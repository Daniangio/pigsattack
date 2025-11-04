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
- ADDED: PlayerStatus enum for game-specific state.
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

# --- FIX: Added PlayerStatus, as it's critical to game logic ---
class PlayerStatus(str, Enum):
    """ The player's status *within the game instance* """
    ACTIVE = "ACTIVE"          # Actively playing
    DISCONNECTED = "DISCONNECTED"  # Temporarily disconnected
    SURRENDERED = "SURRENDERED"  # Forfeited the game

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

# --- Cards ---

class ThreatCard(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    era: int # 1, 2, or 3
    lure: LureCard
    ferocity: int # vs PARTS
    cunning: int  # vs WIRING
    mass: int     # vs PLATES
    spoil: Dict[ScrapType, int] = Field(default_factory=dict)
    resistant: List[ScrapType] = Field(default_factory=list) # v1.8
    immune: List[ScrapType] = Field(default_factory=list) # v1.8
    on_fail: Optional[str] = None # Special effect ID, e.g., "DISCARD_SCRAP"
    
    # Helper to get all stats
    def get_stats(self) -> Dict[str, int]:
        return {"ferocity": self.ferocity, "cunning": self.cunning, "mass": self.mass}
        
    def get_highest_stat(self) -> int:
        return max(self.ferocity, self.cunning, self.mass)

class UpgradeCard(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    cost: Dict[ScrapType, int]
    effect: str
    # Passive defense boost
    defense_boost: Dict[ScrapType, int] = Field(default_factory=dict)
    # Special effect ID for game logic
    special_effect_id: Optional[str] = None

class ArsenalCard(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    cost: Dict[ScrapType, int]
    effect: str
    # Used during defense
    defense_boost: Dict[ScrapType, int] = Field(default_factory=dict)
    # For multi-use cards
    charges: Optional[int] = None
    # Special effect ID for game logic
    special_effect_id: Optional[str] = None

# --- Market ---

class MarketState(BaseModel):
    upgrade_market: List[UpgradeCard] = Field(default_factory=list)
    arsenal_market: List[ArsenalCard] = Field(default_factory=list)
    
# --- Player Data ---

class PlayerPlans(BaseModel):
    player_id: str
    lure: LureCard
    action: SurvivorActionCard
    
    def get_redacted(self) -> Dict[str, Any]:
        """Returns public-safe version (hides Lure/Action)"""
        return {"player_id": self.player_id, "ready": True}

class PlayerDefense(BaseModel):
    player_id: str
    scrap_spent: Dict[ScrapType, int] = Field(default_factory=dict)
    arsenal_ids: List[str] = Field(default_factory=list) # IDs of Arsenal cards used
    
    def get_redacted(self) -> Dict[str, Any]:
        """Returns public-safe version (hides details)"""
        return {"player_id": self.player_id, "ready": True}


class PlayerState(BaseModel):
    # --- Identity ---
    user_id: str # This is the auth user_id
    player_id: str # This is the stable game_session player_id
    username: str
    is_host: bool = False
    is_connected: bool = True
    status: PlayerStatus = PlayerStatus.ACTIVE # --- FIX: Added status ---
    
    # --- Resources ---
    scrap: Dict[ScrapType, int] = Field(default_factory=lambda: {
        ScrapType.PARTS: 0,
        ScrapType.WIRING: 0,
        ScrapType.PLATES: 0
    })
    injuries: int = 0 # v1.8: Count up
    trophies: List[str] = Field(default_factory=list) # v1.8: List of threat names
    
    # --- Cards ---
    upgrades: List[UpgradeCard] = Field(default_factory=list)
    arsenal_hand: List[ArsenalCard] = Field(default_factory=list)
    arsenal_discard: List[ArsenalCard] = Field(default_factory=list)
    
    # --- Player's static hands (from rulebook) ---
    lure_hand: List[LureCard] = Field(default_factory=lambda: [
        LureCard.BLOODY_RAGS, LureCard.STRANGE_NOISES, LureCard.FALLEN_FRUIT
    ])
    action_hand: List[SurvivorActionCard] = Field(default_factory=lambda: [
        SurvivorActionCard.SCAVENGE, SurvivorActionCard.FORTIFY,
        SurvivorActionCard.ARMORY_RUN, SurvivorActionCard.SCHEME
    ])
    
    # --- Round State ---
    initiative: int = 0 # Set during Scheme
    last_round_lure: Optional[LureCard] = None # Set during Cleanup
    last_round_action: Optional[SurvivorActionCard] = None # Set during Cleanup
    
    attracted_threat: Optional[ThreatCard] = None
    defense_result: Optional[str] = None # "FAIL", "DEFEND", "KILL"
    
    # --- Phase-specific state flags ---
    plan_submitted: bool = False
    defense_submitted: bool = False
    action_choice_pending: Optional[SurvivorActionCard] = None # e.g., "SCAVENGE"
    action_prevented: bool = False # v1.8: For "On Fail" effects
    
    # --- Helper Methods ---
    
    def get_total_scrap(self) -> int:
        return sum(self.scrap.values())

    def can_afford(self, cost: Dict[ScrapType, int]) -> bool:
        """Checks if the player has enough scrap for a given cost."""
        for scrap_type, amount in cost.items():
            if self.scrap.get(scrap_type, 0) < amount:
                return False
        return True

    def pay_cost(self, cost: Dict[ScrapType, int]):
        """Deducts scrap. Assumes can_afford was already checked."""
        for scrap_type, amount in cost.items():
            self.scrap[scrap_type] = self.scrap.get(scrap_type, 0) - amount
            
    def get_passive_defense(self) -> Dict[ScrapType, int]:
        """Calculates total passive defense from all upgrades."""
        total = {ScrapType.PARTS: 0, ScrapType.WIRING: 0, ScrapType.PLATES: 0}
        for upgrade in self.upgrades:
            for scrap_type, amount in upgrade.defense_boost.items():
                total[scrap_type] += amount
        return total

    def get_redacted_state(self, is_self: bool) -> Dict[str, Any]:
        """
        Returns a JSON-safe dictionary of the player's state,
        hiding sensitive info if is_self is False.
        """
        
        # Public state
        public_state = {
            "user_id": self.user_id, # <-- FIX: Added user_id
            "player_id": self.player_id,
            "username": self.username,
            "is_connected": self.is_connected,
            "status": self.status.value,
            "scrap": self.scrap, # Scrap is public
            "injuries": self.injuries,
            "trophies": self.trophies,
            "upgrades": [u.model_dump() for u in self.upgrades], # Upgrades are public
            
            "attracted_threat": self.attracted_threat.model_dump() if self.attracted_threat else None,
            "defense_result": self.defense_result,
            
            "plan_submitted": self.plan_submitted,
            "defense_submitted": self.defense_submitted,
            "action_choice_pending": self.action_choice_pending,
            "action_prevented": self.action_prevented,
            
            # --- FIX: Added last round cards ---
            "last_round_lure": self.last_round_lure,
            "last_round_action": self.last_round_action,
        }
        
        if is_self:
            # Add private info
            public_state["arsenal_hand"] = [a.model_dump() for a in self.arsenal_hand]
            public_state["arsenal_discard"] = [a.model_dump() for a in self.arsenal_discard]
            public_state["lure_hand"] = [l.value for l in self.lure_hand]
            public_state["action_hand"] = [a.value for a in self.action_hand]
        else:
            # Add public stubs for private info
            public_state["arsenal_hand_count"] = len(self.arsenal_hand)
        
        return public_state


# --- Main Game State ---

class GameState(BaseModel):
    game_id: str
    phase: GamePhase = GamePhase.WILDERNESS
    era: int = 1
    round: int = 1
    
    # --- Player Data ---
    players: Dict[str, PlayerState] = Field(default_factory=dict)
    initiative_queue: List[str] = Field(default_factory=list) # List of player_ids
    # first_player: Optional[str] = None # player_id <-- FIX: Removed
    
    # --- Decks & Market ---
    threat_deck: List[ThreatCard] = Field(default_factory=list)
    threat_discard: List[ThreatCard] = Field(default_factory=list)
    upgrade_deck: List[UpgradeCard] = Field(default_factory=list)
    upgrade_discard: List[UpgradeCard] = Field(default_factory=list)
    arsenal_deck: List[ArsenalCard] = Field(default_factory=list)
    arsenal_discard: List[ArsenalCard] = Field(default_factory=list)
    
    market: MarketState = Field(default_factory=MarketState)
    
    # --- Round State ---
    current_threats: List[ThreatCard] = Field(default_factory=list)
    player_plans: Dict[str, PlayerPlans] = Field(default_factory=dict)
    player_defenses: Dict[str, PlayerDefense] = Field(default_factory=dict)
    
    # --- Phase-specific states ---
    
    # ATTRACTION
    attraction_phase_state: str = "FIRST_PASS" # "FIRST_PASS" or "SECOND_PASS"
    attraction_turn_player_id: Optional[str] = None
    available_threat_ids: List[str] = Field(default_factory=list)
    unassigned_player_ids: List[str] = Field(default_factory=list)
    
    # ACTION
    action_turn_player_id: Optional[str] = None
    
    # INTERMISSION
    intermission_turn_player_id: Optional[str] = None
    intermission_players_acted: List[str] = Field(default_factory=list) # v1.8: 1 free action
    
    # --- Meta ---
    log: List[str] = Field(default_factory=list)
    winner: Optional[PlayerState] = None
    
    # --- Helper Methods ---
    
    def add_log(self, message: str):
        print(message) # Log to server console
        self.log.insert(0, message) # Add to front of game log
        if len(self.log) > 50:
            self.log.pop()
            
    def get_player(self, user_id: str) -> Optional[PlayerState]:
        """Gets a player by their auth user_id."""
        return self.players.get(user_id)

    def get_active_players_in_order(self) -> List[PlayerState]:
        """
        Returns a list of active players (ACTIVE status, not DISCONNECTED 
        or SURRENDERED), in initiative order.
        """
        return [
            p for p in (self.players.get(pid) for pid in self.initiative_queue)
            if p and p.status == PlayerStatus.ACTIVE
        ]

    def get_player_public_state(self, user_id: str) -> Dict[str, Any]:
        """
        Builds the complete, redacted game state for a specific player.
        'user_id' is the player we are building the state for.
        """
        
        # 1. Get player's own (private) state
        me = self.players.get(user_id)
        
        # 2. Get redacted state for all other players
        redacted_players = {}
        for pid, player in self.players.items():
            is_self = (me is not None) and (pid == me.user_id)
            redacted_players[pid] = player.get_redacted_state(is_self=is_self)
            
        # 3. Redact plans (only show "ready")
        # --- FIX: Pass state explicitly ---
        def get_redacted_plans(current_phase: GamePhase, plans: Dict[str, PlayerPlans]):
            if current_phase == GamePhase.PLANNING:
                return {
                    pid: p.get_redacted() for pid, p in plans.items()
                }
            # After PLANNING, reveal all plans
            return {
                pid: p.model_dump() for pid, p in plans.items()
            }
            
        # 4. Redact defenses
        def get_redacted_defenses():
            redacted_defenses = {}
            # Always show defenses *after* the defense phase
            if self.phase != GamePhase.DEFENSE:
                 for pid, d in self.player_defenses.items():
                    redacted_defenses[pid] = d.model_dump()
            else:
                # During defense phase, only show ready status
                for pid, p in self.players.items():
                    if p.defense_submitted:
                        redacted_defenses[pid] = {"ready": True}
           
            return redacted_defenses

        # Build the final payload
        public_state = {
            "game_id": self.game_id,
            "phase": self.phase,
            "era": self.era,
            "round": self.round,
            "players": redacted_players,
            "initiative_queue": self.initiative_queue,
            # "first_player": self.first_player, <-- FIX: Removed
            "log": self.log,
            "market": self.market.model_dump(),
            "current_threats": [t.model_dump() for t in self.current_threats],
            "player_plans": get_redacted_plans(self.phase, self.player_plans), # <-- FIX: Pass state
            "player_defenses": get_redacted_defenses(),
            "winner": self.winner.model_dump() if self.winner else None,
            
            # --- Phase-specific states ---
            "attraction_phase_state": self.attraction_phase_state,
            "attraction_turn_player_id": self.attraction_turn_player_id,
            "available_threat_ids": self.available_threat_ids,
            "unassigned_player_ids": self.unassigned_player_ids,
            
            "action_turn_player_id": self.action_turn_player_id,
            
            "intermission_turn_player_id": self.intermission_turn_player_id,
            "intermission_players_acted": self.intermission_players_acted,
        }
        
        return public_state
