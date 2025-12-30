from __future__ import annotations

import asyncio
import json
import random
import time
import uuid
from concurrent.futures import ProcessPoolExecutor
from datetime import datetime
from enum import Enum
from multiprocessing import Manager
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from .bot_planner import BotPlanner
from .security import get_current_user
from .server_models import PlayerReport, User
from game_core import GamePhase, GameSession, GameDataLoader
from game_core.data_loader import EMPTY_DECK_NAME
from game_core.session import InvalidActionError
from .custom_content import (
    CUSTOM_BOSS_DIR,
    CUSTOM_THREATS_DIR,
    CUSTOM_UPGRADES_DIR,
    CUSTOM_WEAPONS_DIR,
)


router = APIRouter()
_SIMULATION_JOBS: Dict[str, Dict[str, Any]] = {}
PROGRESS_UNITS_PER_RUN = 14
RESULTS_DIR = Path(__file__).resolve().parent / "simulation_results"
RESULTS_INDEX_FILE = RESULTS_DIR / "index.json"


class SimulationCancelled(Exception):
    pass


class BotSimulationRequest(BaseModel):
    simulations: int = Field(100, ge=1, le=10000)
    bot_count: int = Field(4, ge=2, le=6)
    bot_depth: int = Field(2, ge=1, le=5)
    parallelism: int = Field(32, ge=1, le=64)
    planning_profile: str = "attack_only"
    personality: str = "mixed"
    personality_mix: Optional[List[str]] = None
    randomness: float = Field(0.0, ge=0.0, le=1.0)
    threat_deck: str = "default"
    boss_deck: str = "default"
    upgrade_deck: str = "default"
    weapon_deck: str = "default"
    seed: Optional[int] = None


class CardRef(BaseModel):
    name: str
    kind: Optional[str] = None


class CardStats(BaseModel):
    name: str
    kind: Optional[str] = None
    times_offered: int = 0
    times_bought: int = 0
    times_activated: int = 0
    times_used: int = 0
    wins_with_card: int = 0
    games_with_card: int = 0
    buy_turns_total: int = 0
    buy_turns_samples: int = 0
    buy_turn_histogram: Dict[int, int] = Field(default_factory=dict)
    buy_turn_histogram_day: Dict[int, int] = Field(default_factory=dict)
    buy_turn_histogram_night: Dict[int, int] = Field(default_factory=dict)
    buy_turns_ratio_total: float = 0.0
    buy_turns_ratio_samples: int = 0
    retention_turns_total: int = 0
    retention_samples: int = 0
    retention_turns_ratio_total: float = 0.0
    retention_turns_ratio_samples: int = 0
    delta_vp_total: float = 0.0
    delta_vp_samples: int = 0
    delta_vp_norm_total: float = 0.0
    delta_vp_norm_samples: int = 0
    delta_vp_early_total: float = 0.0
    delta_vp_early_samples: int = 0
    delta_vp_mid_total: float = 0.0
    delta_vp_mid_samples: int = 0
    delta_vp_late_total: float = 0.0
    delta_vp_late_samples: int = 0
    win_rate_when_owned: float = 0.0
    win_rate_added: float = 0.0
    win_rate_added_weighted: float = 0.0


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


class RoundPlayerSnapshot(BaseModel):
    player_id: str
    player_name: str
    vp: int = 0
    wounds: int = 0
    stance: str = ""


class RoundSnapshot(BaseModel):
    round: int
    era: str = ""
    players: List[RoundPlayerSnapshot] = Field(default_factory=list)


class SimulationRun(BaseModel):
    id: int
    winner_id: Optional[str] = None
    winner_name: Optional[str] = None
    final_stats: List[PlayerReport] = Field(default_factory=list)
    actions: List[SimulationAction] = Field(default_factory=list)
    round_snapshots: List[RoundSnapshot] = Field(default_factory=list)
    total_actions: int = 0
    truncated: bool = False
    ended_reason: str = "game_over"
    action_types: List[str] = Field(default_factory=list)
    cards_used: List[CardRef] = Field(default_factory=list)
    card_stats: Dict[str, CardStats] = Field(default_factory=dict)


class BotSimulationSummary(BaseModel):
    simulations: int
    bot_count: int
    players: List[Dict[str, str]] = Field(default_factory=list)
    wins: Dict[str, int] = Field(default_factory=dict)
    win_rates: Dict[str, float] = Field(default_factory=dict)
    action_counts: Dict[str, int] = Field(default_factory=dict)
    card_usage: Dict[str, int] = Field(default_factory=dict)
    card_index: Dict[str, str] = Field(default_factory=dict)
    card_balance_data: Dict[str, CardStats] = Field(default_factory=dict)
    threat_index: Dict[str, str] = Field(default_factory=dict)
    runs: List[SimulationRun] = Field(default_factory=list)
    config: Dict[str, Any] = Field(default_factory=dict)
    duration_ms: int = 0
    stored_result_id: Optional[str] = None
    stored_at: Optional[str] = None


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
    stored_result_id: Optional[str] = None


class SimulationResultMeta(BaseModel):
    id: str
    created_at: str
    simulations: int = 0
    bot_count: int = 0
    personality: Optional[str] = None
    planning_profile: Optional[str] = None
    seed: Optional[int] = None
    duration_ms: int = 0
    label: Optional[str] = None


class SimulationResultList(BaseModel):
    results: List[SimulationResultMeta] = Field(default_factory=list)


def _sanitize_payload(value: Any) -> Any:
    if isinstance(value, Enum):
        return value.value
    if isinstance(value, dict):
        return {str(k): _sanitize_payload(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_sanitize_payload(v) for v in value]
    return value


def resolve_deck_path(name: Optional[str], custom_dir: Path, allow_empty: bool = False) -> Optional[str]:
    if allow_empty and name == EMPTY_DECK_NAME:
        return EMPTY_DECK_NAME
    if not name or name == "default":
        return None
    candidate = Path(custom_dir) / f"{name}.json"
    return str(candidate) if candidate.exists() else None


def _build_threat_index(request: BotSimulationRequest) -> Dict[str, str]:
    loader = GameDataLoader(
        threats_file=resolve_deck_path(request.threat_deck, Path(CUSTOM_THREATS_DIR)),
        bosses_file=resolve_deck_path(request.boss_deck, Path(CUSTOM_BOSS_DIR)),
    )
    data = loader.load_threats()
    threat_index: Dict[str, str] = {}
    for card in (data.day_threats or []):
        threat_index[str(card.id)] = str(card.name)
    for card in (data.night_threats or []):
        threat_index[str(card.id)] = str(card.name)
    return threat_index


def _cancel_requested(job: Optional[Dict[str, Any]]) -> bool:
    return bool(job and job.get("cancel_requested"))


def _ensure_results_dir():
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)


def _read_results_index() -> Dict[str, Any]:
    _ensure_results_dir()
    if not RESULTS_INDEX_FILE.exists():
        return {"results": []}
    try:
        with RESULTS_INDEX_FILE.open("r", encoding="utf-8") as handle:
            data = json.load(handle)
        if isinstance(data, dict) and isinstance(data.get("results"), list):
            return data
    except Exception:
        return {"results": []}
    return {"results": []}


def _write_results_index(index: Dict[str, Any]):
    _ensure_results_dir()
    with RESULTS_INDEX_FILE.open("w", encoding="utf-8") as handle:
        json.dump(index, handle, indent=2, ensure_ascii=True)


def _build_result_meta(summary: BotSimulationSummary, result_id: str, created_at: str) -> SimulationResultMeta:
    cfg = summary.config or {}
    label_parts = [f"{summary.simulations} sims", f"{summary.bot_count} bots"]
    personality = cfg.get("personality")
    if personality:
        label_parts.append(str(personality))
    planning_profile = cfg.get("planning_profile")
    if planning_profile:
        label_parts.append(str(planning_profile))
    label = " • ".join(label_parts)
    return SimulationResultMeta(
        id=result_id,
        created_at=created_at,
        simulations=summary.simulations,
        bot_count=summary.bot_count,
        personality=cfg.get("personality"),
        planning_profile=cfg.get("planning_profile"),
        seed=cfg.get("seed"),
        duration_ms=summary.duration_ms,
        label=label,
    )


def _store_simulation_result(
    summary: BotSimulationSummary,
    result_id: Optional[str] = None,
) -> SimulationResultMeta:
    _ensure_results_dir()
    result_id = result_id or uuid.uuid4().hex
    created_at = datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S")
    summary.stored_result_id = result_id
    summary.stored_at = created_at
    payload = summary.model_dump()
    result_path = RESULTS_DIR / f"{result_id}.json"
    with result_path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, ensure_ascii=True)
    meta = _build_result_meta(summary, result_id, created_at)
    index = _read_results_index()
    results = [entry for entry in index.get("results", []) if entry.get("id") != result_id]
    results.insert(0, meta.model_dump())
    index["results"] = results
    _write_results_index(index)
    return meta


def _load_simulation_result(result_id: str) -> Dict[str, Any]:
    result_path = RESULTS_DIR / f"{result_id}.json"
    if not result_path.exists():
        raise FileNotFoundError(result_id)
    with result_path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


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
    card_map_override: Optional[Dict[str, Dict[str, Optional[str]]]] = None,
) -> List[CardRef]:
    card_map = dict(card_map_override or {})
    if not card_map:
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


def _top_card_picks(card_balance_data: Dict[str, Any], limit: int = 5) -> List[Dict[str, Any]]:
    items: List[Tuple[str, int]] = []
    for name, stats in (card_balance_data or {}).items():
        if isinstance(stats, dict):
            count = int(stats.get("times_bought") or 0)
        else:
            count = int(getattr(stats, "times_bought", 0) or 0)
        items.append((name, count))
    return [
        {"name": name, "count": count}
        for name, count in sorted(items, key=lambda item: item[1], reverse=True)[:limit]
    ]


def _status_payload(job_id: str, job: Dict[str, Any]) -> BotSimulationStatus:
    total_runs = int(job.get("total_runs") or 0)
    completed_runs = int(job.get("completed_runs") or 0)
    started_at = float(job.get("started_at") or time.time())
    elapsed_ms = int((time.time() - started_at) * 1000)
    progress = (completed_runs / total_runs) if total_runs else 0.0
    progress_map = job.get("progress_map")
    units_per_run = int(job.get("progress_units_per_run") or 0)
    total_units = units_per_run * total_runs if units_per_run and total_runs else 0
    completed_units = None
    if progress_map is not None and total_units:
        try:
            completed_units = sum(int(v or 0) for v in progress_map.values())
        except Exception:
            completed_units = None
    if completed_units is not None and total_units:
        progress = min(1.0, completed_units / total_units)
    eta_ms = None
    if completed_units is not None and total_units and completed_units > 0 and total_units > completed_units:
        avg_ms = elapsed_ms / completed_units
        remaining = total_units - completed_units
        eta_ms = int(avg_ms * remaining)
    elif completed_runs > 0 and total_runs > completed_runs:
        avg_ms = elapsed_ms / completed_runs
        remaining = total_runs - completed_runs
        eta_ms = int(avg_ms * remaining)

    top_cards = []
    card_index = job.get("card_index") or {}
    card_balance_data = job.get("card_balance_data") or {}
    if card_balance_data:
        top_entries = _top_card_picks(card_balance_data, limit=5)
    else:
        card_usage = job.get("card_usage") or {}
        top_entries = _top_counts(card_usage, limit=5)
    for entry in top_entries:
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
        stored_result_id=job.get("stored_result_id"),
    )


def _run_simulation_worker(task: Dict[str, Any]) -> Dict[str, Any]:
    request = BotSimulationRequest(**task["request"])
    run_id = int(task["run_id"])
    base_seed = task.get("base_seed")
    progress_map = task.get("progress_map")
    progress_units = int(task.get("progress_units") or PROGRESS_UNITS_PER_RUN)
    start = time.time()
    run = asyncio.run(_run_single_simulation(run_id, request, base_seed, progress_map, progress_units))
    duration_ms = int((time.time() - start) * 1000)
    return {"run": run.model_dump(), "duration_ms": duration_ms}


async def _run_single_simulation(
    run_id: int,
    request: BotSimulationRequest,
    base_seed: Optional[int],
    progress_map: Optional[Dict[int, int]] = None,
    progress_units: int = PROGRESS_UNITS_PER_RUN,
) -> SimulationRun:
    personality_mix: List[str] = []
    if request.personality_mix and len(request.personality_mix) == request.bot_count:
        personality_mix = [str(entry) for entry in request.personality_mix]
    elif request.personality == "mixed":
        personality_mix = ["greedy"] * max(0, request.bot_count - 1) + ["random"]
    else:
        personality_mix = [str(request.personality or "greedy")] * request.bot_count

    bot_players = []
    for idx in range(request.bot_count):
        bot_id = f"bot_{idx + 1}"
        personality = personality_mix[idx] if idx < len(personality_mix) else "greedy"
        bot_players.append(
            {
                "id": bot_id,
                "username": f"Bot {idx + 1}",
                "is_bot": True,
                "personality": personality,
                "planning_profile": request.planning_profile,
            }
        )

    loader = GameDataLoader(
        threats_file=resolve_deck_path(request.threat_deck, Path(CUSTOM_THREATS_DIR)),
        bosses_file=resolve_deck_path(request.boss_deck, Path(CUSTOM_BOSS_DIR)),
        upgrade_file=resolve_deck_path(request.upgrade_deck, Path(CUSTOM_UPGRADES_DIR), allow_empty=True),
        weapon_file=resolve_deck_path(request.weapon_deck, Path(CUSTOM_WEAPONS_DIR), allow_empty=True),
    )
    session = GameSession(f"sim_{run_id}", bot_players, data_loader=loader, verbose=False)
    session.state.simulation_mode = True
    round_snapshots: List[RoundSnapshot] = []

    def capture_round_snapshot(round_number: int, era_label: str):
        players_snapshot: List[RoundPlayerSnapshot] = []
        for pid, player in session.state.players.items():
            stance_value = getattr(player, "stance", "")
            stance_label = stance_value.value if hasattr(stance_value, "value") else str(stance_value)
            players_snapshot.append(
                RoundPlayerSnapshot(
                    player_id=str(pid),
                    player_name=str(getattr(player, "username", pid)),
                    vp=int(getattr(player, "vp", 0) or 0),
                    wounds=int(getattr(player, "wounds", 0) or 0),
                    stance=stance_label,
                )
            )
        round_snapshots.append(
            RoundSnapshot(round=int(round_number or 0), era=str(era_label or ""), players=players_snapshot)
        )

    session.round_end_hook = capture_round_snapshot
    seed = base_seed + run_id if base_seed is not None else None
    if seed is not None:
        session.rng = random.Random(seed)

    await session.async_setup()
    static_card_map = _collect_cards(session, None)

    planner_seed = seed if seed is not None else random.randint(0, 999999)
    planner = BotPlanner(
        max_depth=request.bot_depth,
        rng=random.Random(planner_seed),
        randomness=request.randomness,
    )

    action_log: List[SimulationAction] = []
    action_types: set[str] = set()
    cards_used: Dict[Tuple[str, str], CardRef] = {}
    card_stats: Dict[str, CardStats] = {}
    market_slot_cache: Dict[str, Optional[str]] = {}
    purchase_log: List[Tuple[str, str, str, int]] = []
    total_actions = 0
    truncated = False
    ended_reason = "game_over"
    units_completed = 0
    prev_round = getattr(session.state, "round", 0)
    prev_boss_mode = bool(getattr(session.state, "boss_mode", False))
    if progress_map is not None:
        try:
            progress_map[run_id] = 0
        except Exception:
            pass

    def report_progress():
        if progress_map is None:
            return
        try:
            progress_map[run_id] = min(units_completed, progress_units)
        except Exception:
            pass

    def update_units():
        nonlocal prev_round, prev_boss_mode, units_completed
        current_round = getattr(session.state, "round", prev_round)
        current_boss = bool(getattr(session.state, "boss_mode", False))
        if current_round > prev_round and not prev_boss_mode:
            units_completed += 1
        if prev_boss_mode and not current_boss:
            units_completed += 1
        if current_round != prev_round or current_boss != prev_boss_mode:
            report_progress()
        prev_round = current_round
        prev_boss_mode = current_boss

    def get_card_stats_entry(name: Optional[str], kind: Optional[str] = None) -> Optional[CardStats]:
        if not name:
            return None
        stats = card_stats.get(name)
        if not stats:
            stats = CardStats(name=name, kind=kind)
            card_stats[name] = stats
        elif kind and not stats.kind:
            stats.kind = kind
        return stats

    def get_turn_index(round_num: Any, era_value: Any) -> int:
        turn = int(round_num or 0)
        if turn <= 0:
            return 0
        era_key = str(era_value or "").lower()
        return turn + (6 if era_key == "night" else 0)

    def track_market_slot(slot_key: str, card: Any, kind: str):
        if not card:
            market_slot_cache[slot_key] = None
            return
        card_id = str(getattr(card, "id", None) or card)
        if market_slot_cache.get(slot_key) == card_id:
            return
        market_slot_cache[slot_key] = card_id
        name = getattr(card, "name", None) or card_id
        stats = get_card_stats_entry(name, kind)
        if stats:
            stats.times_offered += 1

    def snapshot_market():
        market = getattr(session.state, "market", None)
        if not market:
            return
        seen_keys: set[str] = set()
        for idx, card in enumerate(market.upgrades_top or []):
            key = f"upgrade_top:{idx}"
            seen_keys.add(key)
            track_market_slot(key, card, "upgrade")
        for idx, card in enumerate(market.upgrades_bottom or []):
            key = f"upgrade_bottom:{idx}"
            seen_keys.add(key)
            track_market_slot(key, card, "upgrade")
        for idx, card in enumerate(market.weapons_top or []):
            key = f"weapon_top:{idx}"
            seen_keys.add(key)
            track_market_slot(key, card, "weapon")
        for idx, card in enumerate(market.weapons_bottom or []):
            key = f"weapon_bottom:{idx}"
            seen_keys.add(key)
            track_market_slot(key, card, "weapon")
        for key in list(market_slot_cache.keys()):
            if key not in seen_keys:
                market_slot_cache[key] = None

    while session.state.phase != GamePhase.GAME_OVER:
        active_id = session.state.get_active_player_id()
        if not active_id:
            ended_reason = "no_active"
            break

        snapshot_market()
        player = session.state.players.get(active_id)
        personality = getattr(player, "personality", None) or request.personality or "greedy"
        planning_profile = getattr(player, "planning_profile", None) or request.planning_profile or "full"
        plan = await planner.plan(session, active_id, personality=personality, planning_profile=planning_profile)
        actions = plan.get("actions") or [{"type": "end_turn", "payload": {}}]
        end_seen = any(action.get("type") == "end_turn" for action in actions)

        for action in actions:
            action_type = str(action.get("type") or "unknown")
            payload_raw = action.get("payload") or {}
            payload = _sanitize_payload(payload_raw)
            round_num = getattr(session.state, "round", 0)
            era = getattr(session.state, "era", "")
            current_card_map = _collect_cards(session, player)
            merged_card_map = dict(static_card_map)
            merged_card_map.update(current_card_map)
            card_refs = _resolve_card_refs(
                session, player, action_type, payload, card_map_override=merged_card_map
            )
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
            if status == "ok":
                if action_type in {"buy_upgrade", "buy_weapon"}:
                    kind = "upgrade" if action_type == "buy_upgrade" else "weapon"
                    era_key = "night" if str(era).lower() == "night" else "day"
                    turn_index = get_turn_index(round_num, era)
                    if card_refs:
                        for card in card_refs:
                            stats = get_card_stats_entry(card.name, kind)
                            if stats:
                                stats.times_bought += 1
                                stats.buy_turns_total += int(round_num or 0)
                                stats.buy_turns_samples += 1
                                round_key = int(round_num or 0)
                                stats.buy_turn_histogram[round_key] = (
                                    stats.buy_turn_histogram.get(round_key, 0) + 1
                                )
                                if era_key == "night":
                                    stats.buy_turn_histogram_night[round_key] = (
                                        stats.buy_turn_histogram_night.get(round_key, 0) + 1
                                    )
                                else:
                                    stats.buy_turn_histogram_day[round_key] = (
                                        stats.buy_turn_histogram_day.get(round_key, 0) + 1
                                    )
                            if card.name and turn_index > 0:
                                purchase_log.append((active_id, card.name, kind, turn_index))
                    else:
                        fallback_name = payload.get("card_name")
                        stats = get_card_stats_entry(fallback_name, kind)
                        if stats:
                            stats.times_bought += 1
                            stats.buy_turns_total += int(round_num or 0)
                            stats.buy_turns_samples += 1
                            round_key = int(round_num or 0)
                            stats.buy_turn_histogram[round_key] = (
                                stats.buy_turn_histogram.get(round_key, 0) + 1
                            )
                            if era_key == "night":
                                stats.buy_turn_histogram_night[round_key] = (
                                    stats.buy_turn_histogram_night.get(round_key, 0) + 1
                                )
                            else:
                                stats.buy_turn_histogram_day[round_key] = (
                                    stats.buy_turn_histogram_day.get(round_key, 0) + 1
                                )
                        if fallback_name and turn_index > 0:
                            purchase_log.append((active_id, fallback_name, kind, turn_index))
                elif action_type == "activate_card":
                    for card in card_refs:
                        stats = get_card_stats_entry(card.name, card.kind)
                        if stats:
                            stats.times_activated += 1
                elif action_type == "fight":
                    for card in card_refs:
                        stats = get_card_stats_entry(card.name, "weapon")
                        if stats:
                            stats.times_used += 1
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
            update_units()
            if session.state.phase == GamePhase.GAME_OVER:
                break

        if session.state.phase == GamePhase.GAME_OVER:
            break

        if not end_seen and session.state.phase != GamePhase.GAME_OVER:
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
            update_units()

    if not action_log:
        await asyncio.sleep(0)

    if progress_map is not None:
        units_completed = max(units_completed, progress_units)
        report_progress()

    final_round = int(getattr(session.state, "round", 0) or 0)
    if final_round > 0:
        for stats in card_stats.values():
            if stats.buy_turns_samples <= 0:
                continue
            stats.retention_turns_total = (stats.buy_turns_samples * final_round) - stats.buy_turns_total
            stats.retention_samples = stats.buy_turns_samples
            stats.buy_turns_ratio_total = stats.buy_turns_total / final_round
            stats.buy_turns_ratio_samples = stats.buy_turns_samples
            stats.retention_turns_ratio_total = stats.retention_turns_total / final_round
            stats.retention_turns_ratio_samples = stats.retention_samples

    final_stats = _build_final_stats(session)
    total_turns = 0
    for action in action_log:
        total_turns = max(total_turns, get_turn_index(action.round, action.era))
    final_turn_index = get_turn_index(final_round, getattr(session.state, "era", ""))
    total_turns = max(total_turns, final_turn_index)
    if total_turns <= 0:
        total_turns = 12

    delta_by_player: Dict[str, float] = {}
    if final_stats:
        scores = [float(getattr(player, "score", 0) or 0) for player in final_stats]
        total_score = sum(scores)
        player_count = len(final_stats)
        for idx, player in enumerate(final_stats):
            player_id = str(player.user_id)
            score = scores[idx]
            if player_count > 1:
                avg_others = (total_score - score) / (player_count - 1)
                delta_by_player[player_id] = score - avg_others
            else:
                delta_by_player[player_id] = 0.0

    if purchase_log and delta_by_player:
        for player_id, card_name, kind, turn_index in purchase_log:
            stats = get_card_stats_entry(card_name, kind)
            if not stats:
                continue
            delta_vp = delta_by_player.get(str(player_id))
            if delta_vp is None:
                continue
            stats.delta_vp_total += delta_vp
            stats.delta_vp_samples += 1
            turns_held = max(1, total_turns - max(1, turn_index))
            stats.delta_vp_norm_total += delta_vp / turns_held
            stats.delta_vp_norm_samples += 1
            if turn_index <= 4:
                stats.delta_vp_early_total += delta_vp
                stats.delta_vp_early_samples += 1
            elif turn_index <= 8:
                stats.delta_vp_mid_total += delta_vp
                stats.delta_vp_mid_samples += 1
            else:
                stats.delta_vp_late_total += delta_vp
                stats.delta_vp_late_samples += 1

    winner_id = _pick_winner(session)
    round_snapshots.sort(key=lambda snap: snap.round)
    run = SimulationRun(
        id=run_id,
        winner_id=winner_id,
        winner_name=_winner_name(session, winner_id),
        final_stats=final_stats,
        actions=action_log,
        round_snapshots=round_snapshots,
        total_actions=total_actions,
        truncated=truncated,
        ended_reason=ended_reason,
        action_types=sorted(action_types),
        cards_used=list(cards_used.values()),
        card_stats=card_stats,
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
    card_balance_data: Dict[str, CardStats] = {}
    total_actions = 0

    completed_runs = 0
    parallelism = max(1, min(int(request.parallelism or 1), request.simulations))
    progress_map: Optional[Dict[int, int]] = None
    manager = None
    executor: Optional[ProcessPoolExecutor] = None
    if job is not None:
        job["progress_units_per_run"] = PROGRESS_UNITS_PER_RUN
        if parallelism > 1:
            manager = Manager()
            progress_map = manager.dict()
        else:
            progress_map = {}
        job["progress_map"] = progress_map

    def apply_run(run: SimulationRun, run_duration_ms: int):
        nonlocal completed_runs, total_actions
        runs.append(run)
        completed_runs += 1
        if run.winner_id:
            wins[run.winner_id] = wins.get(run.winner_id, 0) + 1
        for action in run.actions:
            action_counts[action.type] = action_counts.get(action.type, 0) + 1
        for name, stats in (run.card_stats or {}).items():
            existing = card_balance_data.get(name)
            if not existing:
                existing = CardStats(name=name, kind=stats.kind)
                card_balance_data[name] = existing
            if stats.kind and not existing.kind:
                existing.kind = stats.kind
            existing.times_offered += stats.times_offered
            existing.times_bought += stats.times_bought
            existing.times_activated += stats.times_activated
            existing.times_used += stats.times_used
            existing.buy_turns_total += stats.buy_turns_total
            existing.buy_turns_samples += stats.buy_turns_samples
            for turn, count in (stats.buy_turn_histogram or {}).items():
                existing.buy_turn_histogram[turn] = existing.buy_turn_histogram.get(turn, 0) + int(count or 0)
            for turn, count in (stats.buy_turn_histogram_day or {}).items():
                existing.buy_turn_histogram_day[turn] = existing.buy_turn_histogram_day.get(turn, 0) + int(count or 0)
            for turn, count in (stats.buy_turn_histogram_night or {}).items():
                existing.buy_turn_histogram_night[turn] = existing.buy_turn_histogram_night.get(turn, 0) + int(count or 0)
            existing.buy_turns_ratio_total += stats.buy_turns_ratio_total
            existing.buy_turns_ratio_samples += stats.buy_turns_ratio_samples
            existing.retention_turns_total += stats.retention_turns_total
            existing.retention_samples += stats.retention_samples
            existing.retention_turns_ratio_total += stats.retention_turns_ratio_total
            existing.retention_turns_ratio_samples += stats.retention_turns_ratio_samples
            existing.delta_vp_total += stats.delta_vp_total
            existing.delta_vp_samples += stats.delta_vp_samples
            existing.delta_vp_norm_total += stats.delta_vp_norm_total
            existing.delta_vp_norm_samples += stats.delta_vp_norm_samples
            existing.delta_vp_early_total += stats.delta_vp_early_total
            existing.delta_vp_early_samples += stats.delta_vp_early_samples
            existing.delta_vp_mid_total += stats.delta_vp_mid_total
            existing.delta_vp_mid_samples += stats.delta_vp_mid_samples
            existing.delta_vp_late_total += stats.delta_vp_late_total
            existing.delta_vp_late_samples += stats.delta_vp_late_samples
            if existing.kind:
                card_index.setdefault(name, existing.kind)
            usage = stats.times_used + stats.times_activated
            if usage:
                card_usage[name] = card_usage.get(name, 0) + usage

        winner_id = run.winner_id
        buyers_by_card: Dict[Tuple[str, str], set[str]] = {}
        for action in run.actions or []:
            if action.type not in {"buy_upgrade", "buy_weapon"}:
                continue
            kind = "upgrade" if action.type == "buy_upgrade" else "weapon"
            buyer_id = str(action.player_id)
            cards = action.cards or []
            if cards:
                for card in cards:
                    if isinstance(card, dict):
                        name = card.get("name")
                        card_kind = card.get("kind") or kind
                    else:
                        name = getattr(card, "name", None)
                        card_kind = getattr(card, "kind", None) or kind
                    if not name:
                        continue
                    buyers_by_card.setdefault((str(name), str(card_kind)), set()).add(buyer_id)
            else:
                fallback_name = None
                if isinstance(action.payload, dict):
                    fallback_name = action.payload.get("card_name")
                if fallback_name:
                    buyers_by_card.setdefault((str(fallback_name), kind), set()).add(buyer_id)

        for (name, kind), buyers in buyers_by_card.items():
            existing = card_balance_data.get(name)
            if not existing:
                existing = CardStats(name=name, kind=kind)
                card_balance_data[name] = existing
            if kind and not existing.kind:
                existing.kind = kind
            existing.games_with_card += len(buyers)
            if winner_id and str(winner_id) in buyers:
                existing.wins_with_card += 1
            if existing.kind:
                card_index.setdefault(name, existing.kind)
        total_actions += run.total_actions
        if job is not None and not _cancel_requested(job):
            job["completed_runs"] = completed_runs
            job["updated_at"] = time.time()
            job["wins"] = dict(wins)
            job["action_counts"] = dict(action_counts)
            job["card_usage"] = dict(card_usage)
            job["card_index"] = dict(card_index)
            job["card_balance_data"] = {
                name: stats.model_dump() for name, stats in card_balance_data.items()
            }
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

    try:
        if parallelism <= 1:
            for idx in range(request.simulations):
                if _cancel_requested(job):
                    raise SimulationCancelled()
                run_start = time.time()
                run = await _run_single_simulation(
                    idx + 1,
                    request,
                    base_seed,
                    progress_map,
                    PROGRESS_UNITS_PER_RUN,
                )
                run_duration_ms = int((time.time() - run_start) * 1000)
                apply_run(run, run_duration_ms)
                await asyncio.sleep(0)
        else:
            loop = asyncio.get_running_loop()
            task_payload = request.model_dump()
            executor = ProcessPoolExecutor(max_workers=parallelism)
            tasks = []
            for idx in range(request.simulations):
                if _cancel_requested(job):
                    raise SimulationCancelled()
                task = {
                    "run_id": idx + 1,
                    "request": task_payload,
                    "base_seed": base_seed,
                    "progress_map": progress_map,
                    "progress_units": PROGRESS_UNITS_PER_RUN,
                }
                tasks.append(loop.run_in_executor(executor, _run_simulation_worker, task))
            for future in asyncio.as_completed(tasks):
                if _cancel_requested(job):
                    for task in tasks:
                        task.cancel()
                    raise SimulationCancelled()
                result = await future
                run_data = result.get("run") or {}
                run_duration_ms = int(result.get("duration_ms") or 0)
                run = SimulationRun(**run_data)
                apply_run(run, run_duration_ms)
                await asyncio.sleep(0)

        if _cancel_requested(job):
            raise SimulationCancelled()

        simulations = len(runs)
        runs.sort(key=lambda r: r.id)
        win_rates = {
            player_id: (count / simulations if simulations else 0.0) for player_id, count in wins.items()
        }

        personality_mix: List[str] = []
        if request.personality_mix and len(request.personality_mix) == request.bot_count:
            personality_mix = [str(entry) for entry in request.personality_mix]
        elif request.personality == "mixed":
            personality_mix = ["greedy"] * max(0, request.bot_count - 1) + ["random"]
        else:
            personality_mix = [str(request.personality or "greedy")] * request.bot_count

        players = []
        for idx in range(request.bot_count):
            personality = personality_mix[idx] if idx < len(personality_mix) else "greedy"
            players.append(
                {
                    "id": f"bot_{idx + 1}",
                    "name": f"Bot {idx + 1}",
                    "personality": personality,
                    "planning_profile": request.planning_profile,
                }
            )

        threat_index = _build_threat_index(request)
        baseline_win_rate = (1.0 / request.bot_count) if request.bot_count else 0.0
        for stats in card_balance_data.values():
            if stats.games_with_card > 0:
                stats.win_rate_when_owned = stats.wins_with_card / stats.games_with_card
            else:
                stats.win_rate_when_owned = 0.0
            stats.win_rate_added = stats.win_rate_when_owned - baseline_win_rate
            if stats.buy_turns_ratio_samples > 0:
                avg_buy_ratio = stats.buy_turns_ratio_total / stats.buy_turns_ratio_samples
                weight = max(0.0, min(1.0, 1.0 - avg_buy_ratio))
                stats.win_rate_added_weighted = stats.win_rate_added * weight
            else:
                stats.win_rate_added_weighted = stats.win_rate_added

        if _cancel_requested(job):
            raise SimulationCancelled()

        summary = BotSimulationSummary(
            simulations=simulations,
            bot_count=request.bot_count,
            players=players,
            wins=wins,
            win_rates=win_rates,
            action_counts=action_counts,
            card_usage=card_usage,
            card_index=card_index,
            card_balance_data=card_balance_data,
            threat_index=threat_index,
            runs=runs,
            config=request.model_dump(),
            duration_ms=int((time.time() - start) * 1000),
        )
        if _cancel_requested(job):
            raise SimulationCancelled()
        stored_meta = _store_simulation_result(summary, result_id=(job.get("job_id") if job else None))
        if job is not None and not _cancel_requested(job):
            job["status"] = "completed"
            job["updated_at"] = time.time()
            job["result"] = summary.model_dump()
            job["message"] = "Completed"
            job["stored_result_id"] = stored_meta.id
            job["progress_map"] = None
        return summary
    finally:
        if executor is not None:
            try:
                executor.shutdown(wait=False, cancel_futures=True)
            except TypeError:
                executor.shutdown(wait=False)
        if manager is not None:
            manager.shutdown()


async def _run_simulation_job(job_id: str, request: BotSimulationRequest):
    job = _SIMULATION_JOBS.get(job_id)
    if not job:
        return
    try:
        await _execute_simulations(request, job=job)
    except SimulationCancelled:
        job["status"] = "cancelled"
        job["updated_at"] = time.time()
        job["message"] = "Stopped by user"
    except asyncio.CancelledError:
        job["status"] = "cancelled"
        job["updated_at"] = time.time()
        job["message"] = "Stopped by user"
        return
    except Exception as exc:
        job["status"] = "failed"
        job["updated_at"] = time.time()
        job["error"] = str(exc)
        job["message"] = "Failed"
    finally:
        if job is not None:
            job["task"] = None


@router.get("/simulations/bots/results", response_model=SimulationResultList)
async def list_simulation_results(
    user: User = Depends(get_current_user),
):
    index = _read_results_index()
    results: List[SimulationResultMeta] = []
    for entry in index.get("results", []):
        result_id = entry.get("id")
        if not result_id:
            continue
        if not (RESULTS_DIR / f"{result_id}.json").exists():
            continue
        try:
            results.append(SimulationResultMeta(**entry))
        except Exception:
            continue
    return SimulationResultList(results=results)


@router.get("/simulations/bots/results/{result_id}", response_model=BotSimulationSummary)
async def get_simulation_result_by_id(
    result_id: str,
    user: User = Depends(get_current_user),
):
    try:
        data = _load_simulation_result(result_id)
    except FileNotFoundError:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Simulation result not found")
    return data


@router.get("/simulations/bots/results/{result_id}/download")
async def download_simulation_result(
    result_id: str,
    user: User = Depends(get_current_user),
):
    result_path = RESULTS_DIR / f"{result_id}.json"
    if not result_path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Simulation result not found")
    return FileResponse(
        result_path,
        media_type="application/json",
        filename=f"bot_simulation_{result_id}.json",
    )


@router.delete("/simulations/bots/results/{result_id}")
async def delete_simulation_result(
    result_id: str,
    user: User = Depends(get_current_user),
):
    _ensure_results_dir()
    result_path = RESULTS_DIR / f"{result_id}.json"
    index = _read_results_index()
    existing_entries = index.get("results", [])
    results = [entry for entry in existing_entries if entry.get("id") != result_id]
    removed_from_index = len(results) != len(existing_entries)
    if removed_from_index:
        index["results"] = results
        _write_results_index(index)
    removed_file = False
    if result_path.exists():
        result_path.unlink()
        removed_file = True
    if not removed_from_index and not removed_file:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Simulation result not found")
    return {"status": "deleted", "result_id": result_id}


@router.post("/simulations/bots/start")
async def start_bot_simulations(
    request: BotSimulationRequest,
    user: User = Depends(get_current_user),
):
    job_id = uuid.uuid4().hex
    _SIMULATION_JOBS[job_id] = {
        "job_id": job_id,
        "status": "running",
        "total_runs": request.simulations,
        "completed_runs": 0,
        "started_at": time.time(),
        "updated_at": time.time(),
        "cancel_requested": False,
        "wins": {},
        "action_counts": {},
        "card_usage": {},
        "card_index": {},
        "card_balance_data": {},
        "avg_actions": 0.0,
        "latest_run": None,
        "message": "Starting",
        "result": None,
        "error": None,
        "stored_result_id": None,
    }
    task = asyncio.create_task(_run_simulation_job(job_id, request))
    _SIMULATION_JOBS[job_id]["task"] = task
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


@router.post("/simulations/bots/{job_id}/stop", response_model=BotSimulationStatus)
async def stop_simulation(
    job_id: str,
    user: User = Depends(get_current_user),
):
    job = _SIMULATION_JOBS.get(job_id)
    if not job:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Simulation job not found")
    if job.get("status") in {"completed", "failed", "cancelled"}:
        return _status_payload(job_id, job)
    job["cancel_requested"] = True
    job["status"] = "cancelled"
    job["updated_at"] = time.time()
    job["message"] = "Stopped by user"
    job["error"] = None
    task = job.get("task")
    if task and not task.done():
        task.cancel()
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
