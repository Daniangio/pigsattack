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
    BOSS = "BOSS"
    GAME_OVER = "GAME_OVER"


class PlayerStatus(str, Enum):
    ACTIVE = "ACTIVE"
    SURRENDERED = "SURRENDERED"
    DISCONNECTED = "DISCONNECTED"


STANCE_PROFILES: Dict[Stance, Dict[str, Any]] = {
    Stance.AGGRESSIVE: {"production": {ResourceType.RED: 5, ResourceType.BLUE: 0, ResourceType.GREEN: 1}},
    Stance.TACTICAL:   {"production": {ResourceType.RED: 1, ResourceType.BLUE: 4, ResourceType.GREEN: 1}},
    Stance.HUNKERED:   {"production": {ResourceType.RED: 0, ResourceType.BLUE: 1, ResourceType.GREEN: 5}},
    Stance.BALANCED:   {"production": {ResourceType.RED: 2, ResourceType.BLUE: 2, ResourceType.GREEN: 2}},
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
    resources: Optional[Dict[ResourceType, int]] = None

    def apply(self, player: "PlayerBoard"):
        # Normalize token if stored as string
        tok = self.token
        if isinstance(tok, str):
            try:
                # Try by value (lower) then by name (upper)
                tok = TokenType(tok.lower())
            except Exception:
                try:
                    tok = TokenType[tok.upper()]
                except Exception:
                    tok = None
        if self.kind == "vp":
            player.vp += self.amount
        elif self.kind == "heal_wound":
            player.wounds = max(0, player.wounds - self.amount)
        elif self.kind == "token" and tok:
            player.tokens[tok] = player.tokens.get(tok, 0) + self.amount
        elif self.kind in {"stance_change", "free_stance_change"}:
            delta = self.amount if self.amount else 1
            player.free_stance_changes = max(0, player.free_stance_changes + delta)
        elif self.kind == "slot" and self.slot_type:
            if self.slot_type == "upgrade":
                player.upgrade_slots = min(4, player.upgrade_slots + self.amount)
            elif self.slot_type == "weapon":
                player.weapon_slots = min(4, player.weapon_slots + self.amount)
        elif self.kind == "resource" and self.resources:
            for res, amt in self.resources.items():
                player.resources[res] = player.resources.get(res, 0) + max(0, amt)

    def to_public_dict(self) -> Dict[str, Any]:
        resources_payload = None
        if self.resources:
            try:
                resources_payload = resource_to_wire(self.resources)
            except Exception:
                resources_payload = None
        return {
          "kind": self.kind,
          "amount": self.amount,
          "token": self.token.value if self.token else None,
          "slot_type": self.slot_type,
          "resources": resources_payload,
          "label": self.label,
        }

    @property
    def label(self) -> str:
        if self.kind == "vp":
            return f"{self.amount} VP"
        if self.kind == "heal_wound":
            return f"Heal {self.amount} wound(s)"
        if self.kind == "slot" and self.slot_type:
            return f"{self.slot_type.capitalize()} Slot"
        if self.kind == "token" and self.token:
            name = (
                self.token.value.capitalize()
                if isinstance(self.token, TokenType)
                else str(self.token).capitalize()
            )
            return f"{name} Token x{self.amount}"
        if self.kind in {"stance_change", "free_stance_change"}:
            amount = self.amount if self.amount else 1
            return f"Free Stance Change x{amount}" if amount != 1 else "Free Stance Change"
        if self.kind == "resource" and self.resources:
            parts = []
            for res, amt in (self.resources or {}).items():
                if amt:
                    parts.append(f"{amt}{res.value}")
            return "Resources: " + " ".join(parts)
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
    image: Optional[str] = None

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
            "image": self.image,
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
    image: Optional[str] = None
    thresholds: List[BossThreshold] = field(default_factory=list)

    def to_public_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "vp": self.vp,
            "image": self.image,
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
    upgrades_top: List[MarketCard] = field(default_factory=list)
    upgrades_bottom: List[MarketCard] = field(default_factory=list)
    weapons_top: List[MarketCard] = field(default_factory=list)
    weapons_bottom: List[MarketCard] = field(default_factory=list)
    upgrade_deck: List[MarketCard] = field(default_factory=list)
    weapon_deck: List[MarketCard] = field(default_factory=list)
    upgrade_discard: List[MarketCard] = field(default_factory=list)
    weapon_discard: List[MarketCard] = field(default_factory=list)

    def to_public_dict(self) -> Dict[str, Any]:
        return {
            "upgrades_top": [c.to_public_dict() for c in self.upgrades_top],
            "upgrades_bottom": [c.to_public_dict() for c in self.upgrades_bottom],
            "weapons_top": [c.to_public_dict() for c in self.weapons_top],
            "weapons_bottom": [c.to_public_dict() for c in self.weapons_bottom],
            "upgrade_deck_remaining": len(self.upgrade_deck),
            "weapon_deck_remaining": len(self.weapon_deck),
            "upgrade_discard_count": len(self.upgrade_discard),
            "weapon_discard_count": len(self.weapon_discard),
        }


@dataclass
class PlayerBoard:
    user_id: str
    username: str
    is_bot: bool = False
    personality: str = "greedy"
    planning_profile: str = "full"
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
    threats_defeated: int = 0
    defeated_threats: List[str] = field(default_factory=list)
    action_used: bool = False
    buy_used: bool = False
    extend_used: bool = False
    active_used: Dict[str, bool] = field(default_factory=dict)
    free_stance_changes: int = 0
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
            "is_bot": self.is_bot,
            "personality": self.personality,
            "planning_profile": self.planning_profile,
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
            "threats_defeated": self.threats_defeated,
            "defeated_threats": list(self.defeated_threats or []),
            "action_used": self.action_used,
            "buy_used": self.buy_used,
            "extend_used": self.extend_used,
            "active_used": self.active_used,
            "free_stance_changes": self.free_stance_changes,
            "status": self.status.value,
        }


@dataclass
class GameState:
    game_id: str
    verbose: bool = True
    players: Dict[str, PlayerBoard] = field(default_factory=dict)
    threat_rows: List[List[ThreatCard]] = field(default_factory=list)
    boss: Optional[BossCard] = None
    bosses: List[BossCard] = field(default_factory=list)
    threat_deck_remaining: int = 0
    market: MarketState = field(default_factory=MarketState)
    phase: GamePhase = GamePhase.SETUP
    era: str = "day"
    round: int = 0
    boss_mode: bool = False
    boss_stage: str = "day"
    boss_thresholds_state: List[Dict[str, Any]] = field(default_factory=list)
    boss_index: int = 0
    simulation_mode: bool = False
    turn_order: List[str] = field(default_factory=list)
    active_player_index: int = 0
    log: List[str] = field(default_factory=list)
    bot_logs: Dict[str, List[str]] = field(default_factory=dict)
    bot_runs: List[Dict[str, Any]] = field(default_factory=list)
    winner_id: Optional[str] = None

    def add_log(self, message: str):
        if not self.verbose:
            return
        self.log.append(message)
        print(f"[{self.game_id}] {message}")

    def add_bot_log(self, bot_id: str, message: str):
        if not self.verbose:
            return
        logs = self.bot_logs.setdefault(bot_id, [])
        logs.append(message)
        if len(logs) > 200:
            self.bot_logs[bot_id] = logs[-200:]

    def add_bot_logs(self, bot_id: str, entries: List[str]):
        if not self.verbose:
            return
        for entry in entries or []:
            self.add_bot_log(bot_id, entry)

    def add_bot_log(self, bot_id: str, message: str):
        """Store planner logs per bot and keep them trimmed."""
        logs = self.bot_logs.setdefault(bot_id, [])
        logs.append(message)
        if len(logs) > 200:
            self.bot_logs[bot_id] = logs[-200:]

    def add_bot_logs(self, bot_id: str, entries: List[str]):
        for entry in entries or []:
            self.add_bot_log(bot_id, entry)

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
            "boss_mode": self.boss_mode,
            "boss_stage": self.boss_stage,
            "boss_thresholds": self.boss_thresholds_state,
            "boss_index": self.boss_index,
            "threat_deck_remaining": self.threat_deck_remaining,
            "era": self.era,
            "market": self.market.to_public_dict(),
            "log": self.log[-50:],
            "bot_logs": {pid: logs[-200:] for pid, logs in self.bot_logs.items()},
            "bot_runs": self.bot_runs[-50:],
            "winner_id": self.winner_id,
            "viewer": viewer_id,
        }
