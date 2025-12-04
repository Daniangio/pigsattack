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
    BOSS = "boss"


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
    Stance.AGGRESSIVE: {"production": {ResourceType.RED: 4, ResourceType.BLUE: 0, ResourceType.GREEN: 1}},
    Stance.TACTICAL: {"production": {ResourceType.RED: 1, ResourceType.BLUE: 3, ResourceType.GREEN: 1}},
    Stance.HUNKERED: {"production": {ResourceType.RED: 0, ResourceType.BLUE: 1, ResourceType.GREEN: 4}},
    Stance.BALANCED: {"production": {ResourceType.RED: 2, ResourceType.BLUE: 2, ResourceType.GREEN: 2}},
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
class Reward:
    kind: str  # "token", "vp", "slot"
    amount: int = 0
    token: Optional[TokenType] = None
    slot_type: Optional[str] = None  # "upgrade" or "weapon"

    def apply(self, player: "PlayerBoard"):
        if self.kind == "vp":
            player.vp += self.amount
        elif self.kind == "token" and self.token:
            player.tokens[self.token] = player.tokens.get(self.token, 0) + self.amount
        elif self.kind == "slot" and self.slot_type:
            if self.slot_type == "upgrade":
                player.upgrade_slots = min(4, player.upgrade_slots + self.amount)
            elif self.slot_type == "weapon":
                player.weapon_slots = min(4, player.weapon_slots + self.amount)

    def to_public_dict(self) -> Dict[str, Any]:
        return {
          "kind": self.kind,
          "amount": self.amount,
          "token": self.token.value if self.token else None,
          "slot_type": self.slot_type,
          "label": self.label,
        }

    @property
    def label(self) -> str:
        if self.kind == "vp":
            return f"{self.amount} VP"
        if self.kind == "slot" and self.slot_type:
            return f"{self.slot_type.capitalize()} Slot"
        if self.kind == "token" and self.token:
            return f"{self.token.value.capitalize()} Token x{self.amount}"
        return "Reward"

@dataclass
class ThreatCard:
    id: str
    name: str
    cost: Dict[ResourceType, int]
    vp: int
    type: str
    reward: str
    copies: int = 1
    spoils: List[Reward] = field(default_factory=list)

    def to_public_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "cost": resource_to_wire(self.cost),
            "vp": self.vp,
            "type": self.type,
            "reward": self.reward,
            "spoils": [r.to_public_dict() for r in self.spoils],
            "copies": self.copies,
        }


@dataclass
class BossThreshold:
    label: str
    cost: Dict[ResourceType, int]
    reward: str
    spoils: List[Reward] = field(default_factory=list)

    def to_public_dict(self) -> Dict[str, Any]:
        return {
            "label": self.label,
            "cost": resource_to_wire(self.cost),
            "reward": self.reward,
            "spoils": [r.to_public_dict() for r in self.spoils],
        }


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
    tags: List[str] = field(default_factory=list)

    def to_public_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "type": self.card_type.value,
            "name": self.name,
            "cost": resource_to_wire(self.cost),
            "vp": self.vp,
            "effect": self.effect,
            "uses": self.uses,
            "tags": self.tags,
        }


@dataclass
class MarketState:
    upgrades: List[MarketCard] = field(default_factory=list)
    weapons: List[MarketCard] = field(default_factory=list)
    upgrade_deck: List[MarketCard] = field(default_factory=list)
    weapon_deck: List[MarketCard] = field(default_factory=list)

    def to_public_dict(self) -> Dict[str, Any]:
        return {
            "upgrades": [c.to_public_dict() for c in self.upgrades],
            "weapons": [c.to_public_dict() for c in self.weapons],
            "upgrade_deck_remaining": len(self.upgrade_deck),
            "weapon_deck_remaining": len(self.weapon_deck),
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
    wounds: int = 0
    action_used: bool = False
    buy_used: bool = False
    extend_used: bool = False
    active_used: Dict[str, bool] = field(default_factory=dict)
    status: PlayerStatus = PlayerStatus.ACTIVE

    def produce(self):
        profile = STANCE_PROFILES[self.stance]
        for res, amount in profile["production"].items():
            self.resources[res] = self.resources.get(res, 0) + amount

    def add_resources(self, additions: Dict[ResourceType, int]):
        for res, amt in additions.items():
            self.resources[res] = self.resources.get(res, 0) + amt

    def can_pay(self, cost: Dict[ResourceType, int]) -> bool:
        return all(self.resources.get(res, 0) >= amt for res, amt in cost.items())

    def pay(self, cost: Dict[ResourceType, int]):
        for res, amt in cost.items():
            self.resources[res] = max(0, self.resources.get(res, 0) - amt)

    def add_wounds(self, amount: int = 1):
        self.wounds = max(0, self.wounds + amount)

    def lose_resources(self, amounts: Dict[ResourceType, int]) -> Dict[ResourceType, int]:
        """Removes the specified resources, clamping at 0. Returns what was actually removed."""
        removed: Dict[ResourceType, int] = {}
        for res, amt in amounts.items():
            if amt <= 0:
                continue
            current = self.resources.get(res, 0)
            delta = min(current, amt)
            if delta:
                self.resources[res] = current - delta
            removed[res] = delta
        return removed

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
            "wounds": self.wounds,
            "action_used": self.action_used,
            "buy_used": self.buy_used,
            "extend_used": self.extend_used,
            "active_used": self.active_used,
            "status": self.status.value,
        }


@dataclass
class GameState:
    game_id: str
    players: Dict[str, PlayerBoard] = field(default_factory=dict)
    threat_rows: List[List[ThreatCard]] = field(default_factory=list)
    boss: Optional[BossCard] = None
    bosses: List[BossCard] = field(default_factory=list)
    threat_deck_remaining: int = 0
    market: MarketState = field(default_factory=MarketState)
    phase: GamePhase = GamePhase.SETUP
    era: str = "day"
    round: int = 0
    turn_order: List[str] = field(default_factory=list)
    active_player_index: int = 0
    log: List[str] = field(default_factory=list)
    bot_logs: List[str] = field(default_factory=list)
    bot_runs: List[Dict[str, Any]] = field(default_factory=list)
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
            "bosses": [b.to_public_dict() for b in self.bosses],
            "threat_deck_remaining": self.threat_deck_remaining,
            "era": self.era,
            "market": self.market.to_public_dict(),
            "log": self.log[-50:],
            "bot_logs": self.bot_logs[-200:],
            "bot_runs": self.bot_runs[-10:],
            "winner_id": self.winner_id,
            "viewer": viewer_id,
        }
