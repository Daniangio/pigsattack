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

class UpgradeCard(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    cost: Dict[ScrapType, int]
    effect: str
    permanent_defense: Dict[ScrapType, int] = Field(default_factory=dict)
    special_effect_id: Optional[str] = None

class ArsenalCard(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    cost: Dict[ScrapType, int]
    effect: str
    defense_boost: Dict[ScrapType, int] = Field(default_factory=dict)
    special_effect_id: Optional[str] = None

# --- State-Holding Models ---

class ScrapPool(BaseModel):
    """Represents the bag of scrap tokens."""
    scraps: List[ScrapType] = Field(default_factory=list)

    def __init__(self, **data):
        super().__init__(**data)
        if not self.scraps:
            # Initialize with 50 of each
            self.scraps.extend([ScrapType.PARTS] * 50)
            self.scraps.extend([ScrapType.WIRING] * 50)
            self.scraps.extend([ScrapType.PLATES] * 50)
            random.shuffle(self.scraps)

    def draw_random(self, count: int) -> List[ScrapType]:
        """Draws 'count' scraps from the pool."""
        drawn = []
        for _ in range(count):
            if not self.scraps:
                break # Pool is empty
            drawn.append(self.scraps.pop(random.randint(0, len(self.scraps) - 1)))
        return drawn
    
    def add(self, scraps_to_add: List[ScrapType]):
        """Adds scrap back to the pool."""
        self.scraps.extend(scraps_to_add)
        random.shuffle(self.scraps) # Not strictly necessary but good practice

class Market(BaseModel):
    """Holds the face-up market cards."""
    upgrade_market: List[UpgradeCard] = Field(default_factory=list)
    arsenal_market: List[ArsenalCard] = Field(default_factory=list)

class PlayerPlans(BaseModel):
    """Holds a player's submitted plan for the round."""
    ready: bool = False
    lure_card: Optional[LureCard] = None
    action_card: Optional[SurvivorActionCard] = None

class PlayerDefense(BaseModel):
    """Holds a player's submitted defense for the round."""
    ready: bool = False
    scrap_spent: Dict[ScrapType, int] = Field(default_factory=dict)
    arsenal_cards_used: List[str] = Field(default_factory=list) # List of ArsenalCard IDs

class PlayerState(BaseModel):
    """Represents the complete state of a single player."""
    user_id: str
    username: str
    status: str # "ACTIVE", "SURRENDERED", "ELIMINATED", "DISCONNECTED"
    hp: int = 2
    scrap: Dict[ScrapType, int] = Field(default_factory=lambda: {
        ScrapType.PARTS: 0,
        ScrapType.WIRING: 0,
        ScrapType.PLATES: 0,
    })
    upgrades: List[UpgradeCard] = Field(default_factory=list)
    arsenal_hand: List[ArsenalCard] = Field(default_factory=list)
    trophies: List[LureCard] = Field(default_factory=list) # Store trophies by their Lure type
    
    # Round-specific state
    assigned_threat: Optional[ThreatCard] = None
    defense_result: Optional[str] = None # "KILL", "DEFEND", "FAIL"

class GameState(BaseModel):
    """The root model for all state of a single game instance."""
    game_id: str
    phase: GamePhase = GamePhase.WILDERNESS
    players: Dict[str, PlayerState]
    initiative_queue: List[str] # List of user_ids in order
    first_player: str # user_id of the first player
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
    
    # --- NEW FIELDS FOR ATTRACTION PHASE ---
    attraction_phase_state: Optional[str] = None # "FIRST_PASS" or "SECOND_PASS"
    attraction_turn_player_id: Optional[str] = None # user_id of player whose turn it is
    available_threat_ids: List[str] = Field(default_factory=list) # IDs of threats not yet taken
    unassigned_player_ids: List[str] = Field(default_factory=list) # user_ids of players who still need a threat
    # --- END NEW FIELDS ---
    
    winner: Optional[PlayerState] = None

    def add_log(self, message: str):
        """Adds a message to the game log."""
        print(f"[{self.game_id}] {message}")
        self.log.append(message)

    def get_active_players(self) -> List[PlayerState]:
        """Returns a list of all players with 'ACTIVE' status."""
        return [p for p in self.players.values() if p.status == "ACTIVE"]

    def get_player_public_state(self, player_id: str) -> Dict[str, Any]:
        """
        Generates the public-facing game state, redacting sensitive
        information for all players *except* the one specified.
        """
        
        # Helper to redact plans for other players
        def get_redacted_plans():
            redacted_plans = {}
            for pid, plan in self.player_plans.items():
                if pid == player_id:
                    redacted_plans[pid] = plan # Show self
                else:
                    # Show only readiness for others
                    redacted_plans[pid] = PlayerPlans(ready=plan.ready)
            return redacted_plans
            
        # Helper to redact defenses for other players
        def get_redacted_defenses():
            redacted_defenses = {}
            for pid, defense in self.player_defenses.items():
                 if pid == player_id:
                     redacted_defenses[pid] = defense
                 else:
                     redacted_defenses[pid] = PlayerDefense(ready=defense.ready)
            return redacted_defenses

        # Helper to redact other players' hands
        def get_redacted_players():
            redacted_players = {}
            for pid, player in self.players.items():
                if pid == player_id:
                    redacted_players[pid] = player # Show self
                else:
                    # Redact arsenal hand
                    redacted_p = player.model_copy()
                    # Show *count* of cards, not the cards themselves
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
        }
        
        return public_state
