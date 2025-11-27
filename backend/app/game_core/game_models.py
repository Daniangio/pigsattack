"""
Pydantic models for the core game state and logic.

v1.9.3 - REFACTOR & VALIDATION
- Added Pydantic models for all incoming player action payloads
  (e.g., PlanPayload, DefensePayload). This replaces Dict[str, Any]
  and provides automatic structure validation.
"""

from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any, Tuple
from enum import Enum
import random
import uuid

# --- Import effect enums ---
from .card_effects import OnFailEffect, UpgradeEffect, ArsenalEffect


# --- Enums ---

class Stance(str, Enum):
    AGGRESSIVE = "Aggressive"
    BALANCED = "Balanced"
    TACTICAL = "Tactical"
    HUNKERED = "Hunkered"

class GamePhase(str, Enum):
    WILDERNESS = "WILDERNESS"
    PLANNING = "PLANNING"
    ATTRACTION = "ATTRACTION"
    DEFENSE = "DEFENSE"
    ACTION = "ACTION"
    CLEANUP = "CLEANUP"
    INTERMISSION = "INTERMISSION"
    GAME_OVER = "GAME_OVER"

class PlayerStatus(str, Enum):
    ACTIVE = "ACTIVE"
    SURRENDERED = "SURRENDERED"
    DISCONNECTED = "DISCONNECTED"

class ScrapType(str, Enum):
    PARTS = "PARTS"
    WIRING = "WIRING"
    PLATES = "PLATES"

# --- Card Models ---

class Card(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str

class LureCard(Card):
    lure_type: ScrapType
    strength: int

class SurvivorActionCard(Card):
    pass

class ThreatCard(Card):
    era: int
    lure_type: str # "Rags", "Noises", "Fruit"
    ferocity: int
    cunning: int
    mass: int
    abilities_text: str # The full-text description
    trophy_value: Dict[ScrapType, int] = Field(default_factory=dict)
    resistant: List[ScrapType] = Field(default_factory=list)
    immune: List[ScrapType] = Field(default_factory=list)
    on_fail_effect: Optional[OnFailEffect] = None
    
class UpgradeCard(Card):
    cost: Dict[ScrapType, int] = Field(default_factory=dict)
    effect_text: str
    defense_boost: Dict[ScrapType, int] = Field(default_factory=dict)
    defense_piercing: Dict[ScrapType, int] = Field(default_factory=dict)
    special_effect_id: Optional[str] = None # Use UpgradeEffect enum
    
class ArsenalCard(Card):
    cost: Dict[ScrapType, int] = Field(default_factory=dict)
    effect_text: str
    charges: Optional[int] = None # None = 1 charge (one-use)
    defense_boost: Dict[ScrapType, int] = Field(default_factory=dict)
    special_effect_id: Optional[str] = None # Use ArsenalEffect enum


# --- Player & Game State ---

class PlayerPlans(BaseModel):
    lure_card_id: str
    action_card_id: str
    lure_card_key: str
    action_card_key: str

class PlayerDefense(BaseModel):
    scrap_spent: Dict[ScrapType, int] = Field(default_factory=dict)
    arsenal_card_ids: List[str] = Field(default_factory=list)
    special_target_stat: Optional[ScrapType] = None 
    special_corrode_stat: Optional[ScrapType] = None
    special_amp_spend: Dict[ScrapType, int] = Field(default_factory=dict)

class PlayerState(BaseModel):
    user_id: str
    username: str
    status: PlayerStatus = PlayerStatus.ACTIVE
    initiative: int = 0
    scrap: Dict[ScrapType, int] = Field(default_factory=lambda: {
        ScrapType.PARTS: 0, ScrapType.WIRING: 0, ScrapType.PLATES: 0
    })
    injuries: int = 0
    trophies: List[str] = Field(default_factory=list)
    action_prevented: bool = False
    stance: Stance = Stance.BALANCED
    
    lure_cards: List[LureCard] = Field(default_factory=list)
    action_cards: List[SurvivorActionCard] = Field(default_factory=list)
    upgrade_cards: List[UpgradeCard] = Field(default_factory=list)
    arsenal_cards: List[ArsenalCard] = Field(default_factory=list)
    
    plan: Optional[PlayerPlans] = None
    defense: Optional[PlayerDefense] = None
    last_round_lure_id: Optional[str] = None
    
    def get_total_scrap(self) -> int:
        return sum(self.scrap.values())

    def add_scrap(self, scrap_type: ScrapType, amount: int):
        if scrap_type in self.scrap:
            self.scrap[scrap_type] = max(0, self.scrap[scrap_type] + amount)

    def pay_cost(self, cost: Dict[ScrapType, int]) -> bool:
        """Check if player can pay cost, and if so, deduct it."""
        if not self.can_afford(cost):
            return False
        
        for scrap_type, amount in cost.items():
            self.scrap[scrap_type] -= amount
        
        return True
    
    def can_afford(self, cost: Dict[ScrapType, int]) -> bool:
        """Checks if player has enough scrap without deducting."""
        for scrap_type, amount in cost.items():
            if self.scrap.get(scrap_type, 0) < amount:
                return False # Cannot afford
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
    faceup_limit: int = 3

class GameState(BaseModel):
    game_id: str
    phase: GamePhase = GamePhase.WILDERNESS
    era: int = 1
    round: int = 1
    players: Dict[str, PlayerState] = Field(default_factory=dict)
    initiative_queue: List[str] = Field(default_factory=list) # List of player_ids
    log: List[str] = Field(default_factory=list)
    threat_deck: List[ThreatCard] = Field(default_factory=list)
    market: Market = Field(default_factory=Market)
    
    # --- Round-specific state ---
    current_threats: List[ThreatCard] = Field(default_factory=list) # Attracted threats
    player_plans: Dict[str, PlayerPlans] = Field(default_factory=dict)
    player_defenses: Dict[str, PlayerDefense] = Field(default_factory=dict)
    player_threat_assignment: Dict[str, str] = Field(default_factory=dict)
    spoils_to_gain: Dict[str, ThreatCard] = Field(default_factory=dict)
    cards_to_return_to_hand: Dict[str, str] = Field(default_factory=dict) 
    turn_initial_stance: Dict[str, Stance] = Field(default_factory=dict)
    
    winner: Optional[PlayerState] = None
    
    # --- ATTRACTION ---
    attraction_phase_state: str = "FIRST_PASS" # "FIRST_PASS" or "SECOND_PASS"
    attraction_turn_player_id: Optional[str] = None
    available_threat_ids: List[str] = Field(default_factory=list) # Threats to be assigned
    unassigned_player_ids: List[str] = Field(default_factory=list) # Players w/o threats

    # --- ACTION ---
    action_turn_player_id: Optional[str] = None
    
    # --- INTERMISSION ---
    # Legacy fields kept for compatibility; not sent to frontend
    intermission_turn_player_id: Optional[str] = None
    intermission_purchases: Dict[str, int] = Field(default_factory=dict)
    
    
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
        
        # --- Handle Spectator ---
        is_spectator = player_id == "spectator" or player_id not in self.players
        
        # Redact other players' hands
        redacted_players = {}
        for pid, player in self.players.items():
            if not is_spectator and pid == player_id:
                redacted_players[pid] = player.model_dump()
            else:
                redacted_players[pid] = {
                    "user_id": player.user_id,
                    "username": player.username,
                    "status": player.status,
                    "initiative": player.initiative,
                    "stance": player.stance,
                    "scrap": player.scrap,
                    "injuries": player.injuries,
                    "trophies": player.trophies,
                    "action_prevented": player.action_prevented,
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
            if self.phase == GamePhase.DEFENSE:
                for pid in self.players:
                    if self.players[pid].status != PlayerStatus.ACTIVE:
                        redacted_defenses[pid] = {"submitted": True} # Not playing
                        continue
                        
                    has_threat = self.get_assigned_threat(pid) is not None
                    if has_threat:
                        redacted_defenses[pid] = {"submitted": pid in self.player_defenses}
                    else:
                        redacted_defenses[pid] = {"submitted": True} # Auto-ready
            
            elif self.phase in [GamePhase.ACTION, GamePhase.CLEANUP, GamePhase.INTERMISSION, GamePhase.GAME_OVER]:
                for pid, defense in self.player_defenses.items():
                    redacted_defenses[pid] = defense.model_dump()
            
            return redacted_defenses

        # Build the final payload
        public_state = {
            "game_id": self.game_id,
            "phase": self.phase,
            "era": self.era,
            "round": self.round,
            "players": redacted_players,
            "initiative_queue": self.initiative_queue,
            "log": self.log[-50:], # <-- Only send last 50 log messages
            "market": self.market.model_dump(),
            "current_threats": [t.model_dump() for t in self.current_threats],
            "player_plans": get_redacted_plans(self.phase, self.player_plans),
            "player_defenses": get_redacted_defenses(),
            "winner": self.winner.model_dump() if self.winner else None,
            
            # --- Phase-specific states ---
            "attraction_phase_state": self.attraction_phase_state,
            "attraction_turn_player_id": self.attraction_turn_player_id,
            "available_threat_ids": self.available_threat_ids,
            "unassigned_player_ids": self.unassigned_player_ids,
            "action_turn_player_id": self.action_turn_player_id,
            "player_threat_assignment": self.player_threat_assignment,
            "turn_initial_stance": {pid: stance.value if isinstance(stance, Enum) else stance for pid, stance in self.turn_initial_stance.items()},
        }
        
        return public_state


# --- NEW: Action Payload Models ---
# These models validate the *structure* of data from the client

class PlanPayload(BaseModel):
    lure_card_id: str
    action_card_id: str

class AssignThreatPayload(BaseModel):
    threat_id: str

class DefensePayload(BaseModel):
    scrap_spent: Dict[ScrapType, int] = Field(default_factory=dict)
    arsenal_card_ids: List[str] = Field(default_factory=list)
    special_target_stat: Optional[ScrapType] = None
    special_corrode_stat: Optional[ScrapType] = None
    special_amp_spend: Dict[ScrapType, int] = Field(default_factory=dict)

class ScavengePayload(BaseModel):
    choices: List[ScrapType] = Field(default_factory=list)

class FortifyPayload(BaseModel):
    card_id: Optional[str] = None # Player can choose to take fallback

class ArmoryRunPayload(BaseModel):
    card_id: Optional[str] = None # Player can choose to take fallback

class BuyPayload(BaseModel):
    card_id: str
