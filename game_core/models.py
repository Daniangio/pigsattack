from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Dict, List, Optional


class ResourceType(str, Enum):
    RED = "R"
    BLUE = "B"
    GREEN = "G"


class Stance(str, Enum):
    AGGRESSIVE = "AGGRESSIVE"
    TACTICAL = "TACTICAL"
    HUNKERED = "HUNKERED"
    BALANCED = "BALANCED"


class TokenType(str, Enum):
    ATTACK = "attack"
    CONVERSION = "conversion"
    MASS = "mass"
    WILD = "wild"


class CardType(str, Enum):
    UPGRADE = "Upgrade"
    WEAPON = "Weapon"
    THREAT = "Threat"
    BOSS = "Boss"


class GamePhase(str, Enum):
    SETUP = "SETUP"
    ROUND_START = "ROUND_START"
    PLAYER_TURN = "PLAYER_TURN"
    ROUND_END = "ROUND_END"
    GAME_OVER = "GAME_OVER"


class PlayerStatus(str, Enum):
    ACTIVE = "ACTIVE"
    SURRENDERED = "SURRENDERED"
    DISCONNECTED = "DISCONNECTED"


STANCE_PROFILES: Dict[Stance, Dict[str, Any]] = {
    Stance.AGGRESSIVE: {"production": {ResourceType.RED: 4, ResourceType.BLUE: 0, ResourceType.GREEN: 1}, "discount": ResourceType.RED},
    Stance.TACTICAL: {"production": {ResourceType.RED: 1, ResourceType.BLUE: 3, ResourceType.GREEN: 1}, "discount": ResourceType.BLUE},
    Stance.HUNKERED: {"production": {ResourceType.RED: 0, ResourceType.BLUE: 1, ResourceType.GREEN: 4}, "discount": ResourceType.GREEN},
    Stance.BALANCED: {"production": {ResourceType.RED: 2, ResourceType.BLUE: 2, ResourceType.GREEN: 1}, "discount": None},
}


def empty_resources() -> Dict[ResourceType, int]:
    return {ResourceType.RED: 0, ResourceType.BLUE: 0, ResourceType.GREEN: 0}


def resource_from_json(raw: Dict[str, int]) -> Dict[ResourceType, int]:
    return {
        ResourceType.RED: raw.get("R", 0),
        ResourceType.BLUE: raw.get("B", 0),
        ResourceType.GREEN: raw.get("G", 0),
    }


def resource_to_wire(resources: Dict[ResourceType, int]) -> Dict[str, int]:
    return {
        "R": resources.get(ResourceType.RED, 0),
        "B": resources.get(ResourceType.BLUE, 0),
        "G": resources.get(ResourceType.GREEN, 0),
    }


def clamp_cost(cost: Dict[ResourceType, int]) -> Dict[ResourceType, int]:
    return {k: max(0, v) for k, v in cost.items()}


@dataclass
class ThreatCard:
    id: str
    name: str
    cost: Dict[ResourceType, int]
    vp: int
    type: str
    reward: str

    def to_public_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "cost": resource_to_wire(self.cost),
            "vp": self.vp,
            "type": self.type,
            "reward": self.reward,
        }


@dataclass
class BossThreshold:
    label: str
    cost: Dict[ResourceType, int]
    reward: str

    def to_public_dict(self) -> Dict[str, Any]:
        return {"label": self.label, "cost": resource_to_wire(self.cost), "reward": self.reward}


@dataclass
class BossCard:
    id: str
    name: str
    vp: int
    thresholds: List[BossThreshold] = field(default_factory=list)

    def to_public_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "vp": self.vp,
            "thresholds": [t.to_public_dict() for t in self.thresholds],
        }


@dataclass
class MarketCard:
    id: str
    card_type: CardType
    name: str
    cost: Dict[ResourceType, int]
    vp: int
    effect: str
    uses: Optional[int] = None

    def to_public_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "type": self.card_type.value,
            "name": self.name,
            "cost": resource_to_wire(self.cost),
            "vp": self.vp,
            "effect": self.effect,
            "uses": self.uses,
        }


@dataclass
class MarketState:
    upgrades: List[MarketCard] = field(default_factory=list)
    weapons: List[MarketCard] = field(default_factory=list)

    def to_public_dict(self) -> Dict[str, Any]:
        return {
            "upgrades": [c.to_public_dict() for c in self.upgrades],
            "weapons": [c.to_public_dict() for c in self.weapons],
        }


@dataclass
class PlayerBoard:
    user_id: str
    username: str
    stance: Stance = Stance.BALANCED
    turn_initial_stance: Stance = Stance.BALANCED
    resources: Dict[ResourceType, int] = field(default_factory=empty_resources)
    tokens: Dict[TokenType, int] = field(default_factory=lambda: {t: 0 for t in TokenType})
    upgrade_slots: int = 1
    weapon_slots: int = 1
    upgrades: List[MarketCard] = field(default_factory=list)
    weapons: List[MarketCard] = field(default_factory=list)
    vp: int = 0
    status: PlayerStatus = PlayerStatus.ACTIVE

    def produce(self):
        profile = STANCE_PROFILES[self.stance]
        for res, amount in profile["production"].items():
            self.resources[res] = self.resources.get(res, 0) + amount

    def can_pay(self, cost: Dict[ResourceType, int]) -> bool:
        return all(self.resources.get(res, 0) >= amt for res, amt in cost.items())

    def pay(self, cost: Dict[ResourceType, int]):
        for res, amt in cost.items():
            self.resources[res] = max(0, self.resources.get(res, 0) - amt)

    def to_public_dict(self) -> Dict[str, Any]:
        return {
            "user_id": self.user_id,
            "username": self.username,
            "stance": self.stance.value,
            "turn_initial_stance": self.turn_initial_stance.value,
            "resources": resource_to_wire(self.resources),
            "tokens": {t.value: self.tokens.get(t, 0) for t in TokenType},
            "upgrade_slots": self.upgrade_slots,
            "weapon_slots": self.weapon_slots,
            "upgrades": [u.to_public_dict() for u in self.upgrades],
            "weapons": [w.to_public_dict() for w in self.weapons],
            "vp": self.vp,
            "status": self.status.value,
        }


@dataclass
class GameState:
    game_id: str
    players: Dict[str, PlayerBoard] = field(default_factory=dict)
    threat_rows: List[List[ThreatCard]] = field(default_factory=list)
    boss: Optional[BossCard] = None
    market: MarketState = field(default_factory=MarketState)
    phase: GamePhase = GamePhase.SETUP
    round: int = 0
    turn_order: List[str] = field(default_factory=list)
    active_player_index: int = 0
    log: List[str] = field(default_factory=list)
    winner_id: Optional[str] = None

    def add_log(self, message: str):
        self.log.append(message)
        print(f"[{self.game_id}] {message}")

    def get_active_player_id(self) -> Optional[str]:
        if not self.turn_order:
            return None
        return self.turn_order[self.active_player_index]

    def get_redacted_state(self, viewer_id: str) -> Dict[str, Any]:
        """Public view of the state; nothing secret yet so we return full info."""
        return {
            "game_id": self.game_id,
            "phase": self.phase.value,
            "round": self.round,
            "active_player_id": self.get_active_player_id(),
            "players": {pid: p.to_public_dict() for pid, p in self.players.items()},
            "turn_order": self.turn_order,
            "threat_rows": [[t.to_public_dict() for t in row] for row in self.threat_rows],
            "boss": self.boss.to_public_dict() if self.boss else None,
            "market": self.market.to_public_dict(),
            "log": self.log[-50:],
            "winner_id": self.winner_id,
            "viewer": viewer_id,
        }
