from __future__ import annotations

import asyncio
import random
import time
import uuid
from concurrent.futures import ProcessPoolExecutor
from enum import Enum
from typing import Any, Dict, List, Optional, Tuple

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from .bot_planner import BotPlanner
from .security import get_current_user
from .server_models import PlayerReport, User
from game_core import GamePhase, GameSession
from game_core.session import InvalidActionError


router = APIRouter()
_SIMULATION_JOBS: Dict[str, Dict[str, Any]] = {}


class BotSimulationRequest(BaseModel):
    simulations: int = Field(100, ge=1, le=300)
    bot_count: int = Field(4, ge=2, le=6)
    bot_depth: int = Field(2, ge=1, le=5)
    parallelism: int = Field(32, ge=1, le=64)
    max_actions_per_run: int = Field(400, ge=50, le=2000)
    max_turns: int = Field(200, ge=10, le=1000)
    planning_profile: str = "attack_only"
    personality: str = "greedy"
    seed: Optional[int] = None


class CardRef(BaseModel):
    name: str
    kind: Optional[str] = None


class SimulationAction(BaseModel):
    index: int
    type: str
    player_id: str
    player_name: str
    payload: Dict[str, Any] = Field(default_factory=dict)
    round: int = 0
    era: str = ""
    status: str = "ok"
    error: Optional[str] = None
    cards: List[CardRef] = Field(default_factory=list)
    forced: bool = False


class SimulationRun(BaseModel):
    id: int
    winner_id: Optional[str] = None
    winner_name: Optional[str] = None
    final_stats: List[PlayerReport] = Field(default_factory=list)
    actions: List[SimulationAction] = Field(default_factory=list)
    total_actions: int = 0
    truncated: bool = False
    ended_reason: str = "game_over"
    action_types: List[str] = Field(default_factory=list)
    cards_used: List[CardRef] = Field(default_factory=list)


class BotSimulationSummary(BaseModel):
    simulations: int
    bot_count: int
    players: List[Dict[str, str]] = Field(default_factory=list)
    wins: Dict[str, int] = Field(default_factory=dict)
    win_rates: Dict[str, float] = Field(default_factory=dict)
    action_counts: Dict[str, int] = Field(default_factory=dict)
    card_usage: Dict[str, int] = Field(default_factory=dict)
    card_index: Dict[str, str] = Field(default_factory=dict)
    runs: List[SimulationRun] = Field(default_factory=list)
    config: Dict[str, Any] = Field(default_factory=dict)
    duration_ms: int = 0


class BotSimulationStatus(BaseModel):
    job_id: str
    status: str
    progress: float
    completed_runs: int
    total_runs: int
    elapsed_ms: int
    eta_ms: Optional[int] = None
    message: Optional[str] = None
    latest_run: Optional[Dict[str, Any]] = None
    avg_actions: float = 0.0
    wins: Dict[str, int] = Field(default_factory=dict)
    top_actions: List[Dict[str, Any]] = Field(default_factory=list)
    top_cards: List[Dict[str, Any]] = Field(default_factory=list)
    result_ready: bool = False
    error: Optional[str] = None


def _sanitize_payload(value: Any) -> Any:
    if isinstance(value, Enum):
        return value.value
    if isinstance(value, dict):
        return {str(k): _sanitize_payload(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_sanitize_payload(v) for v in value]
    return value


def _build_final_stats(session: GameSession) -> List[PlayerReport]:
    stats: List[PlayerReport] = []
    players = getattr(session.state, "players", {}) or {}
    for player in players.values():
        data = player.to_public_dict() if hasattr(player, "to_public_dict") else {}
        wounds = int(data.get("wounds", 0) or 0)
        vp = int(data.get("vp", 0) or 0)
        penalty = 20 if wounds >= 10 else 10 if wounds >= 5 else 0
        score = vp - penalty
        upgrades = [
            (u.get("name") or u.get("id") or "Unknown")
            for u in (data.get("upgrades") or [])
            if isinstance(u, dict)
        ]
        weapons = []
        for weapon in (data.get("weapons") or []):
            if not isinstance(weapon, dict):
                continue
            weapons.append(
                {
                    "name": weapon.get("name") or weapon.get("id") or "Unknown",
                    "uses": weapon.get("uses"),
                }
            )
        stats.append(
            PlayerReport(
                user_id=str(data.get("user_id") or data.get("id") or ""),
                username=str(data.get("username") or data.get("user_id") or "Unknown"),
                status=str(data.get("status") or ""),
                vp=vp,
                score=score,
                wounds=wounds,
                tokens=dict(data.get("tokens") or {}),
                resources=dict(data.get("resources") or {}),
                threats_defeated=int(data.get("threats_defeated") or 0),
                defeated_threats=list(data.get("defeated_threats") or []),
                upgrades=upgrades,
                weapons=weapons,
                stance=str(data.get("stance") or ""),
            )
        )
    return stats


def _collect_cards(session: GameSession, player: Any) -> Dict[str, Dict[str, Optional[str]]]:
    card_map: Dict[str, Dict[str, Optional[str]]] = {}

    def add_card(card: Any):
        if not card:
            return
        card_id = getattr(card, "id", None)
        if not card_id:
            return
        name = getattr(card, "name", None) or str(card_id)
        card_type = getattr(card, "card_type", None)
        kind = str(card_type.value).lower() if card_type else None
        card_map[str(card_id)] = {"name": name, "kind": kind}

    market = getattr(session.state, "market", None)
    if market:
        for entry in (
            market.upgrades_top
            + market.upgrades_bottom
            + market.weapons_top
            + market.weapons_bottom
            + market.upgrade_deck
            + market.weapon_deck
            + market.upgrade_discard
            + market.weapon_discard
        ):
            add_card(entry)

    if player:
        for entry in (player.upgrades or []):
            add_card(entry)
        for entry in (player.weapons or []):
            add_card(entry)

    return card_map


def _resolve_card_refs(
    session: GameSession,
    player: Any,
    action_type: str,
    payload: Dict[str, Any],
) -> List[CardRef]:
    card_map = _collect_cards(session, player)
    seen: set[Tuple[str, str]] = set()
    refs: List[CardRef] = []

    def add_ref(name: Optional[str], kind: Optional[str] = None):
        if not name:
            return
        key = (name, kind or "")
        if key in seen:
            return
        seen.add(key)
        refs.append(CardRef(name=name, kind=kind))

    if action_type in {"buy_upgrade", "buy_weapon"}:
        kind = "upgrade" if action_type == "buy_upgrade" else "weapon"
        card_name = payload.get("card_name")
        if card_name:
            add_ref(card_name, kind)
        else:
            card_id = payload.get("card_id")
            if card_id and str(card_id) in card_map:
                mapped = card_map[str(card_id)]
                add_ref(mapped.get("name"), kind)
    elif action_type == "activate_card":
        card_id = payload.get("card_id")
        if card_id and str(card_id) in card_map:
            mapped = card_map[str(card_id)]
            add_ref(mapped.get("name"), mapped.get("kind"))
        else:
            add_ref(payload.get("card_name"), None)
    elif action_type == "fight":
        for weapon_id in payload.get("played_weapons") or []:
            mapped = card_map.get(str(weapon_id))
            add_ref(mapped.get("name") if mapped else str(weapon_id), "weapon")

    return refs


def _winner_name(session: GameSession, winner_id: Optional[str]) -> Optional[str]:
    if not winner_id:
        return None
    player = session.state.players.get(winner_id)
    return player.username if player else None


def _pick_winner(session: GameSession) -> Optional[str]:
    winner_id = session.state.winner_id
    if winner_id:
        return winner_id
    try:
        winner = session._determine_winner()
    except Exception:
        return None
    return winner.user_id if winner else None


def _top_counts(source: Dict[str, int], limit: int = 5) -> List[Dict[str, Any]]:
    return [
        {"name": key, "count": count}
        for key, count in sorted(source.items(), key=lambda item: item[1], reverse=True)[:limit]
    ]


def _status_payload(job_id: str, job: Dict[str, Any]) -> BotSimulationStatus:
    total_runs = int(job.get("total_runs") or 0)
    completed_runs = int(job.get("completed_runs") or 0)
    started_at = float(job.get("started_at") or time.time())
    elapsed_ms = int((time.time() - started_at) * 1000)
    progress = (completed_runs / total_runs) if total_runs else 0.0
    eta_ms = None
    if completed_runs > 0 and total_runs > completed_runs:
        avg_ms = elapsed_ms / completed_runs
        remaining = total_runs - completed_runs
        eta_ms = int(avg_ms * remaining)

    top_cards = []
    card_usage = job.get("card_usage") or {}
    card_index = job.get("card_index") or {}
    for entry in _top_counts(card_usage, limit=5):
        name = entry.get("name")
        top_cards.append(
            {
                "name": name,
                "count": entry.get("count"),
                "kind": card_index.get(name),
            }
        )

    return BotSimulationStatus(
        job_id=job_id,
        status=str(job.get("status") or "unknown"),
        progress=progress,
        completed_runs=completed_runs,
        total_runs=total_runs,
        elapsed_ms=elapsed_ms,
        eta_ms=eta_ms,
        message=job.get("message"),
        latest_run=job.get("latest_run"),
        avg_actions=float(job.get("avg_actions") or 0.0),
        wins=dict(job.get("wins") or {}),
        top_actions=_top_counts(job.get("action_counts") or {}, limit=5),
        top_cards=top_cards,
        result_ready=bool(job.get("result")),
        error=job.get("error"),
    )


def _run_simulation_worker(task: Dict[str, Any]) -> Dict[str, Any]:
    request = BotSimulationRequest(**task["request"])
    run_id = int(task["run_id"])
    base_seed = task.get("base_seed")
    start = time.time()
    run = asyncio.run(_run_single_simulation(run_id, request, base_seed))
    duration_ms = int((time.time() - start) * 1000)
    return {"run": run.model_dump(), "duration_ms": duration_ms}


async def _run_single_simulation(
    run_id: int,
    request: BotSimulationRequest,
    base_seed: Optional[int],
) -> SimulationRun:
    bot_players = []
    for idx in range(request.bot_count):
        bot_id = f"bot_{idx + 1}"
        bot_players.append(
            {
                "id": bot_id,
                "username": f"Bot {idx + 1}",
                "is_bot": True,
                "personality": request.personality,
                "planning_profile": request.planning_profile,
            }
        )

    session = GameSession(f"sim_{run_id}", bot_players, verbose=False)
    session.state.simulation_mode = True
    seed = base_seed + run_id if base_seed is not None else None
    if seed is not None:
        session.rng = random.Random(seed)

    await session.async_setup()

    planner_seed = seed if seed is not None else random.randint(0, 999999)
    planner = BotPlanner(max_depth=request.bot_depth, rng=random.Random(planner_seed))

    action_log: List[SimulationAction] = []
    action_types: set[str] = set()
    cards_used: Dict[Tuple[str, str], CardRef] = {}
    total_actions = 0
    truncated = False
    ended_reason = "game_over"
    turn_count = 0

    while session.state.phase != GamePhase.GAME_OVER:
        if total_actions >= request.max_actions_per_run:
            truncated = True
            ended_reason = "action_cap"
            break
        if turn_count >= request.max_turns:
            truncated = True
            ended_reason = "turn_cap"
            break

        active_id = session.state.get_active_player_id()
        if not active_id:
            ended_reason = "no_active"
            break

        player = session.state.players.get(active_id)
        personality = request.personality or getattr(player, "personality", "greedy")
        planning_profile = request.planning_profile or getattr(player, "planning_profile", "full")
        plan = await planner.plan(session, active_id, personality=personality, planning_profile=planning_profile)
        actions = plan.get("actions") or [{"type": "end_turn", "payload": {}}]
        end_seen = any(action.get("type") == "end_turn" for action in actions)

        for action in actions:
            if total_actions >= request.max_actions_per_run or turn_count >= request.max_turns:
                truncated = True
                ended_reason = "action_cap" if total_actions >= request.max_actions_per_run else "turn_cap"
                break
            action_type = str(action.get("type") or "unknown")
            payload_raw = action.get("payload") or {}
            payload = _sanitize_payload(payload_raw)
            round_num = getattr(session.state, "round", 0)
            era = getattr(session.state, "era", "")
            status = "ok"
            error = None
            try:
                await session.player_action(active_id, action_type, payload_raw, None)
            except InvalidActionError as exc:
                status = "invalid"
                error = str(exc)
            except Exception as exc:
                status = "error"
                error = str(exc)
            card_refs = _resolve_card_refs(session, player, action_type, payload)
            action_log.append(
                SimulationAction(
                    index=total_actions + 1,
                    type=action_type,
                    player_id=active_id,
                    player_name=player.username if player else active_id,
                    payload=payload,
                    round=round_num,
                    era=era,
                    status=status,
                    error=error,
                    cards=card_refs,
                    forced=False,
                )
            )
            total_actions += 1
            action_types.add(action_type)
            for card in card_refs:
                key = (card.name, card.kind or "")
                cards_used[key] = card
            if action_type == "end_turn":
                turn_count += 1
            if session.state.phase == GamePhase.GAME_OVER:
                break

        if session.state.phase == GamePhase.GAME_OVER:
            break

        if not end_seen and session.state.phase != GamePhase.GAME_OVER:
            if total_actions >= request.max_actions_per_run or turn_count >= request.max_turns:
                truncated = True
                ended_reason = "action_cap" if total_actions >= request.max_actions_per_run else "turn_cap"
                break
            round_num = getattr(session.state, "round", 0)
            era = getattr(session.state, "era", "")
            status = "ok"
            error = None
            try:
                await session.player_action(active_id, "end_turn", {}, None)
            except InvalidActionError as exc:
                status = "invalid"
                error = str(exc)
            except Exception as exc:
                status = "error"
                error = str(exc)
            action_log.append(
                SimulationAction(
                    index=total_actions + 1,
                    type="end_turn",
                    player_id=active_id,
                    player_name=player.username if player else active_id,
                    payload={},
                    round=round_num,
                    era=era,
                    status=status,
                    error=error,
                    cards=[],
                    forced=True,
                )
            )
            total_actions += 1
            action_types.add("end_turn")
            turn_count += 1

        if not action_log:
            await asyncio.sleep(0)

    winner_id = _pick_winner(session)
    run = SimulationRun(
        id=run_id,
        winner_id=winner_id,
        winner_name=_winner_name(session, winner_id),
        final_stats=_build_final_stats(session),
        actions=action_log,
        total_actions=total_actions,
        truncated=truncated,
        ended_reason=ended_reason,
        action_types=sorted(action_types),
        cards_used=list(cards_used.values()),
    )
    return run


async def _execute_simulations(
    request: BotSimulationRequest,
    job: Optional[Dict[str, Any]] = None,
) -> BotSimulationSummary:
    start = time.time()
    base_seed = request.seed
    runs: List[SimulationRun] = []
    wins: Dict[str, int] = {}
    action_counts: Dict[str, int] = {}
    card_usage: Dict[str, int] = {}
    card_index: Dict[str, str] = {}
    total_actions = 0

    completed_runs = 0

    def apply_run(run: SimulationRun, run_duration_ms: int):
        nonlocal completed_runs, total_actions
        runs.append(run)
        completed_runs += 1
        if run.winner_id:
            wins[run.winner_id] = wins.get(run.winner_id, 0) + 1
        for action in run.actions:
            action_counts[action.type] = action_counts.get(action.type, 0) + 1
            for card in action.cards:
                card_usage[card.name] = card_usage.get(card.name, 0) + 1
                if card.kind:
                    card_index.setdefault(card.name, card.kind)
        total_actions += run.total_actions
        if job is not None:
            job["completed_runs"] = completed_runs
            job["updated_at"] = time.time()
            job["wins"] = dict(wins)
            job["action_counts"] = dict(action_counts)
            job["card_usage"] = dict(card_usage)
            job["card_index"] = dict(card_index)
            job["latest_run"] = {
                "id": run.id,
                "winner_id": run.winner_id,
                "winner_name": run.winner_name,
                "ended_reason": run.ended_reason,
                "total_actions": run.total_actions,
                "duration_ms": run_duration_ms,
            }
            job["avg_actions"] = (total_actions / completed_runs) if completed_runs else 0.0
            job["message"] = f"Completed {completed_runs}/{request.simulations}"

    parallelism = max(1, min(int(request.parallelism or 1), request.simulations))
    if parallelism <= 1:
        for idx in range(request.simulations):
            run_start = time.time()
            run = await _run_single_simulation(idx + 1, request, base_seed)
            run_duration_ms = int((time.time() - run_start) * 1000)
            apply_run(run, run_duration_ms)
            await asyncio.sleep(0)
    else:
        loop = asyncio.get_running_loop()
        task_payload = request.model_dump()
        with ProcessPoolExecutor(max_workers=parallelism) as executor:
            tasks = []
            for idx in range(request.simulations):
                task = {
                    "run_id": idx + 1,
                    "request": task_payload,
                    "base_seed": base_seed,
                }
                tasks.append(loop.run_in_executor(executor, _run_simulation_worker, task))
            for future in asyncio.as_completed(tasks):
                result = await future
                run_data = result.get("run") or {}
                run_duration_ms = int(result.get("duration_ms") or 0)
                run = SimulationRun(**run_data)
                apply_run(run, run_duration_ms)
                await asyncio.sleep(0)

    simulations = len(runs)
    runs.sort(key=lambda r: r.id)
    win_rates = {
        player_id: (count / simulations if simulations else 0.0) for player_id, count in wins.items()
    }
    players = [
        {"id": f"bot_{idx + 1}", "name": f"Bot {idx + 1}"}
        for idx in range(request.bot_count)
    ]

    summary = BotSimulationSummary(
        simulations=simulations,
        bot_count=request.bot_count,
        players=players,
        wins=wins,
        win_rates=win_rates,
        action_counts=action_counts,
        card_usage=card_usage,
        card_index=card_index,
        runs=runs,
        config=request.model_dump(),
        duration_ms=int((time.time() - start) * 1000),
    )
    if job is not None:
        job["status"] = "completed"
        job["updated_at"] = time.time()
        job["result"] = summary.model_dump()
        job["message"] = "Completed"
    return summary


async def _run_simulation_job(job_id: str, request: BotSimulationRequest):
    job = _SIMULATION_JOBS.get(job_id)
    if not job:
        return
    try:
        await _execute_simulations(request, job=job)
    except Exception as exc:
        job["status"] = "failed"
        job["updated_at"] = time.time()
        job["error"] = str(exc)
        job["message"] = "Failed"


@router.post("/simulations/bots/start")
async def start_bot_simulations(
    request: BotSimulationRequest,
    user: User = Depends(get_current_user),
):
    job_id = uuid.uuid4().hex
    _SIMULATION_JOBS[job_id] = {
        "status": "running",
        "total_runs": request.simulations,
        "completed_runs": 0,
        "started_at": time.time(),
        "updated_at": time.time(),
        "wins": {},
        "action_counts": {},
        "card_usage": {},
        "card_index": {},
        "avg_actions": 0.0,
        "latest_run": None,
        "message": "Starting",
        "result": None,
        "error": None,
    }
    asyncio.create_task(_run_simulation_job(job_id, request))
    return {
        "job_id": job_id,
        "status_url": f"/api/simulations/bots/{job_id}/status",
        "result_url": f"/api/simulations/bots/{job_id}/result",
    }


@router.get("/simulations/bots/{job_id}/status", response_model=BotSimulationStatus)
async def get_simulation_status(
    job_id: str,
    user: User = Depends(get_current_user),
):
    job = _SIMULATION_JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Simulation job not found")
    return _status_payload(job_id, job)


@router.get("/simulations/bots/{job_id}/result", response_model=BotSimulationSummary)
async def get_simulation_result(
    job_id: str,
    user: User = Depends(get_current_user),
):
    job = _SIMULATION_JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Simulation job not found")
    if job.get("status") != "completed" or not job.get("result"):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Simulation result not ready")
    return job["result"]


@router.post("/simulations/bots", response_model=BotSimulationSummary)
async def run_bot_simulations(
    request: BotSimulationRequest,
    user: User = Depends(get_current_user),
):
    return await _execute_simulations(request)
