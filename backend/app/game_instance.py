"""
The GameInstance class.
This encapsulates all the rules and state for a single game.
It is the "server" for one match.

v1.8 - Refactored by Gemini

Key Refactor:
- Fixed an infinite loop in the ATTRACTION phase.
- The previous logic used a helper `_check_and_skip_attraction_turn`
  that could recursively call the main advancement logic
  `_process_attraction_turn_end`, causing a loop when all
  remaining players had no valid moves.
- This is replaced by a single, robust `_advance_attraction_turn`
  function. This new function is the single source of truth for
  turn advancement. It internally loops to find the *next available
  player who can act*, skipping players who cannot, all within
  a single call. This prevents the infinite loop and is much cleaner.
"""

from .game_core.game_models import (
    GameState, PlayerState, GamePhase, PlayerPlans, PlayerDefense,
    ScrapType, LureCard, SurvivorActionCard, ThreatCard, UpgradeCard, ArsenalCard,
    PlayerStatus
)
from .game_core.deck_factory import create_threat_deck, create_upgrade_deck, create_arsenal_deck
from typing import List, Dict, Any, Optional, cast
import random

# Import the server-level models only for type hinting the setup
from .server_models import GameParticipant

# --- CONSTANTS (v1.8) ---
BASE_DEFENSE_FROM_ACTION = {
    SurvivorActionCard.SCAVENGE: {ScrapType.PARTS: 3, ScrapType.WIRING: 1, ScrapType.PLATES: 3},
    SurvivorActionCard.FORTIFY: {ScrapType.PARTS: 3, ScrapType.WIRING: 3, ScrapType.PLATES: 1},
    SurvivorActionCard.ARMORY_RUN: {ScrapType.PARTS: 1, ScrapType.WIRING: 3, ScrapType.PLATES: 3},
    SurvivorActionCard.SCHEME: {ScrapType.PARTS: 2, ScrapType.WIRING: 2, ScrapType.PLATES: 2},
}
TOTAL_ROUNDS = 15 # v1.8 rulebook
ROUNDS_PER_ERA = 5
# --


class GameInstance:
    """
    Manages the state and logic for a single game of "Wild Pigs Will Attack!".
    """

    def __init__(self, game_id: str, participants: List[GameParticipant]):
        """
        Initializes a new game instance.
        """

        # 1. Create Players
        players = {}
        player_ids = []
        for i, p in enumerate(participants):
            player_state = PlayerState(
                user_id=p.user.id,
                player_id=p.user.id,
                username=p.user.username,
                is_host=(i == 0),
                is_connected=True,
                status=PlayerStatus.ACTIVE,
                scrap={} # Will be populated by helper
            )
            # Rulebook Sec 3: Start with 2 random scrap
            self._player_draws_random_scrap(player_state, 2, log=False)

            players[p.user.id] = player_state
            player_ids.append(p.user.id)

        # 2. Determine initial initiative (random)
        # Rulebook Sec 3: Player who most recently...
        # Random is an acceptable simplification for now.
        random.shuffle(player_ids)
        initiative_queue = player_ids
        # first_player = initiative_queue[0] # This is no longer needed

        # 3. Initialize GameState
        self.state = GameState(
            game_id=game_id,
            players=players,
            initiative_queue=initiative_queue
            # first_player=first_player # Removed, field no longer exists
        )

        # 4. Create decks
        num_players = len(participants)

        self.state.threat_deck = create_threat_deck(num_players)
        self.state.upgrade_deck = create_upgrade_deck()
        self.state.arsenal_deck = create_arsenal_deck()

        self.state.add_log(f"Game {game_id} created with {num_players} players.")

        # 5. Start the first phase
        self._start_wilderness_phase()

    # --- Public API (called by GameManager) ---

    def get_state(self, user_id: str) -> Dict[str, Any]:
        """
        Returns the appropriate redacted state for the given user.
        'user_id' can be a player's ID or "spectator".
        """
        return self.state.get_player_public_state(user_id)

    def get_all_player_states(self) -> Dict[str, Dict[str, Any]]:
        """
        Returns a dict mapping user_id -> redacted_state for all players.
        """
        states = {}
        for user_id in self.state.players:
            states[user_id] = self.get_state(user_id)
        # Also include a spectator view
        states["spectator"] = self.get_state("spectator")
        return states

    # --- Helper: Player Draws Scrap ---

    def _player_draws_random_scrap(self, player: PlayerState, count: int, log: bool = True):
        """Helper for a player to draw 'count' random scrap."""
        # Per rulebook (Sec 2), pool is 50/50/50. So random.choice is fine.
        if count <= 0:
            return

        drawn = random.choices(
            [ScrapType.PARTS, ScrapType.WIRING, ScrapType.PLATES],
            k=count
        )
        drawn_str = []
        for scrap in drawn:
            player.scrap[scrap] = player.scrap.get(scrap, 0) + 1
            drawn_str.append(scrap.value)

        if log:
            self.state.add_log(f"{player.username} draws {count} random scrap: {', '.join(drawn_str)}")

    # --- Player Connection ---

    def on_player_reconnect(self, user_id: str):
        player = self.state.get_player(user_id)
        if player:
            # Only reconnect if they were just disconnected
            if player.status == PlayerStatus.DISCONNECTED:
                player.status = PlayerStatus.ACTIVE
            player.is_connected = True
            self.state.add_log(f"{player.username} has reconnected.")

    def on_player_disconnect(self, user_id: str):
        player = self.state.get_player(user_id)
        if player:
            player.is_connected = False
            # Only set to DISCONNECTED if they are currently ACTIVE
            if player.status == PlayerStatus.ACTIVE:
                player.status = PlayerStatus.DISCONNECTED
            self.state.add_log(f"{player.username} has disconnected.")

            # Check if this disconnect triggers phase advancement
            if self.state.phase == GamePhase.PLANNING:
                if self._are_all_players_ready("plans"):
                    self._advance_phase()
            elif self.state.phase == GamePhase.DEFENSE:
                 if self._are_all_players_ready("defenses"):
                    self._resolve_all_defenses()
            # ... etc.

    def surrender_player(self, user_id: str):
        """ Player forfeits the game."""
        player = self.state.get_player(user_id)
        if player and player.status == PlayerStatus.ACTIVE:
            player.status = PlayerStatus.SURRENDERED
            player.is_connected = False # Treat them as disconnected for turn order
            self.state.add_log(f"{player.username} has surrendered!")

            # Check if this surrender triggers phase advancement
            if self.state.phase == GamePhase.PLANNING:
                if self._are_all_players_ready("plans"):
                    self._advance_phase()
            elif self.state.phase == GamePhase.DEFENSE:
                 if self._are_all_players_ready("defenses"):
                    self._resolve_all_defenses()
            # ... etc.

    # --- Phase 1: WILDERNESS ---

    def _start_wilderness_phase(self):
        self.state.phase = GamePhase.WILDERNESS

        self.state.add_log(f"--- Round {self.state.round} / Era {self.state.era} ---")
        self.state.add_log("Phase: WILDERNESS. New threats emerge...")

        if self.state.current_threats:
            self.state.add_log("Discarding remaining threats from last round.")
            self.state.threat_discard.extend(self.state.current_threats)
            self.state.current_threats = []

        num_players = len(self.state.get_active_players_in_order())
        # Per rulebook, 1 threat per player
        num_threats = num_players

        if num_threats == 0:
            self.state.add_log("No active players. Advancing phase.")
            self._advance_phase()
            return

        threat_deck = self.state.threat_deck

        if len(threat_deck) < num_threats:
            self.state.add_log("Threat deck empty, reshuffling discard...")
            self.state.threat_deck.extend(self.state.threat_discard)
            self.state.threat_discard = []
            random.shuffle(self.state.threat_deck)
            threat_deck = self.state.threat_deck

        drawn_threats = []
        for _ in range(num_threats):
            if not threat_deck:
                self.state.add_log("Threat deck is empty! No more threats to draw.")
                break
            drawn_threats.append(threat_deck.pop(0))

        self.state.current_threats = drawn_threats
        for t in drawn_threats:
            self.state.add_log(f"A {t.name} (E{t.era}) appears!")

        self._advance_phase()

    # --- Phase 2: PLANNING ---

    def _start_planning_phase(self):
        self.state.phase = GamePhase.PLANNING
        self.state.player_plans = {}

        for player in self.state.players.values():
            if player.status == PlayerStatus.ACTIVE:
                player.plan_submitted = False
                player.defense_submitted = False
                player.attracted_threat = None
                player.defense_result = None
                player.action_prevented = False

        self.state.add_log("Phase: PLANNING. All survivors, submit your plans.")

    def submit_plan(self, player_id: str, lure_card: str, action_card: str) -> bool:
        if self.state.phase != GamePhase.PLANNING:
            return False

        player = self.state.get_player(player_id)
        if not player or player.plan_submitted or player.status != PlayerStatus.ACTIVE:
            return False

        try:
            lure = LureCard(lure_card)
            action = SurvivorActionCard(action_card)
        except ValueError:
            self.state.add_log(f"Invalid card submission from {player.username}")
            return False

        if lure not in player.lure_hand or action not in player.action_hand:
            self.state.add_log(f"Player {player.username} does not own {lure} or {action}")
            return False

        # v1.8 Rule [Source 51]
        if lure == player.last_round_lure:
            self.state.add_log(f"Player {player.username} cannot use the same lure as last round.")
            return False

        self.state.player_plans[player_id] = PlayerPlans(
            player_id=player_id,
            lure=lure,
            action=action
        )
        player.plan_submitted = True
        self.state.add_log(f"{player.username} has submitted their plan.")

        if self._are_all_players_ready("plans"):
            self._advance_phase()

        return True

    # --- Phase 3: ATTRACTION (v1.8 Rules) ---

    def _start_attraction_phase(self):
        self.state.phase = GamePhase.ATTRACTION
        self.state.add_log("Phase: ATTRACTION. Revealing plans...")

        for pid, plan in self.state.player_plans.items():
            player = self.state.get_player(pid)
            if player:
                self.state.add_log(f"  {player.username} planned: {plan.lure.value} & {plan.action.value}")

        self.state.attraction_phase_state = "FIRST_PASS"

        active_player_ids = [p.user_id for p in self.state.get_active_players_in_order()]
        self.state.unassigned_player_ids = active_player_ids

        self.state.available_threat_ids = [t.id for t in self.state.current_threats]

        if not active_player_ids or not self.state.available_threat_ids:
            self.state.add_log("No active players or threats. Advancing phase.")
            self._advance_phase()
            return

        # Set the turn to the first player, then call advance_turn
        # to validate them and find the *actual* first turn.
        self.state.attraction_turn_player_id = active_player_ids[0]
        self._advance_attraction_turn(is_new_pass=True)

    def attract_threat(self, player_id: str, threat_id: str) -> bool:
        """
        Player 'player_id' attempts to attract 'threat_id'.
        """
        if self.state.phase != GamePhase.ATTRACTION:
            return False

        if player_id != self.state.attraction_turn_player_id:
            return False # Not your turn

        player = self.state.get_player(player_id)
        if not player or player_id not in self.state.unassigned_player_ids:
            return False # You've already attracted one

        threat = next((t for t in self.state.current_threats if t.id == threat_id), None)
        if not threat or threat.id not in self.state.available_threat_ids:
            return False # Threat not available

        player_plan = self.state.player_plans.get(player_id)
        if not player_plan:
            return False # Should not happen

        if self.state.attraction_phase_state == "FIRST_PASS":
            if threat.lure != player_plan.lure:
                self.state.add_log(f"Invalid choice: {threat.name} does not match {player_plan.lure.value}")
                return False

        self.state.add_log(f"{player.username} attracts {threat.name}!")
        player.attracted_threat = threat

        self.state.unassigned_player_ids.remove(player_id)
        self.state.available_threat_ids.remove(threat_id)

        self._advance_attraction_turn()
        return True

    def _advance_attraction_turn(self, is_new_pass: bool = False):
        """
        Finds the next player who can act in the attraction phase.
        This function will loop, skipping players who cannot act,
        until it finds a player who can, or until the phase ends.
        """

        active_initiative = [p.user_id for p in self.state.get_active_players_in_order()]
        if not active_initiative:
            self.state.add_log("No active players left.")
            self._advance_phase()
            return

        # Get the list of players who still need a threat
        unassigned_player_ids_set = set(self.state.unassigned_player_ids)

        # Start searching from the correct player
        start_idx = 0
        if not is_new_pass:
            # Start search *after* the current player
            try:
                start_idx = (active_initiative.index(self.state.attraction_turn_player_id) + 1)
            except (ValueError, TypeError):
                 # Current player might be None or not in active list
                 start_idx = 0
        
        # Make sure start_idx is valid
        if start_idx >= len(active_initiative):
            start_idx = 0

        # Loop max N times (N=num players) to find the next valid player
        for i in range(len(active_initiative)):
            current_idx = (start_idx + i) % len(active_initiative)
            player_id = active_initiative[current_idx]

            # 1. Check if this player is in the running
            if player_id not in unassigned_player_ids_set:
                continue # Skip player, they already have a threat

            # 2. This player needs a threat. Check if they *can* act.
            if self.state.attraction_phase_state == "FIRST_PASS":
                player_plan = self.state.player_plans.get(player_id)
                if not player_plan:
                    self.state.add_log(f"Error: {self.state.get_player(player_id).username} has no plan. Skipping.")
                    continue # Should not happen, but good to check

                available_threats = [
                    t for t in self.state.current_threats
                    if t.id in self.state.available_threat_ids
                ]
                has_match = any(t.lure == player_plan.lure for t in available_threats)

                if not has_match:
                    self.state.add_log(f"{self.state.get_player(player_id).username} has no matching Lure! Skipping turn.")
                    continue # Skip player, they have no valid moves

            # 3. Found a valid player!
            self.state.attraction_turn_player_id = player_id
            player = self.state.get_player(player_id)
            pass_name = "Pass 1" if self.state.attraction_phase_state == "FIRST_PASS" else "Pass 2"
            self.state.add_log(f"{pass_name}: {player.username}'s turn.")
            return # Exit, wait for player's action

        # 4. If we looped through everyone and found no valid turns
        # This means either:
        #  a) All unassigned players have no matches (in Pass 1)
        #  b) All unassigned players are assigned (Pass 1 or 2)
        #  c) All threats are gone (Pass 2)

        # Check if anyone is *still* unassigned
        # We must re-fetch this as it's not updated *during* the loop
        still_unassigned = [
            pid for pid in active_initiative 
            if pid in self.state.unassigned_player_ids
        ]

        if self.state.attraction_phase_state == "FIRST_PASS":
            self.state.add_log("--- Attraction Pass 1 complete. ---")

            if not still_unassigned or not self.state.available_threat_ids:
                self.state.add_log("No players or threats remaining. Advancing phase.")
                self._advance_phase()
            else:
                # Start Pass 2
                self.state.attraction_phase_state = "SECOND_PASS"
                self.state.add_log("Starting Attraction Pass 2.")
                # Recursively call this to find the *first* player for Pass 2
                # who is in the `still_unassigned` list.
                self._advance_attraction_turn(is_new_pass=True)

        else: # We were in SECOND_PASS
            self.state.add_log("--- Attraction Pass 2 complete. ---")
            self._advance_phase()

    # --- Phase 4: DEFENSE ---

    def _start_defense_phase(self):
        self.state.phase = GamePhase.DEFENSE
        self.state.player_defenses = {}

        for player in self.state.players.values():
            player.defense_submitted = False

            # Auto-submit for players with no threat or not active
            if player.status != PlayerStatus.ACTIVE or not player.attracted_threat:
                player.defense_submitted = True
                if player.status == PlayerStatus.ACTIVE:
                    self.state.add_log(f"{player.username} has no threat, auto-ready.")

        self.state.add_log("Phase: DEFENSE. All survivors, submit defenses.")

        # Check if all players are ready *immediately*
        if self._are_all_players_ready("defenses"):
            self._resolve_all_defenses()

    def submit_defense(
        self,
        player_id: str,
        scrap_spent: Dict[str, int],
        arsenal_ids: List[str]
    ) -> bool:
        if self.state.phase != GamePhase.DEFENSE:
            return False

        player = self.state.get_player(player_id)
        if not player or player.defense_submitted or player.status != PlayerStatus.ACTIVE:
            return False

        if not player.attracted_threat:
            return False

        validated_scrap = {}
        try:
            for k, v in scrap_spent.items():
                scrap_type = ScrapType(k.upper())
                amount = int(v)
                if amount < 0: raise ValueError
                validated_scrap[scrap_type] = amount
        except (ValueError, KeyError):
            self.state.add_log(f"Invalid scrap payload from {player.username}")
            return False

        temp_scrap_cost = {k: v for k, v in validated_scrap.items() if v > 0}
        if not player.can_afford(temp_scrap_cost):
            self.state.add_log(f"{player.username} cannot afford submitted scrap.")
            return False

        arsenal_cards_used = []
        for card_id in arsenal_ids:
            card = next((c for c in player.arsenal_hand if c.id == card_id), None)
            if not card:
                self.state.add_log(f"{player.username} does not have card {card_id}")
                return False
            arsenal_cards_used.append(card)

        # ---
        # TODO: This logic is too simple for complex Arsenal cards
        # like Adrenaline, Makeshift Amp, etc.
        # This requires a significant refactor of this method
        # and the payload it accepts.
        # ---

        player.pay_cost(temp_scrap_cost)

        self.state.player_defenses[player_id] = PlayerDefense(
            player_id=player_id,
            scrap_spent=validated_scrap,
            arsenal_ids=arsenal_ids
        )
        player.defense_submitted = True
        self.state.add_log(f"{player.username} has submitted their defense.")

        for card in arsenal_cards_used:
            if card.charges is not None:
                card.charges -= 1
                if card.charges > 0:
                    self.state.add_log(f"{player.username} used 1 charge from {card.name}.")
                else:
                    self.state.add_log(f"{player.username} used the last charge from {card.name}.")
                    player.arsenal_hand.remove(card)
                    player.arsenal_discard.append(card)
            else:
                # One-use cards
                player.arsenal_hand.remove(card)
                player.arsenal_discard.append(card)

        if self._are_all_players_ready("defenses"):
            self._resolve_all_defenses()

        return True

    def _resolve_all_defenses(self):
        """
        All defenses are in. Calculate outcomes.
        """
        self.state.add_log("All defenses submitted. Resolving...")

        for player in self.state.get_active_players_in_order():
            if not player.attracted_threat:
                continue

            threat = player.attracted_threat
            defense_plan = self.state.player_defenses.get(player.user_id)

            total_defense = self._calculate_total_defense(player, defense_plan, threat)

            outcome = self._check_defense_outcome(player, total_defense, threat)

            player.defense_result = outcome["result"]

            if player.defense_result == "FAIL":
                player.injuries += 1
                self.state.add_log(f"{player.username} FAILED against {threat.name} and gains 1 Injury.")

                # Handle "On Fail"
                if threat.on_fail == "DISCARD_SCRAP":
                    # TODO: Implement this. For now, just log it.
                    self.state.add_log(f"On Fail: {player.username} must discard scrap!")
                elif threat.on_fail == "PREVENT_ACTION":
                    player.action_prevented = True
                    self.state.add_log(f"On Fail: {player.username}'s action is PREVENTED!")
                elif threat.on_fail == "GAIN_INJURY":
                    player.injuries += 1
                    self.state.add_log(f"On Fail: {player.username} gains 1 *additional* Injury!")
                elif threat.on_fail == "GIVE_SCRAP":
                    # TODO: Implement this
                    self.state.add_log(f"On Fail: {player.username} must give scrap!")

                # Discard threat
                self.state.threat_discard.append(threat)

            elif player.defense_result == "DEFEND":
                self.state.add_log(f"{player.username} DEFENDED against {threat.name}.")
                self.state.threat_discard.append(threat)

            elif player.defense_result == "KILL":
                self.state.add_log(f"{player.username} KILLED {threat.name}!")

                # Add to trophies
                player.trophies.append(threat.name)
                # DO NOT discard threat, it goes to trophy pile (which is just a list)

                # Gain Spoil
                spoil_str_parts = []
                for scrap_type, amount in threat.spoil.items():
                    player.scrap[scrap_type] = player.scrap.get(scrap_type, 0) + amount
                    spoil_str_parts.append(f"{amount} {scrap_type.value}")

                if spoil_str_parts:
                    spoil_str = ", ".join(spoil_str_parts)
                    self.state.add_log(f"{player.username} gains Spoil: {spoil_str}")

                # TODO: Handle "On Kill" effects (Recycler-Net, Boar Spear)
                # This should be handled in _check_defense_outcome or here.

        self._advance_phase()

    def _calculate_total_defense(
        self,
        player: PlayerState,
        defense_plan: Optional[PlayerDefense],
        threat: ThreatCard
    ) -> Dict[ScrapType, int]:
        """
        Calculates a player's *effective* total defense values for the round,
        accounting for scrap value, resistance, and upgrades.
        """

        total = {ScrapType.PARTS: 0, ScrapType.WIRING: 0, ScrapType.PLATES: 0}

        # 1. Base Defense (from Action cards in hand)
        plan = self.state.player_plans.get(player.user_id)
        if plan:
            base_defense = BASE_DEFENSE_FROM_ACTION.get(plan.action, {})
            for s, v in base_defense.items():
                total[s] += v

        # 2. Passive Defense (from Upgrades)
        passive = player.get_passive_defense()
        for s, v in passive.items():
            total[s] += v

        # 3. Arsenal Cards
        arsenal_cards_used = []
        if defense_plan:
            for card_id in defense_plan.arsenal_ids:
                # Find card in discard (if 1-use) or hand (if charges)
                card = next((c for c in player.arsenal_discard if c.id == card_id), None)
                if not card:
                    card = next((c for c in player.arsenal_hand if c.id == card_id), None)

                if card:
                    arsenal_cards_used.append(card)
                    for s, v in card.defense_boost.items():
                        total[s] += v

        # 4. Spent Scrap (The complex part)
        if defense_plan:
            # Check for special upgrades
            up_ids = {u.special_effect_id for u in player.upgrades}
            has_piercing_jaws = "PIERCING_JAWS" in up_ids
            has_serrated_parts = "SERRATED_PARTS" in up_ids
            has_focused_wiring = "FOCUSED_WIRING" in up_ids
            has_high_voltage = "HIGH_VOLTAGE_WIRE" in up_ids
            has_reinf_plating = "REINFORCED_PLATING" in up_ids
            has_layered_plating = "LAYERED_PLATING" in up_ids

            # TODO: Check for special arsenal cards
            # This logic is NOT implemented as it requires payload changes
            is_sludge_used = any(c.special_effect_id == "CORROSIVE_SLUDGE" for c in arsenal_cards_used)
            is_amp_used = any(c.special_effect_id == "MAKESHIFT_AMP" for c in arsenal_cards_used)


            for scrap_type, num_scrap in defense_plan.scrap_spent.items():
                if num_scrap == 0:
                    continue

                # Check Immunity first
                # TODO: This doesn't account for Sludge target
                if scrap_type in threat.immune and not is_sludge_used:
                    continue # Value is 0

                # Base value
                scrap_value = 2 # Rulebook [Sec 4]

                # Apply resistance
                is_resistant = scrap_type in threat.resistant
                if is_resistant:
                    # TODO: This doesn't account for Sludge target
                    if not is_sludge_used:
                        scrap_value -= 1 # Rulebook [Sec 4]

                # Apply player upgrades
                if scrap_type == ScrapType.PARTS:
                    if has_serrated_parts:
                        scrap_value += 1 # Rulebook Manifest
                    if has_piercing_jaws and is_resistant:
                        scrap_value += 1 # Negates the -1
                elif scrap_type == ScrapType.WIRING:
                    if has_high_voltage:
                        scrap_value += 1
                    if has_focused_wiring and is_resistant:
                        scrap_value += 1
                elif scrap_type == ScrapType.PLATES:
                    if has_layered_plating:
                        scrap_value += 1
                    if has_reinf_plating and is_resistant:
                        scrap_value += 1

                # TODO: Add logic for Makeshift Amp (not affected by R/I)

                total[scrap_type] += (num_scrap * scrap_value)

        return total

    def _check_defense_outcome(
        self,
        player: PlayerState,
        total_defense: Dict[ScrapType, int],
        threat: ThreatCard
    ) -> Dict[str, Any]:
        """
        Checks a player's *effective* defense against a threat.
        Assumes total_defense is already calculated.
        """

        effective_defense = total_defense # Already calculated

        defense_str = f"Defense (P/W/Pl): {effective_defense[ScrapType.PARTS]}/{effective_defense[ScrapType.WIRING]}/{effective_defense[ScrapType.PLATES]}"
        threat_str = f"Threat (F/C/M): {threat.ferocity}/{threat.cunning}/{threat.mass}"
        self.state.add_log(f"  {player.username} vs {threat.name}: {defense_str} vs {threat_str}")

        # TODO: Check for 'Adrenaline' card (requires new state)

        is_fail = (
            effective_defense[ScrapType.PARTS] < threat.ferocity and
            effective_defense[ScrapType.WIRING] < threat.cunning and
            effective_defense[ScrapType.PLATES] < threat.mass
        )
        if is_fail:
            return {"result": "FAIL"}

        # TODO: Check for 'Lure to Weakness' card (requires payload)
        # This would change the 'highest_stat_val' logic
        stats = {"ferocity": threat.ferocity, "cunning": threat.cunning, "mass": threat.mass}
        highest_stat_val = max(stats.values())

        met_highest_stat = False
        if effective_defense[ScrapType.PARTS] >= threat.ferocity and threat.ferocity == highest_stat_val:
            met_highest_stat = True
        if effective_defense[ScrapType.WIRING] >= threat.cunning and threat.cunning == highest_stat_val:
            met_highest_stat = True
        if effective_defense[ScrapType.PLATES] >= threat.mass and threat.mass == highest_stat_val:
            met_highest_stat = True

        if met_highest_stat:
            return {"result": "KILL"}

        return {"result": "DEFEND"}

    # --- Phase 5: ACTION (v1.8 Rules) ---

    def _start_action_phase(self):
        self.state.phase = GamePhase.ACTION
        self.state.add_log("Phase: ACTION. Survivors take their actions.")

        active_players = self.state.get_active_players_in_order()
        if not active_players:
            self.state.add_log("No active players. Skipping phase.")
            self._advance_phase()
            return

        self._start_next_action_turn(active_players[0].user_id)

    def _start_next_action_turn(self, player_id: str):
        """
        Starts the action turn for the given player.
        """
        self.state.action_turn_player_id = player_id
        player = self.state.get_player(player_id)
        if not player:
            return

        plan = self.state.player_plans.get(player_id)
        if not plan:
            self.state.add_log(f"{player.username} had no plan. Skipping action.")
            self._process_action_turn_end()
            return

        if player.action_prevented:
            self.state.add_log(f"{player.username}'s action ({plan.action.value}) was PREVENTED!")
            self._process_action_turn_end()
            return

        action = plan.action
        self.state.add_log(f"{player.username}'s action: {action.value}")

        if action == SurvivorActionCard.SCHEME:
            self.state.add_log(f"{player.username} uses SCHEME. They will act first next round.")
            # Rulebook Sec 5: Draw 1 random scrap
            self._player_draws_random_scrap(player, 1)
            player.initiative = -1 # Flag to be sorted first in Cleanup
            self._process_action_turn_end()

        elif action == SurvivorActionCard.SCAVENGE:
            # Handle Scavenger's Eye
            num_scrap = 2
            if any(u.special_effect_id == "SCAVENGERS_EYE" for u in player.upgrades):
                num_scrap = 3
            # Scavenge is now interactive
            player.action_choice_pending = action
            self.state.add_log(f"Waiting for {player.username} to choose {num_scrap} scrap...")

        elif action in [SurvivorActionCard.FORTIFY, SurvivorActionCard.ARMORY_RUN]:
            player.action_choice_pending = action
            self.state.add_log(f"Waiting for {player.username} to make a choice...")

        else:
            self.state.add_log(f"Unknown action {action}. Skipping.")
            self._process_action_turn_end()

    def submit_action_choice(self, player_id: str, payload: Dict[str, Any]) -> bool:
        """
        Handles the player's choice for an interactive action.
        """
        if self.state.phase != GamePhase.ACTION:
            return False

        if player_id != self.state.action_turn_player_id:
            return False

        player = self.state.get_player(player_id)
        if not player or not player.action_choice_pending:
            return False

        action = player.action_choice_pending
        choice_type = payload.get("choice_type")

        # Handle passing the action
        # This is now only used for Scavenge (if they don't want to pick)
        if choice_type == "pass_action":
            self.state.add_log(f"{player.username} passes their action.")
            player.action_choice_pending = None
            self._process_action_turn_end()
            return True

        if action == SurvivorActionCard.SCAVENGE and choice_type == "scavenge":
            num_to_choose = 2
            if any(u.special_effect_id == "SCAVENGERS_EYE" for u in player.upgrades):
                num_to_choose = 3

            scraps = payload.get("scraps", [])
            if not isinstance(scraps, list) or len(scraps) != num_to_choose:
                self.state.add_log(f"Invalid scrap choice: expected {num_to_choose}.")
                return False

            try:
                scraps_to_add = [ScrapType(s) for s in scraps]
                for s in scraps_to_add:
                    player.scrap[s] = player.scrap.get(s, 0) + 1
                scrap_str = ", ".join(s.value for s in scraps_to_add)
                self.state.add_log(f"{player.username} scavenges: {scrap_str}")
            except ValueError:
                return False

        elif action == SurvivorActionCard.FORTIFY and choice_type == "fortify":
            card_id = payload.get("card_id")

            # Handle Fallback
            if not card_id or card_id == "pass":
                self.state.add_log(f"{player.username} cannot/chooses not to Fortify. Drawing 2 random scrap.")
                self._player_draws_random_scrap(player, 2)
            else:
                card = next((c for c in self.state.market.upgrade_market if c.id == card_id), None)
                if not card:
                    self.state.add_log("Invalid card ID.")
                    return False

                # Rulebook Sec 5: No discount
                if not player.can_afford(card.cost):
                    self.state.add_log(f"{player.username} cannot afford {card.name}. Choose 'Pass' to get fallback.")
                    return False # Let user retry

                player.pay_cost(card.cost)
                player.upgrades.append(card)
                self.state.market.upgrade_market.remove(card)
                self.state.add_log(f"{player.username} built {card.name}!")

        elif action == SurvivorActionCard.ARMORY_RUN and choice_type == "armory_run":
            card_id = payload.get("card_id")

            # Handle Fallback
            if not card_id or card_id == "pass":
                self.state.add_log(f"{player.username} cannot/chooses not to Armory Run. Drawing 2 random scrap.")
                self._player_draws_random_scrap(player, 2)
            else:
                card = next((c for c in self.state.market.arsenal_market if c.id == card_id), None)
                if not card:
                    self.state.add_log("Invalid card ID.")
                    return False

                # Rulebook Sec 5: No discount
                if not player.can_afford(card.cost):
                    self.state.add_log(f"{player.username} cannot afford {card.name}. Choose 'Pass' to get fallback.")
                    return False # Let user retry

                player.pay_cost(card.cost)
                player.arsenal_hand.append(card)
                self.state.market.arsenal_market.remove(card)
                self.state.add_log(f"{player.username} acquired {card.name}!")

        else:
            self.state.add_log(f"Mismatched action choice: {action} vs {choice_type}")
            return False

        player.action_choice_pending = None
        self._process_action_turn_end()
        return True

    def _process_action_turn_end(self):
        """Advances to the next player in the Action phase."""

        current_player_id = self.state.action_turn_player_id
        active_players_ordered = self.state.get_active_players_in_order()
        
        if not active_players_ordered:
            self.state.add_log("No active players. Advancing phase.")
            self._advance_phase()
            return

        try:
            current_idx = [p.user_id for p in active_players_ordered].index(current_player_id)
        except ValueError:
            self.state.add_log("Error: Could not find current action player. Advancing phase.")
            self._advance_phase()
            return

        if current_idx == len(active_players_ordered) - 1:
            self.state.action_turn_player_id = None
            self.state.add_log("All actions complete.")
            self._advance_phase()
        else:
            next_player = active_players_ordered[current_idx + 1]
            self._start_next_action_turn(next_player.user_id)

    # --- Phase 6: CLEANUP ---

    def _start_cleanup_phase(self):
        self.state.phase = GamePhase.CLEANUP
        self.state.add_log("Phase: CLEANUP.")

        # 1. Store last-used cards
        for player in self.state.players.values():
            plan = self.state.player_plans.get(player.user_id)
            if plan:
                player.last_round_lure = plan.lure
                player.last_round_action = plan.action

        # 2. Base Income
        # Rulebook Sec 6: Every player draws 1 scrap randomly
        self.state.add_log("All active players gain 1 random scrap for Base Income.")
        for player in self.state.players.values():
            if player.status == PlayerStatus.ACTIVE:
                self._player_draws_random_scrap(player, 1)

        # 3. Spoils (Handled in _resolve_all_defenses)

        # 4. Initiative Queue
        # Rulebook Sec 6: Queue does not change, except for Scheme
        schemer_id = None
        for player in self.state.get_active_players_in_order():
            if player.initiative == -1: # Flag set by SCHEME
                schemer_id = player.user_id
                player.initiative = 0 # Reset flag
                break

        if schemer_id:
            schemer_name = self.state.get_player(schemer_id).username
            self.state.add_log(f"{schemer_name} (Scheme) takes first initiative!")
            current_queue = self.state.initiative_queue
            # Rebuild queue, preserving order of non-active players
            active_queue = [pid for pid in current_queue if self.state.get_player(pid).status == PlayerStatus.ACTIVE]
            inactive_queue = [pid for pid in current_queue if self.state.get_player(pid).status != PlayerStatus.ACTIVE]

            if schemer_id in active_queue:
                active_queue.remove(schemer_id)
                self.state.initiative_queue = [schemer_id] + active_queue + inactive_queue
            else:
                 # Schemer must have disconnected/surrendered after playing scheme
                 # but before cleanup. Put them at front of inactive queue.
                 if schemer_id in inactive_queue:
                    inactive_queue.remove(schemer_id)
                 self.state.initiative_queue = active_queue + [schemer_id] + inactive_queue


        # Set new first player
        if self.state.initiative_queue:
            # self.state.first_player = self.state.initiative_queue[0] # Removed, field no longer exists
            pass
        else:
            # self.state.first_player = None # Removed, field no longer exists
            pass

        self.state.add_log("Initiative Order:")
        for i, pid in enumerate(self.state.initiative_queue):
            player = self.state.get_player(pid)
            if player:
                fp_marker = "(First Player)" if i == 0 else ""
                status_marker = f"({player.status.value})" if player.status != PlayerStatus.ACTIVE else ""
                self.state.add_log(f"  {i+1}. {player.username} {fp_marker} {status_marker}")

        # 5. Refill Markets
        # Rulebook Sec 6: Refill the Upgrade and Arsenal markets.
        self.state.add_log("Refilling markets...")
        # Rulebook Sec 3: "number of players minus one (minimum of 2, max 4)"
        # Use total players in game, not just active
        market_size = max(2, min(4, len(self.state.players) - 1))

        self._refill_market(self.state.upgrade_deck, self.state.market.upgrade_market, market_size, self.state.upgrade_discard)
        self._refill_market(self.state.arsenal_deck, self.state.market.arsenal_market, market_size, self.state.arsenal_discard)

        # 6. Era Check (Handled in _advance_phase)
        self._advance_phase()

    # --- Phase 7: INTERMISSION (v1.8 Rules) ---

    def _start_intermission_phase(self):
        self.state.phase = GamePhase.INTERMISSION
        self.state.add_log("Phase: INTERMISSION. Survivors may buy one item.")

        # Markets are already refilled by Cleanup

        self.state.intermission_players_acted = []

        active_players = self.state.get_active_players_in_order()
        if not active_players:
            self.state.add_log("No active players. Skipping Intermission.")
            self._advance_phase()
            return

        first_player_id = active_players[0].user_id
        self.state.intermission_turn_player_id = first_player_id

        player = self.state.get_player(first_player_id)
        if player:
            self.state.add_log(f"Starting with {player.username} (first in initiative).")

    def buy_market_card(self, user_id: str, card_id: str, card_type: str) -> bool:
        if self.state.phase != GamePhase.INTERMISSION:
            return False

        if user_id != self.state.intermission_turn_player_id:
            return False

        player = self.state.get_player(user_id)
        if not player or user_id in self.state.intermission_players_acted:
            return False

        card = None
        market_list = None

        if card_type == "UPGRADE":
            market_list = self.state.market.upgrade_market
            card = next((c for c in market_list if c.id == card_id), None)
        elif card_type == "ARSENAL":
            market_list = self.state.market.arsenal_market
            card = next((c for c in market_list if c.id == card_id), None)

        if not card or market_list is None:
            return False

        if not player.can_afford(card.cost):
            self.state.add_log(f"{player.username} cannot afford {card.name}")
            return False

        player.pay_cost(card.cost)
        market_list.remove(card)

        if card_type == "UPGRADE":
            player.upgrades.append(cast(UpgradeCard, card))
        elif card_type == "ARSENAL":
            player.arsenal_hand.append(cast(ArsenalCard, card))

        self.state.add_log(f"{player.username} purchased {card.name}.")

        # Do not refill market per Rulebook Sec 7

        self.pass_intermission_turn(user_id, bought_card=True)

        return True

    def pass_intermission_turn(self, user_id: str, bought_card: bool = False) -> bool:
        if self.state.phase != GamePhase.INTERMISSION:
            return False

        if user_id != self.state.intermission_turn_player_id:
            return False

        player = self.state.get_player(user_id)
        if not player:
            return False

        if user_id not in self.state.intermission_players_acted:
            if not bought_card:
                self.state.add_log(f"{player.username} passes their turn.")
            self.state.intermission_players_acted.append(user_id)

        active_initiative = [p.user_id for p in self.state.get_active_players_in_order()]

        try:
            current_idx = active_initiative.index(user_id)
        except ValueError:
            self.state.add_log("Error: Could not find current intermission player.")
            self._advance_phase()
            return True

        next_player_id = None
        for i in range(1, len(active_initiative) + 1): # Check all players
            next_idx = (current_idx + i) % len(active_initiative)
            pid = active_initiative[next_idx]
            if pid not in self.state.intermission_players_acted:
                next_player_id = pid
                break

        if next_player_id:
            self.state.intermission_turn_player_id = next_player_id
            next_player = self.state.get_player(next_player_id)
            self.state.add_log(f"It is {next_player.username}'s turn to buy.")
        else:
            self.state.add_log("Intermission buying phase is over.")
            self.state.intermission_turn_player_id = None
            self._advance_phase()

        return True

    def _refill_market(
        self,
        deck: List,
        market_list: List,
        target_size: int,
        discard_pile: List
    ):
        """Refills a market list from its deck."""

        while len(market_list) < target_size:
            if not deck:
                if not discard_pile:
                    self.state.add_log(f"Market deck and discard are empty.")
                    break

                self.state.add_log("Market deck empty, reshuffling discard...")
                deck.extend(discard_pile)
                discard_pile.clear()
                random.shuffle(deck)

            if not deck: # Still empty after shuffle?
                break

            market_list.append(deck.pop(0))

    # --- Phase Advancement ---

    def _advance_phase(self):
        """
        Main state machine logic.
        """
        current_phase = self.state.phase

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
            if self.state.round == TOTAL_ROUNDS:
                self._start_game_over()
                return

            if self.state.round % ROUNDS_PER_ERA == 0:
                self._start_intermission_phase()
            else:
                self.state.round += 1
                self._start_wilderness_phase()

        elif current_phase == GamePhase.INTERMISSION:
            self.state.round += 1
            self.state.era += 1
            self.state.add_log(f"Entering Era {self.state.era}.")
            self._start_wilderness_phase()

    # --- Game End ---

    def _start_game_over(self):
        self.state.phase = GamePhase.GAME_OVER
        self.state.add_log("--- GAME OVER ---")

        # [Source 99] Determine winner
        # Get all players who finished
        finalist_players = [
            p for p in self.state.players.values()
            if p.status in [PlayerStatus.ACTIVE, PlayerStatus.DISCONNECTED]
        ]

        if not finalist_players:
            self.state.add_log("No active players remaining. No winner.")
            return

        # Tie-breaker #1: Trophies
        # Tie-breaker #2: Total Scrap
        # Tie-breaker #3: (Implied) Initiative

        # Create a stable initiative tiebreak map
        initiative_tiebreak = {pid: i for i, pid in enumerate(self.state.initiative_queue)}

        sorted_players = sorted(
            finalist_players,
            key=lambda p: (
                p.injuries,                  # 1. Fewest Injuries
                -len(p.trophies),            # 2. Most Trophies
                -p.get_total_scrap(),        # 3. Most Scrap
                initiative_tiebreak.get(p.user_id, 99) # 4. Initiative
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
                pid for pid, p in self.state.players.items() if p.plan_submitted
            }
        elif check_type == "defenses":
            submitted_ids = {
                pid for pid, p in self.state.players.items() if p.defense_submitted
            }
        else:
            return False

        return active_player_ids.issubset(submitted_ids)
