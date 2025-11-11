"""
Handles the business logic for specific, validated player actions.
"""
from ...game_core.game_models import (
    GameState, LureCard, PlayerState, PlayerPlans, PlayerDefense, ScrapType, SurvivorActionCard,
    UpgradeCard, ArsenalCard, PlayerStatus, GamePhase,
    PlanPayload, AssignThreatPayload, DefensePayload,
    ScavengePayload, FortifyPayload, ArmoryRunPayload, BuyPayload
)
from ...game_core.card_effects import ArsenalEffect
from .validation import GameValidator
from .phase_manager import GamePhaseManager


class GameActionHandler:
    """
    Contains methods to execute the core logic of player actions.
    Assumes that the actions have already been validated by the time
    they reach this handler.
    """

    def __init__(self, state: GameState, validator: GameValidator, phase_manager: GamePhaseManager):
        self.state = state
        self.validator = validator
        self.phase_manager = phase_manager

    async def submit_plan(self, player: PlayerState, payload: PlanPayload):
        # The payload contains the simple keys (e.g., "BLOODY_RAGS")
        lure_card_key = payload.lure_card_id
        action_card_key = payload.action_card_id

        # Find the actual card instances using the keys
        lure_card = self.validator.find_card_in_hand_by_key(
            player, lure_card_key, LureCard
        )
        action_card = self.validator.find_card_in_hand_by_key(
            player, action_card_key, SurvivorActionCard
        )

        # This validation correctly uses the card's instance ID (UUID)
        self.validator.validate_lure_not_used_last_round(player, lure_card.id)

        # The plan is stored with both the instance ID (for backend)
        # and the simple key (for frontend)
        plan = PlayerPlans(
            lure_card_id=lure_card.id,
            action_card_id=action_card.id,
            lure_card_key=lure_card_key,
            action_card_key=action_card_key
        )
        self.state.player_plans[player.user_id] = plan
        player.plan = plan
        self.state.add_log(f"{player.username} has submitted their plan.")

        if self.phase_manager.are_all_players_ready("plans"):
            await self.phase_manager.advance_to_attraction()

    async def assign_threat(self, player: PlayerState, payload: AssignThreatPayload):
        threat_id = payload.threat_id
        self.validator.validate_threat_is_available(threat_id)
        threat = next((t for t in self.state.current_threats if t.id == threat_id), None)
        if not threat:
             raise ValueError(f"Threat {threat_id} not found.")

        if self.state.attraction_phase_state == "FIRST_PASS":
            self.validator.validate_lure_matches_threat(player, threat)

        self.state.add_log(f"{player.username} attracts the {threat.name}.")
        self.state.player_threat_assignment[player.user_id] = threat.id
        self.state.available_threat_ids.remove(threat.id)
        self.state.unassigned_player_ids.remove(player.user_id)

        await self.phase_manager.advance_attraction_turn()

    async def submit_defense(self, player: PlayerState, payload: DefensePayload):
        if not self.state.get_assigned_threat(player.user_id):
            if not self.phase_manager.are_all_players_ready("defenses"):
                raise ValueError("You do not have a threat to defend against.")
            else:
                self.state.add_log(f"{player.username} is ready (no threat).")
                await self.phase_manager.resolve_defense_phase()
                return

        self.validator.validate_scrap_payment(player, payload.scrap_spent, check_only=False)
        arsenal_cards_to_use = self.validator.validate_arsenal_cards_in_hand(player, payload.arsenal_card_ids)
        self.validator.validate_special_defense_inputs(payload, arsenal_cards_to_use)

        for scrap_type, count in payload.scrap_spent.items():
            player.add_scrap(scrap_type, -count)

        defense = PlayerDefense(**payload.model_dump())
        self.state.player_defenses[player.user_id] = defense
        player.defense = defense
        self.state.add_log(f"{player.username} has submitted their defense.")

        if self.phase_manager.are_all_players_ready("defenses"):
            await self.phase_manager.resolve_defense_phase()

    async def scavenge(self, player: PlayerState, payload: ScavengePayload):
        self.validator.validate_planned_action(player, "SCAVENGE")

        if len(payload.choices) != 2:
            self.state.add_log(f"Error: {player.username} (Scavenge) invalid choices. Defaulting to random.")
            self.phase_manager.draw_random_scrap(player, 2)
        else:
            try:
                for choice in payload.choices:
                    # Ensure choice is a valid ScrapType Enum
                    s_type = ScrapType(choice)
                    player.add_scrap(s_type, 1)
                self.state.add_log(f"{player.username} (Scavenge) takes 1 {payload.choices[0]} and 1 {payload.choices[1]}.")
            except (ValueError, TypeError):
                self.state.add_log(f"Error: {player.username} (Scavenge) invalid scrap types. Defaulting to random.")
                self.phase_manager.draw_random_scrap(player, 2)

        await self.phase_manager.resolve_action_phase()

    async def fortify(self, player: PlayerState, payload: FortifyPayload):
        self.validator.validate_planned_action(player, "FORTIFY")

        if not payload.card_id:
            self.state.add_log(f"{player.username} (Fortify) chooses fallback.")
            self.phase_manager.draw_random_scrap(player, 2)
        else:
            card, source_list = self.validator.validate_market_card(payload.card_id, UpgradeCard)
            if not player.can_afford(card.cost):
                self.state.add_log(f"{player.username} (Fortify) cannot afford {card.name}. Taking fallback.")
                self.phase_manager.draw_random_scrap(player, 2)
            else:
                player.pay_cost(card.cost)
                source_list.remove(card)
                player.upgrade_cards.append(card)
                self.state.add_log(f"{player.username} (Fortify) buys {card.name}.")

        await self.phase_manager.resolve_action_phase()

    async def armory_run(self, player: PlayerState, payload: ArmoryRunPayload):
        self.validator.validate_planned_action(player, "ARMORY RUN")

        if not payload.card_id:
            self.state.add_log(f"{player.username} (Armory Run) chooses fallback.")
            self.phase_manager.draw_random_scrap(player, 2)
        else:
            card, source_list = self.validator.validate_market_card(payload.card_id, ArsenalCard)
            if not player.can_afford(card.cost):
                self.state.add_log(f"{player.username} (Armory Run) cannot afford {card.name}. Taking fallback.")
                self.phase_manager.draw_random_scrap(player, 2)
            else:
                player.pay_cost(card.cost)
                source_list.remove(card)
                player.arsenal_cards.append(card)
                self.state.add_log(f"{player.username} (Armory Run) buys {card.name}.")

        await self.phase_manager.resolve_action_phase()

    async def scheme(self, player: PlayerState):
        self.validator.validate_planned_action(player, "SCHEME")

        self.state.add_log(f"{player.username} (Scheme) takes 1 random scrap and moves to the front.")
        self.phase_manager.draw_random_scrap(player, 1)

        if player.user_id in self.state.initiative_queue:
            self.state.initiative_queue.remove(player.user_id)
        self.state.initiative_queue.insert(0, player.user_id)

        await self.phase_manager.resolve_action_phase()

    async def intermission_buy(self, player: PlayerState, payload: BuyPayload):
        card, source_list = self.validator.validate_market_card(payload.card_id)

        source_list.remove(card)
        if isinstance(card, UpgradeCard):
            player.upgrade_cards.append(card)
        elif isinstance(card, ArsenalCard):
            player.arsenal_cards.append(card)
        else:
            source_list.append(card)
            raise ValueError(f"Card {card.name} is not an Upgrade or Arsenal card.")

        self.state.add_log(f"{player.username} took FREE Intermission card: {card.name}.")
        self.state.intermission_purchases[player.user_id] = 1
        await self.phase_manager.resolve_intermission()

    async def intermission_pass(self, player: PlayerState):
        self.state.add_log(f"{player.username} passes their free buy.")
        self.state.intermission_purchases[player.user_id] = -1
        await self.phase_manager.resolve_intermission()

    async def surrender(self, player: PlayerState):
        self.state.add_log(f"{player.username} has surrendered.")
        player.status = PlayerStatus.SURRENDERED
        if len(self.state.get_active_players_in_order()) <= 1:
            await self.phase_manager.end_game()

    async def disconnect(self, player: PlayerState):
        self.state.add_log(f"{player.username} has disconnected.")
        player.status = PlayerStatus.DISCONNECTED
        if len(self.state.get_active_players_in_order()) <= 1:
            await self.phase_manager.end_game()


class ActionDispatcher:
    """Routes validated actions to the GameActionHandler."""

    def __init__(self, action_handler: GameActionHandler, validator: GameValidator):
        self.handler = action_handler
        self.validator = validator
        self.state = action_handler.state

    async def dispatch(self, player: PlayerState, action: str, payload: dict):
        # Global actions first
        if action == "surrender":
            await self.handler.surrender(player)
            return
        if action == "disconnect":
            await self.handler.disconnect(player)
            return

        # Phase-specific actions
        # --- FIX: Compare against Enum object, not string ---
        phase = self.state.phase
        
        if phase == GamePhase.PLANNING and action == "submit_plan":
            self.validator.validate_player_can_act(player, phase)
            self.validator.validate_player_has_not_acted(player.user_id, self.state.player_plans, "plan")
            await self.handler.submit_plan(player, PlanPayload(**payload))

        elif phase == GamePhase.ATTRACTION and action == "assign_threat":
            self.validator.validate_player_can_act(player, phase, self.state.attraction_turn_player_id)
            await self.handler.assign_threat(player, AssignThreatPayload(**payload))

        elif phase == GamePhase.DEFENSE and action == "submit_defense":
            self.validator.validate_player_can_act(player, phase)
            self.validator.validate_player_has_not_acted(player.user_id, self.state.player_defenses, "defense")
            await self.handler.submit_defense(player, DefensePayload(**payload))

        elif phase == GamePhase.ACTION:
            self.validator.validate_player_can_act(player, phase, self.state.action_turn_player_id)
            self.validator.validate_action_is_not_prevented(player)
            if action == "perform_scavenge": await self.handler.scavenge(player, ScavengePayload(**payload))
            elif action == "perform_fortify": await self.handler.fortify(player, FortifyPayload(**payload))
            elif action == "perform_armory_run": await self.handler.armory_run(player, ArmoryRunPayload(**payload))
            elif action == "perform_scheme": await self.handler.scheme(player)
            else: raise ValueError(f"Action '{action}' not allowed in ACTION phase.")

        elif phase == GamePhase.INTERMISSION:
            self.validator.validate_player_can_act(player, phase, self.state.intermission_turn_player_id)
            self.validator.validate_player_has_not_bought_or_passed(player)
            if action == "buy_from_market": await self.handler.intermission_buy(player, BuyPayload(**payload))
            elif action == "pass_buy": await self.handler.intermission_pass(player)
            else: raise ValueError(f"Action '{action}' not allowed in INTERMISSION phase.")

        else:
            raise ValueError(f"Unknown action '{action}' in phase {phase.value}")