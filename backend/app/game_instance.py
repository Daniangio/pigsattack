"""
The GameInstance class.
...
v1.9 - Card Logic Refactor
...
v1.9.1 - Defense Preview Refactor
- _calculate_defense now returns a structured Dict, not a Tuple.
- _resolve_defense_phase updated to consume this new Dict.
- ADDED: `public_preview_defense`, a new read-only function.
  This function takes a defense payload, runs _calculate_defense,
  and returns the result, allowing the frontend to show a
  real-time preview without duplicating game logic.
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

# --- CONSTANTS (v1.8) ---
BASE_DEFENSE_FROM_ACTION = 3
CARDS_PER_ERA_PER_PLAYER = 5 # Used for Era 1/2/3 split
MARKET_FACEUP_COUNT = 3

class GameInstance:
    """
    Manages the state and logic for a single game,
    from setup to game over.
    """
    
    def __init__(self, game_id: str):
        self.state = GameState(game_id=game_id)
        self.state.add_log(f"Game instance {game_id} created.")

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
            game.state.players[new_player.user_id] = new_player
        
        # 3. Set up Market
        game._refill_market()
        
        # 4. Start the first round
        # We start in WILDERNESS, which will advance to PLANNING
        game.state.add_log("Game created. Advancing to first round...")

        game.state.phase = GamePhase.PLANNING
        game.state.add_log(f"--- ROUND {game.state.round} (Era {game.state.era}) ---")
        game.state.add_log("--- PLANNING PHASE ---")
        game.state.add_log("All players: Plan your Lure, Action, and Upgrade cards.")
        
        return game

    # --- Main Action Dispatcher ---
    
    async def player_action(self, player_id: str, action: str, payload: Dict[str, Any]) -> GameState:
        """
        Main entry point for all player actions.
        Dispatches to the correct handler based on game phase.
        """
        
        player = self.state.players.get(player_id)
        if not player:
            # This should not happen if the request is valid
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
            if action == "assign_threat":
                await self._action_assign_threat(player, payload)
        
        elif self.state.phase == GamePhase.DEFENSE:
            if action == "submit_defense":
                await self._action_submit_defense(player, payload)
        
        elif self.state.phase == GamePhase.ACTION:
            if action == "player_action":
                await self._action_perform_action(player)
            elif action == "pass_action":
                await self._action_pass_action(player)

        elif self.state.phase == GamePhase.INTERMISSION:
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
        """
        Starts the PLANNING phase.
        Players will submit their Lure, Action, and Upgrade cards.
        """
        # (This is called from _start_new_round)
        self.state.phase = GamePhase.PLANNING
        self.state.add_log("--- PLANNING PHASE ---")
        self.state.add_log("All players: Plan your Lure, Action, and Upgrade cards.")

    async def _advance_to_attraction(self):
        """
        All plans are in. Reveal plans, calculate initiative.
        Resolve "On Reveal" Upgrade card effects.
        """
        self.state.phase = GamePhase.ATTRACTION
        self.state.add_log("--- ATTRACTION PHASE ---")
        self.state.add_log("Plans revealed! Calculating initiative...")

        # Clear old initiative
        self.state.initiative_queue = []
        
        # --- NEW: Resolve "On Reveal" effects ---
        # These must be resolved *before* initiative is calculated,
        # in case an effect changes something.
        all_players = self.state.players.values()
        
        for player in all_players:
            if player.status == PlayerStatus.SURRENDERED:
                continue
            
            # Reset temp boosts from last round
            player.temp_defense_boost = {}
            
            plan = self.state.player_plans.get(player.user_id)
            if not plan or not plan.upgrade_card_id:
                continue
                
            upgrade_card = player.get_card_from_hand(plan.upgrade_card_id)
            if (
                upgrade_card 
                and isinstance(upgrade_card, UpgradeCard) 
                and upgrade_card.special_effect_id
            ):
                # We only care about "ON_REVEAL" tags here
                if "ON_REVEAL" in upgrade_card.special_effect_id:
                    self._apply_special_effect(
                        player, 
                        upgrade_card.special_effect_id, 
                        upgrade_card
                    )

        # Calculate initiative
        initiative_list = [] # (initiative_score, player_id)
        
        active_players = [
            p for p in all_players 
            if p.status == PlayerStatus.ACTIVE
        ]
        
        for player in active_players:
            plan = self.state.player_plans.get(player.user_id)
            if not plan: continue # Should not happen if they are active
            
            lure_card = player.get_card_from_hand(plan.lure_card_id)
            if lure_card and isinstance(lure_card, LureCard):
                player.initiative = lure_card.strength
                initiative_list.append((player.initiative, player.user_id))
            else:
                # Should not happen
                self.state.add_log(f"Error: Player {player.username} plan invalid.")
                player.initiative = 99
                initiative_list.append((player.initiative, player.user_id))

        # Sort by initiative (lowest first)
        initiative_list.sort(key=lambda x: x[0])
        self.state.initiative_queue = [pid for score, pid in initiative_list]
        
        initiative_log = ", ".join([
            f"{self.state.players[pid].username} ({self.state.players[pid].initiative})"
            for pid in self.state.initiative_queue
        ])
        self.state.add_log(f"Initiative Order: {initiative_log}")
        
        # --- Draw Threats ---
        num_to_draw = len(self.state.get_active_players_in_order())
        drawn_threats = []
        for _ in range(num_to_draw):
            if not self.state.threat_deck:
                self.state.add_log("Threat deck is empty!")
                break
            drawn_threats.append(self.state.threat_deck.pop(0))
        
        self.state.current_threats = drawn_threats
        self.state.available_threat_ids = [t.id for t in drawn_threats]
        
        self.state.add_log(f"Drawing {len(drawn_threats)} threats: {', '.join([t.name for t in drawn_threats])}")

        # --- Setup Attraction Phase ---
        self.state.unassigned_player_ids = self.state.initiative_queue.copy()
        self.state.player_threat_assignment = {}
        
        # This will find the first valid player
        await self._advance_attraction_turn()

    async def _advance_attraction_turn(self):
        """
        Finds the next player who can assign a threat.
        If all players/threats are assigned, moves to DEFENSE.
        """
        
        next_player = None
        
        while self.state.unassigned_player_ids:
            potential_player_id = self.state.unassigned_player_ids[0]
            player = self.state.players.get(potential_player_id)
            
            if player.status != PlayerStatus.ACTIVE:
                # Player is eliminated or surrendered, skip them
                self.state.unassigned_player_ids.pop(0)
                continue
                
            # Check if this player *can* take a threat
            valid_threats_for_player = self._get_valid_threats_for_player(player)
            
            if not valid_threats_for_player:
                # This player has no valid threats left.
                # They are skipped.
                self.state.add_log(f"{player.username} has no valid threats matching their Lure card. They are skipped.")
                self.state.unassigned_player_ids.pop(0)
                continue
            
            # Found a valid player!
            next_player = player
            break # Exit the loop
            
        if next_player:
            # It's this player's turn to assign
            self.state.attraction_phase_state = "assigning"
            self.state.attraction_turn_player_id = next_player.user_id
            self.state.add_log(f"Attraction Turn: {next_player.username}")
        else:
            # No valid player found, or no players left
            # All assignments are done.
            self.state.add_log("All threats assigned.")
            await self._advance_to_defense()

    async def _advance_to_defense(self):
        """
        All threats are assigned. Players submit their defense.
        """
        self.state.phase = GamePhase.DEFENSE
        self.state.attraction_turn_player_id = None
        self.state.available_threat_ids = []
        self.state.unassigned_player_ids = []
        
        self.state.add_log("--- DEFENSE PHASE ---")
        self.state.add_log("All players: Submit your defense (Scrap and Arsenal cards).")
        
        # Log assignments
        self.state.add_log("Assignments:")
        for player_id in self.state.initiative_queue:
            player = self.state.players[player_id]
            threat = self.state.get_assigned_threat(player_id)
            if threat:
                self.state.add_log(f"  {player.username} vs. {threat.name}")
            else:
                self.state.add_log(f"  {player.username} vs. (No Threat)")
                
    async def _resolve_defense_phase(self):
        """
        All defenses are in. Calculate success/failure for each player.
        Apply "On Fail" and "On Kill" effects.
        """
        self.state.phase = GamePhase.ACTION # Move to ACTION phase
        self.state.add_log("--- ACTION PHASE (Defense Resolution) ---")
        self.state.add_log("All defenses submitted! Resolving fights...")
        
        # Clear return-to-hand state from previous round
        self.state.cards_to_return_to_hand = {}

        active_players = self.state.get_active_players_in_order()
        
        for player in active_players:
            defense = self.state.player_defenses.get(player.user_id)
            if not defense:
                self.state.add_log(f"Warning: {player.username} is active but has no defense submitted. Skipping.")
                continue
                
            threat = self.state.get_assigned_threat(player.user_id)
            if not threat:
                self.state.add_log(f"{player.username} has no threat. Skipping defense.")
                continue

            # --- REFACTOR: Calculate the defense outcome ---
            # Was: is_kill, killed_stats, defense_totals = _calculate_defense(...)
            defense_result = self._calculate_defense(
                player, threat, defense
            )

            # --- FAILED DEFENSE ---
            # --- REFACTOR: Read from the result dict ---
            if not defense_result["is_kill"]:
                
                # --- NEW: Check for Adrenaline (ON_FAIL:IGNORE_CONSEQUENCES) ---
                ignores_consequences = False
                arsenal_cards_used = [player.get_card_from_hand(cid) for cid in defense.arsenal_card_ids]
                for card in arsenal_cards_used:
                    if card and card.special_effect_id == ArsenalEffect.ON_FAIL_IGNORE_CONSEQUENCES:
                        ignores_consequences = True
                        self.state.add_log(f"{player.username} plays {card.name} and IGNORES all consequences!")
                        break # Found it, stop checking
                
                if ignores_consequences:
                    # Player ignores Injury and "On Fail" effects
                    pass # Skip to the next player
                
                else:
                    # --- Standard Fail Logic ---
                    player.injuries += 1
                    self.state.add_log(f"{player.username} FAILED their defense against {threat.name} and gains 1 Injury!")

                    # --- NEW: Check for Threat "On Fail" effects ---
                    if threat.on_fail_effect:
                        self.state.add_log(f"The {threat.name}'s ability activates: {threat.abilities_text}")
                        
                        if threat.on_fail_effect == OnFailEffect.PREVENT_ACTION:
                            player.action_prevented = True # This flag already exists!
                            self.state.add_log(f"{player.username}'s Action is prevented this round!")
                        
                        elif threat.on_fail_effect == OnFailEffect.FALL_TO_BACK:
                            # Move player to the end of the initiative queue
                            self.state.initiative_queue.remove(player.user_id)
                            self.state.initiative_queue.append(player.user_id)
                            self.state.add_log(f"{player.username} falls to the back of the initiative queue!")
                        
                        elif threat.on_fail_effect == OnFailEffect.DISCARD_SCRAP_1:
                            # Simple version: discard 1 of the most plentiful scrap
                            scrap_type_to_discard = None
                            max_scrap = 0
                            # Iterate in a fixed order to break ties (R > B > G)
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
                
                # Check for elimination (3 injuries)
                if player.injuries >= 3:
                    player.status = PlayerStatus.ELIMINATED
                    self.state.add_log(f"{player.username} has 3 injuries and is ELIMINATED for the round!")

            # --- KILLED THREAT ---
            else:
                player.trophies.append(threat.name)
                
                # --- NEW: Correctly add trophy scrap ---
                trophy_log = []
                for s_type, amount in threat.trophy_value.items():
                    if amount > 0:
                        player.add_scrap(s_type, amount)
                        trophy_log.append(f"{amount} {s_type.value}")
                
                trophy_log_str = ", ".join(trophy_log)
                if not trophy_log_str:
                    trophy_log_str = "no spoil"
                    
                self.state.add_log(f"{player.username} DEFEATED the {threat.name}! (Gained: {trophy_log_str})")
                
                # Remove threat from play
                self.state.current_threats.remove(threat)
                
                # --- NEW: Check for "On Kill" effects ---
                
                # 1. Check played Upgrade Card
                if player.plan and player.plan.upgrade_card_id:
                    upgrade_card = player.get_card_from_hand(player.plan.upgrade_card_id)
                    if (
                        upgrade_card 
                        and isinstance(upgrade_card, UpgradeCard) 
                        and upgrade_card.special_effect_id
                        and "ON_KILL" in upgrade_card.special_effect_id
                    ):
                        self._apply_special_effect(player, upgrade_card.special_effect_id, upgrade_card)

                # 2. Check Arsenal Cards used
                arsenal_cards_used = [player.get_card_from_hand(cid) for cid in defense.arsenal_card_ids]
                for arsenal_card in arsenal_cards_used:
                    if (
                        arsenal_card 
                        and arsenal_card.special_effect_id
                        and "ON_KILL" in arsenal_card.special_effect_id
                    ):
                         self._apply_special_effect(player, arsenal_card.special_effect_id, arsenal_card)

        # Set the first player for the Action Phase
        self.state.action_turn_player_id = self._get_next_active_player()
        if self.state.action_turn_player_id:
            self.state.add_log(f"Action Phase begins. Turn: {self.state.players[self.state.action_turn_player_id].username}")
        else:
            self.state.add_log("No players eligible for Action Phase.")
            await self._advance_to_cleanup()

    async def _advance_to_action(self):
        """
        Stub. This is now handled by _resolve_defense_phase.
        """
        pass # This phase is now merged with Defense Resolution

    async def _resolve_action_phase(self):
        """
        Checks if all active players have taken their action.
        If so, advances to Cleanup.
        """
        
        # Check if all active players are done
        next_player = self._get_next_active_player()
        
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
        
        # This will advance to WILDERNESS (new round) or INTERMISSION
        await self._advance_to_wilderness()
        
    async def _advance_to_wilderness(self):
        """
        End of the round.
        - Discard used Arsenal cards (unless returned)
        - Clear plans, defenses, temp boosts
        - Reset player statuses
        - Check for Era/Game end
        """
        self.state.add_log("--- CLEANUP PHASE ---")
        
        # Discard used Arsenal cards, clear plans/defenses/temps
        for player in self.state.players.values():
            if player.status == PlayerStatus.SURRENDERED:
                continue
            
            # --- NEW: Discard used Arsenal cards ---
            player_defense = self.state.player_defenses.get(player.user_id)
            if player_defense:
                cards_to_discard = []
                
                for arsenal_id in player_defense.arsenal_card_ids:
                    card = player.get_card_from_hand(arsenal_id)
                    if not card: continue
                    
                    # Check if it should be returned
                    if self.state.cards_to_return_to_hand.get(player.user_id) == card.id:
                        self.state.add_log(f"{card.name} returns to {player.username}'s hand!")
                        continue # Skip discard
                    
                    cards_to_discard.append(card)

                for card in cards_to_discard:
                    if card in player.arsenal_cards:
                        # TODO: Handle charges
                        player.arsenal_cards.remove(card)
                        # TODO: Add to a discard pile? For now, just remove.
                
                if cards_to_discard:
                    self.state.add_log(f"{player.username} discards {len(cards_to_discard)} used Arsenal card(s).")
            
            # Clear round-specific state
            player.plan = None
            player.defense = None
            player.action_prevented = False
            player.temp_defense_boost = {} # Clear temp boosts
            
            # Reset status for next round (if not surrendered)
            if player.status == PlayerStatus.ELIMINATED:
                player.status = PlayerStatus.ACTIVE
        
        # Clear global round state
        self.state.player_plans = {}
        self.state.player_defenses = {}
        self.state.current_threats = []
        self.state.initiative_queue = []
        self.state.player_threat_assignment = {}
        self.state.cards_to_return_to_hand = {}

        # --- Check for Era/Game End ---
        
        # End of Round 5 -> Intermission
        if self.state.round == 5:
            await self._advance_to_intermission()
        
        # End of Round 10 -> Intermission
        elif self.state.round == 10:
            await self._advance_to_intermission()
            
        # End of Round 15 -> Game Over
        elif self.state.round == 15:
            await self._end_game()
        
        # Otherwise, just start the next round
        else:
            self._start_new_round()
        
    async def _advance_to_intermission(self):
        """
        Fires after Era 1 (Round 5) and Era 2 (Round 10).
        Players can buy from the Market.
        """
        self.state.phase = GamePhase.INTERMISSION
        self.state.add_log(f"--- INTERMISSION (End of Era {self.state.era}) ---")
        self.state.add_log("Players may purchase from the Market.")
        
        # Update Era
        self.state.era += 1
        
        # Refill market
        self._refill_market()
        
        # Set up purchase turns
        # Use *current* initiative order from last round
        self.state.intermission_purchases = {
            pid: 0 for pid in self.state.initiative_queue 
            if self.state.players[pid].status == PlayerStatus.ACTIVE
        }
        
        # Find first player
        first_player_id = self.state.initiative_queue[0] if self.state.initiative_queue else None
        
        if first_player_id and self.state.players[first_player_id].status == PlayerStatus.ACTIVE:
             self.state.intermission_turn_player_id = first_player_id
             self.state.add_log(f"Purchase Turn: {self.state.players[first_player_id].username}")
        else:
             self.state.add_log("No active players to purchase.")
             await self._resolve_intermission() # End it immediately
             
    async def _resolve_intermission(self):
        """
        Checks if all players have passed or bought their max.
        """
        
        active_players = [
            pid for pid in self.state.initiative_queue
            if self.state.players[pid].status == PlayerStatus.ACTIVE
        ]
        
        if not active_players:
            self.state.add_log("No active players. Ending Intermission.")
            self._start_new_round() # This starts the next round (6 or 11)
            return

        # Check if all active players have had their turn
        # (i.e., their purchases > 0 or they passed)
        
        current_player_id = self.state.intermission_turn_player_id
        current_player_index = -1
        if current_player_id in active_players:
            current_player_index = active_players.index(current_player_id)
            
        next_player_index = (current_player_index + 1) % len(active_players)
        next_player_id = active_players[next_player_index]
        
        # Check if we've looped all the way around
        # We end if *everyone* has passed (purchases[pid] == -1)
        # or bought 1 (purchases[pid] == 1)
        
        all_done = True
        for pid in active_players:
            if self.state.intermission_purchases.get(pid, 0) == 0:
                all_done = False
                break
        
        if all_done:
            self.state.add_log("All players have finished purchasing.")
            self.state.intermission_turn_player_id = None
            self._start_new_round()
        else:
            # Move to the next player
            self.state.intermission_turn_player_id = next_player_id
            self.state.add_log(f"Purchase Turn: {self.state.players[next_player_id].username}")
            
    # --- Defense Calculation ---

    def _calculate_defense(
        self, player: PlayerState, threat: ThreatCard, defense: PlayerDefense
    ) -> Dict[str, Any]:
        """
        Calculates if a player's defense beats a threat.
        
        REFACTOR: Now returns a structured Dict for previews.
        """
        
        # --- 1. Get All Defense Boosts ---
        
        scrap_spent = defense.scrap_spent
        
        # --- Arsenal Boosts (from cards played) ---
        arsenal_boosts = {ScrapType.PARTS: 0, ScrapType.WIRING: 0, ScrapType.PLATES: 0}
        
        # --- Special Arsenal Flags ---
        has_lure_to_weakness = False
        has_corrosive_sludge = False
        
        arsenal_cards_used = [player.get_card_from_hand(cid) for cid in defense.arsenal_card_ids]
        
        for card in arsenal_cards_used:
            if not card or not isinstance(card, ArsenalCard):
                continue
            
            # Add simple defense boosts
            for s_type, amount in card.defense_boost.items():
                arsenal_boosts[s_type] += amount
            
            # Check for special effect flags
            if card.special_effect_id:
                if card.special_effect_id == ArsenalEffect.SPECIAL_LURE_TO_WEAKNESS:
                    has_lure_to_weakness = True
                elif card.special_effect_id == ArsenalEffect.SPECIAL_CORROSIVE_SLUDGE:
                    has_corrosive_sludge = True
        
        # --- Upgrade Boosts (from card played *this round*) ---
        upgrade_boosts = {ScrapType.PARTS: 0, ScrapType.WIRING: 0, ScrapType.PLATES: 0}
        upgrade_piercing_boosts = {ScrapType.PARTS: 0, ScrapType.WIRING: 0, ScrapType.PLATES: 0}
        
        if player.plan and player.plan.upgrade_card_id:
            upgrade_card = player.get_card_from_hand(player.plan.upgrade_card_id)
            if upgrade_card and isinstance(upgrade_card, UpgradeCard):
                
                # Add passive boosts (e.g. "Gain +2 PARTS defense")
                for s_type, amount in upgrade_card.defense_boost.items():
                    upgrade_boosts[s_type] += amount
                
                # Add passive piercing boosts (e.g. "Pig-Sticker")
                for s_type, amount in upgrade_card.defense_piercing.items():
                    upgrade_piercing_boosts[s_type] += amount
        
        # --- Temp Boosts (from "On Reveal" effects like Reinforced Crate) ---
        temp_boosts = player.temp_defense_boost
        
        # --- Piercing Boosts (Makeshift Amp) ---
        # Note: Amp is PIERCING
        amp_boosts = defense.special_amp_spend
        
        
        # --- 2. Calculate Final Defense Totals ---
        
        final_defense_non_piercing = {
            s_type: (
                scrap_spent.get(s_type, 0) +
                arsenal_boosts.get(s_type, 0) +
                upgrade_boosts.get(s_type, 0) +
                temp_boosts.get(s_type, 0)
            ) for s_type in ScrapType
        }
        
        final_piercing_defense = {
            s_type: (
                upgrade_piercing_boosts.get(s_type, 0) +
                amp_boosts.get(s_type, 0)
            ) for s_type in ScrapType
        }

        # --- 3. Get Threat's Target Stats ---
        
        threat_original_stats = {
            ScrapType.PARTS: threat.ferocity,
            ScrapType.WIRING: threat.cunning,
            ScrapType.PLATES: threat.mass,
        }
        
        resistant_to = threat.resistant.copy()
        immune_to = threat.immune.copy()

        # --- 4. Apply Special Modifiers (Corrosive Sludge) ---
        corrosive_sludge_active = False
        if has_corrosive_sludge and defense.special_corrode_stat:
            s_type = defense.special_corrode_stat
            corrosive_sludge_active = True
            if s_type in immune_to:
                immune_to.remove(s_type)
                # self.state.add_log(f"Corrosive Sludge removes Immunity from {s_type}!")
            if s_type in resistant_to:
                resistant_to.remove(s_type)
                # self.state.add_log(f"Corrosive Sludge removes Resistance from {s_type}!")

        # --- 5. Apply Resistance/Immunity to *non-piercing* defense ---
        
        final_defense_non_piercing_applied = final_defense_non_piercing.copy()
        threat_effective_stats = threat_original_stats.copy()

        for s_type in ScrapType:
            if s_type in immune_to:
                final_defense_non_piercing_applied[s_type] = 0 # Immune = 0 defense
                # Also show this on the threat for the UI
                if threat_original_stats[s_type] > 0:
                    threat_effective_stats[s_type] = float('inf') # Show as "Immune"
            elif s_type in resistant_to:
                final_defense_non_piercing_applied[s_type] = final_defense_non_piercing_applied[s_type] // 2 # Resistant = half defense
                # Show this on the threat for the UI
                threat_effective_stats[s_type] = threat_original_stats[s_type] * 2 # Show as "Resistant (x2)"
        
        # --- 6. Check for Kill ---
        
        is_kill = False
        killed_stats = 0
        
        # Combine piercing and final (modified) defense
        total_defense_applied = {
            s_type: final_defense_non_piercing_applied[s_type] + final_piercing_defense[s_type]
            for s_type in ScrapType
        }
        
        highest_stats_to_beat = []
        lure_to_weakness_active = False

        # --- NEW: Check for Lure to Weakness ---
        if has_lure_to_weakness and defense.special_target_stat:
            lure_to_weakness_active = True
            s_type = defense.special_target_stat
            
            # Use the *original* threat stat
            target_val = threat_original_stats[s_type]
            total_def_for_stat = total_defense_applied[s_type]
            
            if total_def_for_stat >= target_val:
                is_kill = True
                killed_stats = 1 # Mark it as a kill
            
            highest_stats_to_beat.append(s_type)
            # self.state.add_log(f"{player.username} uses Lure to Weakness, targeting {s_type} ({target_val}). Defense: {total_def_for_stat}")
        
        else:
            # --- Regular Kill Calculation ---
            # Find the highest stat on the pig
            highest_stat_val = 0
            if threat.ferocity > highest_stat_val: highest_stat_val = threat.ferocity
            if threat.cunning > highest_stat_val: highest_stat_val = threat.cunning
            if threat.mass > highest_stat_val: highest_stat_val = threat.mass
            
            if highest_stat_val == 0:
                is_kill = True # Pig has 0 defense, auto-kill
            
            # Find all stats that match the highest value
            if threat.ferocity == highest_stat_val: highest_stats_to_beat.append(ScrapType.PARTS)
            if threat.cunning == highest_stat_val: highest_stats_to_beat.append(ScrapType.WIRING)
            if threat.mass == highest_stat_val: highest_stats_to_beat.append(ScrapType.PLATES)
            
            # Check if defense meets or exceeds *all* highest stats
            for s_type in highest_stats_to_beat:
                if total_defense_applied[s_type] >= threat_original_stats[s_type]:
                    killed_stats += 1
            
            if killed_stats == len(highest_stats_to_beat) and highest_stat_val > 0:
                is_kill = True
            
            if not highest_stats_to_beat and highest_stat_val == 0:
                is_kill = True # Ensure 0-def pigs are killed
            
            # self.state.add_log(f"{player.username} vs {threat.name} (Target: {highest_stats_to_beat}, Value: {highest_stat_val}).")
            # self.state.add_log(f"  Defense: {total_defense_applied} (piercing: {final_piercing_defense})")

        # Return a structured dictionary
        return {
            "is_kill": is_kill,
            "killed_stats": killed_stats,
            "player_total_defense": {s_type.value: val for s_type, val in total_defense_applied.items()},
            "player_non_piercing_defense": {s_type.value: val for s_type, val in final_defense_non_piercing.items()},
            "player_non_piercing_defense_applied": {s_type.value: val for s_type, val in final_defense_non_piercing_applied.items()},
            "player_piercing_defense": {s_type.value: val for s_type, val in final_piercing_defense.items()},
            "threat_original_stats": {s_type.value: val for s_type, val in threat_original_stats.items()},
            "threat_effective_stats": {s_type.value: val for s_type, val in threat_effective_stats.items()},
            "threat_highest_stats_to_beat": [s_type.value for s_type in highest_stats_to_beat],
            "threat_resistant_to": [s_type.value for s_type in resistant_to],
            "threat_immune_to": [s_type.value for s_type in immune_to],
            "is_lure_to_weakness_active": lure_to_weakness_active,
            "is_corrosive_sludge_active": corrosive_sludge_active,
        }
        
    # --- Action Phase ---

    async def _action_perform_action(self, player: PlayerState):
        """
        Player performs their chosen action for the round.
        """
        if self.state.action_turn_player_id != player.user_id:
            self.state.add_log(f"Error: Not {player.username}'s action turn.")
            return

        if player.action_prevented:
            self.state.add_log(f"{player.username}'s action was prevented by an 'On Fail' effect!")
            # Consume their turn
            self.state.action_turn_player_id = None
            await self._resolve_action_phase()
            return
            
        plan = self.state.player_plans.get(player.user_id)
        if not plan:
            self.state.add_log(f"Error: {player.username} has no plan.")
            return
            
        action_card = player.get_card_from_hand(plan.action_card_id)
        if not action_card:
            self.state.add_log(f"Error: Action card {plan.action_card_id} not in hand.")
            return

        # --- Resolve the Action ---
        action_name = action_card.name.upper()
        if "SCAVENGE" in action_name:
            self._action_scavenge(player)
        elif "FORTIFY" in action_name:
            self._action_fortify(player)
        elif "ARMORY RUN" in action_name:
            self._action_armory_run(player)
        elif "SCHEME" in action_name:
            self._action_scheme(player)
        
        # Mark their turn as done
        self.state.action_turn_player_id = None
        await self._resolve_action_phase()

    async def _action_pass_action(self, player: PlayerState):
        """
        Player passes their action (if allowed? rulebook unclear).
        For now, this just advances the turn.
        """
        if self.state.action_turn_player_id != player.user_id:
            self.state.add_log(f"Error: Not {player.username}'s action turn.")
            return
            
        self.state.add_log(f"{player.username} passes their action.")
        # Mark their turn as done
        self.state.action_turn_player_id = None
        await self._resolve_action_phase()

    def _action_scavenge(self, player: PlayerState):
        """Action: Gain 1 PARTS Scrap (v1.8)"""
        player.add_scrap(ScrapType.PARTS, 1)
        self.state.add_log(f"{player.username} (Scavenge) gains 1 PARTS Scrap.")

    def _action_fortify(self, player: PlayerState):
        """Action: Gain 1 WIRING Scrap (v1.8)"""
        player.add_scrap(ScrapType.WIRING, 1)
        self.state.add_log(f"{player.username} (Fortify) gains 1 WIRING Scrap.")

    def _action_armory_run(self, player: PlayerState):
        """Action: Gain 1 PLATES Scrap, draw 1 Arsenal card (v1.8)."""
        player.add_scrap(ScrapType.PLATES, 1)
        self.state.add_log(f"{player.username} (Armory Run) gains 1 PLATES Scrap.")
        self._draw_arsenal_cards(player, 1)

    def _action_scheme(self, player: PlayerState):
        """Action: Move up 2 spaces in initiative *next* round."""
        self.state.add_log(f"{player.username} (Scheme) will act sooner next round.")
        # (e.g., in a 4-player game, move 2 spots)
        # ... logic to move up initiative ...
        pass # TODO: Implement Scheme logic

    # --- NEW HELPER: Apply Card Effects ---
    
    def _apply_special_effect(
        self, 
        player: PlayerState, 
        effect_id: str, 
        card: Optional[Card] = None
    ):
        """
        Helper to resolve 'On Kill', 'On Reveal', etc. effects
        from a card's special_effect_id string.
        """
        
        if not effect_id:
            return
            
        tags = effect_id.split(';')
        card_name = card.name if card else "An effect"
        
        for tag in tags:
            try:
                # --- On Reveal (Planning Phase) ---
                if tag == UpgradeEffect.ON_REVEAL_GAIN_SCRAP_PARTS_1:
                    player.add_scrap(ScrapType.PARTS, 1)
                    self.state.add_log(f"{card_name} activates: {player.username} gains 1 PARTS.")
                
                elif tag == UpgradeEffect.ON_REVEAL_GAIN_SCRAP_WIRING_1:
                    player.add_scrap(ScrapType.WIRING, 1)
                    self.state.add_log(f"{card_name} activates: {player.username} gains 1 WIRING.")
                
                elif tag == UpgradeEffect.ON_REVEAL_GAIN_SCRAP_PLATES_1:
                    player.add_scrap(ScrapType.PLATES, 1)
                    self.state.add_log(f"{card_name} activates: {player.username} gains 1 PLATES.")
                
                elif tag == UpgradeEffect.ON_REVEAL_GAIN_SCRAP_ALL_1:
                    player.add_scrap(ScrapType.PARTS, 1)
                    player.add_scrap(ScrapType.WIRING, 1)
                    player.add_scrap(ScrapType.PLATES, 1)
                    self.state.add_log(f"{card_name} activates: {player.username} gains 1 of each scrap.")
                
                elif tag == UpgradeEffect.ON_REVEAL_DRAW_ARSENAL_1:
                    self._draw_arsenal_cards(player, 1)
                    self.state.add_log(f"{card_name} activates: {player.username} draws 1 Arsenal card.")
                
                elif tag == UpgradeEffect.ON_REVEAL_DRAW_ARSENAL_2:
                    self._draw_arsenal_cards(player, 2)
                    self.state.add_log(f"{card_name} activates: {player.username} draws 2 Arsenal cards.")
                
                elif tag == UpgradeEffect.ON_REVEAL_DEFENSE_ALL_2:
                    # Applied in _calculate_defense, but also set here.
                    self.state.add_log(f"{card_name} activates: {player.username} gains +2 of each defense this round.")
                    player.temp_defense_boost = {ScrapType.PARTS: 2, ScrapType.WIRING: 2, ScrapType.PLATES: 2}

                # --- On Kill (Defense Phase) ---
                elif tag == UpgradeEffect.ON_KILL_GAIN_SCRAP_ALL_1:
                    player.add_scrap(ScrapType.PARTS, 1)
                    player.add_scrap(ScrapType.WIRING, 1)
                    player.add_scrap(ScrapType.PLATES, 1)
                    self.state.add_log(f"On Kill: {card_name} grants {player.username} 1 scrap of each type!")

                elif tag == UpgradeEffect.ON_KILL_GAIN_SCRAP_PARTS_1:
                    player.add_scrap(ScrapType.PARTS, 1)
                    self.state.add_log(f"On Kill: {card_name} grants {player.username} 1 PARTS scrap!")
                
                elif tag == UpgradeEffect.ON_KILL_GAIN_SCRAP_WIRING_1:
                    player.add_scrap(ScrapType.WIRING, 1)
                    self.state.add_log(f"On Kill: {card_name} grants {player.username} 1 WIRING scrap!")
                
                elif tag == UpgradeEffect.ON_KILL_GAIN_SCRAP_PLATES_1:
                    player.add_scrap(ScrapType.PLATES, 1)
                    self.state.add_log(f"On Kill: {card_name} grants {player.username} 1 PLATES scrap!")

                elif tag == UpgradeEffect.ON_KILL_DRAW_ARSENAL_1:
                    self._draw_arsenal_cards(player, 1)
                    self.state.add_log(f"On Kill: {card_name} lets {player.username} draw 1 Arsenal card!")

                elif tag == ArsenalEffect.ON_KILL_RETURN_TO_HAND:
                    if card and isinstance(card, ArsenalCard):
                        # Flag this card to be kept during cleanup
                        self.state.cards_to_return_to_hand[player.user_id] = card.id
                        # Log is handled in cleanup
                
            except Exception as e:
                print(f"Error applying special effect tag '{tag}': {e}")
                
    # --- Intermission Phase ---
    
    async def _action_intermission_buy(self, player: PlayerState, payload: Dict[str, Any]):
        """Player buys one card from the market."""
        if self.state.intermission_turn_player_id != player.user_id:
            self.state.add_log("Error: Not your turn to buy.")
            return
            
        if self.state.intermission_purchases.get(player.user_id, 0) != 0:
            self.state.add_log("Error: You have already bought or passed.")
            return
            
        card_id = payload.get("card_id")
        card, source_list = self._find_market_card(card_id)
        
        if not card or not source_list:
            self.state.add_log(f"Error: Card {card_id} not in market.")
            return
            
        cost = card.cost
        if not player.pay_cost(cost):
            self.state.add_log(f"{player.username} cannot afford {card.name}.")
            return
            
        # Successful purchase
        source_list.remove(card)
        if isinstance(card, UpgradeCard):
            player.upgrade_cards.append(card)
        elif isinstance(card, ArsenalCard):
            player.arsenal_cards.append(card)
        
        self.state.add_log(f"{player.username} bought {card.name}.")
        
        # Mark their turn as done (bought 1)
        self.state.intermission_purchases[player.user_id] = 1
        await self._resolve_intermission()

    async def _action_intermission_pass(self, player: PlayerState):
        """Player passes their buy action."""
        if self.state.intermission_turn_player_id != player.user_id:
            self.state.add_log("Error: Not your turn to buy.")
            return
        
        if self.state.intermission_purchases.get(player.user_id, 0) != 0:
            self.state.add_log("Error: You have already bought or passed.")
            return
            
        self.state.add_log(f"{player.username} passes their buy.")
        # Mark their turn as done (passed)
        self.state.intermission_purchases[player.user_id] = -1
        await self._resolve_intermission()

    # --- Game Loop ---
    
    def _start_new_round(self):
        """
        Sets up the game for the next round (WILDERNESS -> PLANNING).
        """
        self.state.round += 1
        self.state.phase = GamePhase.WILDERNESS
        self.state.add_log(f"--- ROUND {self.state.round} (Era {self.state.era}) ---")
        
        # Refill market (just in case)
        self._refill_market()
        
        # Deal cards (if needed)
        # (In v1.8, players keep their hands)
        
        # Advance to Planning
        # (This is synchronous, no await)
        self.state.phase = GamePhase.PLANNING
        self.state.add_log("--- PLANNING PHASE ---")
        self.state.add_log("All players: Plan your Lure, Action, and Upgrade cards.")

    # --- Player Actions (Submitting) ---
    
    async def _action_submit_plan(self, player: PlayerState, payload: Dict[str, Any]):
        """Player submits their plan for the round."""
        if self.state.phase != GamePhase.PLANNING:
            self.state.add_log("Error: Can only submit plans in PLANNING phase.")
            return

        plan = PlayerPlans(**payload)
        
        # TODO: Validate the plan (e.g., check card IDs)
        
        self.state.player_plans[player.user_id] = plan
        player.plan = plan # Also store on player for v1.8
        self.state.add_log(f"{player.username} has submitted their plan.")
        
        if self._are_all_players_ready("plans"):
            await self._advance_to_attraction()

    async def _action_assign_threat(self, player: PlayerState, payload: Dict[str, Any]):
        """
        Player (whose turn it is) assigns a threat to *themselves*.
        """
        if self.state.phase != GamePhase.ATTRACTION:
            self.state.add_log("Error: Not in ATTRACTION phase.")
            return
        
        if self.state.attraction_turn_player_id != player.user_id:
            self.state.add_log(f"Error: Not {player.username}'s turn to assign.")
            return
            
        threat_id = payload.get("threat_id")
        if threat_id not in self.state.available_threat_ids:
            self.state.add_log(f"Error: Threat {threat_id} is not available.")
            return
            
        # Check if it's a valid choice
        threat = next((t for t in self.state.current_threats if t.id == threat_id), None)
        lure_card = player.get_card_from_hand(player.plan.lure_card_id)
        
        lure_name_map = {
            ScrapType.PARTS: "Rags",
            ScrapType.WIRING: "Noises",
            ScrapType.PLATES: "Fruit"
        }
        lure_type_name = lure_name_map.get(lure_card.lure_type)

        if not threat or threat.lure_type != lure_type_name:
            self.state.add_log(f"Error: {threat.name} does not match Lure {lure_type_name}")
            return
            
        # --- Assignment successful ---
        self.state.add_log(f"{player.username} attracts the {threat.name}.")
        
        # Assign it
        self.state.player_threat_assignment[player.user_id] = threat.id
        
        # Remove from available pools
        self.state.available_threat_ids.remove(threat.id)
        self.state.unassigned_player_ids.remove(player.user_id)
        
        # Advance to the next player's turn
        await self._advance_attraction_turn()

    async def _action_submit_defense(self, player: PlayerState, payload: Dict[str, Any]):
        """Player submits their defense for the round."""
        if self.state.phase != GamePhase.DEFENSE:
            self.state.add_log("Error: Can only submit defense in DEFENSE phase.")
            return
            
        defense = PlayerDefense(**payload)
        
        # TODO: Validate the defense (e.g., check scrap cost, card IDs)
        
        self.state.player_defenses[player.user_id] = defense
        player.defense = defense # Store on player
        self.state.add_log(f"{player.username} has submitted their defense.")
        
        if self._are_all_players_ready("defenses"):
            await self._resolve_defense_phase()

    async def _action_surrender(self, player: PlayerState):
        """Player leaves the game."""
        self.state.add_log(f"{player.username} has surrendered.")
        player.status = PlayerStatus.SURRENDERED
        
        # Check if this surrender ends the game (e.g., last player)
        active_players = [
            p for p in self.state.players.values() 
            if p.status == PlayerStatus.ACTIVE
        ]
        if len(active_players) <= 1:
            await self._end_game()

    # --- Market & Card Helpers ---
    
    def _refill_market(self):
        """Tops up the face-up market cards."""
        
        # Upgrades
        while len(self.state.market.upgrade_faceup) < MARKET_FACEUP_COUNT:
            if not self.state.market.upgrade_deck:
                break
            self.state.market.upgrade_faceup.append(
                self.state.market.upgrade_deck.pop(0)
            )
            
        # Arsenal
        while len(self.state.market.arsenal_faceup) < MARKET_FACEUP_COUNT:
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
        
    def _draw_arsenal_cards(self, player: PlayerState, num: int):
        """Player draws N cards from the Arsenal deck."""
        for _ in range(num):
            if not self.state.market.arsenal_deck:
                self.state.add_log(f"Arsenal deck is empty, {player.username} cannot draw.")
                return
            card = self.state.market.arsenal_deck.pop(0)
            player.arsenal_cards.append(card)
            self.state.add_log(f"{player.username} (Armory Run) drew {card.name}")

    def _get_valid_threats_for_player(self, player: PlayerState) -> List[ThreatCard]:
        """
        Finds all available threats that match the player's Lure card.
        """
        plan = self.state.player_plans.get(player.user_id)
        if not plan:
            return []
            
        lure_card = player.get_card_from_hand(plan.lure_card_id)
        if not lure_card or not isinstance(lure_card, LureCard):
            return []
            
        lure_name_map = {
            ScrapType.PARTS: "Rags",
            ScrapType.WIRING: "Noises",
            ScrapType.PLATES: "Fruit"
        }
        lure_type_name = lure_name_map.get(lure_card.lure_type)
        
        valid_threats = []
        for threat_id in self.state.available_threat_ids:
            threat = next((t for t in self.state.current_threats if t.id == threat_id), None)
            if threat and threat.lure_type == lure_type_name:
                valid_threats.append(threat)
                
        return valid_threats

    # --- Turn Management ---
    
    def _get_next_active_player(self) -> Optional[str]:
        """
        Finds the next player in the initiative queue who is ACTIVE
        and hasn't had their turn (e.g., in ACTION phase).
        """
        
        # Find all players who are still in the round
        eligible_players = self.state.get_active_players_in_order()
        
        if self.state.phase == GamePhase.ACTION:
            # Find players who haven't acted
            # (This is tricky. We need a way to mark "action_taken")
            # For now, we assume _resolve_action_phase handles one at a time.
            
            # Find the *first* eligible player who
            # hasn't been prevented
            
            for player in eligible_players:
                # If it's this player's turn, they are next
                if self.state.action_turn_player_id == player.user_id:
                    return player.user_id
                    
            # If no one's turn is set, find the first in the list
            if eligible_players:
                return eligible_players[0].user_id

        return None # No one left

    # --- Game End ---
    
    async def _end_game(self):
        """
        Calculates the winner and sets the game state to GAME_OVER.
        """
        if self.state.phase == GamePhase.GAME_OVER:
            return # Already ended
            
        self.state.phase = GamePhase.GAME_OVER
        self.state.add_log("--- GAME OVER ---")
        
        # Determine winner
        # Lowest injuries, then most trophies, then most scrap
        
        active_players = [
            p for p in self.state.players.values() 
            if p.status != PlayerStatus.SURRENDERED
        ]
        
        if not active_players:
            self.state.add_log("No winner, all players surrendered.")
            return

        # Sort by:
        # 1. Injuries (ascending)
        # 2. Trophies (descending)
        # 3. Total Scrap (descending)
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

        # Add surrendered players at the end
        surrendered_players = [
             p for p in self.state.players.values()
             if p.status == PlayerStatus.SURRENDERED
        ]
        for p in surrendered_players:
             self.state.add_log(
                f"  - {p.username} (Surrendered)"
            )


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
            submitted_ids = {
                pid for pid, p in self.state.players.items() if p.plan is not None
            }
        elif check_type == "defenses":
            submitted_ids = {
                pid for pid, p in self.state.players.items() if p.defense is not None
            }
        else:
            return False
            
        # Are all active players in the submitted list?
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
            # Deserialize payload.
            # Need to convert string keys (from JSON) to ScrapType Enums
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

        # Call the real calculation logic
        try:
            defense_result = self._calculate_defense(player, threat, defense)
            return defense_result
        except Exception as e:
            print(f"Error during defense preview: {e}")
            return {"error": "Calculation failed."}