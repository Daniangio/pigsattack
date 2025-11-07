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

v1.9 (This Refactor):
- ADDED: `card_effects.py` enums.
- ThreatCard: Added `on_fail_effect: Optional[OnFailEffect]` to store structured
-   "On Fail" logic parsed from CSV.
- UpgradeCard: Added `defense_boost` and `defense_piercing` dicts to store
-   passive defense bonuses.
"""

from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any, Tuple
from enum import Enum
import random
import uuid

# --- NEW: Import effect enums ---
from .card_effects import OnFailEffect, UpgradeEffect, ArsenalEffect


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
    """ The player's status *within the game logic* """
    ACTIVE = "ACTIVE"
    SURRENDERED = "SURRENDERED" # Player has left the game
    ELIMINATED = "ELIMINATED" # Player is out for the round (e.g. failed defense)

class ScrapType(str, Enum):
    PARTS = "PARTS"
    WIRING = "WIRING"
    PLATES = "PLATES"

# --- Card Models ---

class Card(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str

class LureCard(Card):
    lure_type: ScrapType # e.g., PARTS, WIRING, PLATES
    strength: int # 1, 2, or 3

class SurvivorActionCard(Card):
    pass # Simple cards: Scavenge, Fortify, Armory Run, Scheme

class ThreatCard(Card):
    era: int
    lure_type: str # "Rags", "Noises", "Fruit"
    
    # Defense stats
    ferocity: int
    cunning: int
    mass: int
    
    # --- v1.8 fields ---
    abilities_text: str # The full-text description
    trophy_value: Dict[ScrapType, int] = Field(default_factory=dict)
    
    # --- Structured data parsed from abilities_text ---
    resistant: List[ScrapType] = Field(default_factory=list)
    immune: List[ScrapType] = Field(default_factory=list)

    # --- NEW: Structured "On Fail" effect ---
    on_fail_effect: Optional[OnFailEffect] = None
    
class UpgradeCard(Card):
    cost: Dict[ScrapType, int] = Field(default_factory=dict)
    effect_text: str
    
    # --- NEW: Structured data parsed from EffectTags ---
    # Passive defense boosts
    defense_boost: Dict[ScrapType, int] = Field(default_factory=dict)
    defense_piercing: Dict[ScrapType, int] = Field(default_factory=dict)
    
    # Special effect ID (links to an enum/constant for logic)
    special_effect_id: Optional[str] = None # Use UpgradeEffect enum
    
class ArsenalCard(Card):
    cost: Dict[ScrapType, int] = Field(default_factory=dict)
    effect_text: str
    
    # --- v1.8 fields ---
    charges: Optional[int] = None
    
    # --- Structured data parsed from EffectTags ---
    # Defense boost for this one-time use
    defense_boost: Dict[ScrapType, int] = Field(default_factory=dict)
    
    # Special effect ID (links to an enum/constant for logic)
    special_effect_id: Optional[str] = None # Use ArsenalEffect enum


# --- Player & Game State ---

class PlayerPlans(BaseModel):
    lure_card_id: str
    action_card_id: str
    upgrade_card_id: Optional[str] = None # The upgrade they *play* (not buy)

class PlayerDefense(BaseModel):
    scrap_spent: Dict[ScrapType, int] = Field(default_factory=dict)
    arsenal_card_ids: List[str] = Field(default_factory=list)
    # --- NEW: Fields for special Arsenal cards ---
    # Used for "Lure to Weakness"
    special_target_stat: Optional[ScrapType] = None 
    # Used for "Corrosive Sludge"
    special_corrode_stat: Optional[ScrapType] = None
    # Used for "Makeshift Amp"
    special_amp_spend: Dict[ScrapType, int] = Field(default_factory=dict)

class PlayerState(BaseModel):
    user_id: str
    username: str
    
    status: PlayerStatus = PlayerStatus.ACTIVE
    initiative: int = 0
    
    # --- Resources ---
    scrap: Dict[ScrapType, int] = Field(default_factory=lambda: {
        ScrapType.PARTS: 0, ScrapType.WIRING: 0, ScrapType.PLATES: 0
    })
    
    # --- v1.8: Injuries (additive) ---
    injuries: int = 0
    
    # --- v1.8: Trophies (list of names) ---
    trophies: List[str] = Field(default_factory=list)
    
    # --- v1.8: Action-prevention flag ---
    action_prevented: bool = False
    
    # --- Hand ---
    lure_cards: List[LureCard] = Field(default_factory=list)
    action_cards: List[SurvivorActionCard] = Field(default_factory=list)
    upgrade_cards: List[UpgradeCard] = Field(default_factory=list)
    arsenal_cards: List[ArsenalCard] = Field(default_factory=list)
    
    # --- Plans ---
    plan: Optional[PlayerPlans] = None
    defense: Optional[PlayerDefense] = None
    
    # --- Helper methods ---
    def get_total_scrap(self) -> int:
        return sum(self.scrap.values())

    def add_scrap(self, scrap_type: ScrapType, amount: int):
        if scrap_type in self.scrap:
            self.scrap[scrap_type] = max(0, self.scrap[scrap_type] + amount)

    def pay_cost(self, cost: Dict[ScrapType, int]) -> bool:
        """Check if player can pay cost, and if so, deduct it."""
        # Check affordability
        for scrap_type, amount in cost.items():
            if self.scrap.get(scrap_type, 0) < amount:
                return False # Cannot afford
        
        # Deduct cost
        for scrap_type, amount in cost.items():
            self.scrap[scrap_type] -= amount
        
        return True

    def get_card_from_hand(self, card_id: str) -> Optional[Card]:
        """Finds a card in any of the player's hands by its ID."""
        for hand in [self.lure_cards, self.action_cards, self.upgrade_cards, self.arsenal_cards]:
            for card in hand:
                if card.id == card_id:
                    return card
        return None

class Market(BaseModel):
    upgrade_deck: List[UpgradeCard] = Field(default_factory=list)
    arsenal_deck: List[ArsenalCard] = Field(default_factory=list)
    
    upgrade_faceup: List[UpgradeCard] = Field(default_factory=list)
    arsenal_faceup: List[ArsenalCard] = Field(default_factory=list)

class GameState(BaseModel):
    game_id: str
    phase: GamePhase = GamePhase.WILDERNESS
    
    # --- v1.8: Era and Round ---
    era: int = 1 # 1, 2, or 3
    round: int = 1 # 1 to 15
    
    players: Dict[str, PlayerState] = Field(default_factory=dict)
    
    # --- Player order and turns ---
    initiative_queue: List[str] = Field(default_factory=list) # List of player_ids
    
    log: List[str] = Field(default_factory=list)
    
    # --- Decks and Market ---
    threat_deck: List[ThreatCard] = Field(default_factory=list)
    market: Market = Field(default_factory=Market)
    
    # --- Round-specific state ---
    current_threats: List[ThreatCard] = Field(default_factory=list) # Attracted threats
    player_plans: Dict[str, PlayerPlans] = Field(default_factory=dict)
    player_defenses: Dict[str, PlayerDefense] = Field(default_factory=dict)
    
    winner: Optional[PlayerState] = None

    # --- Phase-specific state ---
    
    # ATTRACTION
    attraction_phase_state: str = "drawing" # "drawing" or "assigning"
    attraction_turn_player_id: Optional[str] = None
    available_threat_ids: List[str] = Field(default_factory=list) # Threats to be assigned
    unassigned_player_ids: List[str] = Field(default_factory=list) # Players w/o threats

    # ACTION
    action_turn_player_id: Optional[str] = None
    
    # INTERMISSION (v1.8)
    intermission_turn_player_id: Optional[str] = None
    intermission_purchases: Dict[str, int] = Field(default_factory=dict) # player_id: num_bought
    
    # --- Methods ---
    
    def add_log(self, message: str):
        self.log.append(message)
        print(f"[{self.game_id} LOG]: {message}")

    def get_player_order(self) -> List[PlayerState]:
        """Returns players in initiative order."""
        return [self.players[pid] for pid in self.initiative_queue if pid in self.players]

    def get_active_players_in_order(self) -> List[PlayerState]:
        """Returns active players in initiative order."""
        return [
            self.players[pid] for pid in self.initiative_queue
            if pid in self.players and self.players[pid].status == PlayerStatus.ACTIVE
        ]

    def get_threat_for_player(self, player_id: str) -> Optional[ThreatCard]:
        """Finds the Threat assigned to a player this round."""
        # This assumes a 1-to-1 assignment, which might need adjustment
        # if logic changes. For now, we find the threat that *matches*
        # the player's Lure card from their plan.
        player = self.players.get(player_id)
        if not player or not player.plan:
            return None
        
        lure_card = player.get_card_from_hand(player.plan.lure_card_id)
        if not lure_card or not isinstance(lure_card, LureCard):
            return None
            
        lure_name_map = {
            ScrapType.PARTS: "Rags",
            ScrapType.WIRING: "Noises",
            ScrapType.PLATES: "Fruit"
        }
        lure_type_name = lure_name_map.get(lure_card.lure_type)

        # Find the first threat in current_threats that matches
        for threat in self.current_threats:
            if threat.lure_type == lure_type_name:
                # This is a simple way, but what if two players use "Rags"?
                # A better way is to store the assignment.
                # Let's assume `available_threat_ids` was used to assign.
                # This logic is complex and lives in GameInstance.
                # We need a simple lookup.
                
                # --- HACK/TODO: This assumes parallel lists. ---
                # This is brittle. A better way is to have
                # `player_threat_assignments: Dict[player_id, threat_id]`
                # For now, let's stick to the Lure card match.
                # This is a known bug in the original logic.
                
                # Let's try to find *the* threat assigned to this player.
                # This is handled by `_assign_threats` in GameInstance,
                # which should populate a field.
                # ... but it doesn't. It just removes from lists.
                
                # We'll stick to the lure card match.
                # We must also check if that threat is still "available"
                # (i.e., not taken by a higher-initiative player)
                # This is messy.
                pass
        
        # --- RE-THINK ---
        # The game_instance logic `_assign_threats` assigns threats one by one.
        # The `current_threats` list *is* the list of assigned threats.
        # How do we link them?
        # The `available_threat_ids` are the *unassigned* ones.
        # `current_threats` are the *assigned* ones.
        # The problem is, we don't know *who* they are assigned *to*.
        
        # Let's assume for now: The GameInstance will store this mapping.
        # `player_threat_assignment: Dict[str, str] = Field(default_factory=dict)` # player_id -> threat_id
        # Let's add this.
        pass
    
    # We will add this field. GameInstance must populate it.
    player_threat_assignment: Dict[str, str] = Field(default_factory=dict)
    
    def get_assigned_threat(self, player_id: str) -> Optional[ThreatCard]:
        threat_id = self.player_threat_assignment.get(player_id)
        if not threat_id:
            return None
        for threat in self.current_threats:
            if threat.id == threat_id:
                return threat
        return None
    
    
    # --- Redaction for client safety ---
    
    def get_redacted_state(self, player_id: str) -> Dict[str, Any]:
        """
        Creates a version of the state for a specific player,
        hiding other players' hands and other secret info.
        """
        
        # Redact other players' hands
        redacted_players = {}
        for pid, player in self.players.items():
            if pid == player_id:
                redacted_players[pid] = player.model_dump()
            else:
                redacted_players[pid] = {
                    "user_id": player.user_id,
                    "username": player.username,
                    "status": player.status,
                    "initiative": player.initiative,
                    "scrap": player.scrap,
                    "injuries": player.injuries,
                    "trophies": player.trophies,
                    "action_prevented": player.action_prevented,
                    # Hide hands
                    "lure_cards_count": len(player.lure_cards),
                    "action_cards_count": len(player.action_cards),
                    "upgrade_cards_count": len(player.upgrade_cards),
                    "arsenal_cards_count": len(player.arsenal_cards),
                    # Show submitted plans/defenses
                    "plan_submitted": bool(player.plan),
                    "defense_submitted": bool(player.defense),
                }

        # --- Redact plans ---
        def get_redacted_plans(phase: GamePhase, plans: Dict[str, PlayerPlans]) -> Dict[str, Any]:
            if phase == GamePhase.PLANNING:
                # Hide all plans
                return {pid: {"submitted": True} for pid in plans}
            
            # Show all plans after PLANNING
            return {pid: p.model_dump() for pid, p in plans.items()}

        # --- Redact defenses ---
        def get_redacted_defenses() -> Dict[str, Any]:
            redacted_defenses = {}
            # Show submitted status during DEFENSE phase
            if self.phase == GamePhase.DEFENSE:
                for pid in self.players:
                    if pid in self.player_defenses:
                        redacted_defenses[pid] = {"submitted": True}
                    else:
                        redacted_defenses[pid] = {"submitted": False}
            # Show full defenses *after* DEFENSE phase
            elif self.phase in [GamePhase.ACTION, GamePhase.CLEANUP, GamePhase.INTERMISSION]:
                for pid, defense in self.player_defenses.items():
                    redacted_defenses[pid] = defense.model_dump()
            # Default: show nothing
            else:
                for pid in self.players:
                    if self.players[pid].status == PlayerStatus.ACTIVE:
                        redacted_defenses[pid] = {"ready": True} # e.g. for attraction
           
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
            
            # --- Phase-specific states ---\
            "attraction_phase_state": self.attraction_phase_state,
            "attraction_turn_player_id": self.attraction_turn_player_id,
            "available_threat_ids": self.available_threat_ids,
            "unassigned_player_ids": self.unassigned_player_ids,
            
            "action_turn_player_id": self.action_turn_player_id,
            
            "intermission_turn_player_id": self.intermission_turn_player_id,
            "intermission_purchases": self.intermission_purchases,
            
            "player_threat_assignment": self.player_threat_assignment,
        }
        
        return public_state