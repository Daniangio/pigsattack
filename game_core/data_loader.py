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
)


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
