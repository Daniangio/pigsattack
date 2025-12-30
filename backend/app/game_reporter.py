from __future__ import annotations

import json
import time
from enum import Enum
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from game_core import GameSession


REPORTS_DIR = Path(__file__).resolve().parent / "game_reports"


def _ensure_reports_dir() -> None:
    REPORTS_DIR.mkdir(parents=True, exist_ok=True)


def _sanitize_payload(value: Any) -> Any:
    if isinstance(value, Enum):
        return value.value
    if isinstance(value, dict):
        return {str(k): _sanitize_payload(v) for k, v in value.items()}
    if isinstance(value, list):
        return [_sanitize_payload(v) for v in value]
    return value


def _collect_cards(session: GameSession, player: Any) -> Dict[str, Dict[str, Optional[str]]]:
    card_map: Dict[str, Dict[str, Optional[str]]] = {}

    def add_card(card: Any) -> None:
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
) -> List[Dict[str, Optional[str]]]:
    card_map = _collect_cards(session, player)
    seen: set[Tuple[str, str]] = set()
    refs: List[Dict[str, Optional[str]]] = []

    def add_ref(name: Optional[str], kind: Optional[str] = None) -> None:
        if not name:
            return
        key = (name, kind or "")
        if key in seen:
            return
        seen.add(key)
        refs.append({"name": name, "kind": kind})

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


class GameReportTracker:
    def __init__(self, game_id: str):
        self.game_id = game_id
        self.started_at = time.time()
        self.actions: List[Dict[str, Any]] = []
        self.round_snapshots: List[Dict[str, Any]] = []
        self.action_counts: Dict[str, int] = {}
        self.card_usage: Dict[str, int] = {}
        self.card_index: Dict[str, str] = {}
        self._cards_used: Dict[Tuple[str, str], Dict[str, Optional[str]]] = {}
        self._action_types: set[str] = set()
        self._action_index = 0

    def record_action(
        self,
        session: GameSession,
        player_id: str,
        action_type: str,
        payload: Dict[str, Any],
        status: str = "ok",
        error: Optional[str] = None,
        forced: bool = False,
    ) -> None:
        player = session.state.players.get(player_id)
        player_name = getattr(player, "username", player_id)
        round_num = getattr(session.state, "round", 0)
        era = getattr(session.state, "era", "") or ""
        sanitized_payload = _sanitize_payload(payload or {})
        card_refs = _resolve_card_refs(session, player, action_type, sanitized_payload)

        entry = {
            "index": self._action_index,
            "type": str(action_type),
            "player_id": str(player_id),
            "player_name": str(player_name),
            "payload": sanitized_payload,
            "round": int(round_num or 0),
            "era": str(era),
            "status": status,
            "error": error,
            "cards": card_refs,
            "forced": forced,
        }
        self._action_index += 1
        self.actions.append(entry)

        self._action_types.add(str(action_type))
        self.action_counts[str(action_type)] = self.action_counts.get(str(action_type), 0) + 1
        for ref in card_refs:
            name = ref.get("name")
            if not name:
                continue
            self.card_usage[name] = self.card_usage.get(name, 0) + 1
            kind = ref.get("kind")
            if kind:
                self.card_index[name] = kind
            key = (name, kind or "")
            if key not in self._cards_used:
                self._cards_used[key] = {"name": name, "kind": kind}

    def capture_round_snapshot(self, round_number: int, era_label: str, session: GameSession) -> None:
        players_snapshot: List[Dict[str, Any]] = []
        for pid, player in session.state.players.items():
            stance_value = getattr(player, "stance", "")
            stance_label = stance_value.value if hasattr(stance_value, "value") else str(stance_value)
            players_snapshot.append(
                {
                    "player_id": str(pid),
                    "player_name": str(getattr(player, "username", pid)),
                    "vp": int(getattr(player, "vp", 0) or 0),
                    "wounds": int(getattr(player, "wounds", 0) or 0),
                    "stance": stance_label,
                }
            )
        self.round_snapshots.append(
            {
                "round": int(round_number or 0),
                "era": str(era_label or ""),
                "players": players_snapshot,
            }
        )

    def build_report(self, session: GameSession, final_stats: List[Dict[str, Any]], ended_reason: str) -> Dict[str, Any]:
        winner_id = getattr(session.state, "winner_id", None)
        winner_name = None
        if winner_id:
            winner = session.state.players.get(winner_id)
            winner_name = getattr(winner, "username", None) if winner else None

        players = [
            {"id": str(pid), "name": str(getattr(player, "username", pid))}
            for pid, player in session.state.players.items()
        ]
        player_count = len(players) or 1
        bot_count = len([p for p in session.state.players.values() if getattr(p, "is_bot", False)])
        wins = {str(winner_id): 1} if winner_id else {}
        win_rates = {str(winner_id): 1.0} if winner_id else {}
        run = {
            "id": 1,
            "winner_id": str(winner_id) if winner_id else None,
            "winner_name": winner_name,
            "final_stats": final_stats,
            "actions": self.actions,
            "round_snapshots": self.round_snapshots,
            "total_actions": len(self.actions),
            "truncated": False,
            "ended_reason": ended_reason,
            "action_types": sorted(self._action_types),
            "cards_used": list(self._cards_used.values()),
            "card_stats": {},
        }
        duration_ms = int((time.time() - self.started_at) * 1000)
        return {
            "simulations": 1,
            "bot_count": bot_count,
            "players": players,
            "wins": wins,
            "win_rates": win_rates,
            "action_counts": self.action_counts,
            "card_usage": self.card_usage,
            "card_index": self.card_index,
            "card_balance_data": {},
            "threat_index": {},
            "runs": [run],
            "config": {
                "source": "live_game",
                "game_id": self.game_id,
                "ended_reason": ended_reason,
                "player_count": player_count,
                "bot_count": bot_count,
            },
            "duration_ms": duration_ms,
        }

    def write_report(self, report: Dict[str, Any]) -> Path:
        _ensure_reports_dir()
        path = REPORTS_DIR / f"{self.game_id}.json"
        path.write_text(json.dumps(report, indent=2))
        return path
