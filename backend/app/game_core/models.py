"""
Pydantic models for the core game state and logic.
All business logic for the game itself lives in this directory.
"""

from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any, Tuple
from enum import Enum
import random
import uuid

# --- Enums ---

class GamePhase(str, Enum):
    WILDERNESS = "WILDERNESS"
    PLANNING = "PLANNING"
    ATTRACTION = "ATTRACTION"
    DEFENSE = "DEFENSE"
    ACTION = "ACTION"
    CLEANUP = "CLEANUP"
    GAME_OVER = "GAME_OVER"

class ScrapType(str, Enum):
    PARTS = "PARTS"    # Red, vs Ferocity
    WIRING = "WIRING"  # Blue, vs Cunning
    PLATES = "PLATES"  # Green, vs Mass

class LureCard(str, Enum):
    BLOODY_RAGS = "BLOODY_RAGS"
    STRANGE_NOISES = "STRANGE_NOISES"
    FALLEN_FRUIT = "FALLEN_FRUIT"

class SurvivorActionCard(str, Enum):
    SCAVENGE = "SCAVENGE"
    FORTIFY = "FORTIFY"
    ARMORY_RUN = "ARMORY_RUN"
    SCHEME = "SCHEME"

# --- Data-Only Card Models ---

class Card(BaseModel):
    """Base class for cards."""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    effect: str
    cost: Dict[ScrapType, int] = Field(default_factory=dict)

class ThreatCard(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    era: str
    lure: LureCard
    ferocity: int
    cunning: int
    mass: int
    ability: Optional[str] = None
    spoil: Dict[ScrapType, int] = Field(default_factory=dict)
    trophy: LureCard # Trophies are just LureCard enums

class UpgradeCard(Card):
    permanent_defense: Dict[ScrapType, int] = Field(default_factory=dict)
    special_effect_id: Optional[str] = None

class ArsenalCard(Card):
    defense_boost: Dict[ScrapType, int] = Field(default_factory=dict)
    special_effect_id: Optional[str] = None

# --- State-Holding Models ---

class ScrapPool(BaseModel):
    """Represents the bag of scrap tokens."""
    scraps: List[ScrapType] = Field(default_factory=list)

    def __init__(self, **data):
        super().__init__(**data)
        if not self.scraps:
            self.scraps.extend([ScrapType.PARTS] * 50)
            self.scraps.extend([ScrapType.WIRING] * 50)
            self.scraps.extend([ScrapType.PLATES] * 50)
            random.shuffle(self.scraps)

    def draw_random(self, count: int) -> List[ScrapType]:
        """Draws 'count' scraps from the pool."""
        drawn = []
        for _ in range(count):
            if not self.scraps:
                break
            drawn.append(self.scraps.pop(random.randint(0, len(self.scraps) - 1)))
        return drawn
    
    def add(self, scraps_to_add: List[ScrapType]):
        """Adds scrap back to the pool."""
        self.scraps.extend(scraps_to_add)
        random.shuffle(self.scraps)
    
    def add_from_dict(self, scraps_dict: Dict[ScrapType, int]):
        """Adds scrap back to the pool from a cost dictionary."""
        for scrap_type, amount in scraps_dict.items():
            self.scraps.extend([scrap_type] * amount)
        random.shuffle(self.scraps)

class Market(BaseModel):
    """Holds the face-up market cards."""
    upgrade_market: List[UpgradeCard] = Field(default_factory=list)
    arsenal_market: List[ArsenalCard] = Field(default_factory=list)

    def find_upgrade(self, card_id: str) -> Tuple[Optional[UpgradeCard], Optional[int]]:
        """Finds an upgrade card by ID and returns it and its index."""
        for i, card in enumerate(self.upgrade_market):
            if card.id == card_id:
                return card, i
        return None, None
        
    def find_arsenal(self, card_id: str) -> Tuple[Optional[ArsenalCard], Optional[int]]:
        """Finds an arsenal card by ID and returns it and its index."""
        for i, card in enumerate(self.arsenal_market):
            if card.id == card_id:
                return card, i
        return None, None

class PlayerPlans(BaseModel):
    """Holds a player's submitted plan for the round."""
    ready: bool = False
    lure_card: Optional[LureCard] = None
    action_card: Optional[SurvivorActionCard] = None

class PlayerDefense(BaseModel):
    """Holds a player's submitted defense for the round."""
    ready: bool = False
    scrap_spent: Dict[ScrapType, int] = Field(default_factory=dict)
    arsenal_cards_used: List[str] = Field(default_factory=list)

class PlayerState(BaseModel):
    """Represents the complete state of a single player."""
    user_id: str
    username: str
    status: str 
    hp: int = 2
    scrap: Dict[ScrapType, int] = Field(default_factory=lambda: {
        ScrapType.PARTS: 0,
        ScrapType.WIRING: 0,
        ScrapType.PLATES: 0,
    })
    upgrades: List[UpgradeCard] = Field(default_factory=list)
    arsenal_hand: List[ArsenalCard] = Field(default_factory=list)
    trophies: List[LureCard] = Field(default_factory=list)
    
    # Round-specific state
    assigned_threat: Optional[ThreatCard] = None
    defense_result: Optional[str] = None # "KILL", "DEFEND", "FAIL"
    action_choice_pending: Optional[str] = None # e.g., "SCAVENGE", "FORTIFY"
    last_round_lure: Optional[LureCard] = None

    def can_afford(self, cost: Dict[ScrapType, int]) -> bool:
        """Checks if the player has enough scrap for a given cost."""
        for scrap_type, amount in cost.items():
            if self.scrap.get(scrap_type, 0) < amount:
                return False
        return True

    def pay_cost(self, cost: Dict[ScrapType, int]):
        """Deducts scrap from the player for a given cost."""
        if not self.can_afford(cost):
            raise ValueError(f"Player {self.username} cannot afford cost.")
        for scrap_type, amount in cost.items():
            self.scrap[scrap_type] -= amount

class GameState(BaseModel):
    """The root model for all state of a single game instance."""
    game_id: str
    phase: GamePhase = GamePhase.WILDERNESS
    players: Dict[str, PlayerState]
    initiative_queue: List[str]
    first_player: str
    log: List[str] = Field(default_factory=list)
    
    # Decks
    threat_deck: List[ThreatCard] = Field(default_factory=list)
    upgrade_deck: List[UpgradeCard] = Field(default_factory=list)
    arsenal_deck: List[ArsenalCard] = Field(default_factory=list)
    scrap_pool: ScrapPool = Field(default_factory=ScrapPool)
    market: Market = Field(default_factory=Market)

    # Round-specific state
    current_threats: List[ThreatCard] = Field(default_factory=list)
    player_plans: Dict[str, PlayerPlans] = Field(default_factory=dict)
    player_defenses: Dict[str, PlayerDefense] = Field(default_factory=dict)
    
    # Attraction Phase state
    attraction_phase_state: Optional[str] = None 
    attraction_turn_player_id: Optional[str] = None
    available_threat_ids: List[str] = Field(default_factory=list)
    unassigned_player_ids: List[str] = Field(default_factory=list)
    
    # Action Phase state
    action_turn_player_id: Optional[str] = None
    
    winner: Optional[PlayerState] = None

    def add_log(self, message: str):
        """Adds a message to the game log."""
        print(f"[{self.game_id}] {message}")
        # Keep log from getting too long
        if len(self.log) > 100:
            self.log = self.log[-50:]
        self.log.append(message)

    # get_active_players now iterates over the initiative_queue to guarantee order.
    # It also no longer needs to be a method of GameState, but can be
    # called by GameInstance, which passes in the correct state components.
    def get_active_players_in_order(self) -> List[PlayerState]:
        """
        Returns a list of all 'ACTIVE' players, in initiative_queue order.
        """
        active_players = []
        for pid in self.initiative_queue:
            player = self.players.get(pid)
            if player and player.status == "ACTIVE":
                active_players.append(player)
        return active_players

    def get_player_public_state(self, player_id: str) -> Dict[str, Any]:
        """
        Generates the public-facing game state, redacting sensitive
        information for all players *except* the one specified.
        """
        
        def get_redacted_plans():
            redacted_plans = {}
            for pid, plan in self.player_plans.items():
                if pid == player_id:
                    redacted_plans[pid] = plan
                else:
                    redacted_plans[pid] = PlayerPlans(ready=plan.ready)
            return redacted_plans
            
        def get_redacted_defenses():
            redacted_defenses = {}
            for pid, defense in self.player_defenses.items():
                 if pid == player_id:
                     redacted_defenses[pid] = defense
                 else:
                     redacted_defenses[pid] = PlayerDefense(ready=defense.ready)
            return redacted_defenses

        def get_redacted_players():
            redacted_players = {}
            for pid, player in self.players.items():
                if pid == player_id:
                    redacted_players[pid] = player
                else:
                    redacted_p = player.model_copy()
                    redacted_p.arsenal_hand = [
                        ArsenalCard(id=f"hidden_{i}", name="Hidden", cost={}, effect="")
                        for i in range(len(player.arsenal_hand))
                    ]
                    redacted_players[pid] = redacted_p
            return redacted_players

        # Build the final payload
        public_state = {
            "game_id": self.game_id,
            "phase": self.phase,
            "players": {pid: p.model_dump() for pid, p in get_redacted_players().items()},
            "initiative_queue": self.initiative_queue,
            "first_player": self.first_player,
            "log": self.log,
            "market": self.market.model_dump(),
            "current_threats": [t.model_dump() for t in self.current_threats],
            "player_plans": {pid: p.model_dump() for pid, p in get_redacted_plans().items()},
            "player_defenses": {pid: p.model_dump() for pid, p in get_redacted_defenses().items()},
            "winner": self.winner.model_dump() if self.winner else None,
            "attraction_phase_state": self.attraction_phase_state,
            "attraction_turn_player_id": self.attraction_turn_player_id,
            "available_threat_ids": self.available_threat_ids,
            "unassigned_player_ids": self.unassigned_player_ids,
            "action_turn_player_id": self.action_turn_player_id,
        }
        
        return public_state
