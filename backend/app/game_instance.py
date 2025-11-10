"""
The GameInstance class.

v1.9.5 - REFACTOR: Centralized Validation
- Added `_validate_player_can_act`, `_validate_player_has_not_acted`,
  and `_validate_card_in_hand` helper methods.
- Refactored `player_action` dispatcher to be the central "gatekeeper"
  that performs all common validation (phase, turn, status) *before*
  dispatching to implementation methods.
- Simplified `_action_submit_plan`, `_action_assign_threat`, and
  `_action_submit_defense` to only contain their *unique* business logic,
  as common checks are now handled by the dispatcher.
"""

from .game_core.game_models import (
    GameState, PlayerState, GamePhase, PlayerPlans, PlayerDefense,
    ScrapType, LureCard, SurvivorActionCard, ThreatCard, UpgradeCard, ArsenalCard,
    PlayerStatus, Card,
    # --- NEW: Import Payload Models ---
    PlanPayload, AssignThreatPayload, DefensePayload,
    ScavengePayload, FortifyPayload, ArmoryRunPayload, BuyPayload
)
from .game_core.card_effects import OnFailEffect, UpgradeEffect, ArsenalEffect
from .game_core.deck_factory import (
    create_threat_deck, create_upgrade_deck, create_arsenal_deck,
    create_initial_lure_cards, create_initial_action_cards
)
from typing import List, Dict, Any, Optional, cast, Tuple, Type
import random
from pydantic import ValidationError

# Import the server-level models
from .server_models import GameParticipant
from .connection_manager import ConnectionManager


# --- NEW: Custom Exception ---
class InvalidActionError(Exception):
    """Custom exception for failed game logic validation."""
    pass


# --- CONSTANTS ---
BASE_DEFENSE_MAP = {
    "SCAVENGE": {ScrapType.WIRING: 2},
    "FORTIFY": {ScrapType.PLATES: 2},
    "ARMORY RUN": {ScrapType.PARTS: 2},
    "SCHEME": {ScrapType.PARTS: 1, ScrapType.WIRING: 1, ScrapType.PLATES: 1},
}
CARDS_PER_ERA_PER_PLAYER = 5
MARKET_FACEUP_COUNT = 3

class GameInstance:
    """
    Manages the state and logic for a single game,
    from setup to game over.
    """
    
    def __init__(self, game_id: str):
        self.state = GameState(game_id=game_id)
        self.state.add_log(f"Game instance {game_id} created.")
        self.scrap_pool: List[ScrapType] = []
        self._initialize_scrap_pool()

    # ... (Setup helpers _initialize_scrap_pool, _draw_random_scrap, create)
    # ... (These are unchanged)
    def _initialize_scrap_pool(self, num_per_type=50):
        """Helper to create the bag of scrap."""
        self.scrap_pool = (
            [ScrapType.PARTS] * num_per_type +
            [ScrapType.WIRING] * num_per_type +
            [ScrapType.PLATES] * num_per_type
        )
        random.shuffle(self.scrap_pool)
        self.state.add_log(f"Scrap Pool initialized with {len(self.scrap_pool)} tokens.")

    def _draw_random_scrap(self, player: PlayerState, amount: int):
        """Draws N scrap from the pool and gives it to the player."""
        drawn = []
        for _ in range(amount):
            if not self.scrap_pool:
                self.state.add_log("Scrap Pool is empty! Re-initializing.")
                self._initialize_scrap_pool()
                if not self.scrap_pool:
                    self.state.add_log("CRITICAL: Scrap Pool failed to re-init.")
                    break 
            
            scrap = self.scrap_pool.pop()
            player.add_scrap(scrap, 1)
            drawn.append(scrap.value)
        
        if drawn:
            self.state.add_log(f"{player.username} draws {amount} random scrap: {', '.join(drawn)}")

    @staticmethod
    def create(game_id: str, participants: List[GameParticipant]) -> 'GameInstance':
        """
        Creates, initializes, and returns a new GameInstance.
        This is the main entry point.
        """
        game = GameInstance(game_id)
        player_count = len(participants)
        
        # 1. Initialize Decks
        game.state.threat_deck = create_threat_deck(player_count)
        game.state.market.upgrade_deck = create_upgrade_deck()
        game.state.market.arsenal_deck = create_arsenal_deck()
        
        # 2. Initialize Players
        for p in participants:
            new_player = PlayerState(
                user_id=p.user.id,
                username=p.user.username,
                lure_cards=create_initial_lure_cards(),
                action_cards=create_initial_action_cards()
            )
            game._draw_random_scrap(new_player, 2)
            game.state.players[new_player.user_id] = new_player
        
        # 3. Set up Market
        market_size = max(2, min(player_count - 1, 4))
        game.state.market.faceup_limit = market_size
        game._refill_market()
        
        # 4. Set Initiative Queue
        game.state.initiative_queue = [p.user.id for p in participants]
        for i, player_id in enumerate(game.state.initiative_queue):
            game.state.players[player_id].initiative = i + 1
        
        game.state.add_log("Game created. Advancing to first round...")
        game.state.phase = GamePhase.PLANNING
        game.state.add_log(f"--- ROUND {game.state.round} (Era {game.state.era}) ---")
        game.state.add_log("--- PLANNING PHASE ---")
        game.state.add_log("All players: Plan your Lure and Action cards.")
        
        return game


    # --- Main Action Dispatcher (REFACTORED) ---
    
    async def player_action(
        self, 
        player_id: str, 
        action: str, 
        payload: Dict[str, Any],
        conn_manager: ConnectionManager  # <-- NEW: For sending errors
    ) -> bool: # <-- NEW: Returns True if state changed, False otherwise
        """
        Main entry point for all player actions.
        Dispatches to the correct handler based on game phase.
        Handles validation and sends specific errors back to the user.
        """
        
        try:
            player = self.state.players.get(player_id)
            if not player:
                raise InvalidActionError(f"Player {player_id} not found.")
            
            # --- FIX: Player status check moved to _validate_player_can_act
            #          but we keep a basic one for global actions.
            if player.status != PlayerStatus.ACTIVE and action not in ["disconnect"]:
                 raise InvalidActionError(f"You are not an active player.")
                
            self.state.add_log(f"Player {player.username} attempting action: {action}")
            
            # --- FIX: Handle global actions FIRST ---
            if action == "surrender":
                await self._action_surrender(player)
                return True # State changed
            
            if action == "disconnect":
                await self._action_disconnect(player)
                return True # State changed

            # --- Phase-specific Actions with Validation ---
            
            if self.state.phase == GamePhase.PLANNING:
                if action == "submit_plan":
                    # --- REFACTOR: Centralized Validation ---
                    self._validate_player_can_act(player, GamePhase.PLANNING)
                    self._validate_player_has_not_acted(player.user_id, self.state.player_plans, "plan")
                    # --- END REFACTOR ---
                    
                    payload_model = PlanPayload(**payload)
                    await self._action_submit_plan(player, payload_model)
                else:
                    raise InvalidActionError(f"Action '{action}' not allowed in PLANNING phase.")
            
            elif self.state.phase == GamePhase.ATTRACTION:
                if action == "assign_threat":
                    # --- REFACTOR: Centralized Validation ---
                    self._validate_player_can_act(
                        player, 
                        GamePhase.ATTRACTION, 
                        expected_turn_player_id=self.state.attraction_turn_player_id
                    )
                    # Note: We don't check _validate_player_has_not_acted because
                    # this is a turn-based action, not a simultaneous one.
                    # --- END REFACTOR ---
                    
                    payload_model = AssignThreatPayload(**payload)
                    await self._action_assign_threat(player, payload_model)
                else:
                    raise InvalidActionError(f"Action '{action}' not allowed in ATTRACTION phase.")
            
            elif self.state.phase == GamePhase.DEFENSE:
                if action == "submit_defense":
                    # --- REFACTOR: Centralized Validation ---
                    self._validate_player_can_act(player, GamePhase.DEFENSE)
                    self._validate_player_has_not_acted(player.user_id, self.state.player_defenses, "defense")
                    # --- END REFACTOR ---
                    
                    payload_model = DefensePayload(**payload)
                    await self._action_submit_defense(player, payload_model)
                else:
                    raise InvalidActionError(f"Action '{action}' not allowed in DEFENSE phase.")
            
            elif self.state.phase == GamePhase.ACTION:
                # --- REFACTOR: Centralized Validation (replaces _check_action_turn) ---
                self._validate_player_can_act(
                    player,
                    GamePhase.ACTION,
                    expected_turn_player_id=self.state.action_turn_player_id
                )
                if player.action_prevented:
                    raise InvalidActionError("Your action is prevented this round!")
                # --- END REFACTOR ---
                
                if action == "perform_scavenge":
                    payload_model = ScavengePayload(**payload)
                    await self._action_scavenge(player, payload_model)
                elif action == "perform_fortify":
                    payload_model = FortifyPayload(**payload)
                    await self._action_fortify(player, payload_model)
                elif action == "perform_armory_run":
                    payload_model = ArmoryRunPayload(**payload)
                    await self._action_armory_run(player, payload_model)
                elif action == "perform_scheme":
                    await self._action_scheme(player)
                else:
                    raise InvalidActionError(f"Action '{action}' not allowed in ACTION phase.")

            elif self.state.phase == GamePhase.INTERMISSION:
                # --- REFACTOR: Centralized Validation ---
                self._validate_player_can_act(
                    player,
                    GamePhase.INTERMISSION,
                    expected_turn_player_id=self.state.intermission_turn_player_id
                )
                if self.state.intermission_purchases.get(player.user_id, 0) != 0:
                    raise InvalidActionError("You have already bought or passed.")
                # --- END REFACTOR ---

                if action == "buy_from_market":
                    payload_model = BuyPayload(**payload)
                    await self._action_intermission_buy(player, payload_model)
                elif action == "pass_buy":
                    await self._action_intermission_pass(player)
                else:
                    raise InvalidActionError(f"Action '{action}' not allowed in INTERMISSION phase.")
            
            # --- FIX: Remove global actions from this block ---

            else:
                raise InvalidActionError(f"Unknown action '{action}' in phase {self.state.phase}")
                
            # If we get here, the action was successful
            return True

        except (InvalidActionError, ValidationError) as e:
            # Send a specific error message back to the player
            error_message = str(e)
            self.state.add_log(f"Invalid action from {player_id}: {error_message}")
            await conn_manager.send_to_user(
                player_id,
                {"type": "error", "payload": {"message": error_message}}
            )
            return False # State did not change
        
        except Exception as e:
            # Handle unexpected system errors
            error_message = f"An unexpected server error occurred: {e}"
            self.state.add_log(f"CRITICAL ERROR for {player_id}: {error_message}")
            await conn_manager.send_to_user(
                player_id,
                {"type": "error", "payload": {"message": error_message}}
            )
            return False # State did not change

    # --- Phase Advancement ---
    # ... (Unchanged) ...
    
    async def _advance_to_planning(self):
        self.state.phase = GamePhase.PLANNING
        self.state.add_log("--- PLANNING PHASE ---")
        self.state.add_log("All players: Plan your Lure and Action cards.")

    async def _advance_to_attraction(self):
        self.state.phase = GamePhase.ATTRACTION
        self.state.add_log("--- ATTRACTION PHASE ---")
        self.state.add_log("Plans revealed! Calculating initiative...")
        
        initiative_list = [] # (initiative_score, player_id)
        active_players = self.state.get_active_players_in_order()
        
        for player in active_players:
            plan = self.state.player_plans.get(player.user_id)
            if not plan: continue
            
            lure_card = player.get_card_from_hand(plan.lure_card_id)
            if lure_card and isinstance(lure_card, LureCard):
                initiative_score = lure_card.strength
                original_pos = 0
                if player.user_id in self.state.initiative_queue:
                    original_pos = self.state.initiative_queue.index(player.user_id)
                
                initiative_list.append((initiative_score, original_pos, player.user_id))
            else:
                self.state.add_log(f"Error: Player {player.username} plan invalid.")
                initiative_list.append((99, 99, player.user_id)) 

        initiative_list.sort(key=lambda x: (x[0], x[1]))
        self.state.initiative_queue = [pid for score, pos, pid in initiative_list]
        
        initiative_log = ", ".join([
            f"{self.state.players[pid].username}"
            for pid in self.state.initiative_queue
        ])
        self.state.add_log(f"Initiative Order: {initiative_log}")
        
        # --- Draw Threats ---
        num_to_draw = len(active_players)
        drawn_threats = []
        for _ in range(num_to_draw):
            if not self.state.threat_deck:
                self.state.add_log("Threat deck is empty!")
                break
            drawn_threats.append(self.state.threat_deck.pop(0))
        
        self.state.current_threats = drawn_threats
        self.state.available_threat_ids = [t.id for t in drawn_threats]
        
        self.state.add_log(f"Drawing {len(drawn_threats)} threats: {', '.join([t.name for t in drawn_threats])}")

        # --- Setup Attraction Phase (v1.8) ---
        self.state.unassigned_player_ids = self.state.initiative_queue.copy()
        self.state.player_threat_assignment = {}
        self.state.attraction_phase_state = "FIRST_PASS"
        self.state.attraction_turn_player_id = None
        
        await self._advance_attraction_turn()

    async def _advance_attraction_turn(self):
        if not self.state.available_threat_ids or not self.state.unassigned_player_ids:
            self.state.add_log("All threats or players assigned.")
            await self._advance_to_defense()
            return
            
        next_player_id = None
        
        if self.state.attraction_phase_state == "FIRST_PASS":
            found_match = False
            for player_id in self.state.initiative_queue:
                if player_id not in self.state.unassigned_player_ids:
                    continue 
                
                player = self.state.players[player_id]
                valid_threats_for_player = self._get_valid_threats_for_player(player)
                
                if valid_threats_for_player:
                    next_player_id = player_id
                    found_match = True
                    break
            
            if found_match:
                self.state.attraction_turn_player_id = next_player_id
                self.state.add_log(f"Attraction (First Pass): {self.state.players[next_player_id].username}'s turn.")
            else:
                self.state.add_log("First Pass complete. Moving to Second Pass.")
                self.state.attraction_phase_state = "SECOND_PASS"
        
        if self.state.attraction_phase_state == "SECOND_PASS":
            for player_id in self.state.initiative_queue:
                if player_id in self.state.unassigned_player_ids:
                    next_player_id = player_id
                    break 
            
            if next_player_id:
                self.state.attraction_turn_player_id = next_player_id
                self.state.add_log(f"Attraction (Second Pass): {self.state.players[next_player_id].username}'s turn.")
            else:
                self.state.add_log("All players assigned (Second Pass).")
                await self._advance_to_defense()

    async def _advance_to_defense(self):
        self.state.phase = GamePhase.DEFENSE
        self.state.attraction_turn_player_id = None
        self.state.unassigned_player_ids = []
        
        self.state.add_log("--- DEFENSE PHASE ---")
        self.state.add_log("All players: Submit your defense (Scrap and Arsenal cards).")
        
        self.state.add_log("Assignments:")
        for player_id in self.state.initiative_queue:
            player = self.state.players[player_id]
            threat = self.state.get_assigned_threat(player_id)
            if threat:
                self.state.add_log(f"  {player.username} vs. {threat.name}")
            else:
                self.state.add_log(f"  {player.username} vs. (No Threat)")
                
    async def _resolve_defense_phase(self):
        self.state.phase = GamePhase.ACTION
        self.state.add_log("--- ACTION PHASE (Defense Resolution) ---")
        self.state.add_log("All defenses submitted! Resolving fights...")
        
        self.state.cards_to_return_to_hand = {}
        active_players = self.state.get_active_players_in_order()
        
        for player in active_players:
            defense = self.state.player_defenses.get(player.user_id)
            threat = self.state.get_assigned_threat(player.user_id)
            
            if not threat:
                self.state.add_log(f"{player.username} has no threat. They are safe.")
                continue
                
            if not defense:
                self.state.add_log(f"Warning: {player.username} has a threat but no defense submitted. Auto-failing.")
                defense = PlayerDefense() 
                
            defense_result = self._calculate_defense(
                player, threat, defense
            )

            total_def = defense_result["player_total_defense"]
            threat_stats = defense_result["threat_original_stats"]
            
            failed_all_three = (
                total_def[ScrapType.PARTS.value] < threat_stats[ScrapType.PARTS.value] and
                total_def[ScrapType.WIRING.value] < threat_stats[ScrapType.WIRING.value] and
                total_def[ScrapType.PLATES.value] < threat_stats[ScrapType.PLATES.value]
            )
            
            is_kill = defense_result["is_kill"]

            if is_kill:
                player.trophies.append(threat.name)
                self.state.spoils_to_gain[player.user_id] = threat
                self.state.add_log(f"{player.username} DEFEATED the {threat.name}! (Spoil pending in Cleanup)")
                self.state.current_threats.remove(threat)
                
                arsenal_cards_used = [player.get_card_from_hand(cid) for cid in defense.arsenal_card_ids]
                for arsenal_card in arsenal_cards_used:
                    if (
                        arsenal_card 
                        and arsenal_card.special_effect_id
                        and "ON_KILL" in arsenal_card.special_effect_id
                    ):
                         self._apply_special_effect(player, arsenal_card.special_effect_id, arsenal_card)

            elif failed_all_three:
                ignores_consequences = False
                arsenal_cards_used = [player.get_card_from_hand(cid) for cid in defense.arsenal_card_ids]
                for card in arsenal_cards_used:
                    if card and card.special_effect_id == ArsenalEffect.ON_FAIL_IGNORE_CONSEQUENCES:
                        ignores_consequences = True
                        self.state.add_log(f"{player.username} plays {card.name} and IGNORES all consequences!")
                        break
                
                if not ignores_consequences:
                    player.injuries += 1
                    self.state.add_log(f"{player.username} FAILED their defense against {threat.name} and gains 1 Injury!")

                    if threat.on_fail_effect:
                        self.state.add_log(f"The {threat.name}'s ability activates: {threat.abilities_text}")
                        
                        if threat.on_fail_effect == OnFailEffect.PREVENT_ACTION:
                            player.action_prevented = True
                            self.state.add_log(f"{player.username}'s Action is prevented this round!")
                        
                        elif threat.on_fail_effect == OnFailEffect.FALL_TO_BACK:
                            self.state.initiative_queue.remove(player.user_id)
                            self.state.initiative_queue.append(player.user_id)
                            self.state.add_log(f"{player.username} falls to the back of the initiative queue!")
                        
                        elif threat.on_fail_effect == OnFailEffect.DISCARD_SCRAP_1:
                            scrap_type_to_discard = None
                            max_scrap = -1
                            for s_type in [ScrapType.PARTS, ScrapType.WIRING, ScrapType.PLATES]:
                                s_amount = player.scrap.get(s_type, 0)
                                if s_amount > max_scrap:
                                    max_scrap = s_amount
                                    scrap_type_to_discard = s_type
                            
                            if scrap_type_to_discard and max_scrap > 0:
                                player.add_scrap(scrap_type_to_discard, -1)
                                self.state.add_log(f"{player.username} discards 1 {scrap_type_to_discard.value} scrap.")
                            else:
                                self.state.add_log(f"{player.username} had no scrap to discard.")
                        
                        elif threat.on_fail_effect == OnFailEffect.GAIN_INJURY_1:
                            player.injuries += 1
                            self.state.add_log(f"{player.username} gains 1 *additional* Injury!")
            else:
                self.state.add_log(f"{player.username} successfully DEFENDED against the {threat.name}.")

        self.state.action_turn_player_id = self._get_next_active_player()
        if self.state.action_turn_player_id:
            self.state.add_log(f"Action Phase begins. Turn: {self.state.players[self.state.action_turn_player_id].username}")
        else:
            self.state.add_log("No players eligible for Action Phase.")
            await self._advance_to_cleanup()

    async def _resolve_action_phase(self):
        next_player = self._get_next_active_player(
            start_after_player=self.state.action_turn_player_id
        )
        
        if next_player:
            self.state.action_turn_player_id = next_player
            self.state.add_log(f"Action Turn: {self.state.players[next_player].username}")
        else:
            self.state.add_log("All player actions complete.")
            await self._advance_to_cleanup()
            
    async def _advance_to_cleanup(self):
        self.state.phase = GamePhase.CLEANUP
        self.state.action_turn_player_id = None
        await self._advance_to_wilderness()
        
    async def _advance_to_wilderness(self):
        self.state.add_log("--- CLEANUP PHASE ---")
        active_players = [p for p in self.state.players.values() if p.status != PlayerStatus.SURRENDERED]
        
        self.state.add_log("All players gain 1 random scrap (Base Income).")
        for player in active_players:
            self._draw_random_scrap(player, 1)

        self.state.add_log("Awarding Spoils for Kills...")
        for player_id, threat in self.state.spoils_to_gain.items():
            player = self.state.players.get(player_id)
            if player:
                trophy_log = []
                for s_type, amount in threat.trophy_value.items():
                    if amount > 0:
                        player.add_scrap(s_type, amount)
                        trophy_log.append(f"{amount} {s_type.value}")
                
                trophy_log_str = ", ".join(trophy_log)
                if not trophy_log_str: trophy_log_str = "no scrap"
                self.state.add_log(f"{player.username} gains {trophy_log_str} from {threat.name}.")

        
        for player in active_players:
            player_defense = self.state.player_defenses.get(player.user_id)
            if player_defense:
                cards_to_discard = []
                for arsenal_id in player_defense.arsenal_card_ids:
                    card = player.get_card_from_hand(arsenal_id)
                    if not card: continue
                    if self.state.cards_to_return_to_hand.get(player.user_id) == card.id:
                        self.state.add_log(f"{card.name} returns to {player.username}'s hand!")
                        continue
                    cards_to_discard.append(card)

                for card in cards_to_discard:
                    if card in player.arsenal_cards:
                        if card.charges is not None:
                            card.charges -= 1
                            if card.charges > 0:
                                self.state.add_log(f"{player.username}'s {card.name} has {card.charges} charge(s) left.")
                                continue 
                        player.arsenal_cards.remove(card)
                
                if cards_to_discard:
                    self.state.add_log(f"{player.username} discards used Arsenal card(s).")
            
            # --- Set last_round_lure_id ---
            plan = self.state.player_plans.get(player.user_id)
            if plan:
                player.last_round_lure_id = plan.lure_card_id
                
            player.plan = None
            player.defense = None
            player.action_prevented = False
        
        self.state.player_plans = {}
        self.state.player_defenses = {}
        self.state.current_threats = []
        self.state.player_threat_assignment = {}
        self.state.cards_to_return_to_hand = {}
        self.state.spoils_to_gain = {}
        self.state.add_log("Refilling markets.")
        self._refill_market()

        if self.state.round == 5 or self.state.round == 10:
            await self._advance_to_intermission()
        elif self.state.round == 15:
            await self._end_game()
        else:
            self._start_new_round()
        
    async def _advance_to_intermission(self):
        self.state.phase = GamePhase.INTERMISSION
        self.state.add_log(f"--- INTERMISSION (End of Era {self.state.era}) ---")
        self.state.add_log("Players may take one FREE purchase from the Market.")
        
        self.state.era += 1
        self.state.intermission_purchases = {
            pid: 0 for pid in self.state.initiative_queue 
            if self.state.players[pid].status == PlayerStatus.ACTIVE
        }
        
        first_player_id = self._get_next_active_player()
        
        if first_player_id:
             self.state.intermission_turn_player_id = first_player_id
             self.state.add_log(f"Purchase Turn: {self.state.players[first_player_id].username}")
        else:
             self.state.add_log("No active players to purchase.")
             await self._resolve_intermission() 
             
    async def _resolve_intermission(self):
        next_player_id = self._get_next_active_player(
            start_after_player=self.state.intermission_turn_player_id,
            check_intermission_pass=True
        )
        
        if next_player_id:
            self.state.intermission_turn_player_id = next_player_id
            self.state.add_log(f"Purchase Turn: {self.state.players[next_player_id].username}")
        else:
            self.state.add_log("All players have finished purchasing.")
            self.state.intermission_turn_player_id = None
            self.state.add_log("Refilling markets for new Era.")
            self._refill_market()
            self._start_new_round() 

    # --- Defense Calculation ---
    # ... (Unchanged) ...
    def _calculate_defense(
        self, player: PlayerState, threat: ThreatCard, defense: PlayerDefense
    ) -> Dict[str, Any]:
        """
        Calculates if a player's defense beats a threat.
        REFACTOR: Returns structured Dict.
        FIXED: Includes v1.8 Base Defense.
        FIXED: Uses v1.8 Kill logic.
        FIXED: Uses v1.8 Scrap value logic.
        """
        
        # --- 1. Get Base Defense (v1.8) ---
        base_defense = {ScrapType.PARTS: 0, ScrapType.WIRING: 0, ScrapType.PLATES: 0}
        if player.plan:
            planned_action_card = player.get_card_from_hand(player.plan.action_card_id)
            
            for action_card in player.action_cards:
                if planned_action_card and action_card.id == planned_action_card.id:
                    continue # Skip the played card
                
                # Find the defense value for the un-played card
                card_name_key = action_card.name.upper()
                if card_name_key in BASE_DEFENSE_MAP:
                    for s_type, val in BASE_DEFENSE_MAP[card_name_key].items():
                        base_defense[s_type] += val
        
        # --- 2. Get Scrap Value (v1.8) ---
        scrap_count = defense.scrap_spent
        scrap_value = {ScrapType.PARTS: 0, ScrapType.WIRING: 0, ScrapType.PLATES: 0}
        
        ignores_resist = {s: False for s in ScrapType}
        scrap_bonus = {s: 0 for s in ScrapType}
        
        for card in player.upgrade_cards:
            if card.special_effect_id:
                if card.special_effect_id == UpgradeEffect.SCRAP_IGNORE_RESIST_PARTS:
                    ignores_resist[ScrapType.PARTS] = True
                elif card.special_effect_id == UpgradeEffect.SCRAP_IGNORE_RESIST_WIRING:
                    ignores_resist[ScrapType.WIRING] = True
                elif card.special_effect_id == UpgradeEffect.SCRAP_IGNORE_RESIST_PLATES:
                    ignores_resist[ScrapType.PLATES] = True
                elif card.special_effect_id == UpgradeEffect.SCRAP_BONUS_PARTS_1:
                    scrap_bonus[ScrapType.PARTS] += 1
                elif card.special_effect_id == UpgradeEffect.SCRAP_BONUS_WIRING_1:
                    scrap_bonus[ScrapType.WIRING] += 1
                elif card.special_effect_id == UpgradeEffect.SCRAP_BONUS_PLATES_1:
                    scrap_bonus[ScrapType.PLATES] += 1

        for s_type in ScrapType:
            count = scrap_count.get(s_type, 0)
            if count == 0:
                continue
            
            base_val = 2 + scrap_bonus[s_type]
            
            if s_type in threat.immune:
                scrap_value[s_type] = 0 
            elif s_type in threat.resistant and not ignores_resist[s_type]:
                scrap_value[s_type] = (base_val - 1) * count 
            else:
                scrap_value[s_type] = base_val * count
        
        # --- 3. Get Arsenal Boosts ---
        arsenal_boosts = {s: 0 for s in ScrapType}
        has_lure_to_weakness = False
        has_corrosive_sludge = False
        
        arsenal_cards_used = [player.get_card_from_hand(cid) for cid in defense.arsenal_card_ids]
        
        for card in arsenal_cards_used:
            if not card or not isinstance(card, ArsenalCard):
                continue
            
            for s_type, amount in card.defense_boost.items():
                arsenal_boosts[s_type] += amount
            
            if card.special_effect_id:
                if card.special_effect_id == ArsenalEffect.SPECIAL_LURE_TO_WEAKNESS:
                    has_lure_to_weakness = True
                elif card.special_effect_id == ArsenalEffect.SPECIAL_CORROSIVE_SLUDGE:
                    has_corrosive_sludge = True
        
        # --- 4. Get Permanent Upgrade Boosts ---
        upgrade_boosts = {s: 0 for s in ScrapType}
        upgrade_piercing_boosts = {s: 0 for s in ScrapType}
        
        for card in player.upgrade_cards:
            for s_type, amount in card.defense_boost.items():
                upgrade_boosts[s_type] += amount
            for s_type, amount in card.defense_piercing.items():
                upgrade_piercing_boosts[s_type] += amount

        # --- 5. Get Special Amp Boosts ---
        amp_boosts = defense.special_amp_spend
        
        # --- 6. Calculate Final Defense Totals ---
        final_defense_non_piercing = {
            s_type: (
                base_defense[s_type] +
                scrap_value[s_type] +
                arsenal_boosts[s_type] +
                upgrade_boosts[s_type]
            ) for s_type in ScrapType
        }
        
        final_piercing_defense = {
            s_type: (
                upgrade_piercing_boosts[s_type] +
                amp_boosts.get(s_type, 0) # Amp is piercing
            ) for s_type in ScrapType
        }

        # --- 7. Get Threat's Target Stats ---
        threat_original_stats = {
            ScrapType.PARTS: threat.ferocity,
            ScrapType.WIRING: threat.cunning,
            ScrapType.PLATES: threat.mass,
        }
        
        resistant_to = threat.resistant.copy()
        immune_to = threat.immune.copy()

        # --- 8. Apply Special Modifiers (Corrosive Sludge) ---
        corrosive_sludge_active = False
        if has_corrosive_sludge and defense.special_corrode_stat:
            s_type = defense.special_corrode_stat
            corrosive_sludge_active = True
            if s_type in immune_to: immune_to.remove(s_type)
            if s_type in resistant_to: resistant_to.remove(s_type)
            
        # --- 9. Apply Resistance/Immunity ---
        final_defense_non_piercing_applied = final_defense_non_piercing.copy()
        for s_type in ScrapType:
            non_scrap_defense = base_defense[s_type] + arsenal_boosts[s_type] + upgrade_boosts[s_type]
            if s_type in immune_to:
                non_scrap_defense = 0
            
            final_defense_non_piercing_applied[s_type] = scrap_value[s_type] + non_scrap_defense
        
        # --- 10. Check for Kill ---
        is_kill = False
        killed_stats = 0
        
        total_defense_applied = {
            s_type: final_defense_non_piercing_applied[s_type] + final_piercing_defense[s_type]
            for s_type in ScrapType
        }
        
        highest_stats_to_beat = []
        lure_to_weakness_active = False

        if has_lure_to_weakness and defense.special_target_stat:
            lure_to_weakness_active = True
            s_type = defense.special_target_stat
            target_val = threat_original_stats[s_type]
            
            if total_defense_applied[s_type] >= target_val:
                is_kill = True
            
            highest_stats_to_beat.append(s_type)
        
        else:
            highest_stat_val = max(threat_original_stats.values())
            if highest_stat_val == 0:
                is_kill = True
            else:
                if threat.ferocity == highest_stat_val: highest_stats_to_beat.append(ScrapType.PARTS)
                if threat.cunning == highest_stat_val: highest_stats_to_beat.append(ScrapType.WIRING)
                if threat.mass == highest_stat_val: highest_stats_to_beat.append(ScrapType.PLATES)
                
                for s_type in highest_stats_to_beat:
                    if total_defense_applied[s_type] >= threat_original_stats[s_type]:
                        is_kill = True
                        break 
            
        return {
            "is_kill": is_kill,
            "player_total_defense": {s_type.value: val for s_type, val in total_defense_applied.items()},
            "player_base_defense": {s_type.value: val for s_type, val in base_defense.items()},
            "player_scrap_value": {s_type.value: val for s_type, val in scrap_value.items()},
            "player_arsenal_defense": {s_type.value: val for s_type, val in arsenal_boosts.items()},
            "player_upgrade_defense": {s_type.value: val for s_type, val in upgrade_boosts.items()},
            "player_piercing_defense": {s_type.value: val for s_type, val in final_piercing_defense.items()},
            "threat_original_stats": {s_type.value: val for s_type, val in threat_original_stats.items()},
            "threat_highest_stats_to_beat": [s_type.value for s_type in highest_stats_to_beat],
            "threat_resistant_to": [s_type.value for s_type in resistant_to],
            "threat_immune_to": [s_type.value for s_type in immune_to],
            "is_lure_to_weakness_active": lure_to_weakness_active,
            "is_corrosive_sludge_active": corrosive_sludge_active,
        }
        
    # --- Action Phase (REFACTORED with Validation) ---

    async def _check_action_turn(self, player: PlayerState, expected_action: str):
        """
        Helper to validate turn, phase, and correct action card.
        
        REFACTOR: This method is now DEPRECATED by the validation
        in `player_action`. It is left here for reference but
        is no longer called by the refactored action methods.
        """
        if self.state.phase != GamePhase.ACTION:
            raise InvalidActionError("Not in ACTION phase.")
        if self.state.action_turn_player_id != player.user_id:
            raise InvalidActionError("It's not your action turn.")
        if player.action_prevented:
            raise InvalidActionError("Your action is prevented this round!")
            
        plan = self.state.player_plans.get(player.user_id)
        if not plan:
             raise InvalidActionError("Cannot find your plan for this round.")
             
        action_card = player.get_card_from_hand(plan.action_card_id)
        if not action_card:
            raise InvalidActionError("Cannot find your planned action card.")
        
        if action_card.name.upper() != expected_action:
            raise InvalidActionError(f"Your planned action was {action_card.name}, not {expected_action}.")

    async def _validate_planned_action(self, player: PlayerState, expected_action: str):
        """
        Helper to check if the player's planned action card matches
        the action they are trying to perform.
        """
        plan = self.state.player_plans.get(player.user_id)
        if not plan:
             raise InvalidActionError("Cannot find your plan for this round.")
        
        action_card = self._validate_card_in_hand(
            player, plan.action_card_id, SurvivorActionCard
        )
        
        if action_card.name.upper() != expected_action:
            raise InvalidActionError(f"Your planned action was {action_card.name}, not {expected_action}.")

    async def _action_scavenge(self, player: PlayerState, payload: ScavengePayload):
        # --- REFACTOR: Use new helper ---
        await self._validate_planned_action(player, "SCAVENGE")
        # --- END REFACTOR ---
        
        if len(payload.choices) != 2:
            # Fallback to random if payload is invalid
            self.state.add_log(f"Error: {player.username} (Scavenge) invalid choices. Defaulting to random.")
            self._draw_random_scrap(player, 2)
        else:
            try:
                choice_1 = payload.choices[0]
                choice_2 = payload.choices[1]
                player.add_scrap(choice_1, 1)
                player.add_scrap(choice_2, 1)
                self.state.add_log(f"{player.username} (Scavenge) takes 1 {choice_1.value} and 1 {choice_2.value}.")
            except ValueError:
                self.state.add_log(f"Error: {player.username} (Scavenge) invalid scrap types. Defaulting to random.")
                self._draw_random_scrap(player, 2)
        
        await self._resolve_action_phase()

    async def _action_fortify(self, player: PlayerState, payload: FortifyPayload):
        # --- REFACTOR: Use new helper ---
        await self._validate_planned_action(player, "FORTIFY")
        # --- END REFACTOR ---
        
        card_id = payload.card_id
        if not card_id:
            self.state.add_log(f"{player.username} (Fortify) chooses fallback.")
            self._draw_random_scrap(player, 2)
            await self._resolve_action_phase()
            return
            
        card, source_list = self._find_market_card(card_id)

        if not card or not isinstance(card, UpgradeCard) or not source_list:
            raise InvalidActionError(f"Card {card_id} not in Upgrade market.")
            
        if not player.can_afford(card.cost):
            self.state.add_log(f"{player.username} (Fortify) cannot afford {card.name}. Taking fallback.")
            self._draw_random_scrap(player, 2)
        else:
            player.pay_cost(card.cost)
            source_list.remove(card)
            player.upgrade_cards.append(card)
            self.state.add_log(f"{player.username} (Fortify) buys {card.name}.")
        
        await self._resolve_action_phase()

    async def _action_armory_run(self, player: PlayerState, payload: ArmoryRunPayload):
        # --- REFACTOR: Use new helper ---
        await self._validate_planned_action(player, "ARMORY RUN")
        # --- END REFACTOR ---
        
        card_id = payload.card_id
        if not card_id:
            self.state.add_log(f"{player.username} (Armory Run) chooses fallback.")
            self._draw_random_scrap(player, 2)
            await self._resolve_action_phase()
            return

        card, source_list = self._find_market_card(card_id)

        if not card or not isinstance(card, ArsenalCard) or not source_list:
            raise InvalidActionError(f"Card {card_id} not in Arsenal market.")

        if not player.can_afford(card.cost):
            self.state.add_log(f"{player.username} (Armory Run) cannot afford {card.name}. Taking fallback.")
            self._draw_random_scrap(player, 2)
        else:
            player.pay_cost(card.cost)
            source_list.remove(card)
            player.arsenal_cards.append(card)
            self.state.add_log(f"{player.username} (Armory Run) buys {card.name}.")
        
        await self._resolve_action_phase()

    async def _action_scheme(self, player: PlayerState):
        # --- REFACTOR: Use new helper ---
        await self._validate_planned_action(player, "SCHEME")
        # --- END REFACTOR ---

        self.state.add_log(f"{player.username} (Scheme) takes 1 random scrap and moves to the front.")
        self._draw_random_scrap(player, 1)
        
        if player.user_id in self.state.initiative_queue:
            self.state.initiative_queue.remove(player.user_id)
        
        self.state.initiative_queue.insert(0, player.user_id)
        
        await self._resolve_action_phase()

    # --- NEW HELPER: Apply Card Effects ---
    # ... (Unchanged) ...
    def _apply_special_effect(
        self, 
        player: PlayerState, 
        effect_id: str, 
        card: Optional[Card] = None
    ):
        if not effect_id: return
        card_name = card.name if card else "An effect"
        try:
            if effect_id == ArsenalEffect.ON_KILL_RETURN_TO_HAND:
                if card and isinstance(card, ArsenalCard):
                    self.state.cards_to_return_to_hand[player.user_id] = card.id
        except Exception as e:
            print(f"Error applying special effect tag '{effect_id}': {e}")
                
    # --- Intermission Phase (REFACTORED with Validation) ---
    
    async def _action_intermission_buy(self, player: PlayerState, payload: BuyPayload):
        # --- REFACTOR: All common validation is now done in `player_action` ---
        # if self.state.phase != GamePhase.INTERMISSION: ... (REMOVED)
        # if self.state.intermission_turn_player_id != player.user_id: ... (REMOVED)
        # if self.state.intermission_purchases.get(player.user_id, 0) != 0: ... (REMOVED)
        # --- END REFACTOR ---
            
        card_id = payload.card_id
        card, source_list = self._find_market_card(card_id)
        
        if not card or not source_list:
            raise InvalidActionError(f"Card {card_id} not in market.")
            
        # --- v1.8 Intermission is FREE ---
        # (Original code was correct per comments)
            
        source_list.remove(card)
        if isinstance(card, UpgradeCard):
            player.upgrade_cards.append(card)
        elif isinstance(card, ArsenalCard):
            player.arsenal_cards.append(card)
        else:
            # Should be impossible, but good to check
            source_list.append(card) # Put it back
            raise InvalidActionError(f"Card {card.name} is not an Upgrade or Arsenal card.")
        
        self.state.add_log(f"{player.username} took FREE Intermission card: {card.name}.")
        
        self.state.intermission_purchases[player.user_id] = 1
        await self._resolve_intermission()

    async def _action_intermission_pass(self, player: PlayerState):
        # --- REFACTOR: All common validation is now done in `player_action` ---
        # if self.state.phase != GamePhase.INTERMISSION: ... (REMOVED)
        # if self.state.intermission_turn_player_id != player.user_id: ... (REMOVED)
        # if self.state.intermission_purchases.get(player.user_id, 0) != 0: ... (REMOVED)
        # --- END REFACTOR ---
            
        self.state.add_log(f"{player.username} passes their free buy.")
        self.state.intermission_purchases[player.user_id] = -1 # -1 = passed
        await self._resolve_intermission()

    # --- Game Loop ---
    # ... (Unchanged) ...
    def _start_new_round(self):
        self.state.round += 1
        self.state.phase = GamePhase.WILDERNESS # This is temp
        self.state.add_log(f"--- ROUND {self.state.round} (Era {self.state.era}) ---")
        self.state.phase = GamePhase.PLANNING
        self.state.add_log("--- PLANNING PHASE ---")
        self.state.add_log("All players: Plan your Lure and Action cards.")

    # --- Player Actions (REFACTORED with Validation) ---
    
    async def _action_submit_plan(self, player: PlayerState, payload: PlanPayload):
        # --- REFACTOR: Removed Phase & Double-Submit checks ---
        # These are now handled by the main `player_action` dispatcher
        # before this method is ever called.
        #
        # if self.state.phase != GamePhase.PLANNING: ... (REMOVED)
        # if player.user_id in self.state.player_plans: ... (REMOVED)
        # --- END REFACTOR ---

        # --- Validation: Card Existence (Using new helper) ---
        lure_card = self._validate_card_in_hand(
            player, payload.lure_card_id, LureCard
        )
        action_card = self._validate_card_in_hand(
            player, payload.action_card_id, SurvivorActionCard
        )
        # --- End Validation ---

        # --- Validation: Unique Business Logic (Rulebook) ---
        if lure_card.id == player.last_round_lure_id:
            raise InvalidActionError("Cannot use the same Lure Card as last round.")

        # --- All checks passed ---
        plan = PlayerPlans(
            lure_card_id=lure_card.id,      # Use validated card id
            action_card_id=action_card.id # Use validated card id
        )

        self.state.player_plans[player.user_id] = plan
        player.plan = plan # Also set on player for redaction
        self.state.add_log(f"{player.username} has submitted their plan.")

        if self._are_all_players_ready("plans"):
            await self._advance_to_attraction()

    async def _action_assign_threat(self, player: PlayerState, payload: AssignThreatPayload):
        # --- REFACTOR: Removed Phase & Turn checks ---
        # These are now handled by the main `player_action` dispatcher
        #
        # if self.state.phase != GamePhase.ATTRACTION: ... (REMOVED)
        # if self.state.attraction_turn_player_id != player.user_id: ... (REMOVED)
        # --- END REFACTOR ---
            
        threat_id = payload.threat_id
        if threat_id not in self.state.available_threat_ids:
            raise InvalidActionError("That threat is not available.")
            
        threat = next((t for t in self.state.current_threats if t.id == threat_id), None)
        if not threat:
             raise InvalidActionError(f"Threat {threat_id} not found.") # Should be impossible

        # --- Validation: Lure Check (First Pass) ---
        if self.state.attraction_phase_state == "FIRST_PASS":
            plan = self.state.player_plans.get(player.user_id)
            # We can trust the plan exists, but we need the card
            if not plan: # Should be impossible, but good paranoia
                raise InvalidActionError("Cannot find your submitted plan.")
            
            lure_card = self._validate_card_in_hand(player, plan.lure_card_id, LureCard)
            
            lure_name_map = {
                ScrapType.PARTS: "Rags",
                ScrapType.WIRING: "Noises",
                ScrapType.PLATES: "Fruit"
            }
            lure_type_name = lure_name_map.get(lure_card.lure_type)
            
            if lure_type_name not in threat.lure_type.split('/'):
                raise InvalidActionError(f"Your lure ({lure_type_name}) does not match {threat.name} ({threat.lure_type}).")
            
        # --- All checks passed ---
        self.state.add_log(f"{player.username} attracts the {threat.name}.")
        
        self.state.player_threat_assignment[player.user_id] = threat.id
        self.state.available_threat_ids.remove(threat.id)
        self.state.unassigned_player_ids.remove(player.user_id)
        
        await self._advance_attraction_turn()

    async def _action_submit_defense(self, player: PlayerState, payload: DefensePayload):
        # --- REFACTOR: Removed Phase & Double-Submit checks ---
        # These are now handled by the main `player_action` dispatcher
        #
        # if self.state.phase != GamePhase.DEFENSE: ... (REMOVED)
        # if player.user_id in self.state.player_defenses: ... (REMOVED)
        # --- END REFACTOR ---
            
        if not self.state.get_assigned_threat(player.user_id):
            # This check is for players *without* a threat trying to submit
            if not self._are_all_players_ready("defenses"):
                raise InvalidActionError("You do not have a threat to defend against.")
            else:
                # Edge case: last player to "ready" has no threat
                self.state.add_log(f"{player.username} is ready (no threat).")
                await self._resolve_defense_phase()
                return

        # --- Validation: Scrap Cost ---
        for scrap_type, count in payload.scrap_spent.items():
            if player.scrap.get(scrap_type, 0) < count:
                raise InvalidActionError(f"Not enough {scrap_type.value} scrap. You have {player.scrap.get(scrap_type, 0)}, need {count}.")

        # --- Validation: Arsenal Cards (Using new helper) ---
        arsenal_cards_to_use = []
        for card_id in payload.arsenal_card_ids:
            card = self._validate_card_in_hand(player, card_id, ArsenalCard)
            arsenal_cards_to_use.append(card)
        
        # --- Validation: Special Inputs ---
        has_lure_to_weakness = any(
            c.special_effect_id == ArsenalEffect.SPECIAL_LURE_TO_WEAKNESS for c in arsenal_cards_to_use
        )
        if has_lure_to_weakness and not payload.special_target_stat:
            raise InvalidActionError("You must select a target stat for 'Lure to Weakness'.")
            
        has_corrosive = any(
            c.special_effect_id == ArsenalEffect.SPECIAL_CORROSIVE_SLUDGE for c in arsenal_cards_to_use
        )
        if has_corrosive and not payload.special_corrode_stat:
             raise InvalidActionError("You must select a stat for 'Corrosive Sludge'.")

        # --- All checks passed ---
        
        # 1. Deduct Scrap
        for scrap_type, count in payload.scrap_spent.items():
            player.add_scrap(scrap_type, -count)
            
        # 2. Create Defense object
        defense = PlayerDefense(
            scrap_spent=payload.scrap_spent,
            arsenal_card_ids=payload.arsenal_card_ids,
            special_target_stat=payload.special_target_stat,
            special_corrode_stat=payload.special_corrode_stat,
            special_amp_spend=payload.special_amp_spend 
        )
        
        self.state.player_defenses[player.user_id] = defense
        player.defense = defense
        self.state.add_log(f"{player.username} has submitted their defense.")
        
        if self._are_all_players_ready("defenses"):
            await self._resolve_defense_phase()

    async def _action_surrender(self, player: PlayerState):
        self.state.add_log(f"{player.username} has surrendered.")
        player.status = PlayerStatus.SURRENDERED
        
        active_players = self.state.get_active_players_in_order()
        if len(active_players) <= 1:
            await self._end_game()

    async def _action_disconnect(self, player: PlayerState):
        self.state.add_log(f"{player.username} has disconnected.")
        player.status = PlayerStatus.DISCONNECTED
        
        active_players = self.state.get_active_players_in_order()
        if len(active_players) <= 1:
            await self._end_game()

    # --- NEW: Validation Helper Methods ---

    def _validate_player_can_act(
        self, 
        player: PlayerState, 
        expected_phase: GamePhase, 
        expected_turn_player_id: Optional[str] = None
    ):
        """
        Central validator for basic game state and player turn.
        Raises InvalidActionError if any check fails.
        """
        if self.state.phase != expected_phase:
            raise InvalidActionError(f"Action not allowed in {self.state.phase} phase. Expected {expected_phase}.")
        
        if player.status != PlayerStatus.ACTIVE:
            raise InvalidActionError(f"You are not an active player ({player.status}).")
        
        if expected_turn_player_id and expected_turn_player_id != player.user_id:
            raise InvalidActionError("It is not your turn.")
    
    def _validate_player_has_not_acted(self, player_id: str, action_map: Dict[str, Any], action_name: str):
        """
        Central validator to prevent double-submission.
        Raises InvalidActionError if player has already acted.
        """
        if player_id in action_map:
            raise InvalidActionError(f"You have already submitted your {action_name}.")

    def _validate_card_in_hand(self, player: PlayerState, card_id: str, expected_type: Type[Card]) -> Card:
        """
        Gets a card from a player's hand and validates its type.
        Raises InvalidActionError if not found or wrong type.
        """
        card = player.get_card_from_hand(card_id)
        if not card:
            raise InvalidActionError(f"Card with ID {card_id} not found in your hand.")
        if not isinstance(card, expected_type):
            raise InvalidActionError(f"Invalid card type. Expected {expected_type.__name__}, but {card.name} is a {type(card).__name__}.")
        return card

    # --- Market & Card Helpers ---
    # ... (Unchanged) ...
    def _refill_market(self):
        market_size = self.state.market.faceup_limit
        while len(self.state.market.upgrade_faceup) < market_size:
            if not self.state.market.upgrade_deck:
                break
            self.state.market.upgrade_faceup.append(
                self.state.market.upgrade_deck.pop(0)
            )
        while len(self.state.market.arsenal_faceup) < market_size:
            if not self.state.market.arsenal_deck:
                break
            self.state.market.arsenal_faceup.append(
                self.state.market.arsenal_deck.pop(0)
            )
            
    def _find_market_card(self, card_id: str) -> Tuple[Optional[Card], Optional[List]]:
        for card_list in [
            self.state.market.upgrade_faceup, 
            self.state.market.arsenal_faceup
        ]:
            for card in card_list:
                if card.id == card_id:
                    return card, card_list
        return None, None
        
    def _get_valid_threats_for_player(self, player: PlayerState) -> List[ThreatCard]:
        plan = self.state.player_plans.get(player.user_id)
        if not plan: return []
        
        # --- REFACTOR: Use validation helper ---
        try:
            lure_card = self._validate_card_in_hand(player, plan.lure_card_id, LureCard)
        except InvalidActionError:
            return [] # Should not happen if plan was validated, but good to check
        # --- END REFACTOR ---
        
        lure_name_map = {
            ScrapType.PARTS: "Rags",
            ScrapType.WIRING: "Noises",
            ScrapType.PLATES: "Fruit"
        }
        lure_type_name = lure_name_map.get(lure_card.lure_type)
        valid_threats = []
        for threat_id in self.state.available_threat_ids:
            threat = next((t for t in self.state.current_threats if t.id == threat_id), None)
            if threat and lure_type_name in threat.lure_type.split('/'):
                valid_threats.append(threat)
        return valid_threats

    # --- Turn Management ---
    # ... (Unchanged) ...
    def _get_next_active_player(
        self, 
        start_after_player: Optional[str] = None,
        check_intermission_pass: bool = False
    ) -> Optional[str]:
        player_queue = self.state.initiative_queue
        start_index = 0
        if start_after_player and start_after_player in player_queue:
            start_index = player_queue.index(start_after_player) + 1
            
        for i in range(start_index, len(player_queue)):
            player_id = player_queue[i]
            player = self.state.players[player_id]
            if player.status != PlayerStatus.ACTIVE:
                continue
            if self.state.phase == GamePhase.ACTION and player.action_prevented:
                continue
            if check_intermission_pass:
                if self.state.intermission_purchases.get(player_id, 0) != 0:
                    continue 
            return player_id
            
        if check_intermission_pass:
            return None
        if self.state.phase == GamePhase.ACTION and start_after_player:
            return None
        if not start_after_player:
             for i in range(0, len(player_queue)):
                player_id = player_queue[i]
                player = self.state.players[player_id]
                if player.status == PlayerStatus.ACTIVE:
                    if self.state.phase == GamePhase.ACTION and player.action_prevented:
                        continue
                    return player_id
        return None 

    # --- Game End ---
    # ... (Unchanged) ...
    async def _end_game(self):
        if self.state.phase == GamePhase.GAME_OVER: return
        self.state.phase = GamePhase.GAME_OVER
        self.state.add_log("--- GAME OVER ---")
        active_players = [
            p for p in self.state.players.values() 
            if p.status != PlayerStatus.SURRENDERED
        ]
        if not active_players:
            self.state.add_log("No winner, all players surrendered.")
            return
        sorted_players = sorted(
            active_players,
            key=lambda p: (p.injuries, -len(p.trophies), -p.get_total_scrap())
        )
        self.state.winner = sorted_players[0]
        self.state.add_log(f"Winner: {self.state.winner.username}!")
        self.state.add_log("Final Standings:")
        for i, p in enumerate(sorted_players):
            self.state.add_log(
                f"  {i+1}. {p.username} (Injuries: {p.injuries}, Trophies: {len(p.trophies)}, Scrap: {p.get_total_scrap()})"
            )

    # --- Helper: Check Readiness ---
    # ... (Unchanged) ...
    def _are_all_players_ready(self, check_type: str) -> bool:
        active_player_ids = {
            p.user_id for p in self.state.get_active_players_in_order()
        }
        if not active_player_ids:
            return True 

        if check_type == "plans":
            submitted_ids = set(self.state.player_plans.keys())
        elif check_type == "defenses":
            active_player_ids = {
                pid for pid in active_player_ids 
                if self.state.get_assigned_threat(pid) is not None
            }
            if not active_player_ids:
                return True 
            submitted_ids = set(self.state.player_defenses.keys())
        else:
            return False
        return active_player_ids.issubset(submitted_ids)

    # --- Public Preview Function (REFACTORED with Validation) ---
    
    def public_preview_defense(self, player_id: str, defense_payload: Dict[str, Any]) -> Dict[str, Any]:
        """
        READ-ONLY.
        Takes a *proposed* defense from a player and returns the
        calculated outcome. Does not mutate state.
        """
        player = self.state.players.get(player_id)
        threat = self.state.get_assigned_threat(player_id)
        
        if not player or not threat:
            return {"error": "Player or threat not found for preview."}
            
        try:
            # --- Validation: Deserialize and check payload ---
            # Use the Pydantic model for validation
            payload_model = DefensePayload(**defense_payload)

            # --- Validation: Check scrap *possession* ---
            for scrap_type, count in payload_model.scrap_spent.items():
                if player.scrap.get(scrap_type, 0) < count:
                    raise InvalidActionError(f"Not enough {scrap_type.value} scrap. You have {player.scrap.get(scrap_type, 0)}, need {count}.")

            # --- Validation: Check arsenal card *possession* (using new helper) ---
            arsenal_cards_to_use = []
            for card_id in payload_model.arsenal_card_ids:
                card = self._validate_card_in_hand(player, card_id, ArsenalCard)
                arsenal_cards_to_use.append(card)

            # --- Validation: Check special inputs ---
            has_lure_to_weakness = any(c.special_effect_id == ArsenalEffect.SPECIAL_LURE_TO_WEAKNESS for c in arsenal_cards_to_use)
            if has_lure_to_weakness and not payload_model.special_target_stat:
                raise InvalidActionError("Preview requires 'special_target_stat' for 'Lure to Weakness'.")
                
            has_corrosive = any(c.special_effect_id == ArsenalEffect.SPECIAL_CORROSIVE_SLUDGE for c in arsenal_cards_to_use)
            if has_corrosive and not payload_model.special_corrode_stat:
                raise InvalidActionError("Preview requires 'special_corrode_stat' for 'Corrosive Sludge'.")

            # --- Create the temporary PlayerDefense object for calculation ---
            defense = PlayerDefense(
                scrap_spent=payload_model.scrap_spent,
                arsenal_card_ids=payload_model.arsenal_card_ids,
                special_target_stat=payload_model.special_target_stat,
                special_corrode_stat=payload_model.special_corrode_stat,
                special_amp_spend=payload_model.special_amp_spend
            )

            defense_result = self._calculate_defense(player, threat, defense)
            return defense_result
            
        except (ValidationError, InvalidActionError) as e:
            return {"error": f"Invalid defense payload: {e}"}
        except Exception as e:
            print(f"Error during defense preview: {e}")
            return {"error": f"Calculation failed: {e}"}