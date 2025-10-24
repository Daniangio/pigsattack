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
from typing import List, Dict, Any, Optional
import random

# Import the server-level models only for type hinting the setup
from .models import GameParticipant 

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
        
        # 1. Create players and set initiative
        # Rules: "player who most recently saw a wild animal is first"
        # We'll just randomize it for now.
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

        # 2. Prepare decks
        gs.threat_deck = create_threat_deck()
        gs.upgrade_deck = create_upgrade_deck()
        gs.arsenal_deck = create_arsenal_deck()
        
        # 3. Create Market
        # Rules: "number of face-up cards... is number of players minus one (min 2)"
        num_market_cards = max(2, len(player_list) - 1)
        for _ in range(num_market_cards):
            if gs.upgrade_deck:
                gs.market.upgrade_market.append(gs.upgrade_deck.pop())
            if gs.arsenal_deck:
                gs.market.arsenal_market.append(gs.arsenal_deck.pop())

        # 4. Starting Resources
        # Rules: "Each player draws 2 Scrap tokens randomly"
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
        
        # Clear round-specific player state
        for p in self.state.players.values():
            p.assigned_threat = None
            p.defense_result = None
        
        # Clear attraction phase state
        self.state.attraction_phase_state = None
        self.state.attraction_turn_player_id = None
        self.state.available_threat_ids = []
        self.state.unassigned_player_ids = []
            
        self._advance_to(GamePhase.WILDERNESS)

    def _advance_to(self, phase: GamePhase):
        """Advances the state machine and triggers phase logic."""
        self.state.phase = phase
        self.state.add_log(f"Phase: {phase.value}")
        
        if phase == GamePhase.WILDERNESS:
            self._resolve_wilderness()
        elif phase == GamePhase.PLANNING:
            # No automatic resolution, wait for player input
            pass
        elif phase == GamePhase.ATTRACTION:
            # This method now *sets up* the turn-based phase
            self._resolve_attraction()
        elif phase == GamePhase.DEFENSE:
            # No automatic resolution, wait for player input
            pass
        elif phase == GamePhase.ACTION:
            self._resolve_action()
        elif phase == GamePhase.CLEANUP:
            self._resolve_cleanup()
        elif phase == GamePhase.GAME_OVER:
            self._resolve_game_over()

    def _check_if_all_ready(self, phase: GamePhase) -> bool:
        """Checks if all active players are 'ready' for a given phase."""
        active_pids = [p.user_id for p in self.state.get_active_players()]
        
        if phase == GamePhase.PLANNING:
            return all(
                self.state.player_plans[pid].ready for pid in active_pids
            )
        elif phase == GamePhase.DEFENSE:
            return all(
                self.state.player_defenses[pid].ready for pid in active_pids
            )
        return False

    # --- PLAYER ACTIONS ---

    def submit_plan(self, user_id: str, lure: LureCard, action: SurvivorActionCard) -> bool:
        """Player submits their Phase 2 cards."""
        if self.state.phase != GamePhase.PLANNING:
            return False # Can't submit plan now
        if user_id not in self.state.player_plans:
            return False # Not an active player
        
        plans = self.state.player_plans[user_id]
        if plans.ready:
            return False # Already submitted
            
        plans.lure_card = lure
        plans.action_card = action
        plans.ready = True
        self.state.add_log(f"{self.state.players[user_id].username} has planned their turn.")
        
        # If all players are ready, advance the game
        if self._check_if_all_ready(GamePhase.PLANNING):
            self._advance_to(GamePhase.ATTRACTION)
            
        return True

    def submit_defense(self, user_id: str, scrap_spent: Dict[ScrapType, int], arsenal_ids: List[str]) -> bool:
        """Player submits their Phase 4 defense."""
        if self.state.phase != GamePhase.DEFENSE:
            return False
        if user_id not in self.state.player_defenses:
            return False
        
        defense = self.state.player_defenses[user_id]
        if defense.ready:
            return False

        # TODO: Validate scrap_spent and arsenal_ids
        
        defense.scrap_spent = scrap_spent
        defense.arsenal_cards_used = arsenal_ids
        defense.ready = True
        self.state.add_log(f"{self.state.players[user_id].username} has submitted their defense.")
        
        if self._check_if_all_ready(GamePhase.DEFENSE):
            # Once all defenses are in, resolve them *then* advance
            self._resolve_all_defenses()
            
            # Check if game ended during defense phase
            if self.state.phase != GamePhase.GAME_OVER:
                self._advance_to(GamePhase.ACTION)
        
        return True

    def select_threat(self, user_id: str, threat_id: Optional[str]) -> bool:
        """Player selects a threat during the Attraction phase."""
        if self.state.phase != GamePhase.ATTRACTION:
            return False # Not in attraction phase
        if user_id != self.state.attraction_turn_player_id:
            return False # Not your turn
            
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

        # Case 1: Player tries to skip (threat_id is None)
        if not threat_id:
            if self.state.attraction_phase_state == "FIRST_PASS":
                if matching_threats:
                    self.state.add_log(f"Invalid action: {player.username} must select a matching threat during the First Pass.")
                    return False # Rule: You *must* choose if your lure matches.
                # This case is now handled automatically by _find_next_attraction_turn.
                # A player should not be able to manually skip if they have no matching lure.
                return False
            
            elif self.state.attraction_phase_state == "SECOND_PASS":
                if available_threats:
                    self.state.add_log(f"Invalid action: {player.username} must select a remaining threat.")
                    return False # Rule: You *must* choose from the remainder.
                # Valid skip (no threats left)
                self.state.add_log(f"{player.username} attracts no threat (none available).")
            
            # Conclude turn
            self.state.unassigned_player_ids.remove(user_id)
            self._find_next_attraction_turn()
            return True

        # Case 2: Player selects a threat (threat_id is not None)
        selected_threat = next((t for t in available_threats if t.id == threat_id), None)
        if not selected_threat:
            return False # Threat not available or already taken
            
        if self.state.attraction_phase_state == "FIRST_PASS":
            if selected_threat.lure != plan.lure_card:
                self.state.add_log(f"Invalid action: {player.username} must select a matching threat in First Pass.")
                return False # Must pick a *matching* threat in First Pass
        
        # If in SECOND_PASS, any available threat is valid
        
        # Assign threat
        player.assigned_threat = selected_threat
        self.state.available_threat_ids.remove(threat_id)
        self.state.unassigned_player_ids.remove(user_id)
        self.state.add_log(f"{player.username} attracts {selected_threat.name}.")
        
        # Find next turn
        self._find_next_attraction_turn()
        return True

    def handle_player_leave(self, user_id: str, status: str):
        """Handles a player surrendering or disconnecting."""
        if user_id not in self.state.players:
            return
            
        player = self.state.players[user_id]
        if player.status == "ACTIVE":
            player.status = status
            self.state.add_log(f"{player.username} has {status.lower()}.")
            
            # --- NEW LOGIC ---
            # If the player leaves during their attraction turn, advance the turn.
            if self.state.phase == GamePhase.ATTRACTION and user_id == self.state.attraction_turn_player_id:
                if user_id in self.state.unassigned_player_ids:
                    self.state.unassigned_player_ids.remove(user_id)
                self.state.add_log(f"{player.username} left, advancing attraction turn.")
                self._find_next_attraction_turn()
            # --- END NEW LOGIC ---

            self._check_for_game_over()


    # --- PHASE RESOLUTION LOGIC ---

    def _resolve_wilderness(self):
        """Phase 1: Reveal Threat cards."""
        num_threats = len(self.state.get_active_players())
        
        for _ in range(num_threats):
            if not self.state.threat_deck:
                self.state.add_log("Threat deck is empty! The wilderness is quiet... for now.")
                break
            threat = self.state.threat_deck.pop(0)
            self.state.current_threats.append(threat)
            
        self.state.add_log(f"Revealed {len(self.state.current_threats)} threats from the wilderness.")
        self._advance_to(GamePhase.PLANNING)

    def _find_next_attraction_turn(self):
        """Finds the next player in the initiative queue who needs a threat."""
        
        # Find the first player in initiative order who is still unassigned
        next_player_id = None
        for pid in self.state.initiative_queue:
            # Player must be active AND in the unassigned list
            player = self.state.players.get(pid)
            if player and player.status == "ACTIVE" and pid in self.state.unassigned_player_ids:
                next_player_id = pid
                break
        
        # --- Automatic Skip Logic ---
        # If we found a player, check if they should be skipped automatically.
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
            
            # If there are no threats matching the player's lure, they are skipped.
            if not matching_threats:
                self.state.add_log(f"{player.username} has no matching lure and is skipped during the First Pass.")
                self.state.unassigned_player_ids.remove(next_player_id)
                # Recursively call to find the *next* player's turn.
                self._find_next_attraction_turn()
                return # Stop execution to avoid setting the turn player below.

        # --- End Automatic Skip Logic ---

        self.state.attraction_turn_player_id = next_player_id
        
        if not next_player_id:
            # No one is left to assign
            if self.state.attraction_phase_state == "FIRST_PASS":
                # Move to second pass
                self.state.attraction_phase_state = "SECOND_PASS"
                self.state.add_log("All matching lures resolved. Starting Second Pass.")
                # Re-populate unassigned players for the second pass
                self.state.unassigned_player_ids = [
                    p.user_id for p in self.state.get_active_players() 
                    if not p.assigned_threat # Find all active players who still don't have a threat
                ]
                self._find_next_attraction_turn() # Find the first player for the second pass
            else:
                # Second pass is over
                self.state.add_log("Attraction phase complete.")
                self.state.attraction_turn_player_id = None
                self._advance_to(GamePhase.DEFENSE)
        else:
            self.state.add_log(f"It is {self.state.players[next_player_id].username}'s turn to select a threat.")

    def _resolve_attraction(self):
        """Phase 3: Setup the Attraction phase state machine."""
        # This method NO LONGER resolves the phase. It sets it up.
        self.state.add_log("Resolving attraction...")
        self.state.attraction_phase_state = "FIRST_PASS"
        self.state.available_threat_ids = [t.id for t in self.state.current_threats]
        self.state.unassigned_player_ids = [p.user_id for p in self.state.get_active_players()]
        
        # Start the turn-based process
        self._find_next_attraction_turn()
        
        # DO NOT advance to DEFENSE. Wait for player actions.

    def _resolve_all_defenses(self):
        """Helper to run defense calculations for all players."""
        self.state.add_log("Players defend!")
        for user_id in self.state.initiative_queue:
            player = self.state.players.get(user_id)
            if not player or player.status != "ACTIVE" or not player.assigned_threat:
                continue
            
            # TODO: Implement full defense calculation
            # 1. Get base defense from 3 unused Action Cards
            # 2. Get permanent defense from Upgrades
            # 3. Get value of spent Scrap (+2 per)
            # 4. Factor in Arsenal cards
            
            # Placeholder logic:
            threat = player.assigned_threat
            player_defense = self.state.player_defenses[user_id]
            
            # Simple check: did they spend at least 1 scrap?
            total_spent = sum(player_defense.scrap_spent.values())
            
            if total_spent >= 3:
                result = "KILL"
                player.defense_result = result
                player.trophies.append(threat.trophy)
                # TODO: Add spoil to player
                self.state.add_log(f"{player.username} KILLS {threat.name}!")
            elif total_spent >= 1:
                result = "DEFEND"
                player.defense_result = result
                self.state.add_log(f"{player.username} DEFENDS against {threat.name}.")
            else:
                result = "FAIL"
                player.defense_result = result
                player.hp -= 1
                self.state.add_log(f"{player.username} FAILS to defend and loses 1 HP.")
                # TODO: Trigger "On Fail" ability
            
            # TODO: Handle player elimination
            if player.hp <= 0 and player.status == "ACTIVE":
                player.status = "ELIMINATED"
                self.state.add_log(f"{player.username} has been eliminated!")
        
        # --- Check for game over after all defenses are resolved ---
        self._check_for_game_over()

    def _resolve_action(self):
        """Phase 5: Resolve Survivor Action cards in initiative order."""
        self.state.add_log("Resolving actions...")
        for user_id in self.state.initiative_queue:
            player = self.state.players.get(user_id)
            if not player or player.status != "ACTIVE":
                continue
            
            # Players who failed defense might not get an action
            # Rule: "only if you survive, take an action"
            # We'll assume this means "if not eliminated"
            
            plan = self.state.player_plans[user_id]
            action = plan.action_card
            
            # TODO: Implement full action logic (Scavenge, Fortify, etc.)
            self.state.add_log(f"{player.username} resolves {action.value}.")
            
            if action == SurvivorActionCard.SCAVENGE:
                # TODO: Handle "Choose 2 scrap"
                drawn = self.state.scrap_pool.draw_random(2)
                for scrap in drawn:
                    player.scrap[scrap] += 1
                self.state.add_log(f"{player.username} gains 2 random scrap.")
            
            elif action == SurvivorActionCard.SCHEME:
                drawn = self.state.scrap_pool.draw_random(1)
                for scrap in drawn:
                    player.scrap[scrap] += 1
                self.state.add_log(f"{player.username} gains 1 random scrap and will be first next round.")
                # Logic for moving to top of queue is in _resolve_cleanup
        
        self._check_for_game_over()
        if self.state.phase != GamePhase.GAME_OVER:
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
            self.state.market.upgrade_market.append(self.state.upgrade_deck.pop())
        while len(self.state.market.arsenal_market) < num_market_cards and self.state.arsenal_deck:
            self.state.market.arsenal_market.append(self.state.arsenal_deck.pop())
            
        # 3. Set new Initiative Queue
        schemers = []
        non_schemers = []
        
        # Get all *active* players from the *current* initiative queue
        active_players_in_order = [
            pid for pid in self.state.initiative_queue 
            if self.state.players.get(pid) and self.state.players[pid].status == "ACTIVE"
        ]
        
        for user_id in active_players_in_order:
            if self.state.player_plans[user_id].action_card == SurvivorActionCard.SCHEME:
                schemers.append(user_id)
            else:
                non_schemers.append(user_id)
        
        # New queue is [schemers (in old order)] + [non-schemers (in old order)]
        self.state.initiative_queue = schemers + non_schemers
        
        # Pass first player token
        if self.state.initiative_queue:
            self.state.first_player = self.state.initiative_queue[0]
            self.state.add_log(f"New first player is {self.state.players[self.state.first_player].username}.")
        else:
            # This can happen if all remaining players schemed and then disconnected
            self.state.first_player = None 

        # Start the next round
        self._start_round()

    def _check_for_game_over(self):
        """Checks if only one player remains active."""
        active_players = self.state.get_active_players()
        if len(active_players) <= 1:
            self.state.winner = active_players[0] if active_players else None
            self._advance_to(GamePhase.GAME_OVER)
            
    def _resolve_game_over(self):
        """Announces the winner."""
        if self.state.winner:
            self.state.add_log(f"GAME OVER! The winner is {self.state.winner.username}!")
        else:
            self.state.add_log("GAME OVER! There are no survivors.")
        # The GameManager will detect this state and terminate the game
