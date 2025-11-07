"""
The GameInstance class.
"""

from .game_core.game_models import (
    GameState, PlayerState, GamePhase, PlayerPlans, PlayerDefense,
    ScrapType, LureCard, SurvivorActionCard, ThreatCard, UpgradeCard, ArsenalCard,
    PlayerStatus, Card
)
# --- NEW: Import effect enums ---
from .game_core.card_effects import OnFailEffect, UpgradeEffect, ArsenalEffect
from .game_core.deck_factory import (
    create_threat_deck, create_upgrade_deck, create_arsenal_deck,
    create_initial_lure_cards, create_initial_action_cards
)
from typing import List, Dict, Any, Optional, cast, Tuple
import random

# Import the server-level models only for type hinting the setup
from .server_models import GameParticipant

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
        
        # --- FIX: Add a scrap pool for random draws ---
        self.scrap_pool: List[ScrapType] = []
        self._initialize_scrap_pool()

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
                # Fallback, just in case
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
                # Give starting hands
                lure_cards=create_initial_lure_cards(),
                action_cards=create_initial_action_cards()
            )
            # --- FIX: v1.8 Starting Resources ---
            game._draw_random_scrap(new_player, 2)
            game.state.players[new_player.user_id] = new_player
        
        # 3. Set up Market
        # --- FIX: v1.8 Market Size Rule ---
        market_size = max(2, min(player_count - 1, 4))
        game.state.market.faceup_limit = market_size
        game._refill_market()
        
        # 4. Set Initiative Queue
        # --- FIX: v1.8 Initiative Queue Setup ---
        # We'll use the order of participants for now
        game.state.initiative_queue = [p.user.id for p in participants]
        for i, player_id in enumerate(game.state.initiative_queue):
            game.state.players[player_id].initiative = i + 1
        
        game.state.add_log("Game created. Advancing to first round...")

        game.state.phase = GamePhase.PLANNING
        game.state.add_log(f"--- ROUND {game.state.round} (Era {game.state.era}) ---")
        game.state.add_log("--- PLANNING PHASE ---")
        game.state.add_log("All players: Plan your Lure and Action cards.")
        
        return game

    # --- Main Action Dispatcher ---
    
    async def player_action(self, player_id: str, action: str, payload: Dict[str, Any]) -> GameState:
        """
        Main entry point for all player actions.
        Dispatches to the correct handler based on game phase.
        """
        
        player = self.state.players.get(player_id)
        if not player:
            self.state.add_log(f"Error: Player {player_id} not found.")
            return self.state
        
        if player.status == PlayerStatus.SURRENDERED:
            self.state.add_log(f"Action '{action}' ignored from surrendered player {player.username}.")
            return self.state
            
        self.state.add_log(f"Player {player.username} performed action: {action}")
        
        # --- Phase-specific Actions ---
        
        if self.state.phase == GamePhase.PLANNING:
            if action == "submit_plan":
                await self._action_submit_plan(player, payload)
        
        elif self.state.phase == GamePhase.ATTRACTION:
            # --- FIX: Check for correct turn player ---
            if self.state.attraction_turn_player_id != player_id:
                 self.state.add_log(f"Error: Not {player.username}'s turn to assign.")
                 return self.state
            if action == "assign_threat":
                await self._action_assign_threat(player, payload)
        
        elif self.state.phase == GamePhase.DEFENSE:
            if action == "submit_defense":
                await self._action_submit_defense(player, payload)
        
        elif self.state.phase == GamePhase.ACTION:
            # --- FIX: Check for correct turn player ---
            if self.state.action_turn_player_id != player_id:
                 self.state.add_log(f"Error: Not {player.username}'s action turn.")
                 return self.state
            
            # --- FIX: v1.8 Actions ---
            if action == "perform_scavenge":
                await self._action_scavenge(player, payload)
            elif action == "perform_fortify":
                await self._action_fortify(player, payload)
            elif action == "perform_armory_run":
                await self._action_armory_run(player, payload)
            elif action == "perform_scheme":
                await self._action_scheme(player)

        elif self.state.phase == GamePhase.INTERMISSION:
            # --- FIX: Check for correct turn player ---
            if self.state.intermission_turn_player_id != player_id:
                 self.state.add_log("Error: Not your turn to buy.")
                 return self.state
            
            if action == "buy_from_market":
                await self._action_intermission_buy(player, payload)
            elif action == "pass_buy":
                await self._action_intermission_pass(player)
        
        elif action == "surrender":
            await self._action_surrender(player)

        else:
            self.state.add_log(f"Warning: No action '{action}' in phase {self.state.phase}")
            
        return self.state

    # --- Phase Advancement ---
    
    async def _advance_to_planning(self):
        self.state.phase = GamePhase.PLANNING
        self.state.add_log("--- PLANNING PHASE ---")
        self.state.add_log("All players: Plan your Lure and Action cards.")

    async def _advance_to_attraction(self):
        self.state.phase = GamePhase.ATTRACTION
        self.state.add_log("--- ATTRACTION PHASE ---")
        self.state.add_log("Plans revealed! Calculating initiative...")

        # --- FIX: Initiative should be based on v1.8 starting queue ---
        # --- unless Scheme has changed it. ---
        # --- We'll just re-sort the existing queue based on lure strength. ---
        
        initiative_list = [] # (initiative_score, player_id)
        
        active_players = self.state.get_active_players_in_order()
        
        for player in active_players:
            plan = self.state.player_plans.get(player.user_id)
            if not plan: continue
            
            lure_card = player.get_card_from_hand(plan.lure_card_id)
            if lure_card and isinstance(lure_card, LureCard):
                # We use initiative as a tie-breaker, lure strength is primary
                initiative_score = lure_card.strength
                # Find original initiative
                original_pos = 0
                if player.user_id in self.state.initiative_queue:
                    original_pos = self.state.initiative_queue.index(player.user_id)
                
                initiative_list.append((initiative_score, original_pos, player.user_id))
            else:
                self.state.add_log(f"Error: Player {player.username} plan invalid.")
                initiative_list.append((99, 99, player.user_id)) # Put at end

        # Sort by strength (lowest first), then original initiative
        initiative_list.sort(key=lambda x: (x[0], x[1]))
        
        # --- FIX: Set *new* initiative queue based on this sort ---
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
        # --- FIX: Set state for FIRST_PASS ---
        self.state.attraction_phase_state = "FIRST_PASS"
        self.state.attraction_turn_player_id = None
        
        await self._advance_attraction_turn()

    async def _advance_attraction_turn(self):
        """
        Finds the next player who can assign a threat.
        Handles v1.8 FIRST_PASS and SECOND_PASS logic.
        """
        
        if not self.state.available_threat_ids or not self.state.unassigned_player_ids:
            self.state.add_log("All threats or players assigned.")
            await self._advance_to_defense()
            return
            
        next_player_id = None
        
        if self.state.attraction_phase_state == "FIRST_PASS":
            # Find the next player in order who has a valid lure match
            found_match = False
            
            # We must check all unassigned players in initiative order
            for player_id in self.state.initiative_queue:
                if player_id not in self.state.unassigned_player_ids:
                    continue # Already assigned
                
                player = self.state.players[player_id]
                valid_threats_for_player = self._get_valid_threats_for_player(player)
                
                if valid_threats_for_player:
                    next_player_id = player_id
                    found_match = True
                    break # Found the next player
            
            if found_match:
                self.state.attraction_turn_player_id = next_player_id
                self.state.add_log(f"Attraction (First Pass): {self.state.players[next_player_id].username}'s turn.")
            else:
                # No one left in First Pass has a match. Move to Second Pass.
                self.state.add_log("First Pass complete. Moving to Second Pass.")
                self.state.attraction_phase_state = "SECOND_PASS"
                # Fall through to Second Pass logic
        
        if self.state.attraction_phase_state == "SECOND_PASS":
            # Find the next player in order who is unassigned
            for player_id in self.state.initiative_queue:
                if player_id in self.state.unassigned_player_ids:
                    next_player_id = player_id
                    break # Found the next player
            
            if next_player_id:
                self.state.attraction_turn_player_id = next_player_id
                self.state.add_log(f"Attraction (Second Pass): {self.state.players[next_player_id].username}'s turn.")
            else:
                # Should be impossible if first check passed, but just in case
                self.state.add_log("All players assigned (Second Pass).")
                await self._advance_to_defense()

    async def _advance_to_defense(self):
        self.state.phase = GamePhase.DEFENSE
        self.state.attraction_turn_player_id = None
        self.state.unassigned_player_ids = []
        # Note: available_threat_ids may still have unassigned threats
        
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

        # --- FIX: Resolve in initiative order! ---
        active_players = self.state.get_active_players_in_order()
        
        for player in active_players:
            defense = self.state.player_defenses.get(player.user_id)
            threat = self.state.get_assigned_threat(player.user_id)
            
            if not threat:
                self.state.add_log(f"{player.username} has no threat. They are safe.")
                continue
                
            if not defense:
                self.state.add_log(f"Warning: {player.username} has a threat but no defense submitted. Auto-failing.")
                defense = PlayerDefense() # Create empty defense
                
            defense_result = self._calculate_defense(
                player, threat, defense
            )

            # --- FAILED DEFENSE ---
            # --- FIX: v1.8 FAIL condition: < *all three* stats ---
            # --- DEFEND: >= *at least one* stat ---
            
            total_def = defense_result["player_total_defense"]
            threat_stats = defense_result["threat_original_stats"]
            
            failed_all_three = (
                total_def[ScrapType.PARTS.value] < threat_stats[ScrapType.PARTS.value] and
                total_def[ScrapType.WIRING.value] < threat_stats[ScrapType.WIRING.value] and
                total_def[ScrapType.PLATES.value] < threat_stats[ScrapType.PLATES.value]
            )
            
            is_kill = defense_result["is_kill"]

            # --- KILLED THREAT ---
            if is_kill:
                player.trophies.append(threat.name)
                
                # --- FIX: Spoil is gained in CLEANUP per v1.8 ---
                # We'll store it on the state
                self.state.spoils_to_gain[player.user_id] = threat
                
                self.state.add_log(f"{player.username} DEFEATED the {threat.name}! (Spoil pending in Cleanup)")
                
                # Remove threat from play
                self.state.current_threats.remove(threat)
                
                # Check for "On Kill" effects from Arsenal
                arsenal_cards_used = [player.get_card_from_hand(cid) for cid in defense.arsenal_card_ids]
                for arsenal_card in arsenal_cards_used:
                    if (
                        arsenal_card 
                        and arsenal_card.special_effect_id
                        and "ON_KILL" in arsenal_card.special_effect_id
                    ):
                         self._apply_special_effect(player, arsenal_card.special_effect_id, arsenal_card)

            # --- FAILED DEFENSE ---
            elif failed_all_three:
                
                # Check for Adrenaline
                ignores_consequences = False
                arsenal_cards_used = [player.get_card_from_hand(cid) for cid in defense.arsenal_card_ids]
                for card in arsenal_cards_used:
                    if card and card.special_effect_id == ArsenalEffect.ON_FAIL_IGNORE_CONSEQUENCES:
                        ignores_consequences = True
                        self.state.add_log(f"{player.username} plays {card.name} and IGNORES all consequences!")
                        break
                
                if ignores_consequences:
                    pass # Skip Injury and "On Fail"
                
                else:
                    # Standard Fail Logic
                    player.injuries += 1
                    self.state.add_log(f"{player.username} FAILED their defense against {threat.name} and gains 1 Injury!")

                    # Check for Threat "On Fail" effects
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
                            # Discard 1 random scrap
                            # --- FIX: We can't just pick one. We have to draw. ---
                            # --- This is complex. Simple: discard 1 of most plentiful. ---
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
                
            # --- DEFENDED ---
            else:
                self.state.add_log(f"{player.username} successfully DEFENDED against the {threat.name}.")

        # --- Set the first player for the Action Phase ---
        # --- Must be done *after* initiative is modified by "On Fail" ---
        self.state.action_turn_player_id = self._get_next_active_player()
        if self.state.action_turn_player_id:
            self.state.add_log(f"Action Phase begins. Turn: {self.state.players[self.state.action_turn_player_id].username}")
        else:
            self.state.add_log("No players eligible for Action Phase.")
            await self._advance_to_cleanup()

    async def _resolve_action_phase(self):
        """
        Checks if all active players have taken their action.
        If so, advances to Cleanup.
        """
        
        next_player = self._get_next_active_player(
            start_after_player=self.state.action_turn_player_id
        )
        
        if next_player:
            # Still players to go
            self.state.action_turn_player_id = next_player
            self.state.add_log(f"Action Turn: {self.state.players[next_player].username}")
        else:
            # All actions are done
            self.state.add_log("All player actions complete.")
            await self._advance_to_cleanup()
            
    async def _advance_to_cleanup(self):
        """
        This phase is now the end-of-round logic.
        """
        self.state.phase = GamePhase.CLEANUP
        self.state.action_turn_player_id = None
        
        await self._advance_to_wilderness()
        
    async def _advance_to_wilderness(self):
        """
        End of the round.
        - Base Income (v1.8)
        - Spoils (v1.8)
        - Discard used Arsenal cards
        - Clear plans, defenses, temp boosts
        - Reset player statuses
        - Check for Era/Game end
        """
        self.state.add_log("--- CLEANUP PHASE ---")
        
        active_players = [p for p in self.state.players.values() if p.status != PlayerStatus.SURRENDERED]
        
        # --- FIX: v1.8 Base Income ---
        self.state.add_log("All players gain 1 random scrap (Base Income).")
        for player in active_players:
            self._draw_random_scrap(player, 1)

        # --- FIX: v1.8 Spoils ---
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

        
        # Discard used Arsenal cards
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
                        # --- FIX: Handle Charges ---
                        if card.charges is not None:
                            card.charges -= 1
                            if card.charges > 0:
                                self.state.add_log(f"{player.username}'s {card.name} has {card.charges} charge(s) left.")
                                continue # Don't discard yet
                        
                        player.arsenal_cards.remove(card)
                        # TODO: Add to discard
                
                if cards_to_discard:
                    self.state.add_log(f"{player.username} discards used Arsenal card(s).")
            
            # Clear round-specific state
            player.plan = None
            player.defense = None
            player.action_prevented = False
            
            if player.status == PlayerStatus.ELIMINATED:
                player.status = PlayerStatus.ACTIVE
        
        # Clear global round state
        self.state.player_plans = {}
        self.state.player_defenses = {}
        self.state.current_threats = []
        # --- FIX: Initiative queue *persists* per v1.8 ---
        # self.state.initiative_queue = []
        self.state.player_threat_assignment = {}
        self.state.cards_to_return_to_hand = {}
        self.state.spoils_to_gain = {}
        
        # --- FIX: Refill market (v1.8) ---
        self.state.add_log("Refilling markets.")
        self._refill_market()

        # --- Check for Era/Game End ---
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
        
        # --- FIX: v1.8 - Do NOT refill market. ---
        # _refill_market() # <-- This was wrong
        
        self.state.intermission_purchases = {
            pid: 0 for pid in self.state.initiative_queue 
            if self.state.players[pid].status == PlayerStatus.ACTIVE
        }
        
        # Find first active player in initiative order
        first_player_id = self._get_next_active_player()
        
        if first_player_id:
             self.state.intermission_turn_player_id = first_player_id
             self.state.add_log(f"Purchase Turn: {self.state.players[first_player_id].username}")
        else:
             self.state.add_log("No active players to purchase.")
             await self._resolve_intermission() # End it immediately
             
    async def _resolve_intermission(self):
        
        next_player_id = self._get_next_active_player(
            start_after_player=self.state.intermission_turn_player_id,
            check_intermission_pass=True
        )
        
        if next_player_id:
            # Move to the next player
            self.state.intermission_turn_player_id = next_player_id
            self.state.add_log(f"Purchase Turn: {self.state.players[next_player_id].username}")
        else:
            # All players have bought or passed
            self.state.add_log("All players have finished purchasing.")
            self.state.intermission_turn_player_id = None
            
            # --- FIX: v1.8 - Refill *after* Intermission ---
            self.state.add_log("Refilling markets for new Era.")
            self._refill_market()
            
            self._start_new_round() # Starts next round (6 or 11)
            
    # --- Defense Calculation ---

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
                if action_card.id == planned_action_card.id:
                    continue # Skip the played card
                
                # Find the defense value for the un-played card
                card_name_key = action_card.name.upper()
                if card_name_key in BASE_DEFENSE_MAP:
                    for s_type, val in BASE_DEFENSE_MAP[card_name_key].items():
                        base_defense[s_type] += val
        
        # --- 2. Get Scrap Value (v1.8) ---
        scrap_count = defense.scrap_spent
        scrap_value = {ScrapType.PARTS: 0, ScrapType.WIRING: 0, ScrapType.PLATES: 0}
        
        # Check for permanent upgrades affecting scrap
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
                scrap_value[s_type] = 0 # v1.8 rule
            elif s_type in threat.resistant and not ignores_resist[s_type]:
                scrap_value[s_type] = (base_val - 1) * count # v1.8 rule
            else:
                scrap_value[s_type] = base_val * count # v1.8 rule
        
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
        
        # --- 4. Get Permanent Upgrade Boosts (v1.9 logic) ---
        # These are passive boosts, *not* from a "played" upgrade
        upgrade_boosts = {s: 0 for s in ScrapType}
        upgrade_piercing_boosts = {s: 0 for s in ScrapType}
        
        for card in player.upgrade_cards:
            for s_type, amount in card.defense_boost.items():
                upgrade_boosts[s_type] += amount
            # --- FIX: Piercing *is* its own category ---
            # This is v1.9 logic, but we'll keep it
            for s_type, amount in card.defense_piercing.items():
                upgrade_piercing_boosts[s_type] += amount

        # --- 5. Get Special Amp Boosts (v1.9) ---
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
            
        # --- 9. Apply Resistance/Immunity to *non-piercing* defense ---
        # --- FIX: This is v1.9 logic, but it's *separate* from v1.8 scrap logic.
        # We'll assume v1.9 Resistance/Immunity (halving/zeroing) applies to
        # *non-scrap* sources (Base, Arsenal, Upgrade).
        
        final_defense_non_piercing_applied = final_defense_non_piercing.copy()
        
        for s_type in ScrapType:
            # v1.8 scrap logic already handled this.
            # We just apply to non-scrap.
            non_scrap_defense = base_defense[s_type] + arsenal_boosts[s_type] + upgrade_boosts[s_type]
            
            if s_type in immune_to:
                non_scrap_defense = 0
            elif s_type in resistant_to:
                # We'll assume Resistance *only* affects scrap per v1.8
                pass # non_scrap_defense = non_scrap_defense // 2
            
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
                
                # --- FIX: v1.8 Kill Logic ---
                # "you only need to meet *one* of those tied values"
                for s_type in highest_stats_to_beat:
                    if total_defense_applied[s_type] >= threat_original_stats[s_type]:
                        is_kill = True
                        break # Found one, that's enough
            
        # Return a structured dictionary
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
        
    # --- Action Phase (v1.8) ---

    async def _action_scavenge(self, player: PlayerState, payload: Dict[str, Any]):
        """Action: Choose 2 Scrap of any type."""
        if self.state.action_turn_player_id != player.user_id: return
        
        choices = payload.get("choices", [])
        if len(choices) != 2:
            self.state.add_log("Error: Scavenge requires 2 choices. Defaulting to random.")
            self._draw_random_scrap(player, 2)
        else:
            try:
                choice_1 = ScrapType(choices[0])
                choice_2 = ScrapType(choices[1])
                player.add_scrap(choice_1, 1)
                player.add_scrap(choice_2, 1)
                self.state.add_log(f"{player.username} (Scavenge) takes 1 {choice_1.value} and 1 {choice_2.value}.")
            except ValueError:
                self.state.add_log("Error: Invalid Scavenge choices. Defaulting to random.")
                self._draw_random_scrap(player, 2)
        
        await self._resolve_action_phase()

    async def _action_fortify(self, player: PlayerState, payload: Dict[str, Any]):
        """Action: Buy 1 Upgrade (or fallback: 2 random scrap)."""
        if self.state.action_turn_player_id != player.user_id: return
        
        card_id = payload.get("card_id")
        card, source_list = self._find_market_card(card_id)

        if card and isinstance(card, UpgradeCard) and source_list:
            if player.pay_cost(card.cost):
                source_list.remove(card)
                player.upgrade_cards.append(card)
                self.state.add_log(f"{player.username} (Fortify) buys {card.name}.")
            else:
                self.state.add_log(f"{player.username} (Fortify) cannot afford {card.name}. Taking fallback.")
                self._draw_random_scrap(player, 2)
        else:
            # Player chose not to buy, or card_id was invalid
            self.state.add_log(f"{player.username} (Fortify) takes fallback.")
            self._draw_random_scrap(player, 2)
        
        await self._resolve_action_phase()

    async def _action_armory_run(self, player: PlayerState, payload: Dict[str, Any]):
        """Action: Buy 1 Arsenal (or fallback: 2 random scrap)."""
        if self.state.action_turn_player_id != player.user_id: return
        
        card_id = payload.get("card_id")
        card, source_list = self._find_market_card(card_id)

        if card and isinstance(card, ArsenalCard) and source_list:
            if player.pay_cost(card.cost):
                source_list.remove(card)
                player.arsenal_cards.append(card)
                self.state.add_log(f"{player.username} (Armory Run) buys {card.name}.")
            else:
                self.state.add_log(f"{player.username} (Armory Run) cannot afford {card.name}. Taking fallback.")
                self._draw_random_scrap(player, 2)
        else:
            self.state.add_log(f"{player.username} (Armory Run) takes fallback.")
            self._draw_random_scrap(player, 2)
        
        await self._resolve_action_phase()

    async def _action_scheme(self, player: PlayerState):
        """Action: 1 random scrap. Move to "1" on Initiative Queue."""
        if self.state.action_turn_player_id != player.user_id: return

        self.state.add_log(f"{player.username} (Scheme) takes 1 random scrap and moves to the front.")
        self._draw_random_scrap(player, 1)
        
        if player.user_id in self.state.initiative_queue:
            self.state.initiative_queue.remove(player.user_id)
        
        self.state.initiative_queue.insert(0, player.user_id)
        
        await self._resolve_action_phase()

    # --- NEW HELPER: Apply Card Effects ---
    
    def _apply_special_effect(
        self, 
        player: PlayerState, 
        effect_id: str, 
        card: Optional[Card] = None
    ):
        """
        Helper to resolve 'On Kill' effects
        from an Arsenal card's special_effect_id string.
        """
        if not effect_id:
            return
            
        card_name = card.name if card else "An effect"
        
        try:
            if effect_id == ArsenalEffect.ON_KILL_RETURN_TO_HAND:
                if card and isinstance(card, ArsenalCard):
                    # Flag this card to be kept during cleanup
                    self.state.cards_to_return_to_hand[player.user_id] = card.id
                    # Log is handled in cleanup
            
        except Exception as e:
            print(f"Error applying special effect tag '{effect_id}': {e}")
                
    # --- Intermission Phase ---
    
    async def _action_intermission_buy(self, player: PlayerState, payload: Dict[str, Any]):
        """Player buys one *FREE* card from the market."""
        if self.state.intermission_turn_player_id != player.user_id: return
        if self.state.intermission_purchases.get(player.user_id, 0) != 0: return
            
        card_id = payload.get("card_id")
        card, source_list = self._find_market_card(card_id)
        
        if not card or not source_list:
            self.state.add_log(f"Error: Card {card_id} not in market.")
            return
            
        # --- FIX: v1.8 Intermission is FREE ---
        # cost = card.cost
        # if not player.pay_cost(cost):
        #     self.state.add_log(f"{player.username} cannot afford {card.name}.")
        #     return
            
        source_list.remove(card)
        if isinstance(card, UpgradeCard):
            player.upgrade_cards.append(card)
        elif isinstance(card, ArsenalCard):
            player.arsenal_cards.append(card)
        
        self.state.add_log(f"{player.username} took FREE Intermission card: {card.name}.")
        
        self.state.intermission_purchases[player.user_id] = 1
        await self._resolve_intermission()

    async def _action_intermission_pass(self, player: PlayerState):
        if self.state.intermission_turn_player_id != player.user_id: return
        if self.state.intermission_purchases.get(player.user_id, 0) != 0: return
            
        self.state.add_log(f"{player.username} passes their free buy.")
        self.state.intermission_purchases[player.user_id] = -1
        await self._resolve_intermission()

    # --- Game Loop ---
    
    def _start_new_round(self):
        self.state.round += 1
        self.state.phase = GamePhase.WILDERNESS # This is temp
        self.state.add_log(f"--- ROUND {self.state.round} (Era {self.state.era}) ---")
        
        # --- FIX: v1.8 - Market refills at end of CLEANUP, ---
        # --- which is *before* this. So no refill here. ---
        
        self.state.phase = GamePhase.PLANNING
        self.state.add_log("--- PLANNING PHASE ---")
        self.state.add_log("All players: Plan your Lure and Action cards.")

    # --- Player Actions (Submitting) ---
    
    async def _action_submit_plan(self, player: PlayerState, payload: Dict[str, Any]):
        if self.state.phase != GamePhase.PLANNING: return

        # --- FIX: v1.8 Plan does not include an Upgrade card ---
        plan = PlayerPlans(
            lure_card_id=payload.get("lure_card_id"),
            action_card_id=payload.get("action_card_id")
        )
        
        # TODO: Validate the plan
        
        self.state.player_plans[player.user_id] = plan
        player.plan = plan
        self.state.add_log(f"{player.username} has submitted their plan.")
        
        if self._are_all_players_ready("plans"):
            await self._advance_to_attraction()

    async def _action_assign_threat(self, player: PlayerState, payload: Dict[str, Any]):
        if self.state.phase != GamePhase.ATTRACTION: return
        if self.state.attraction_turn_player_id != player.user_id: return
            
        threat_id = payload.get("threat_id")
        if threat_id not in self.state.available_threat_ids:
            self.state.add_log(f"Error: Threat {threat_id} is not available.")
            return
            
        threat = next((t for t in self.state.current_threats if t.id == threat_id), None)
        if not threat:
            self.state.add_log(f"Error: Threat {threat_id} not found.")
            return

        # --- FIX: v1.8 Lure Check (only for First Pass) ---
        if self.state.attraction_phase_state == "FIRST_PASS":
            lure_card = player.get_card_from_hand(player.plan.lure_card_id)
            lure_name_map = {
                ScrapType.PARTS: "Rags",
                ScrapType.WIRING: "Noises",
                ScrapType.PLATES: "Fruit"
            }
            lure_type_name = lure_name_map.get(lure_card.lure_type)
            
            # --- FIX: v1.8 Multi-Lure Check ---
            if lure_type_name not in threat.lure_type.split('/'):
                self.state.add_log(f"Error: {threat.name} does not match Lure {lure_type_name}")
                return
            
        # Assignment successful
        self.state.add_log(f"{player.username} attracts the {threat.name}.")
        
        self.state.player_threat_assignment[player.user_id] = threat.id
        self.state.available_threat_ids.remove(threat.id)
        self.state.unassigned_player_ids.remove(player.user_id)
        
        await self._advance_attraction_turn()

    async def _action_submit_defense(self, player: PlayerState, payload: Dict[str, Any]):
        if self.state.phase != GamePhase.DEFENSE: return
            
        # --- FIX: Deserialize scrap_spent correctly ---
        # The payload will be {"scrap_spent": {"PARTS": 2, "WIRING": 1}}
        # This means 2 PARTS *tokens*, 1 WIRING *token*.
        try:
            raw_scrap = payload.get("scrap_spent", {})
            defense = PlayerDefense(
                scrap_spent={ScrapType(k): v for k, v in raw_scrap.items()},
                arsenal_card_ids=payload.get("arsenal_card_ids", []),
                special_target_stat=payload.get("special_target_stat"),
                special_corrode_stat=payload.get("special_corrode_stat"),
                # special_amp_spend is v1.9, we'll allow it
                special_amp_spend={ScrapType(k): v for k, v in payload.get("special_amp_spend", {}).items()}
            )
        except Exception as e:
            self.state.add_log(f"Error: Invalid defense payload. {e}")
            return
        
        # TODO: Validate defense (scrap cost, card IDs)
        
        self.state.player_defenses[player.user_id] = defense
        player.defense = defense
        self.state.add_log(f"{player.username} has submitted their defense.")
        
        if self._are_all_players_ready("defenses"):
            await self._resolve_defense_phase()

    async def _action_surrender(self, player: PlayerState):
        self.state.add_log(f"{player.username} has surrendered.")
        player.status = PlayerStatus.SURRENDERED
        
        active_players = [
            p for p in self.state.players.values() 
            if p.status == PlayerStatus.ACTIVE
        ]
        if len(active_players) <= 1:
            await self._end_game()

    # --- Market & Card Helpers ---
    
    def _refill_market(self):
        """Tops up the face-up market cards."""
        
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
        """Finds a card in the market and the list it belongs to."""
        for card_list in [
            self.state.market.upgrade_faceup, 
            self.state.market.arsenal_faceup
        ]:
            for card in card_list:
                if card.id == card_id:
                    return card, card_list
        return None, None
        
    def _get_valid_threats_for_player(self, player: PlayerState) -> List[ThreatCard]:
        """
        Finds all available threats that match the player's Lure card.
        """
        plan = self.state.player_plans.get(player.user_id)
        if not plan: return []
            
        lure_card = player.get_card_from_hand(plan.lure_card_id)
        if not lure_card or not isinstance(lure_card, LureCard): return []
            
        lure_name_map = {
            ScrapType.PARTS: "Rags",
            ScrapType.WIRING: "Noises",
            ScrapType.PLATES: "Fruit"
        }
        lure_type_name = lure_name_map.get(lure_card.lure_type)
        
        valid_threats = []
        for threat_id in self.state.available_threat_ids:
            threat = next((t for t in self.state.current_threats if t.id == threat_id), None)
            
            # --- FIX: v1.8 Multi-Lure Check ---
            if threat and lure_type_name in threat.lure_type.split('/'):
                valid_threats.append(threat)
                
        return valid_threats

    # --- Turn Management ---
    
    def _get_next_active_player(
        self, 
        start_after_player: Optional[str] = None,
        check_intermission_pass: bool = False
    ) -> Optional[str]:
        """
        Finds the next player in the initiative queue who is ACTIVE
        and eligible for the current action.
        """
        
        player_queue = self.state.initiative_queue
        
        start_index = 0
        if start_after_player and start_after_player in player_queue:
            start_index = player_queue.index(start_after_player) + 1
            
        # Check from start_index to end
        for i in range(start_index, len(player_queue)):
            player_id = player_queue[i]
            player = self.state.players[player_id]
            
            if player.status != PlayerStatus.ACTIVE:
                continue
            
            if self.state.phase == GamePhase.ACTION and player.action_prevented:
                continue
            
            if check_intermission_pass:
                if self.state.intermission_purchases.get(player_id, 0) != 0:
                    continue # Already bought or passed
            
            return player_id # Found next player
            
        # If checking for intermission, we don't loop
        if check_intermission_pass:
            return None
            
        # If in Action phase, we don't loop
        if self.state.phase == GamePhase.ACTION and start_after_player:
            return None

        # If we're just finding the *first* active player,
        # loop from the beginning
        if not start_after_player:
             for i in range(0, len(player_queue)):
                player_id = player_queue[i]
                player = self.state.players[player_id]
                if player.status == PlayerStatus.ACTIVE:
                    if self.state.phase == GamePhase.ACTION and player.action_prevented:
                        continue
                    return player_id

        return None # No one left

    # --- Game End ---
    
    async def _end_game(self):
        if self.state.phase == GamePhase.GAME_OVER: return
            
        self.state.phase = GamePhase.GAME_OVER
        self.state.add_log("--- GAME OVER ---")
        
        # --- FIX: v1.8 Tie-breakers ---
        # Lowest injuries, then most trophies, then most scrap
        
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
        
        # ... (surrendered players log) ...


    # --- Helper: Check Readiness ---

    def _are_all_players_ready(self, check_type: str) -> bool:
        """
        Checks if all *active* players are ready for a given phase.
        check_type: "plans" or "defenses"
        """

        active_player_ids = {
            p.user_id for p in self.state.get_active_players_in_order()
        }
        if not active_player_ids:
            return True # No one is active, so we are "ready"

        if check_type == "plans":
            submitted_ids = set(self.state.player_plans.keys())
        elif check_type == "defenses":
            # --- FIX: Must check *assigned* players ---
            # A player with no threat doesn't need to submit defense
            active_player_ids = {
                pid for pid in active_player_ids 
                if self.state.get_assigned_threat(pid) is not None
            }
            if not active_player_ids:
                return True # No one has a threat, ready to move on
            
            submitted_ids = set(self.state.player_defenses.keys())
        else:
            return False
            
        return active_player_ids.issubset(submitted_ids)

    # --- NEW: Public Preview Function ---
    
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
            # --- FIX: Deserialize payload correctly (v1.8) ---
            # Payload keys are strings "PARTS", "WIRING", "PLATES"
            # Values are *counts* of scrap, not values.
            raw_scrap = defense_payload.get("scrap_spent", {})
            raw_amp = defense_payload.get("special_amp_spend", {})
            
            defense = PlayerDefense(
                scrap_spent={ScrapType(k.upper()): v for k, v in raw_scrap.items()},
                arsenal_card_ids=defense_payload.get("arsenal_card_ids", []),
                special_target_stat=defense_payload.get("special_target_stat"),
                special_corrode_stat=defense_payload.get("special_corrode_stat"),
                special_amp_spend={ScrapType(k.upper()): v for k, v in raw_amp.items()}
            )
        except Exception as e:
            return {"error": f"Invalid defense payload: {e}"}

        try:
            defense_result = self._calculate_defense(player, threat, defense)
            return defense_result
        except Exception as e:
            print(f"Error during defense preview: {e}")
            return {"error": f"Calculation failed: {e}"}