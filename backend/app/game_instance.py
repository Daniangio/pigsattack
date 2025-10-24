"""
The GameInstance class.
This encapsulates all the rules and state for a single game.
It is the "server" for one match.
"""

from .game_core.models import (
    GameState, PlayerState, GamePhase, PlayerPlans, PlayerDefense,
    ScrapType, LureCard, SurvivorActionCard, ThreatCard, UpgradeCard, ArsenalCard
)
from .game_core.deck_factory import create_threat_deck, create_upgrade_deck, create_arsenal_deck
from typing import List, Dict, Any, Optional, cast
import random

# Import the server-level models only for type hinting the setup
from .models import GameParticipant 

# --- CONSTANTS ---
# From rules: "Armory Run adds +2 vs p", "Scavenge adds +2 vs k", etc.
ACTION_CARD_DEFENSE = {
    SurvivorActionCard.SCAVENGE: {ScrapType.PARTS: 0, ScrapType.WIRING: 2, ScrapType.PLATES: 0},
    SurvivorActionCard.FORTIFY: {ScrapType.PARTS: 0, ScrapType.WIRING: 0, ScrapType.PLATES: 2},
    SurvivorActionCard.ARMORY_RUN: {ScrapType.PARTS: 2, ScrapType.WIRING: 0, ScrapType.PLATES: 0},
    SurvivorActionCard.SCHEME: {ScrapType.PARTS: 1, ScrapType.WIRING: 1, ScrapType.PLATES: 1},
}
# ---

class GameInstance:
    """
    Manages the state and logic for a single, isolated game.
    """
    def __init__(self, game_id: str, participants: List[GameParticipant]):
        self.state = self._initialize_game_state(game_id, participants)
        self.state.add_log("Game initialized. Good luck, survivors.")
        
        # Start the first round
        self._start_round()

    def _initialize_game_state(self, game_id: str, participants: List[GameParticipant]) -> GameState:
        """Creates the starting GameState from the list of participants."""
        
        player_list = [p.user for p in participants]
        random.shuffle(player_list)
        
        initiative_queue = [p.id for p in player_list]
        first_player = initiative_queue[0]
        
        player_states = {}
        for user in player_list:
            player_states[user.id] = PlayerState(
                user_id=user.id,
                username=user.username,
                status="ACTIVE",
                hp=2
            )
        
        gs = GameState(
            game_id=game_id,
            players=player_states,
            initiative_queue=initiative_queue,
            first_player=first_player
        )

        gs.threat_deck = create_threat_deck()
        gs.upgrade_deck = create_upgrade_deck()
        gs.arsenal_deck = create_arsenal_deck()
        
        num_market_cards = max(2, len(player_list) - 1)
        for _ in range(num_market_cards):
            if gs.upgrade_deck:
                gs.market.upgrade_market.append(gs.upgrade_deck.pop(0))
            if gs.arsenal_deck:
                gs.market.arsenal_market.append(gs.arsenal_deck.pop(0))

        for player in gs.players.values():
            drawn = gs.scrap_pool.draw_random(2)
            for scrap in drawn:
                player.scrap[scrap] += 1

        gs.add_log(f"Setup complete. First player is {gs.players[first_player].username}.")
        return gs

    def get_state_for_player(self, user_id: str) -> Dict[str, Any]:
        """Gets the public, redacted game state for a specific player."""
        return self.state.get_player_public_state(user_id)

    def get_all_player_states(self) -> Dict[str, Dict[str, Any]]:
        """Gets the redacted state for every player in the game."""
        states = {}
        for user_id in self.state.players.keys():
            states[user_id] = self.get_state_for_player(user_id)
        return states

    # --- STATE MACHINE ---

    def _start_round(self):
        """Resets round-specific state and moves to Phase 1."""
        self.state.add_log(f"--- Round Start ---")
        self.state.current_threats = []
        self.state.player_plans = {
            p.user_id: PlayerPlans() for p in self.state.get_active_players()
        }
        self.state.player_defenses = {
            p.user_id: PlayerDefense() for p in self.state.get_active_players()
        }
        
        for p in self.state.players.values():
            p.assigned_threat = None
            p.defense_result = None
            p.action_choice_pending = None # Clear pending choice
        
        self.state.attraction_phase_state = None
        self.state.attraction_turn_player_id = None
        self.state.available_threat_ids = []
        self.state.unassigned_player_ids = []
        self.state.action_turn_player_id = None # Clear action turn
            
        self._advance_to(GamePhase.WILDERNESS)

    def _advance_to(self, phase: GamePhase):
        """Advances the state machine and triggers phase logic."""
        self.state.phase = phase
        self.state.add_log(f"Phase: {phase.value}")
        
        if phase == GamePhase.WILDERNESS:
            self._resolve_wilderness()
        elif phase == GamePhase.PLANNING:
            pass # Wait for player input
        elif phase == GamePhase.ATTRACTION:
            self._setup_attraction_phase()
        elif phase == GamePhase.DEFENSE:
            pass # Wait for player input
        elif phase == GamePhase.ACTION:
            self._start_action_phase() # Start turn-based action phase
        elif phase == GamePhase.CLEANUP:
            self._resolve_cleanup()
        elif phase == GamePhase.GAME_OVER:
            self._resolve_game_over()

    def _check_if_all_ready(self, phase: GamePhase) -> bool:
        """Checks if all active players are 'ready' for a given phase."""
        active_pids = [p.user_id for p in self.state.get_active_players()]
        
        if not active_pids:
             return True # No active players, so "all" are ready

        if phase == GamePhase.PLANNING:
            return all(
                self.state.player_plans[pid].ready for pid in active_pids
            )
        elif phase == GamePhase.DEFENSE:
            # Players without a threat are implicitly ready
            return all(
                self.state.player_defenses[pid].ready or 
                not self.state.players[pid].assigned_threat
                for pid in active_pids
            )
        return False

    # --- PLAYER ACTIONS ---

    def submit_plan(self, user_id: str, lure: LureCard, action: SurvivorActionCard) -> bool:
        """Player submits their Phase 2 cards."""
        if self.state.phase != GamePhase.PLANNING:
            return False
        if user_id not in self.state.player_plans:
            return False
        
        plans = self.state.player_plans[user_id]
        if plans.ready:
            return False
            
        plans.lure_card = lure
        plans.action_card = action
        plans.ready = True
        self.state.add_log(f"{self.state.players[user_id].username} has planned their turn.")
        
        if self._check_if_all_ready(GamePhase.PLANNING):
            self._advance_to(GamePhase.ATTRACTION)
            
        return True

    def submit_defense(self, user_id: str, scrap_spent: Dict[ScrapType, int], arsenal_ids: List[str]) -> bool:
        """Player submits their Phase 4 defense."""
        if self.state.phase != GamePhase.DEFENSE:
            return False
        if user_id not in self.state.player_defenses:
            return False
        
        player = self.state.players[user_id]
        defense = self.state.player_defenses[user_id]
        if defense.ready:
            return False
            
        # --- Validate scrap spent ---
        for scrap_type, amount in scrap_spent.items():
            if amount < 0 or amount > player.scrap.get(scrap_type, 0):
                self.state.add_log(f"Invalid scrap amount for {player.username}.")
                return False
        
        # TODO: Validate arsenal_ids

        # Deduct scrap from player
        for scrap_type, amount in scrap_spent.items():
            player.scrap[scrap_type] -= amount
        
        defense.scrap_spent = scrap_spent
        defense.arsenal_cards_used = arsenal_ids
        defense.ready = True
        self.state.add_log(f"{self.state.players[user_id].username} has submitted their defense.")
        
        if self._check_if_all_ready(GamePhase.DEFENSE):
            self._resolve_all_defenses()
            
            if self.state.phase != GamePhase.GAME_OVER:
                self._advance_to(GamePhase.ACTION)
        
        return True

    def select_threat(self, user_id: str, threat_id: Optional[str]) -> bool:
        """Player selects a threat during the Attraction phase."""
        if self.state.phase != GamePhase.ATTRACTION:
            return False
        if user_id != self.state.attraction_turn_player_id:
            return False
            
        player = self.state.players[user_id]
        plan = self.state.player_plans[user_id]
        available_threats = [
            t for t in self.state.current_threats 
            if t.id in self.state.available_threat_ids
        ]
        matching_threats = [
            t for t in available_threats 
            if t.lure == plan.lure_card
        ]

        if not threat_id:
            # Player trying to skip
            if self.state.attraction_phase_state == "FIRST_PASS" and matching_threats:
                self.state.add_log(f"Invalid action: {player.username} must select a matching threat.")
                return False
            elif self.state.attraction_phase_state == "SECOND_PASS" and available_threats:
                self.state.add_log(f"Invalid action: {player.username} must select a remaining threat.")
                return False
            
            self.state.add_log(f"{player.username} attracts no threat.")
            self.state.unassigned_player_ids.remove(user_id)
            self._find_next_attraction_turn()
            return True

        selected_threat = next((t for t in available_threats if t.id == threat_id), None)
        if not selected_threat:
            return False
            
        if self.state.attraction_phase_state == "FIRST_PASS":
            if selected_threat.lure != plan.lure_card:
                self.state.add_log(f"Invalid action: {player.username} must select a matching threat.")
                return False
        
        player.assigned_threat = selected_threat
        self.state.available_threat_ids.remove(threat_id)
        self.state.unassigned_player_ids.remove(user_id)
        self.state.add_log(f"{player.username} attracts {selected_threat.name}.")
        
        self._find_next_attraction_turn()
        return True

    def submit_action_choice(self, user_id: str, choice: Dict[str, Any]) -> bool:
        """Player submits their choice for their Action card."""
        if self.state.phase != GamePhase.ACTION:
            return False
        if user_id != self.state.action_turn_player_id:
            return False

        player = self.state.players[user_id]
        choice_type = choice.get("choice_type") # e.g., "SCAVENGE", "FORTIFY"
        
        if player.action_choice_pending != choice_type:
            self.state.add_log(f"Invalid action choice for {player.username}.")
            return False # Mismatch between pending action and choice

        # --- Resolve choice ---
        if choice_type == SurvivorActionCard.SCAVENGE.value:
            scraps = choice.get("scraps", [])
            # Rules: "Choose 2 Scrap of any type"
            # TODO: Add special_effect_id "SCAVENGERS_EYE" check for 3
            if len(scraps) != 2:
                return False # Invalid choice
            
            for scrap_str in scraps:
                scrap_type = ScrapType(scrap_str)
                player.scrap[scrap_type] += 1
                # Note: Scavenge takes from "general supply", not scrap pool
            self.state.add_log(f"{player.username} scavenges {', '.join(scraps)}.")

        elif choice_type == SurvivorActionCard.FORTIFY.value:
            card_id = choice.get("card_id")
            
            if not card_id:
                # Player *chose* the fallback
                self._resolve_action_fallback(player, "Fortify")
            else:
                # Player chose a specific card
                card, index = self.state.market.find_upgrade(card_id)
                
                if not card or index is None:
                    # Card doesn't exist (e.g., already bought)
                    self.state.add_log(f"Error: {player.username} tried to buy non-existent card {card_id}.")
                    return False # Wait for a new, valid action

                if not player.can_afford(card.cost):
                    # Card exists, but player can't afford it
                    self.state.add_log(f"Error: {player.username} cannot afford {card.name}.")
                    return False # Wait for a new, valid action
                
                # --- Purchase is valid ---
                player.pay_cost(card.cost)
                player.upgrades.append(card)
                self.state.market.upgrade_market.pop(index)
                self.state.scrap_pool.add_from_dict(card.cost)
                self.state.add_log(f"{player.username} fortifies with {card.name}.")

        elif choice_type == SurvivorActionCard.ARMORY_RUN.value:
            card_id = choice.get("card_id")

            if not card_id:
                # Player *chose* the fallback
                self._resolve_action_fallback(player, "Armory Run")
            else:
                # Player chose a specific card
                card, index = self.state.market.find_arsenal(card_id)

                if not card or index is None:
                    # Card doesn't exist
                    self.state.add_log(f"Error: {player.username} tried to buy non-existent card {card_id}.")
                    return False # Wait for new action

                if not player.can_afford(card.cost):
                    # Card exists, but player can't afford it
                    self.state.add_log(f"Error: {player.username} cannot afford {card.name}.")
                    return False # Wait for new action
                
                # --- Purchase is valid ---
                player.pay_cost(card.cost)
                player.arsenal_hand.append(card) # TODO: Check hand size
                self.state.market.arsenal_market.pop(index)
                self.state.scrap_pool.add_from_dict(card.cost)
                self.state.add_log(f"{player.username} runs to the armory for {card.name}.")

        else:
            return False # Should not happen

        # --- Conclude turn ---
        player.action_choice_pending = None
        self._find_next_action_turn()
        return True

    def _resolve_action_fallback(self, player: PlayerState, action_name: str):
        """Helper for Fortify/Armory Run fallback."""
        self.state.add_log(f"{player.username} could not {action_name}, triggers fallback.")
        drawn = self.state.scrap_pool.draw_random(2)
        for scrap in drawn:
            player.scrap[scrap] += 1
        self.state.add_log(f"{player.username} gains 2 random scrap.")

    def handle_player_leave(self, user_id: str, status: str):
        """Handles a player surrendering or disconnecting."""
        if user_id not in self.state.players:
            return
            
        player = self.state.players[user_id]
        if player.status == "ACTIVE":
            player.status = status
            self.state.add_log(f"{player.username} has {status.lower()}.")
            
            if self.state.phase == GamePhase.ATTRACTION and user_id == self.state.attraction_turn_player_id:
                if user_id in self.state.unassigned_player_ids:
                    self.state.unassigned_player_ids.remove(user_id)
                self.state.add_log(f"{player.username} left, advancing attraction turn.")
                self._find_next_attraction_turn()
            
            if self.state.phase == GamePhase.ACTION and user_id == self.state.action_turn_player_id:
                self.state.add_log(f"{player.username} left, advancing action turn.")
                self._find_next_action_turn()

            if self.state.phase == GamePhase.PLANNING:
                if self._check_if_all_ready(GamePhase.PLANNING):
                    self._advance_to(GamePhase.ATTRACTION)
            elif self.state.phase == GamePhase.DEFENSE:
                 if self._check_if_all_ready(GamePhase.DEFENSE):
                    self._resolve_all_defenses()
                    if self.state.phase != GamePhase.GAME_OVER:
                        self._advance_to(GamePhase.ACTION)

            self._check_for_game_over()


    # --- PHASE RESOLUTION LOGIC ---

    def _resolve_wilderness(self):
        """Phase 1: Reveal Threat cards."""
        num_threats = len(self.state.get_active_players())
        
        if num_threats == 0:
            self.state.add_log("No active players to reveal threats for.")
            self._check_for_game_over()
            return

        for _ in range(num_threats):
            if not self.state.threat_deck:
                self.state.add_log("Threat deck is empty!")
                break
            threat = self.state.threat_deck.pop(0)
            self.state.current_threats.append(threat)
            
        self.state.add_log(f"Revealed {len(self.state.current_threats)} threats from the wilderness.")
        self._advance_to(GamePhase.PLANNING)

    def _find_next_attraction_turn(self):
        """Finds the next player in the initiative queue who needs a threat."""
        
        next_player_id = None
        for pid in self.state.initiative_queue:
            player = self.state.players.get(pid)
            if player and player.status == "ACTIVE" and pid in self.state.unassigned_player_ids:
                next_player_id = pid
                break
        
        if next_player_id and self.state.attraction_phase_state == "FIRST_PASS":
            player = self.state.players[next_player_id]
            plan = self.state.player_plans[next_player_id]
            available_threats = [
                t for t in self.state.current_threats 
                if t.id in self.state.available_threat_ids
            ]
            matching_threats = [
                t for t in available_threats 
                if t.lure == plan.lure_card
            ]
            
            if not matching_threats:
                self.state.add_log(f"{player.username} has no matching lure and is skipped.")
                self.state.unassigned_player_ids.remove(next_player_id)
                self._find_next_attraction_turn() # Recursively find next
                return

        self.state.attraction_turn_player_id = next_player_id
        
        if not next_player_id:
            # No one is left to assign
            if self.state.attraction_phase_state == "FIRST_PASS":
                self.state.attraction_phase_state = "SECOND_PASS"
                self.state.add_log("All matching lures resolved. Starting Second Pass.")
                self.state.unassigned_player_ids = [
                    p.user_id for p in self.state.get_active_players() 
                    if not p.assigned_threat
                ]

                if not self.state.unassigned_player_ids or not self.state.available_threat_ids:
                    self.state.add_log("No players or no threats remaining for Second Pass. Skipping.")
                    self.state.attraction_turn_player_id = None
                    self._advance_to(GamePhase.DEFENSE)
                else:
                    self._find_next_attraction_turn()
            else:
                self.state.add_log("Attraction phase complete.")
                self.state.attraction_turn_player_id = None
                self._advance_to(GamePhase.DEFENSE)
        else:
            self.state.add_log(f"It is {self.state.players[next_player_id].username}'s turn to select a threat.")

    def _setup_attraction_phase(self):
        """Phase 3: Setup the Attraction phase state machine."""
        self.state.add_log("Resolving attraction...")
        self.state.attraction_phase_state = "FIRST_PASS"
        self.state.available_threat_ids = [t.id for t in self.state.current_threats]
        self.state.unassigned_player_ids = [p.user_id for p in self.state.get_active_players()]
        
        if not self.state.current_threats or not self.state.unassigned_player_ids:
            self.state.add_log("No threats or no active players. Skipping Attraction Phase.")
            self._advance_to(GamePhase.DEFENSE)
            return

        self._find_next_attraction_turn()

    def _calculate_total_defense(self, player: PlayerState, player_plan: PlayerPlans, player_defense: PlayerDefense) -> Dict[ScrapType, int]:
        """Calculates a player's total defense stats."""
        total_defense = {ScrapType.PARTS: 0, ScrapType.WIRING: 0, ScrapType.PLATES: 0}
        
        # 1. Base Defense from unused Action Cards
        used_action = player_plan.action_card
        
        # Check for Master Schemer upgrade
        has_master_schemer = any(u.special_effect_id == "MASTER_SCHEMER" for u in player.upgrades)
        
        for card_enum, defense_vals in ACTION_CARD_DEFENSE.items():
            if card_enum != used_action:
                # Apply Master Schemer bonus if applicable
                if card_enum == SurvivorActionCard.SCHEME and has_master_schemer:
                    total_defense[ScrapType.PARTS] += 2
                    total_defense[ScrapType.WIRING] += 2
                    total_defense[ScrapType.PLATES] += 2
                else:
                    total_defense[ScrapType.PARTS] += defense_vals[ScrapType.PARTS]
                    total_defense[ScrapType.WIRING] += defense_vals[ScrapType.WIRING]
                    total_defense[ScrapType.PLATES] += defense_vals[ScrapType.PLATES]
        
        # 2. Permanent defense from Upgrades
        for upgrade in player.upgrades:
            for scrap_type, amount in upgrade.permanent_defense.items():
                total_defense[scrap_type] += amount
            # TODO: Add logic for other special upgrades like Trophy Rack
        
        # 3. Value of spent Scrap
        for scrap_type, amount in player_defense.scrap_spent.items():
            # Rules: 1 scrap = +2 defense
            total_defense[scrap_type] += (amount * 2)
            
        # 4. Factor in Arsenal cards (TODO)
        # for card_id in player_defense.arsenal_cards_used:
        #    ...
            
        return total_defense

    def _resolve_all_defenses(self):
        """Helper to run defense calculations for all players."""
        self.state.add_log("Players defend!")
        for user_id in self.state.initiative_queue:
            player = self.state.players.get(user_id)
            threat = player.assigned_threat if player else None
            
            if not player or player.status != "ACTIVE" or not threat:
                if player and player.status == "ACTIVE" and player.defense_result is None:
                    # Player was active but had no threat
                    player.defense_result = "NONE"
                continue
            
            player_plan = self.state.player_plans[user_id]
            player_defense_submission = self.state.player_defenses[user_id]
            
            total_defense = self._calculate_total_defense(player, player_plan, player_defense_submission)
            
            # Compare defense to threat
            meets_ferocity = total_defense[ScrapType.PARTS] >= threat.ferocity
            meets_cunning = total_defense[ScrapType.WIRING] >= threat.cunning
            meets_mass = total_defense[ScrapType.PLATES] >= threat.mass
            
            # Determine outcome
            result: str
            if meets_ferocity and meets_cunning and meets_mass:
                result = "KILL"
            elif not meets_ferocity and not meets_cunning and not meets_mass:
                result = "FAIL"
            else:
                result = "DEFEND"
                
            player.defense_result = result
            
            # Apply outcome
            if result == "KILL":
                player.trophies.append(threat.trophy)
                spoil_log = []
                for scrap_type, amount in threat.spoil.items():
                    player.scrap[scrap_type] += amount
                    spoil_log.append(f"{amount} {scrap_type.value}")
                
                spoil_msg = f" and gains {', '.join(spoil_log)}" if spoil_log else ""
                self.state.add_log(f"{player.username} KILLS {threat.name}{spoil_msg}!")
                # TODO: Handle special spoils (draw card, etc.)

            elif result == "DEFEND":
                self.state.add_log(f"{player.username} DEFENDS against {threat.name}.")
            
            else: # FAIL
                # TODO: Check for "Savage" ability (2 HP loss)
                hp_loss = 1
                player.hp -= hp_loss
                self.state.add_log(f"{player.username} FAILS to defend against {threat.name} and loses {hp_loss} HP.")
                # TODO: Trigger "On Fail" ability
            
            # Return spent scrap to pool
            self.state.scrap_pool.add_from_dict(player_defense_submission.scrap_spent)
            
            if player.hp <= 0 and player.status == "ACTIVE":
                player.status = "ELIMINATED"
                self.state.add_log(f"{player.username} has been eliminated!")
        
        self._check_for_game_over()

    def _start_action_phase(self):
        """Phase 5: Start the turn-based Action resolution."""
        self.state.add_log("Resolving actions...")
        
        self._check_for_game_over()
        if self.state.phase == GamePhase.GAME_OVER:
            return

        self.state.action_turn_player_id = None
        for user_id in self.state.initiative_queue:
            player = self.state.players.get(user_id)
            if player and player.status == "ACTIVE":
                self.state.action_turn_player_id = user_id
                break
        
        if self.state.action_turn_player_id:
            self._process_current_action_turn()
        else:
            self.state.add_log("No active players to take actions.")
            self._advance_to(GamePhase.CLEANUP) # No one to act, skip to cleanup

    def _process_current_action_turn(self):
        """Resolves the action for the current player, or waits for choice."""
        user_id = self.state.action_turn_player_id
        if not user_id:
             return # Should not happen

        player = self.state.players[user_id]
        plan = self.state.player_plans[user_id]
        action = plan.action_card
        
        self.state.add_log(f"It is {player.username}'s turn to {action.value}.")

        if action == SurvivorActionCard.SCHEME:
            # Scheme resolves instantly
            drawn = self.state.scrap_pool.draw_random(1)
            for scrap in drawn:
                player.scrap[scrap] += 1
            self.state.add_log(f"{player.username} gains 1 random scrap and plots...")
            self._find_next_action_turn() # Move to next player
        
        else:
            # Scavenge, Fortify, Armory Run require a choice
            player.action_choice_pending = action.value
            # The game now waits for a 'submit_action_choice' message
            self.state.add_log(f"Waiting for {player.username} to make a choice.")

    def _find_next_action_turn(self):
        """Finds the next active player in the initiative queue to take an action."""
        
        current_turn_player_id = self.state.action_turn_player_id
        if not current_turn_player_id:
             self._advance_to(GamePhase.CLEANUP)
             return

        # Find current player's index
        try:
            current_index = self.state.initiative_queue.index(current_turn_player_id)
        except ValueError:
            # Player disconnected mid-turn?
            current_index = -1 # Start search from beginning
        
        next_player_id = None
        # Search *after* the current player
        for i in range(current_index + 1, len(self.state.initiative_queue)):
            pid = self.state.initiative_queue[i]
            player = self.state.players.get(pid)
            if player and player.status == "ACTIVE":
                next_player_id = pid
                break
        
        self.state.action_turn_player_id = next_player_id
        
        if next_player_id:
            # Found next player, process their turn
            self._process_current_action_turn()
        else:
            # Reached end of queue
            self.state.add_log("All player actions resolved.")
            self._advance_to(GamePhase.CLEANUP)

    def _resolve_cleanup(self):
        """Phase 6: Base income, refill market, set new initiative."""
        self.state.add_log("Cleaning up...")
        
        # 1. Base Income
        for player in self.state.get_active_players():
            drawn = self.state.scrap_pool.draw_random(1)
            for scrap in drawn:
                player.scrap[scrap] += 1
        self.state.add_log("All active players gain 1 random scrap.")

        # 2. Refill Markets
        num_market_cards = max(2, len(self.state.get_active_players()) - 1)
        while len(self.state.market.upgrade_market) < num_market_cards and self.state.upgrade_deck:
            self.state.market.upgrade_market.append(self.state.upgrade_deck.pop(0))
        while len(self.state.market.arsenal_market) < num_market_cards and self.state.arsenal_deck:
            self.state.market.arsenal_market.append(self.state.arsenal_deck.pop(0))
            
        # 3. Set new Initiative Queue
        schemers = []
        non_schemers = []
        
        active_players_in_order = [
            pid for pid in self.state.initiative_queue 
            if self.state.players.get(pid) and self.state.players[pid].status == "ACTIVE"
        ]
        
        for user_id in active_players_in_order:
            plan = self.state.player_plans.get(user_id)
            if plan and plan.action_card == SurvivorActionCard.SCHEME:
                schemers.append(user_id)
            else:
                non_schemers.append(user_id)
        
        # New queue is [schemers (in old order)] + [non_schemers (in old order)]
        # Rule: "If multiple players Scheme, their new order at the top...
        # is determined by their old order."
        self.state.initiative_queue = schemers + non_schemers
        
        if self.state.initiative_queue:
            self.state.first_player = self.state.initiative_queue[0]
            self.state.add_log(f"New first player is {self.state.players[self.state.first_player].username}.")
        else:
            self.state.first_player = None 
            self.state.add_log("No active players left to set initiative.")

        self._check_for_game_over()
        if self.state.phase != GamePhase.GAME_OVER:
            self._start_round()

    def _check_for_game_over(self):
        """Checks if only one player remains active."""
        active_players = self.state.get_active_players()
        if len(active_players) <= 1:
            if self.state.phase != GamePhase.GAME_OVER:
                self.state.winner = active_players[0] if active_players else None
                self._advance_to(GamePhase.GAME_OVER)
            
    def _resolve_game_over(self):
        """Announces the winner."""
        if self.state.winner:
            self.state.add_log(f"GAME OVER! The winner is {self.state.winner.username}!")
        else:
            self.state.add_log("GAME OVER! There are no survivors.")
