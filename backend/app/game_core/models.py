"""
Contains all Pydantic models and Enums related to the
internal state of a single game instance.
This module is independent of the server/API.
"""

from pydantic import BaseModel, Field
from typing import List, Dict, Optional, Any
from enum import Enum
import random

# --- ENUMERATIONS ---

class ScrapType(str, Enum):
    PARTS = "PARTS"       # Red
    WIRING = "WIRING"     # Blue
    PLATES = "PLATES"     # Green

class LureCard(str, Enum):
    BLOODY_RAGS = "BLOODY_RAGS"
    STRANGE_NOISES = "STRANGE_NOISES"
    FALLEN_FRUIT = "FALLEN_FRUIT"

class SurvivorActionCard(str, Enum):
    SCAVENGE = "SCAVENGE"
    FORTIFY = "FORTIFY"
    ARMORY_RUN = "ARMORY_RUN"
    SCHEME = "SCHEME"

class GamePhase(str, Enum):
    SETUP = "SETUP"
    WILDERNESS = "WILDERNESS"       # Phase 1
    PLANNING = "PLANNING"         # Phase 2
    ATTRACTION = "ATTRACTION"       # Phase 3
    DEFENSE = "DEFENSE"           # Phase 4
    ACTION = "ACTION"             # Phase 5
    CLEANUP = "CLEANUP"           # Phase 6
    GAME_OVER = "GAME_OVER"

# --- CARD MODELS ---

class Card(BaseModel):
    """Base class for all cards."""
    id: str
    name: str

class ThreatCard(Card):
    era: str # 'Day', 'Twilight', 'Night'
    lure: LureCard
    ferocity: int = 0
    cunning: int = 0
    mass: int = 0
    ability: str = ""
    spoil: Dict[ScrapType, int] = Field(default_factory=dict)
    trophy: LureCard # The trophy is the same as the lure type

class UpgradeCard(Card):
    cost: Dict[ScrapType, int]
    effect: str
    # 'permanent_defense' is a simplified way to model the effect
    permanent_defense: Dict[ScrapType, int] = Field(default_factory=dict)
    # 'special_effect_id' can be used to trigger non-defense logic
    special_effect_id: Optional[str] = None

class ArsenalCard(Card):
    cost: Dict[ScrapType, int]
    effect: str
    # 'defense_boost' is a simplified way to model one-time effects
    defense_boost: Dict[ScrapType, int] = Field(default_factory=dict)
    special_effect_id: Optional[str] = None

# --- STATE MODELS ---

class PlayerPlans(BaseModel):
    """Stores the face-down cards for a player in the PLANNING phase."""
    lure_card: Optional[LureCard] = None
    action_card: Optional[SurvivorActionCard] = None
    ready: bool = False

class PlayerDefense(BaseModel):
    """Stores the submitted defense for a player in the DEFENSE phase."""
    scrap_spent: Dict[ScrapType, int] = Field(default_factory=dict)
    arsenal_cards_used: List[str] = Field(default_factory=list) # List of card IDs
    ready: bool = False

class PlayerState(BaseModel):
    """Represents the complete state of a single player."""
    user_id: str
    username: str
    status: str # 'ACTIVE', 'SURRENDERED', 'ELIMINATED'
    hp: int = 2
    scrap: Dict[ScrapType, int] = Field(default_factory=lambda: {
        ScrapType.PARTS: 0,
        ScrapType.WIRING: 0,
        ScrapType.PLATES: 0,
    })
    upgrades: List[UpgradeCard] = Field(default_factory=list)
    arsenal_hand: List[ArsenalCard] = Field(default_factory=list)
    trophies: List[LureCard] = Field(default_factory=list)
    
    # Per-round state
    assigned_threat: Optional[ThreatCard] = None
    defense_result: Optional[str] = None # "FAIL", "DEFEND", "KILL"

class MarketState(BaseModel):
    """Represents the face-up cards in the market."""
    upgrade_market: List[UpgradeCard] = Field(default_factory=list)
    arsenal_market: List[ArsenalCard] = Field(default_factory=list)

class ScrapPool(BaseModel):
    """Represents the central scrap bag."""
    pool: Dict[ScrapType, int] = Field(default_factory=lambda: {
        ScrapType.PARTS: 50,
        ScrapType.WIRING: 50,
        ScrapType.PLATES: 50,
    })

    def draw_random(self, count: int = 1) -> List[ScrapType]:
        """Draws 'count' scrap tokens randomly from the pool."""
        available = []
        for scrap_type, num in self.pool.items():
            available.extend([scrap_type] * num)
        
        if not available or len(available) < count:
            # Handle empty pool case, though rules don't specify
            return []

        drawn_scraps = []
        for _ in range(count):
            if not available:
                break # Stop if we run out mid-draw
            chosen = random.choice(available)
            drawn_scraps.append(chosen)
            available.remove(chosen)
            self.pool[chosen] -= 1

        return drawn_scraps

class GameState(BaseModel):
    """The complete, serializable state of a single game."""
    game_id: str
    phase: GamePhase = GamePhase.SETUP
    players: Dict[str, PlayerState] = Field(default_factory=dict) # key is user_id
    initiative_queue: List[str] = Field(default_factory=list) # List of user_id
    first_player: str # user_id of first player
    
    # Decks and Market
    threat_deck: List[ThreatCard] = Field(default_factory=list)
    upgrade_deck: List[UpgradeCard] = Field(default_factory=list)
    arsenal_deck: List[ArsenalCard] = Field(default_factory=list)
    scrap_pool: ScrapPool = Field(default_factory=ScrapPool)
    market: MarketState = Field(default_factory=MarketState)
    
    # Round-specific state
    current_threats: List[ThreatCard] = Field(default_factory=list)
    player_plans: Dict[str, PlayerPlans] = Field(default_factory=dict) # key is user_id
    player_defenses: Dict[str, PlayerDefense] = Field(default_factory=dict) # key is user_id
    winner: Optional[PlayerState] = None

    # Game log for clients
    log: List[str] = Field(default_factory=list)

    def get_active_players(self) -> List[PlayerState]:
        """Returns a list of players who are not eliminated or surrendered."""
        return [p for p in self.players.values() if p.status == 'ACTIVE']

    def add_log(self, message: str):
        """Adds a message to the game log."""
        print(f"[Game {self.game_id}]: {message}")
        self.log.insert(0, message)
        if len(self.log) > 50: # Keep log from getting too big
            self.log.pop()

    def get_player_public_state(self, user_id: str) -> Dict[str, Any]:
        """
        Generates a view of the state for a specific player,
        hiding secret information.
        """
        if user_id not in self.players:
            # This user is a spectator
            # TODO: Implement spectator view (hide all hands, plans)
            pass

        public_state = self.model_dump()
        
        # Hide secret information
        public_state.pop("threat_deck", None)
        public_state.pop("upgrade_deck", None)
        public_state.pop("arsenal_deck", None)

        # Hide other players' hands and plans
        for pid, player in public_state["players"].items():
            if pid != user_id:
                player["arsenal_hand"] = [
                    {"id": "hidden", "name": "Hidden Card"}
                ] * len(player["arsenal_hand"])

        # Hide face-down plans
        for pid, plan in public_state.get("player_plans", {}).items():
            if pid != user_id:
                plan["lure_card"] = "HIDDEN" if plan["lure_card"] else None
                plan["action_card"] = "HIDDEN" if plan["action_card"] else None

        return public_state
