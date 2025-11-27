"""
Manages the game's state machine, advancing between phases.
"""
import random
from typing import List, Optional, cast
from ...game_core.game_models import (
    GameState, PlayerState, GamePhase, ScrapType, LureCard, PlayerStatus, PlayerDefense,
    ThreatCard, ArsenalCard, Card
)
from ...game_core.card_effects import OnFailEffect, ArsenalEffect
from .calculation import GameCalculationService
from .validation import GameValidator # <-- NEW DEPENDENCY

class GamePhaseManager:
    """Handles phase transitions and resolutions."""

    def __init__(self, state: GameState, calculation_service: GameCalculationService, validator: GameValidator):
        self.state = state
        self.calc_service = calculation_service
        self.validator = validator # <-- NEW DEPENDENCY
        self.scrap_pool: List[ScrapType] = []
        self._initialize_scrap_pool()

    async def advance_to_attraction(self):
        self.state.phase = GamePhase.ATTRACTION
        self.state.add_log("--- ATTRACTION PHASE ---")
        self.state.add_log("Plans revealed! Calculating initiative...")
        
        self._set_initiative_order()
        
        # Setup Attraction Phase
        active_players = self.state.get_active_players_in_order()
        self.state.unassigned_player_ids = [p.user_id for p in active_players]
        self.state.player_threat_assignment = {}
        self.state.attraction_phase_state = "FIRST_PASS"
        self.state.attraction_turn_player_id = None
        
        await self.advance_attraction_turn()

    async def advance_attraction_turn(self):
        if not self.state.available_threat_ids or not self.state.unassigned_player_ids:
            self.state.add_log("All threats or players assigned.")
            await self.advance_to_defense()
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
                # Fall through to the SECOND_PASS logic block
        
        if self.state.attraction_phase_state == "SECOND_PASS":
            # Find the first player in initiative who is still unassigned
            for player_id in self.state.initiative_queue:
                if player_id in self.state.unassigned_player_ids:
                    next_player_id = player_id
                    break 
            
            if next_player_id:
                self.state.attraction_turn_player_id = next_player_id
                self.state.add_log(f"Attraction (Second Pass): {self.state.players[next_player_id].username}'s turn.")
            else:
                # This should be redundant if the first check passes, but good for safety
                self.state.add_log("All players assigned (Second Pass).")
                await self.advance_to_defense()
                
        if not next_player_id and self.state.attraction_phase_state == "FIRST_PASS":
             # This means no one had a valid threat in first pass, and we're now in second pass
             # This recursive call is safe because the state has changed
             await self.advance_attraction_turn()

    async def advance_to_defense(self):
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

    async def resolve_defense_phase(self):
        """
        FIXED: Ported logic from old_game_instance.py
        This now correctly handles KILL, FAILED (all three), and DEFEND.
        """
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
                
            defense_result = self.calc_service.calculate_defense(
                player, threat, defense
            )

            # Get stats for FAILED check
            total_def = defense_result["player_total_defense"]
            threat_stats = defense_result["threat_original_stats"]
            
            failed_all_three = (
                total_def.get(ScrapType.PARTS.value, 0) < threat_stats.get(ScrapType.PARTS.value, 0) and
                total_def.get(ScrapType.WIRING.value, 0) < threat_stats.get(ScrapType.WIRING.value, 0) and
                total_def.get(ScrapType.PLATES.value, 0) < threat_stats.get(ScrapType.PLATES.value, 0)
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
                         # FIX: Call self.apply_special_effect
                         self.apply_special_effect(player, arsenal_card.special_effect_id, arsenal_card)

            elif failed_all_three:
                # This is the "FAIL" case
                self._handle_defense_fail(player, threat, defense)

            else:
                # This is the "DEFEND" case
                self.state.add_log(f"{player.username} successfully DEFENDED against the {threat.name}.")

        self.state.action_turn_player_id = self._get_next_active_player()
        if self.state.action_turn_player_id:
            self.state.add_log(f"Action Phase begins. Turn: {self.state.players[self.state.action_turn_player_id].username}")
            # Record initial stance for this action turn
            self.state.turn_initial_stance[self.state.action_turn_player_id] = self.state.players[self.state.action_turn_player_id].stance
        else:
            self.state.add_log("No players eligible for Action Phase.")
            await self.advance_to_cleanup()

    async def resolve_action_phase(self):
        next_player = self._get_next_active_player(
            start_after_player=self.state.action_turn_player_id
        )
        
        if next_player:
            self.state.action_turn_player_id = next_player
            self.state.add_log(f"Action Turn: {self.state.players[next_player].username}")
            self.state.turn_initial_stance[self.state.action_turn_player_id] = self.state.players[self.state.action_turn_player_id].stance
        else:
            self.state.add_log("All player actions complete.")
            await self.advance_to_cleanup()
            
    async def advance_to_cleanup(self):
        self.state.phase = GamePhase.CLEANUP
        self.state.action_turn_player_id = None
        
        self.state.add_log("--- CLEANUP PHASE ---")
        active_players = [p for p in self.state.players.values() if p.status != PlayerStatus.SURRENDERED]
        
        self.state.add_log("All players gain 1 random scrap (Base Income).")
        for player in active_players:
            self.draw_random_scrap(player, 1)

        self._award_spoils()
        self._cleanup_cards(active_players)
        self._reset_round_state()
        self.refill_market()

        if self.state.round in [5, 10]:
            await self.advance_to_intermission()
        elif self.state.round >= 15: # >= to be safe
            await self.end_game()
        else:
            await self._start_new_round()

    async def advance_to_intermission(self):
        self.state.phase = GamePhase.INTERMISSION
        self.state.era += 1
        self.state.add_log(f"--- INTERMISSION (End of Era {self.state.era-1}) ---")
        self.state.add_log("Players may take one FREE purchase from the Market.")
        
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
             await self.resolve_intermission() 
             
    async def resolve_intermission(self):
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
            self.refill_market()
            await self._start_new_round() 

    async def end_game(self):
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

    def apply_special_effect(
        self, 
        player: PlayerState, 
        effect_id: str, 
        card: Optional[Card] = None
    ):
        """Applies special effects from cards."""
        if not effect_id: return
        card_name = card.name if card else "An effect"
        try:
            if effect_id == ArsenalEffect.ON_KILL_RETURN_TO_HAND:
                if card and isinstance(card, ArsenalCard):
                    self.state.cards_to_return_to_hand[player.user_id] = card.id
        except Exception as e:
            print(f"Error applying special effect tag '{effect_id}': {e}")

    # --- Helper methods... ---
    
    def _set_initiative_order(self):
        """
        FIXED: Ported logic from old_game_instance.py
        Sorts players by lure strength, then by original initiative position.
        """
        initiative_list = [] # (initiative_score, original_pos, player_id)
        active_players = self.state.get_active_players_in_order()
        
        for player in active_players:
            plan = self.state.player_plans.get(player.user_id)
            if not plan: continue
            
            lure_card = player.get_card_from_hand(plan.lure_card_id)
            if lure_card and isinstance(lure_card, LureCard):
                initiative_score = lure_card.strength
                # Find original position from *last* round's queue
                original_pos = 0
                if player.user_id in self.state.initiative_queue:
                    original_pos = self.state.initiative_queue.index(player.user_id)
                else:
                    # Player wasn't in queue? (e.g. joined mid-game? set last)
                    original_pos = 99
                
                initiative_list.append((initiative_score, original_pos, player.user_id))
            else:
                self.state.add_log(f"Error: Player {player.username} plan invalid.")
                initiative_list.append((99, 99, player.user_id)) 

        # Sort by score (lower is better), then by original pos (lower is better)
        initiative_list.sort(key=lambda x: (x[0], x[1]))
        
        # Set the new queue
        self.state.initiative_queue = [pid for score, pos, pid in initiative_list]
        
        initiative_log = ", ".join([
            f"{self.state.players[pid].username}"
            for pid in self.state.initiative_queue
        ])
        self.state.add_log(f"Initiative Order: {initiative_log}")

    def _draw_threats(self):
        """Draws threats from the deck for the round."""
        num_active_players = len(self.state.get_active_players_in_order())
        num_threats_needed = num_active_players - len(self.state.current_threats)

        if num_threats_needed <= 0:
            self.state.add_log("Threats from last round carry over. No new threats drawn.")
            return

        newly_drawn_threats = []
        for _ in range(num_threats_needed):
            if not self.state.threat_deck:
                self.state.add_log("Threat deck is empty!")
                break
            newly_drawn_threats.append(self.state.threat_deck.pop(0))
        
        self.state.current_threats.extend(newly_drawn_threats)
        self.state.available_threat_ids = [t.id for t in self.state.current_threats]
        
        self.state.add_log(f"Revealed {len(newly_drawn_threats)} new threats: {', '.join([t.name for t in newly_drawn_threats])}")

    def _get_valid_threats_for_player(self, player: PlayerState) -> List[ThreatCard]:
        """
        Copied from old_game_instance.py
        Checks which available threats match a player's lure.
        """
        plan = self.state.player_plans.get(player.user_id)
        if not plan: return []
        
        try:
            # Use the validator to get the card
            lure_card = self.validator.validate_card_in_hand(player, plan.lure_card_id, LureCard)
        except ValueError:
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
            if threat and lure_type_name in threat.lure_type.split('/'):
                valid_threats.append(threat)
        return valid_threats

    def _handle_defense_fail(self, player: PlayerState, threat: ThreatCard, defense: PlayerDefense):
        """
        FIXED: Ported logic from old_game_instance.py
        Applies the consequences of a "FAIL" (failed all 3 stats).
        """
        ignores_consequences = False
        arsenal_cards_used = [player.get_card_from_hand(cid) for cid in defense.arsenal_card_ids]
        for card in arsenal_cards_used:
            if card and card.special_effect_id == ArsenalEffect.ON_FAIL_IGNORE_CONSEQUENCES:
                ignores_consequences = True
                self.state.add_log(f"{player.username} plays {card.name} and IGNORES all consequences!")
                break
        
        if not ignores_consequences:
            # 1. Apply Base Injury
            player.injuries += 1
            self.state.add_log(f"{player.username} FAILED their defense against {threat.name} and gains 1 Injury!")

            # 2. Apply Threat's OnFailEffect (if any)
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
                    # Discard 1 scrap (highest amount)
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

    def _award_spoils(self):
        """Gives players the scrap from their defeated threats."""
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

    def _cleanup_cards(self, active_players: List[PlayerState]):
        """Handles arsenal discards and setting last round's lure."""
        for player in active_players:
            player_defense = self.state.player_defenses.get(player.user_id)
            if player_defense:
                cards_to_discard = []
                for arsenal_id in player_defense.arsenal_card_ids:
                    card = player.get_card_from_hand(arsenal_id)
                    if not card: continue
                    # Check if card is marked to be returned
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
                        # Discard one-use or 0-charge cards
                        player.arsenal_cards.remove(cast(ArsenalCard, card))
                
                if cards_to_discard:
                    self.state.add_log(f"{player.username} discards used Arsenal card(s).")
            
            # --- Set last_round_lure_id ---
            plan = self.state.player_plans.get(player.user_id)
            if plan:
                player.last_round_lure_id = plan.lure_card_id

    def _reset_round_state(self):
        """Resets all temporary, round-specific state variables."""
        self.state.current_threats = []
        self.state.player_plans = {}
        self.state.player_defenses = {}
        self.state.player_threat_assignment = {}
        self.state.spoils_to_gain = {}
        self.state.cards_to_return_to_hand = {}
        self.state.turn_initial_stance = {}
        for player in self.state.players.values():
            player.plan = None
            player.defense = None
            player.action_prevented = False

    async def _advance_to_wilderness(self):
        """Handles the start-of-round events, primarily drawing new threats."""
        self.state.phase = GamePhase.WILDERNESS
        self.state.add_log("The wilderness stirs...")
        self._draw_threats()
        # After wilderness events, immediately move to planning.
        await self._advance_to_planning()

    async def _advance_to_planning(self):
        """Sets the game to the PLANNING phase for players to act."""
        self.state.phase = GamePhase.PLANNING
        self.state.add_log("--- PLANNING PHASE ---")
        self.state.add_log("All players: Plan your Lure and Action cards.")

    async def _start_new_round(self):
        self.state.round += 1
        self.state.add_log(f"--- ROUND {self.state.round} (Era {self.state.era}) ---")
        await self._advance_to_wilderness()

    def _get_next_active_player(
        self, 
        start_after_player: Optional[str] = None,
        check_intermission_pass: bool = False
    ) -> Optional[str]:
        """Finds the next active player in initiative order."""
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
            
        # If we're checking for intermission and reached the end, no one is left
        if check_intermission_pass:
            return None
        
        # If we're in ACTION phase and started *after* someone, we don't loop
        if self.state.phase == GamePhase.ACTION and start_after_player:
            return None

        # If we didn't start after anyone (e.g. first player of round)
        # we must check from the beginning (this loop is redundant, but safe)
        if not start_after_player:
             for i in range(0, start_index): # Check 0 to start_index
                player_id = player_queue[i]
                player = self.state.players[player_id]
                if player.status == PlayerStatus.ACTIVE:
                    if self.state.phase == GamePhase.ACTION and player.action_prevented:
                        continue
                    return player_id
        return None

    def are_all_players_ready(self, check_type: str) -> bool:
        """Checks if all active players have submitted their action for a phase."""
        active_player_ids = {
            p.user_id for p in self.state.get_active_players_in_order()
        }
        if not active_player_ids:
            return True 

        if check_type == "plans":
            submitted_ids = set(self.state.player_plans.keys())
        elif check_type == "defenses":
            # For defenses, we only care about players *with* a threat
            active_player_ids_with_threats = {
                pid for pid in active_player_ids 
                if self.state.get_assigned_threat(pid) is not None
            }
            if not active_player_ids_with_threats:
                return True # No one to wait for
            submitted_ids = set(self.state.player_defenses.keys())
            return active_player_ids_with_threats.issubset(submitted_ids)
        else:
            return False
        
        return active_player_ids.issubset(submitted_ids)

    def refill_market(self):
        """Refills the face-up cards in the market to the limit."""
        market = self.state.market
        market_size = self.state.market.faceup_limit
        
        while len(market.upgrade_faceup) < market_size:
            if not market.upgrade_deck:
                break
            market.upgrade_faceup.append(market.upgrade_deck.pop(0))
            
        while len(market.arsenal_faceup) < market_size:
            if not market.arsenal_deck:
                break
            market.arsenal_faceup.append(market.arsenal_deck.pop(0))
        self.state.add_log("The market has been restocked.")

    def _initialize_scrap_pool(self, num_per_type=50):
        self.scrap_pool = (
            [ScrapType.PARTS] * num_per_type +
            [ScrapType.WIRING] * num_per_type +
            [ScrapType.PLATES] * num_per_type
        )
        random.shuffle(self.scrap_pool)
        self.state.add_log(f"Scrap Pool initialized with {len(self.scrap_pool)} tokens.")

    def draw_random_scrap(self, player: PlayerState, amount: int):
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
