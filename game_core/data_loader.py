import json
from pathlib import Path
from typing import Any, Dict, List, Optional

from .models import BossCard, BossThreshold, CardType, MarketCard, MarketState, ThreatCard, Reward, TokenType, resource_from_json
from .threats import ThreatDeckData


def parse_reward_text(raw: str) -> List[Reward]:
    if not raw:
        return []
    parts = [p.strip() for p in raw.split("+")]
    rewards: List[Reward] = []
    for part in parts:
        if not part:
            continue
        lower_part = part.lower()
        # VP reward
        if "vp" in lower_part:
            try:
                val = int("".join([c for c in part if c.isdigit()]) or "0")
                rewards.append(Reward(kind="vp", amount=val))
                continue
            except ValueError:
                pass
        # Slot reward
        if "slot" in lower_part:
            if "upgrade" in lower_part:
                rewards.append(Reward(kind="slot", slot_type="upgrade", amount=1))
                continue
            if "weapon" in lower_part:
                rewards.append(Reward(kind="slot", slot_type="weapon", amount=1))
                continue
        # Token reward
        token_map = {
            "attack": TokenType.ATTACK,
            "conversion": TokenType.CONVERSION,
            "mass": TokenType.MASS,
            "wild": TokenType.WILD,
            "boss": TokenType.BOSS,
        }
        amount = 1
        digits = "".join([c for c in part if c.isdigit()])
        if digits:
            try:
                amount = int(digits)
            except ValueError:
                amount = 1
        for key, token in token_map.items():
            if key in lower_part:
                rewards.append(Reward(kind="token", token=token, amount=amount))
                break
    return rewards


class GameDataLoader:
    """Loads static game data from JSON files."""

    def __init__(self, data_root: Optional[Path] = None):
        self.data_root = data_root or Path(__file__).resolve().parent / "data"

    def _load_json(self, filename: str):
        path = self.data_root / filename
        with path.open("r", encoding="utf-8") as handle:
            return json.load(handle)

    def load_threats(self) -> ThreatDeckData:
        data = self._load_json("threats.json")

        bosses: List[BossCard] = []
        for boss_data in data.get("bosses", []):
            thresholds = [
                BossThreshold(
                    label=t["label"],
                    cost=resource_from_json(t.get("cost", {})),
                    reward=t.get("reward", ""),
                    spoils=parse_reward_text(t.get("reward", "")),
                )
                for t in boss_data.get("thresholds", [])
            ]
            bosses.append(
                BossCard(
                    id=boss_data["id"],
                    name=boss_data["name"],
                    vp=boss_data.get("vp", 0),
                    thresholds=thresholds,
                )
            )

        day_threats = self._parse_threat_list(data.get("day_threats", []))
        night_threats = self._parse_threat_list(data.get("night_threats", []))

        # Legacy fallback (old format) - flatten rows into day threats if new fields missing
        if not day_threats and data.get("rows"):
            for row in data.get("rows", []):
                for raw in row:
                    day_threats.append(
                        ThreatCard(
                            id=raw["id"],
                            name=raw["name"],
                            cost=resource_from_json(raw.get("cost", {})),
                            vp=raw.get("vp", 0),
                            type=raw.get("type", "Unknown"),
                            reward=raw.get("reward", ""),
                            spoils=parse_reward_text(raw.get("reward", "")),
                        )
                    )

        return ThreatDeckData(day_threats=day_threats, night_threats=night_threats, bosses=bosses)

    def load_market(self) -> MarketState:
        data = self._load_json("market.json")

        def build_cards(raw_items, card_type: CardType) -> List[MarketCard]:
            cards: List[MarketCard] = []
            for raw in raw_items:
                copies = int(raw.get("copies", 1)) if isinstance(raw, dict) else 1
                card = MarketCard(
                    id=raw["id"],
                    card_type=card_type,
                    name=raw["name"],
                    cost=resource_from_json(raw.get("cost", {})),
                    vp=raw.get("vp", 0),
                    effect=raw.get("effect", ""),
                    uses=raw.get("uses") if card_type == CardType.WEAPON else None,
                    tags=raw.get("tags", []),
                )
                for _ in range(max(1, copies)):
                    cards.append(card)
            return cards

        upgrades = build_cards(data.get("upgrades", []), CardType.UPGRADE)
        weapons = build_cards(data.get("weapons", []), CardType.WEAPON)

        return MarketState(upgrades=upgrades, weapons=weapons)

    def _parse_threat_list(self, raw_items: List[Dict[str, Any]]) -> List[ThreatCard]:
        threats: List[ThreatCard] = []
        for raw in raw_items:
            threats.append(
                ThreatCard(
                    id=raw["id"],
                    name=raw["name"],
                    cost=resource_from_json(raw.get("cost", {})),
                    vp=raw.get("vp", 0),
                    type=raw.get("type", "Unknown"),
                    reward=raw.get("reward", ""),
                    copies=int(raw.get("copies", 1)),
                    spoils=parse_reward_text(raw.get("reward", "")),
                )
            )
        return threats
