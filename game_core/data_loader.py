import json
from pathlib import Path
from typing import List, Optional, Tuple

from .models import (
    BossCard,
    BossThreshold,
    CardType,
    MarketCard,
    MarketState,
    ResourceType,
    ThreatCard,
    resource_from_json,
    Reward,
    TokenType,
)


def parse_reward_text(raw: str) -> List[Reward]:
    if not raw:
        return []
    parts = [p.strip() for p in raw.split("+")]
    rewards: List[Reward] = []
    for part in parts:
        if not part:
            continue
        # VP reward
        if "vp" in part.lower():
            try:
                val = int("".join([c for c in part if c.isdigit()]) or "0")
                rewards.append(Reward(kind="vp", amount=val))
                continue
            except ValueError:
                pass
        # Slot reward
        if "slot" in part.lower():
            if "upgrade" in part.lower():
                rewards.append(Reward(kind="slot", slot_type="upgrade", amount=1))
                continue
            if "weapon" in part.lower():
                rewards.append(Reward(kind="slot", slot_type="weapon", amount=1))
                continue
        # Token reward
        if "token" in part.lower():
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
                if key in part.lower():
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

    def load_threats(self) -> Tuple[List[List[ThreatCard]], Optional[BossCard]]:
        data = self._load_json("threats.json")

        boss = None
        if boss_data := data.get("boss"):
            thresholds = [
                BossThreshold(
                    label=t["label"],
                    cost=resource_from_json(t.get("cost", {})),
                    reward=t.get("reward", ""),
                    spoils=parse_reward_text(t.get("reward", "")),
                )
                for t in boss_data.get("thresholds", [])
            ]
            boss = BossCard(
                id=boss_data["id"],
                name=boss_data["name"],
                vp=boss_data.get("vp", 0),
                thresholds=thresholds,
            )

        rows: List[List[ThreatCard]] = []
        for row in data.get("rows", []):
            threats: List[ThreatCard] = []
            for raw in row:
                threats.append(
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
            rows.append(threats)

        return rows, boss

    def load_market(self) -> MarketState:
        data = self._load_json("market.json")

        upgrades = [
            MarketCard(
                id=raw["id"],
                card_type=CardType.UPGRADE,
                name=raw["name"],
                cost=resource_from_json(raw.get("cost", {})),
                vp=raw.get("vp", 0),
                effect=raw.get("effect", ""),
            )
            for raw in data.get("upgrades", [])
        ]

        weapons = [
            MarketCard(
                id=raw["id"],
                card_type=CardType.WEAPON,
                name=raw["name"],
                cost=resource_from_json(raw.get("cost", {})),
                vp=raw.get("vp", 0),
                effect=raw.get("effect", ""),
                uses=raw.get("uses"),
            )
            for raw in data.get("weapons", [])
        ]

        return MarketState(upgrades=upgrades, weapons=weapons)
