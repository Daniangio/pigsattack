"""
Pydantic models for the core game state and logic.
All business logic for the game itself lives in this directory.

v1.8 Refactor:
- GamePhase includes INTERMISSION.
- ThreatCard includes 'resistant' and 'immune' lists. 'trophy' field removed.
- ArsenalCard includes 'charges'.
- PlayerState tracks 'injuries' (additive) instead of 'hp' (subtractive).
- PlayerState 'trophies' is now a List[str] of threat names.
- PlayerState adds 'action_prevented' flag for "On Fail" effects.
- GameState tracks 'round' and 'era', plus state for Intermission phase.
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
    INTERMISSION = "INTERMISSION" # New phase for v1.8
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

# --- Base Card Models ---

class Card(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    cost: Dict[ScrapType, int] = Field(default_factory=dict)
    effect: Optional[str] = None # <-- FIX: Made this field optional

class ThreatCard(Card):
    era: str # "Day", "Twilight", "Night"
    lure: LureCard
    ferocity: int # Red
    cunning: int  # Blue
    mass: int     # Green
    ability: str
    spoil: Dict[ScrapType, int] = Field(default_factory=dict)
    
    # New for v1.8
    resistant: List[ScrapType] = Field(default_factory=list)
    immune: List[ScrapType] = Field(default_factory=list)

class UpgradeCard(Card):
    permanent_defense: Dict[ScrapType, int] = Field(default_factory=dict)
    special_effect_id: Optional[str] = None # e.g., "SCAVENGERS_EYE"

class ArsenalCard(Card):
    defense_boost: Dict[ScrapType, int] = Field(default_factory=dict)
    special_effect_id: Optional[str] = None # e.g., "ADRENALINE"
    charges: Optional[int] = None # e.g., 2 for Scrap Shield

# --- Player & Plan Models ---

class PlayerState(BaseModel):
    user_id: str
    username: str
    status: str # "ACTIVE", "SURRENDERED", "DISCONNECTED"
    
    # --- Resources ---
    scrap: Dict[ScrapType, int] = Field(default_factory=lambda: {
        ScrapType.PARTS: 0, ScrapType.WIRING: 0, ScrapType.PLATES: 0
    })
    injuries: int = 0
    
    # --- Cards ---
    upgrades: List[UpgradeCard] = Field(default_factory=list)
    arsenal_hand: List[ArsenalCard] = Field(default_factory=list)
    
    # --- Round State ---
    last_round_lure: Optional[LureCard] = None
    last_round_action: Optional[SurvivorActionCard] = None
    assigned_threat: Optional[ThreatCard] = None
    defense_result: Optional[str] = None # "KILL", "DEFEND", "FAIL"
    action_prevented: bool = False
    action_choice_pending: Optional[str] = None # Stores the value, e.g., "SCAVENGE"
    
    # --- Game End State ---
    trophies: List[str] = Field(default_factory=list) # List of threat names

    def get_random_scrap_types(self, count: int) -> List[ScrapType]:
        """Returns a list of 'count' scrap types this player owns."""
        owned_scraps = []
        for scrap_type, amount in self.scrap.items():
            owned_scraps.extend([scrap_type] * amount)
        
        if not owned_scraps:
            return []
            
        random.shuffle(owned_scraps)
        return owned_scraps[:count]

    def can_afford(self, cost: Dict[ScrapType, int]) -> bool:
        """Checks if the player has enough scrap for a given cost."""
        for scrap_type, required in cost.items():
            if self.scrap.get(scrap_type, 0) < required:
                return False
        return True

class PlayerPlans(BaseModel):
    lure_card: Optional[LureCard] = None
    action_card: Optional[SurvivorActionCard] = None
    ready: bool = False

class PlayerDefense(BaseModel):
    scrap_spent: Dict[ScrapType, int] = Field(default_factory=dict)
    arsenal_cards_used: List[str] = Field(default_factory=list) # List of card IDs
    ready: bool = False

# --- Market & Game State Models ---

class MarketState(BaseModel):
    upgrade_market: List[UpgradeCard] = Field(default_factory=list)
    arsenal_market: List[ArsenalCard] = Field(default_factory=list)

    def find_card(self, card_id: str) -> Optional[Card]:
        """Finds a card in either market by its ID."""
        for card in self.upgrade_market:
            if card.id == card_id:
                return card
        for card in self.arsenal_market:
            if card.id == card_id:
                return card
        return None

    def buy_card(self, player: PlayerState, card: Card, market_type: str):
        """Moves a card from the market to the player and takes their scrap."""
        # 1. Take scrap
        for scrap_type, required in card.cost.items():
            player.scrap[scrap_type] -= required
            
        # 2. Move card
        if market_type == "UPGRADE" and isinstance(card, UpgradeCard):
            self.upgrade_market = [c for c in self.upgrade_market if c.id != card.id]
            player.upgrades.append(card)
        elif market_type == "ARSENAL" and isinstance(card, ArsenalCard):
            self.arsenal_market = [c for c in self.arsenal_market if c.id != card.id]
            player.arsenal_hand.append(card)

class ScrapPool(BaseModel):
    scraps: List[ScrapType] = Field(default_factory=list)
    
    def __init__(self, **data):
        super().__init__(**data)
        if not self.scraps:
            self.scraps = ([ScrapType.PARTS] * 50) + \
                          ([ScrapType.WIRING] * 50) + \
                          ([ScrapType.PLATES] * 50)
            random.shuffle(self.scraps)

    def draw_random(self, count: int) -> List[ScrapType]:
        """Draws 'count' scraps from the pool, removing them."""
        if count > len(self.scraps):
            count = len(self.scraps) # Take what's left
            
        drawn = [self.scraps.pop(random.randrange(len(self.scraps))) for _ in range(count)]
        return drawn

class GameState(BaseModel):
    game_id: str
    phase: GamePhase = GamePhase.WILDERNESS
    era: int = 1
    round: int = 1
    
    # --- Player Data ---
    players: Dict[str, PlayerState]
    initiative_queue: List[str] # List of player_ids in order
    first_player: Optional[str] = None # player_id
    
    # --- Decks & Market ---
    threat_deck: List[ThreatCard] = Field(default_factory=list)
    upgrade_deck: List[UpgradeCard] = Field(default_factory=list)
    arsenal_deck: List[ArsenalCard] = Field(default_factory=list)
    scrap_pool: ScrapPool = Field(default_factory=ScrapPool)
    market: MarketState = Field(default_factory=MarketState)
    
    # --- Round State ---
    log: List[str] = Field(default_factory=list)
    current_threats: List[ThreatCard] = Field(default_factory=list)
    
    # --- Plan/Defense State ---
    player_plans: Dict[str, PlayerPlans] = Field(default_factory=dict)
    player_defenses: Dict[str, PlayerDefense] = Field(default_factory=dict)
    
    # --- Attraction Phase State ---
    attraction_phase_state: str = "FIRST_PASS" # "FIRST_PASS", "SECOND_PASS"
    attraction_turn_player_id: Optional[str] = None
    available_threat_ids: List[str] = Field(default_factory=list)
    unassigned_player_ids: List[str] = Field(default_factory=list)
    
    # --- Action Phase State ---
    action_turn_player_id: Optional[str] = None
    
    # --- Intermission Phase State ---
    intermission_turn_player_id: Optional[str] = None
    intermission_players_acted: List[str] = Field(default_factory=list)
    
    # --- CORRECT FIX APPLIED HERE ---
    threat_discard: List[ThreatCard] = Field(default_factory=list)
    # --- END FIX ---
    
    # --- Game End State ---
    winner: Optional[PlayerState] = None

    def add_log(self, message: str):
        """Adds a message to the game log and prints it."""
        print(f"[{self.game_id}] {message}")
        self.log.insert(0, message)
        if len(self.log) > 50: # Keep log from getting too big
            self.log.pop()

    def get_active_players_in_order(self) -> List[PlayerState]:
        """Returns a list of active players in initiative order."""
        active = []
        for player_id in self.initiative_queue:
            player = self.players.get(player_id)
            if player and player.status == "ACTIVE":
                active.append(player)
        return active

    def get_player_public_state(self, player_id: str) -> Dict[str, Any]:
        """
        Gets the full game state, redacted for a specific player.
        v1.8: Pydantic handles serialization, so we just build the dict.
        """
        
        # --- Redact Player Data ---
        def get_redacted_players() -> Dict[str, Any]:
            """Redacts other players' hands."""
            redacted_players = {}
            for pid, p in self.players.items():
                player_data = p.model_dump()
                if pid != player_id:
                    # Redact sensitive info for *other* players
                    player_data["arsenal_hand"] = [
                        {"id": "hidden", "name": "Hidden Arsenal Card"}
                    ] * len(p.arsenal_hand)
                redacted_players[pid] = player_data
            return redacted_players

        # --- Redact Plans ---
        def get_redacted_plans() -> Dict[str, Any]:
            """
If planning, only show this player's plan.
            If past planning, show everyone's plan.
            """
            redacted_plans = {}
            if self.phase == GamePhase.PLANNING:
                # Only show my own plan
                my_plan = self.player_plans.get(player_id)
                if my_plan:
                    redacted_plans[player_id] = my_plan.model_dump()
                # Show "ready" status for others
                for pid, p in self.player_plans.items():
                    if pid != player_id:
                        redacted_plans[pid] = {"ready": p.ready}
            else:
                # Show all plans
                for pid, p in self.player_plans.items():
                    redacted_plans[pid] = p.model_dump()
            return redacted_plans
            
        # --- Redact Defenses ---
        def get_redacted_defenses() -> Dict[str, Any]:
            """
If defending, only show this player's defense.
            If past defending, show everyone's.
            """
            redacted_defenses = {}
            if self.phase == GamePhase.DEFENSE:
                # Only show my own defense
                my_defense = self.player_defenses.get(player_id)
                if my_defense:
                    redacted_defenses[player_id] = my_defense.model_dump()
                # Show "ready" status for others
                for pid, d in self.player_defenses.items():
                    if pid != player_id:
                         # Don't show "ready" if they have no threat
                        player = self.players.get(pid)
                        if player and player.assigned_threat:
                            redacted_defenses[pid] = {"ready": d.ready}
                        else:
                            redacted_defenses[pid] = {"ready": True} # Auto-ready
            else:
                # Show all defenses
                for pid, d in self.player_defenses.items():
                    redacted_defenses[pid] = d.model_dump()
            return redacted_defenses

        # Build the final payload
        public_state = {
            "game_id": self.game_id,
            "phase": self.phase,
            "era": self.era,
            "round": self.round,
            "players": get_redacted_players(),
            "initiative_queue": self.initiative_queue,
            "first_player": self.first_player,
            "log": self.log,
            "market": self.market.model_dump(),
            "current_threats": [t.model_dump() for t in self.current_threats],
            "player_plans": get_redacted_plans(),
            "player_defenses": get_redacted_defenses(),
            "winner": self.winner.model_dump() if self.winner else None,
            
            # --- Phase-specific states ---
            "attraction_phase_state": self.attraction_phase_state,
            "attraction_turn_player_id": self.attraction_turn_player_id,
            "available_threat_ids": self.available_threat_ids,
            "unassigned_player_ids": self.unassigned_player_ids,
            
            "action_turn_player_id": self.action_turn_player_id,
            
            "intermission_turn_player_id": self.intermission_turn_player_id,
        }
        
        return public_state
