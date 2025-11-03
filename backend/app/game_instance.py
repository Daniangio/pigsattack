"""
The GameInstance class.
This encapsulates all the rules and state for a single game.
It is the "server" for one match.
v1.8
"""

from .game_core.models import (
    GameState, PlayerState, GamePhase, PlayerPlans, PlayerDefense,
    ScrapType, LureCard, SurvivorActionCard, ThreatCard, UpgradeCard, ArsenalCard
)
from .game_core.deck_factory import create_threat_deck, create_upgrade_deck, create_arsenal_deck
from typing import List, Dict, Any, Optional, cast
import random
import math # For ceiling in resistance calculation

# Import the server-level models only for type hinting the setup
from .models import GameParticipant 

# --- CONSTANTS (v1.8) ---\
BASE_DEFENSE_FROM_ACTION = {
    SurvivorActionCard.SCAVENGE: {ScrapType.PARTS: 3, ScrapType.WIRING: 1, ScrapType.PLATES: 3},
    SurvivorActionCard.FORTIFY: {ScrapType.PARTS: 3, ScrapType.WIRING: 3, ScrapType.PLATES: 1},
    SurvivorActionCard.ARMORY_RUN: {ScrapType.PARTS: 1, ScrapType.WIRING: 3, ScrapType.PLATES: 3},
    SurvivorActionCard.SCHEME: {ScrapType.PARTS: 2, ScrapType.WIRING: 2, ScrapType.PLATES: 2},
}
# --

class GameInstance:
    """
    Manages the state and logic for a single, isolated game.
    """
    def __init__(self, game_id: str, participants: List[GameParticipant]):
        self.game_id = game_id
        self.state = GameState(game_id=game_id)
        
        print(f"Initializing GameInstance {game_id}...")
        
        # 1. Create and add players
        player_ids = list(range(1, len(participants) + 1))
        random.shuffle(player_ids)
        
        player_user_ids = []
        for i, p in enumerate(participants):
            player_state = PlayerState(
                user_id=p.user.id,
                username=p.user.username,
                player_id=player_ids[i],
                is_host=(p.user.id == participants[0].user.id) # First participant is host
            )
            self.state.players[p.user.id] = player_state
            player_user_ids.append(p.user.id)
        
        # 2. Set initiative order
        # For setup, we just shuffle the user_ids.
        self.state.initiative_queue = player_user_ids
        random.shuffle(self.state.initiative_queue)
        
        # 3. Set first player
        self.state.first_player = self.state.initiative_queue[0]
        
        # 4. Create decks (v1.8: 5 cards per player per era)
        num_players = len(participants)
        self.state.threat_decks[1] = create_threat_deck(1, num_players)
        self.state.threat_decks[2] = create_threat_deck(2, num_players)
        self.state.threat_decks[3] = create_threat_deck(3, num_players)
        
        self.state.market.upgrade_deck = create_upgrade_deck()
        self.state.market.arsenal_deck = create_arsenal_deck()
        
        self.state.add_log(f"Game {game_id} created with {num_players} players.")
        
        # 5. Start the first phase
        self._start_wilderness_phase()

    def get_state(self, user_id: str) -> Dict[str, Any]:
        """
        Returns the appropriate redacted state for the given user.
        """
        return self.state.get_redacted_state(user_id)

    # --- Player Connection ---

    def on_player_connect(self, user_id: str):
        """Mark a player as connected."""
        player = self.state.get_player(user_id)
        if player:
            player.is_connected = True
            self.state.add_log(f"{player.username} has reconnected.")
            return True
        return False

    def on_player_disconnect(self, user_id: str):
        """Mark a player as disconnected."""
        player = self.state.get_player(user_id)
        if player:
            player.is_connected = False
            self.state.add_log(f"{player.username} has disconnected.")
            # TODO: Handle auto-readiness or skipping turns
            return True
        return False

    # --- Core Game Loop (State Machine) ---

    def _advance_phase(self):
        """
        Advances the game to the next phase.
        This is the main state machine.
        """
        current_phase = self.state.phase
        
        # Determine next phase
        if current_phase == GamePhase.WILDERNESS:
            self._start_planning_phase()
        elif current_phase == GamePhase.PLANNING:
            self._start_attraction_phase()
        elif current_phase == GamePhase.ATTRACTION:
            self._start_defense_phase()
        elif current_phase == GamePhase.DEFENSE:
            self._start_action_phase()
        elif current_phase == GamePhase.ACTION:
            self._start_cleanup_phase()
        elif current_phase == GamePhase.CLEANUP:
            # Check for game end (15 rounds)
            if self.state.round == 15:
                self._end_game()
            else:
                self.state.round += 1
                # Check for Era change
                if self.state.round == 6: # Start Era 2 (Twilight)
                    self.state.era = 2
                    self._start_intermission_phase()
                elif self.state.round == 11: # Start Era 3 (Night)
                    self.state.era = 3
                    self._start_intermission_phase()
                else:
                    self._start_wilderness_phase() # Start next round
        
        elif current_phase == GamePhase.INTERMISSION:
            # After intermission, always start Wilderness
            self._start_wilderness_phase()
            
        elif current_phase == GamePhase.GAME_OVER:
            # Do nothing
            pass

    # --- Phase: WILDERNESS ---
    
    def _start_wilderness_phase(self):
        """
        Phase 1: Draw new threats for the round.
        """
        self.state.phase = GamePhase.WILDERNESS
        self.state.add_log(f"--- Round {self.state.round} (Era {self.state.era}) ---")
        self.state.add_log("Phase: WILDERNESS. New threats emerge...")
        
        # 1. Clear old threats
        self.state.current_threats = []
        
        # 2. Draw new threats
        num_players = len(self.state.get_active_players_in_order())
        num_threats = num_players + 1
        
        threat_deck = self.state.threat_decks.get(self.state.era)
        if not threat_deck:
            self.state.add_log(f"Error: No threat deck found for Era {self.state.era}!")
            # Handle error, maybe end game?
            return
            
        drawn_threats = []
        for _ in range(num_threats):
            if not threat_deck:
                self.state.add_log("Threat deck is empty!")
                break
            drawn_threats.append(threat_deck.pop(0))
            
        self.state.current_threats = drawn_threats
        
        for threat in drawn_threats:
            self.state.add_log(f"  > {threat.name} appears!")
            
        # 3. Advance to next phase
        self._advance_phase()

    # --- Phase: PLANNING ---

    def _start_planning_phase(self):
        """
        Phase 2: Players secretly choose Lure and Action cards.
        """
        self.state.phase = GamePhase.PLANNING
        self.state.add_log("Phase: PLANNING. Choose your Lure and Action.")
        
        # 1. Clear old plans
        self.state.player_plans = {}
        
        # 2. Create new empty plans for all players
        for player in self.state.get_all_players_in_order(): # Use all, even disconnected
            self.state.player_plans[player.user_id] = PlayerPlans()
            # Reset round-specific flags
            player.attracted_threat_id = None
            player.defense_result = None
            player.action_prevented = False # v1.8
            
    def submit_plan(self, user_id: str, lure_card: str, action_card: str) -> bool:
        """
        Player submits their plan for the round.
        """
        if self.state.phase != GamePhase.PLANNING:
            return False
            
        player = self.state.get_player(user_id)
        plan = self.state.player_plans.get(user_id)
        
        if not player or not plan or plan.ready:
            return False # Player not found or already ready
            
        # Validate cards
        try:
            lure = LureCard(lure_card)
            action = SurvivorActionCard(action_card)
        except ValueError:
            self.state.add_log(f"Invalid plan submitted by {player.username}.")
            return False
            
        if lure not in player.lure_hand or action not in player.action_hand:
            self.state.add_log(f"Plan validation failed for {player.username}.")
            return False
            
        # Set plan
        plan.lure = lure
        plan.action = action
        plan.ready = True
        
        self.state.add_log(f"{player.username} is ready.", player_id=user_id, is_public=False)
        
        # Check if all players are ready
        if self._are_all_players_ready("plans"):
            self._advance_phase()
            
        return True

    # --- Phase: ATTRACTION ---
    
    def _start_attraction_phase(self):
        """
        Phase 3: Reveal Lures, Attract Threats.
        """
        self.state.phase = GamePhase.ATTRACTION
        self.state.add_log("Phase: ATTRACTION. Revealing plans...")
        
        # 1. Reveal all Lure and Action cards
        for player in self.state.get_active_players_in_order():
            plan = self.state.player_plans.get(player.user_id)
            if plan:
                self.state.add_log(f"{player.username} planned: {plan.lure.value} & {plan.action.value}")
                # Set last round's action (v1.8)
                player.last_round_lure = plan.lure
                player.last_round_action = plan.action
        
        # 2. Setup attraction state
        self.state.attraction_phase_state = "threat_attraction"
        self.state.available_threat_ids = [t.id for t in self.state.current_threats]
        self.state.unassigned_player_ids = self.state.initiative_queue[:]
        
        # 3. Start the first attraction turn
        self._start_next_attraction_turn()
        
    def _start_next_attraction_turn(self):
        """
        Finds the next player who needs to attract a threat.
        """
        if not self.state.unassigned_player_ids:
            # Everyone has attracted (or tried to).
            # This should ideally not happen, logic continues from attract_threat
            self.state.add_log("Error: _start_next_attraction_turn called with no unassigned players.")
            return

        next_player_id = self.state.unassigned_player_ids[0]
        player = self.state.get_player(next_player_id)
        
        if not player or not player.is_connected:
            # TODO: Handle disconnected player attraction
            self.state.add_log(f"{player.username if player else 'Player'} is disconnected, skipping attraction.")
            self.state.unassigned_player_ids.pop(0)
            if not self.state.unassigned_player_ids:
                self._advance_phase() # All done
            else:
                self._start_next_attraction_turn() # Try next
            return
            
        self.state.attraction_turn_player_id = next_player_id
        self.state.add_log(f"It's {player.username}'s turn to attract a threat.")

    def attract_threat(self, user_id: str, threat_id: str) -> bool:
        """
        Player attempts to attract a specific threat.
        """
        if self.state.phase != GamePhase.ATTRACTION or \
           self.state.attraction_phase_state != "threat_attraction" or \
           self.state.attraction_turn_player_id != user_id:
            return False
            
        player = self.state.get_player(user_id)
        threat = self.state.get_threat_by_id(threat_id)
        plan = self.state.player_plans.get(user_id)
        
        if not player or not threat or not plan:
            self.state.add_log(f"Attraction failed (invalid state).")
            return False
            
        if threat.id not in self.state.available_threat_ids:
            self.state.add_log(f"Attraction failed: {threat.name} is not available.")
            return False
            
        # Validation: Check lure strength
        player_lure_strength = player.get_lure_strength(plan.lure)
        
        target_stat_map = {
            LureCard.BLOODY_RAGS: threat.ferocity,
            LureCard.STRANGE_NOISES: threat.cunning,
            LureCard.FALLEN_FRUIT: threat.mass,
        }
        target_stat = target_stat_map.get(plan.lure, 0)
        
        if player_lure_strength < target_stat:
            self.state.add_log(f"Attraction failed: {player.username}'s Lure ({player_lure_strength}) is too weak for {threat.name} ({target_stat}).")
            return False
            
        # --- SUCCESS ---
        self.state.add_log(f"{player.username} attracts {threat.name}!")
        player.attracted_threat_id = threat.id
        
        # Remove threat and player from attraction pool
        self.state.available_threat_ids.remove(threat.id)
        self.state.unassigned_player_ids.remove(user_id)
        
        # Check for "On Attract:" abilities
        if "On Attract: discard 1" in threat.ability:
            scrap_type_str = threat.ability.split(" ")[-1] # "Red", "Blue", "Green"
            scrap_map = {"Red": ScrapType.PARTS, "Blue": ScrapType.WIRING, "Green": ScrapType.PLATES}
            scrap_type = scrap_map.get(scrap_type_str)
            
            if scrap_type and player.scrap[scrap_type] > 0:
                player.scrap[scrap_type] -= 1
                self.state.add_log(f"{threat.name}'s ability forces {player.username} to discard 1 {scrap_type.value}!")
            else:
                self.state.add_log(f"{player.username} has no {scrap_type_str} scrap to discard.")

        # Check if phase is over
        if not self.state.available_threat_ids or not self.state.unassigned_player_ids:
            # Phase is over
            self.state.attraction_turn_player_id = None
            
            # Assign remaining threat to last player
            if len(self.state.unassigned_player_ids) == 1 and len(self.state.available_threat_ids) == 1:
                last_player_id = self.state.unassigned_player_ids[0]
                last_threat_id = self.state.available_threat_ids[0]
                last_player = self.state.get_player(last_player_id)
                last_threat = self.state.get_threat_by_id(last_threat_id)
                
                if last_player and last_threat:
                    self.state.add_log(f"{last_threat.name} is left over and goes to {last_player.username}.")
                    last_player.attracted_threat_id = last_threat.id
                    # Check "On Attract" for this player too
                    if "On Attract: discard 1" in last_threat.ability:
                         scrap_type_str = last_threat.ability.split(" ")[-1]
                         scrap_map = {"Red": ScrapType.PARTS, "Blue": ScrapType.WIRING, "Green": ScrapType.PLATES}
                         scrap_type = scrap_map.get(scrap_type_str)
                         if scrap_type and last_player.scrap[scrap_type] > 0:
                             last_player.scrap[scrap_type] -= 1
                             self.state.add_log(f"{last_threat.name}'s ability forces {last_player.username} to discard 1 {scrap_type.value}!")
                         else:
                             self.state.add_log(f"{last_player.username} has no {scrap_type_str} scrap to discard.")
            
            self._advance_phase()
        else:
            # Start next turn
            self._start_next_attraction_turn()
            
        return True

    # --- Phase: DEFENSE ---

    def _start_defense_phase(self):
        """
        Phase 4: Players spend scrap to defend against their threat.
        """
        self.state.phase = GamePhase.DEFENSE
        self.state.add_log("Phase: DEFENSE. Spend scrap to defend!")
        
        # 1. Clear old defenses
        self.state.player_defenses = {}
        
        # 2. Create new empty defenses
        for player in self.state.get_all_players_in_order():
            self.state.player_defenses[player.user_id] = PlayerDefense()
            
            # Auto-ready players with no threat
            if not player.attracted_threat_id:
                self.state.player_defenses[player.user_id].ready = True
                self.state.add_log(f"{player.username} has no threat to defend against.")
        
        # Check if all players are ready (in case no one attracted a threat)
        if self._are_all_players_ready("defenses"):
            self._advance_phase()

    def submit_defense(self, user_id: str, scrap_spent: Dict[str, int], arsenal_ids: List[str]) -> bool:
        """
        Player submits their defense plan.
        """
        if self.state.phase != GamePhase.DEFENSE:
            return False
            
        player = self.state.get_player(user_id)
        defense = self.state.player_defenses.get(user_id)
        
        if not player or not defense or defense.ready:
            return False # Already ready
            
        if not player.attracted_threat_id:
            self.state.add_log(f"Error: {player.username} submitted defense with no threat.")
            return False
            
        # 1. Validate Scrap
        valid_scrap: Dict[ScrapType, int] = {}
        total_spent_scrap = 0
        for scrap_str, amount in scrap_spent.items():
            try:
                scrap_type = ScrapType(scrap_str)
                amount = int(amount)
            except (ValueError, TypeError):
                self.state.add_log(f"Invalid scrap type or amount from {player.username}.")
                return False
                
            if amount < 0:
                self.state.add_log(f"Cannot spend negative scrap.")
                return False
                
            if player.scrap[scrap_type] < amount:
                self.state.add_log(f"{player.username} does not have {amount} {scrap_type.value}.")
                return False
            
            if amount > 0:
                valid_scrap[scrap_type] = amount
                total_spent_scrap += amount
        
        # 2. Validate Arsenal Cards (NEW)
        player_arsenal_ids = {card.id for card in player.arsenal_hand}
        for card_id in arsenal_ids:
            if card_id not in player_arsenal_ids:
                self.state.add_log(f"Invalid defense: {player.username} tried to use arsenal card {card_id} they don't own.")
                return False
        
        # --- SUCCESS ---
        
        # 3. Set Defense
        defense.scrap_spent = valid_scrap
        defense.arsenal_cards_used = arsenal_ids # NEW
        defense.ready = True
        
        self.state.add_log(f"{player.username} is ready for action.", player_id=user_id, is_public=False)
        
        # 4. Check if all players are ready
        if self._are_all_players_ready("defenses"):
            self._resolve_all_defenses()
            self._advance_phase()
            
        return True

    def _resolve_all_defenses(self):
        """
        Helper: Called when all players are ready for Defense.
        Calculates outcome for all players.
        """
        self.state.add_log("All players are ready. Resolving defenses...")
        
        for player in self.state.get_active_players_in_order():
            defense = self.state.player_defenses.get(player.user_id)
            plan = self.state.player_plans.get(player.user_id)
            threat = self.state.get_threat_by_id(player.attracted_threat_id)
            
            if not defense or not plan or not threat:
                # Player had no threat or is disconnected
                continue

            # 1. Consume Scrap
            for scrap_type, amount in defense.scrap_spent.items():
                player.scrap[scrap_type] -= amount
            
            # 2. Get player's total defense (Base + Scrap + Arsenal)
            # This now includes Arsenal card boosts
            total_defense = self._calculate_total_defense(player, plan, defense)
            
            # 3. Check for rule-bending cards (Lure to Weakness, Corrosive Sludge)
            # We will skip this for the v1.9 implementation as discussed.
            # This is where logic for ADRENALINE, LURE_TO_WEAKNESS, etc. would go.
            
            # Get the card objects
            used_arsenal_cards = [
                card for card in player.arsenal_hand 
                if card.id in defense.arsenal_cards_used
            ]

            # 4. Determine outcome
            outcome = self._check_defense_outcome(player, total_defense, threat)
            
            # 5. Apply outcome
            player.defense_result = outcome.get("result", "FAIL") # "FAIL", "DEFEND", "KILL"
            
            # --- Handle "Adrenaline" Hack ---
            # If we were to implement the "predictive hack" for Adrenaline:
            has_adrenaline = any(c.special_effect_id == "ADRENALINE" for c in used_arsenal_cards)
            if player.defense_result == "FAIL" and has_adrenaline:
                player.defense_result = "DEFEND" # Override FAIL
                self.state.add_log(f"{player.username} uses Adrenaline to ignore the consequences!")
                
            
            if player.defense_result == "FAIL":
                self.state.add_log(f"{player.username} FAILED to defend against {threat.name}!")
                player.injuries += 1
                self.state.add_log(f"{player.username} gains 1 Injury! (Total: {player.injuries})")
                
                # Check "On Fail:" abilities
                if "On Fail: gain 1 Injury" in threat.ability:
                    player.injuries += 1
                    self.state.add_log(f"{threat.name}'s ability causes 1 additional Injury! (Total: {player.injuries})")
                if "On Fail: lose next Action" in threat.ability:
                    player.action_prevented = True
                    self.state.add_log(f"{threat.name}'s ability prevents {player.username}'s action!")
            
            elif player.defense_result == "DEFEND":
                self.state.add_log(f"{player.username} successfully DEFENDED against {threat.name}!")
                # No injuries, but no trophy.
            
            elif player.defense_result == "KILL":
                self.state.add_log(f"{player.username} KILLED {threat.name}!")
                player.trophies.append(threat.name)
                # TODO: Handle reward
                self.state.add_log(f"Reward: {threat.reward}") # Placeholder
                
            
            # 6. Consume/Discard Arsenal Cards (NEW)
            cards_to_keep = []
            cards_to_discard = []
            
            for card in player.arsenal_hand:
                if card.id not in defense.arsenal_cards_used:
                    cards_to_keep.append(card)
                    continue

                # Card was used
                is_kill = player.defense_result == "KILL"
                
                # Handle conditional "return to hand"
                if is_kill and card.special_effect_id in ["RECYCLER_NET", "BOAR_SPEAR"]:
                    cards_to_keep.append(card) # Return to hand
                    self.state.add_log(f"{player.username}'s {card.name} returns to hand!")
                    continue
                    
                # Handle multi-use "charges"
                if card.charges is not None:
                    card.charges -= 1
                    if card.charges > 0:
                        cards_to_keep.append(card) # Keep in hand, but with fewer charges
                        self.state.add_log(f"{player.username}'s {card.name} has {card.charges} charges left.")
                    else:
                        cards_to_discard.append(card) # No charges left
                        self.state.add_log(f"{player.username}'s {card.name} is out of charges and discarded.")
                    continue
                    
                # Handle "Adrenaline" (if using the hack)
                if card.special_effect_id == "ADRENALINE":
                     # It's only consumed if it was *actually used* (i.e., changed FAIL to DEFEND)
                     if player.defense_result == "DEFEND" and outcome.get("result") == "FAIL":
                         cards_to_discard.append(card)
                         self.state.add_log(f"{player.username}'s {card.name} is consumed.")
                     else:
                         cards_to_keep.append(card) # Not used, return to hand
                     continue

                # All other cards are one-use
                cards_to_discard.append(card)
                
            player.arsenal_hand = cards_to_keep
            player.arsenal_discard.extend(cards_to_discard)


    def _calculate_total_defense(self, player: PlayerState, plan: PlayerPlans, defense: PlayerDefense) -> Dict[ScrapType, int]:
        """
        Calculates a player's total defense, including base, scrap, and arsenal.
        """
        # 1. Get base defense from action
        base_defense = BASE_DEFENSE_FROM_ACTION.get(plan.action, {}).copy()
        
        # 2. Add spent scrap
        for scrap_type, amount in defense.scrap_spent.items():
            base_defense[scrap_type] = base_defense.get(scrap_type, 0) + amount
            
        # 3. Add Upgrade card logic
        # TODO
        
        # 4. Add Arsenal Card logic (NEW)
        arsenal_cards = [
            card for card in player.arsenal_hand 
            if card.id in defense.arsenal_cards_used
        ]
        
        for card in arsenal_cards:
            if card.defense_boost:
                for scrap_type, boost in card.defense_boost.items():
                    base_defense[scrap_type] = base_defense.get(scrap_type, 0) + boost

        return base_defense

    def _check_defense_outcome(
        self,
        player: PlayerState, 
        total_defense: Dict[ScrapType, int], 
        threat: ThreatCard
    ) -> Dict[str, Any]:
        """
        Checks a player's defense against a threat and returns the outcome.
        
        Returns: {
            "result": "FAIL" | "DEFEND" | "KILL",
            "target_stat": "ferocity" | "cunning" | "mass",
            "kill_stat": "ferocity" | "cunning" | "mass" | None
        }
        """
        
        # 1. Determine Target Stat (for "DEFEND" calculation)
        # This is the HIGHEST stat on the threat
        stats = {
            "ferocity": threat.ferocity,
            "cunning": threat.cunning,
            "mass": threat.mass
        }
        target_stat_name = max(stats, key=stats.get)
        target_stat_value = stats[target_stat_name]
        
        # Map stat name to scrap type
        stat_to_scrap_map = {
            "ferocity": ScrapType.PARTS,
            "cunning": ScrapType.WIRING,
            "mass": ScrapType.PLATES
        }
        target_scrap_type = stat_to_scrap_map[target_stat_name]
        
        # 2. Calculate effective defense against target stat
        player_defense_value = total_defense.get(target_scrap_type, 0)
        
        # Apply resistance / immunity
        if target_scrap_type in threat.immune:
            player_defense_value = 0
        elif target_scrap_type in threat.resistant:
            player_defense_value = math.ceil(player_defense_value / 2)
            
        # 3. Check for DEFEND
        if player_defense_value < target_stat_value:
            return {"result": "FAIL", "target_stat": target_stat_name, "kill_stat": None}
            
        # --- Player has DEFENDED ---
        # Now, check for KILL
        
        # 4. Determine Kill Stat (for "KILL" calculation)
        # This is the LOWEST stat on the threat
        # (Handle ties by picking one, e.g., ferocity)
        stats_list = sorted(stats.items(), key=lambda item: item[1])
        kill_stat_name = stats_list[0][0]
        kill_stat_value = stats_list[0][1]
        kill_scrap_type = stat_to_scrap_map[kill_stat_name]

        # 5. Calculate effective defense against kill stat
        player_kill_defense_value = total_defense.get(kill_scrap_type, 0)
        
        # Apply resistance / immunity
        if kill_scrap_type in threat.immune:
            player_kill_defense_value = 0
        elif kill_scrap_type in threat.resistant:
            player_kill_defense_value = math.ceil(player_kill_defense_value / 2)
            
        # 6. Check for KILL
        if player_kill_defense_value >= kill_stat_value:
            return {"result": "KILL", "target_stat": target_stat_name, "kill_stat": kill_stat_name}
        else:
            return {"result": "DEFEND", "target_stat": target_stat_name, "kill_stat": kill_stat_name}


    # --- Phase: ACTION ---

    def _start_action_phase(self):
        """
        Phase 5: Players take their actions in initiative order.
        """
        self.state.phase = GamePhase.ACTION
        self.state.add_log("Phase: ACTION. Taking actions...")
        
        # 1. Setup action state
        self.state.action_turn_player_id = None
        
        # 2. Start the first action turn
        self._start_next_action_turn()

    def _start_next_action_turn(self):
        """
        Finds the next player who needs to take their action.
        """
        active_players = self.state.get_active_players_in_order()
        
        current_turn_player_id = self.state.action_turn_player_id
        
        if not current_turn_player_id:
            # This is the first action of the phase
            next_player = active_players[0]
        else:
            # Find the next player in the initiative queue
            try:
                current_index = self.state.initiative_queue.index(current_turn_player_id)
                # Find the next *active* player
                next_player = None
                for i in range(1, len(active_players) + 1):
                    next_index_in_queue = (current_index + i) % len(self.state.initiative_queue)
                    next_player_id = self.state.initiative_queue[next_index_in_queue]
                    
                    # Check if this player is in the active list
                    found = next((p for p in active_players if p.user_id == next_player_id), None)
                    if found:
                        next_player = found
                        break
                        
                if not next_player: # Should not happen if active_players > 0
                     self.state.add_log("Error: Could not find next active player.")
                     self._advance_phase()
                     return
                
            except ValueError:
                self.state.add_log("Error: Current action player not in initiative queue.")
                self._advance_phase() # Fail safe
                return

        if not next_player:
             self.state.add_log("No active players to take actions.")
             self._advance_phase()
             return

        # We have the next player.
        self.state.action_turn_player_id = next_player.user_id
        
        plan = self.state.player_plans.get(next_player.user_id)
        
        if not plan:
            self.state.add_log(f"Error: {next_player.username} has no plan.")
            self._process_action_turn_end() # Skip them
            return

        # Check for "On Fail: lose next Action" (v1.8)
        if next_player.action_prevented:
            self.state.add_log(f"{next_player.username}'s action ({plan.action.value}) is PREVENTED!")
            next_player.action_prevented = False # Reset flag
            self._process_action_turn_end() # Skip to end of their turn
            return

        # --- Player takes their action automatically ---
        self.state.add_log(f"{next_player.username} takes their action: {plan.action.value}")
        
        action = plan.action
        
        if action == SurvivorActionCard.SCAVENGE:
            # Gain 2 Red, 2 Blue, 2 Green
            next_player.scrap[ScrapType.PARTS] += 2
            next_player.scrap[ScrapType.WIRING] += 2
            next_player.scrap[ScrapType.PLATES] += 2
            self.state.add_log(f"{next_player.username} gains 2 of each scrap type.")
        
        elif action == SurvivorActionCard.FORTIFY:
            # Gain 5 Red, 1 Blue
            next_player.scrap[ScrapType.PARTS] += 5
            next_player.scrap[ScrapType.WIRING] += 1
            self.state.add_log(f"{next_player.username} gains 5 PARTS and 1 WIRING.")
            
        elif action == SurvivorActionCard.ARMORY_RUN:
            # Gain 1 Green, 5 Blue
            next_player.scrap[ScrapType.PLATES] += 1
            next_player.scrap[ScrapType.WIRING] += 5
            self.state.add_log(f"{next_player.username} gains 1 PLATES and 5 WIRING.")
            
        elif action == SurvivorActionCard.SCHEME:
            # Gain 1 Red, 1 Green, and +1 Initiative
            next_player.scrap[ScrapType.PARTS] += 1
            next_player.scrap[ScrapType.PLATES] += 1
            self.state.add_log(f"{next_player.username} gains 1 PARTS and 1 PLATES.")
            
            # Move player up one slot in initiative
            queue = self.state.initiative_queue
            try:
                idx = queue.index(next_player.user_id)
                if idx > 0: # Cannot go past first player
                    # Swap with player before
                    prev_player_id = queue[idx - 1]
                    queue[idx - 1] = next_player.user_id
                    queue[idx] = prev_player_id
                    self.state.add_log(f"{next_player.username} moves up in the initiative order!")
            except ValueError:
                pass # Player not in queue?
                
        # After action is resolved, process end of turn
        self._process_action_turn_end()

    def _process_action_turn_end(self):
        """
        Helper: Checks if all actions are done, or starts next turn.
        """
        current_turn_player_id = self.state.action_turn_player_id
        
        # Check if this was the last player
        active_players = self.state.get_active_players_in_order()
        if not active_players:
            self._advance_phase() # No one left
            return
            
        last_player_in_initiative = active_players[-1]
        
        if current_turn_player_id == last_player_in_initiative.user_id:
            # All actions for the round are complete
            self.state.action_turn_player_id = None
            self.state.add_log("All actions complete.")
            self._advance_phase()
        else:
            # Start the next player's turn
            self._start_next_action_turn()
            
    # --- Phase: CLEANUP ---

    def _start_cleanup_phase(self):
        """
        Phase 6: Pass initiative, check for game end.
        """
        self.state.phase = GamePhase.CLEANUP
        self.state.add_log("Phase: CLEANUP. Passing initiative...")
        
        # 1. Clear "last round" UI flags
        for player in self.state.get_all_players_in_order():
            player.last_round_action = None
            player.last_round_lure = None

        # 2. Pass first player token
        current_first_player = self.state.first_player
        try:
            idx = self.state.initiative_queue.index(current_first_player)
            next_idx = (idx + 1) % len(self.state.initiative_queue)
            self.state.first_player = self.state.initiative_queue[next_idx]
            
            new_first_player = self.state.get_player(self.state.first_player)
            if new_first_player:
                self.state.add_log(f"{new_first_player.username} is now the first player.")
                
        except ValueError:
            self.state.add_log("Error: First player not in initiative queue.")
            # Reset to first in list as a failsafe
            if self.state.initiative_queue:
                self.state.first_player = self.state.initiative_queue[0]
            
        
        # 3. Advance phase (which will check for game end/next round)
        self._advance_phase()

    # --- Phase: INTERMISSION ---
    
    def _start_intermission_phase(self):
        """
        Phase 7 (v1.8): Occurs after rounds 5 and 10.
        Players buy Upgrades and Arsenal cards.
        """
        self.state.phase = GamePhase.INTERMISSION
        self.state.add_log(f"--- INTERMISSION (End of Era {self.state.era - 1}) ---")
        self.state.add_log("Phase: INTERMISSION. Time to buy cards.")
        
        # 1. Refill markets
        self._refill_market(self.state.market.upgrade_deck, self.state.market.upgrade_market, 5)
        self._refill_market(self.state.market.arsenal_deck, self.state.market.arsenal_market, 5)

        # 2. Setup Intermission state
        # Players buy in REVERSE initiative order
        self.state.intermission_turn_player_id = self.state.initiative_queue[-1]
        self.state.intermission_market_purchases = {}
        for pid in self.state.players:
            self.state.intermission_market_purchases[pid] = 0 # 0 purchases so far
            
        player = self.state.get_player(self.state.intermission_turn_player_id)
        if player:
            self.state.add_log(f"Starting with {player.username} (last in initiative).")

    def _refill_market(self, deck: List, market_list: List, size: int):
        """Helper to refill a market list from a deck."""
        while len(market_list) < size:
            if not deck:
                self.state.add_log("Market deck is empty!")
                break
            market_list.append(deck.pop(0))

    def buy_market_card(self, user_id: str, card_id: str, card_type: str) -> bool:
        """
        Player attempts to buy a card from the Intermission market.
        """
        if self.state.phase != GamePhase.INTERMISSION or \
           self.state.intermission_turn_player_id != user_id:
            return False
            
        player = self.state.get_player(user_id)
        if not player:
            return False
            
        # Check purchase limit (max 2)
        purchases_made = self.state.intermission_market_purchases.get(user_id, 0)
        if purchases_made >= 2:
            self.state.add_log(f"{player.username} has already made 2 purchases.")
            return False
            
        # Find the card
        source_market: List[UpgradeCard | ArsenalCard]
        if card_type == "upgrade":
            source_market = self.state.market.upgrade_market
        elif card_type == "arsenal":
            source_market = self.state.market.arsenal_market
        else:
            return False
            
        card_to_buy: Optional[UpgradeCard | ArsenalCard] = None
        for card in source_market:
            if card.id == card_id:
                card_to_buy = card
                break
                
        if not card_to_buy:
            self.state.add_log(f"Card {card_id} not found in {card_type} market.")
            return False
            
        # Check cost
        for scrap_type, cost in card_to_buy.cost.items():
            if player.scrap.get(scrap_type, 0) < cost:
                self.state.add_log(f"{player.username} cannot afford {card_to_buy.name}.")
                return False
                
        # --- SUCCESS ---
        
        # 1. Pay cost
        for scrap_type, cost in card_to_buy.cost.items():
            player.scrap[scrap_type] -= cost
            
        # 2. Remove from market
        source_market.remove(card_to_buy)
        
        # 3. Add to player
        if isinstance(card_to_buy, UpgradeCard):
            player.upgrades.append(card_to_buy)
            self.state.add_log(f"{player.username} bought Upgrade: {card_to_buy.name}")
        elif isinstance(card_to_buy, ArsenalCard):
            player.arsenal_hand.append(card_to_buy)
            self.state.add_log(f"{player.username} bought Arsenal: {card_to_buy.name}")
            
        # 4. Increment purchase count
        self.state.intermission_market_purchases[user_id] = purchases_made + 1
        
        # 5. Refill the market
        if card_type == "upgrade":
            self._refill_market(self.state.market.upgrade_deck, self.state.market.upgrade_market, 5)
        else:
            self._refill_market(self.state.market.arsenal_deck, self.state.market.arsenal_market, 5)
        
        return True

    def pass_intermission_turn(self, user_id: str) -> bool:
        """
        Player passes their turn to buy.
        """
        if self.state.phase != GamePhase.INTERMISSION or \
           self.state.intermission_turn_player_id != user_id:
            return False
            
        player = self.state.get_player(user_id)
        if not player:
            return False
            
        self.state.add_log(f"{player.username} passes their turn.")
        
        # Find next player (in reverse initiative)
        try:
            current_idx = self.state.initiative_queue.index(user_id)
            
            if current_idx == 0:
                # This was the first player in initiative (last to buy)
                # Phase is over.
                self.state.add_log("Intermission buying phase is over.")
                self.state.intermission_turn_player_id = None
                self._advance_phase()
            else:
                # Get previous player in queue
                next_player_id = self.state.initiative_queue[current_idx - 1]
                self.state.intermission_turn_player_id = next_player_id
                next_player = self.state.get_player(next_player_id)
                if next_player:
                    self.state.add_log(f"It's now {next_player.username}'s turn to buy.")
                
        except ValueError:
            self.state.add_log("Error: Intermission player not in queue.")
            self.state.intermission_turn_player_id = None
            self._advance_phase() # Failsafe
            
        return True

    # --- Phase: GAME OVER ---

    def _end_game(self):
        """
        Game Over: Calculate winner.
        """
        self.state.phase = GamePhase.GAME_OVER
        self.state.add_log("--- GAME OVER ---")
        
        active_players = self.state.get_active_players_in_order()
        if not active_players:
            self.state.add_log("No active players to determine a winner.")
            return
            
        # Winner is player with FEWEST injuries.
        # Tie-breaker: most trophies.
        # Tie-breaker 2: most scrap.
        # Tie-breaker 3: (Not in rules) highest initiative (last)
        
        sorted_players = sorted(
            active_players,
            key=lambda p: (
                p.injuries,           # 1. Fewest injuries
                -len(p.trophies),     # 2. Most trophies
                -p.get_total_scrap()  # 3. Most scrap
            )
        )
        
        winner = sorted_players[0]
        self.state.winner = winner
        
        self.state.add_log(f"The winner is {winner.username}!")
        self.state.add_log("Final Standings:")
        for i, p in enumerate(sorted_players):
            self.state.add_log(
                f"  {i+1}. {p.username} (Injuries: {p.injuries}, Trophies: {len(p.trophies)}, Scrap: {p.get_total_scrap()})"
            )

    # --- Helper: Check Readiness ---

    def _are_all_players_ready(self, check_type: str) -> bool:
        """
        Checks if all *active* players are ready for a given phase.
        check_type: "plans" or "defenses"
        """
        
        if check_type == "plans":
            plans = self.state.player_plans
        elif check_type == "defenses":
            plans = self.state.player_defenses
        else:
            return False
            
        for player in self.state.get_active_players_in_order():
            plan = plans.get(player.user_id)
            if not plan or not plan.ready:
                return False # At least one active player is not ready
                
        return True
