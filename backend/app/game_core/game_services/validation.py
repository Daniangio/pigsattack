"""
Handles all game logic validation.
"""
from typing import List, Optional, Dict, Any, Tuple, Type
from ...game_core.game_models import (
    GameState, PlayerState, GamePhase, Card, LureCard, ScrapType, SurvivorActionCard,
    ThreatCard, ArsenalCard, UpgradeCard, PlayerStatus, DefensePayload
)
from ...game_core.card_effects import ArsenalEffect

class GameValidator:
    """
    A stateless service for validating game actions and states.
    Raises ValueError on failed validation.
    """

    def __init__(self, state: GameState):
        self.state = state

    def validate_player_can_act(self, player: PlayerState, expected_phase: GamePhase, expected_turn_player_id: Optional[str] = None):
        if self.state.phase != expected_phase:
            raise ValueError(f"Action not allowed in {self.state.phase} phase. Expected {expected_phase}.")
        if player.status != PlayerStatus.ACTIVE:
            raise ValueError(f"You are not an active player ({player.status}).")
        if expected_turn_player_id and expected_turn_player_id != player.user_id:
            raise ValueError("It is not your turn.")

    def find_card_in_hand_by_key(self, player: PlayerState, card_key: str, expected_type: Type[Card]) -> Card:
        """
        Finds a card in the player's hand matching a constant key (e.g., "BLOODY_RAGS").
        This is used to translate frontend keys into backend card instances.
        """
        search_lists = []
        if expected_type == LureCard:
            search_lists = [player.lure_cards]
        elif expected_type == SurvivorActionCard:
            search_lists = [player.action_cards]
        elif expected_type == ArsenalCard:
            search_lists = [player.arsenal_cards]
        elif expected_type == UpgradeCard:
            search_lists = [player.upgrade_cards]
        elif expected_type == Card:
            # Search all lists if base Card type is requested
            search_lists = [
                player.lure_cards,
                player.action_cards,
                player.arsenal_cards,
                player.upgrade_cards
            ]
        else:
            raise ValueError(f"Unknown card type {expected_type.__name__} for key {card_key}.")

        search_key = card_key.upper()
        for card_list in search_lists:
            for card in card_list:
                # Match logic: "Bloody Rags" -> "BLOODY_RAGS"
                # "Armory Run" -> "ARMORY_RUN"
                card_name_key = card.name.upper().replace(" ", "_")
                if card_name_key == search_key:
                    return card
        
        # If no match
        raise ValueError(f"Card with key {card_key} not found in your hand.")

    def validate_player_has_not_acted(self, player_id: str, action_map: Dict[str, Any], action_name: str):
        if player_id in action_map:
            raise ValueError(f"You have already submitted your {action_name}.")

    def validate_card_in_hand(self, player: PlayerState, card_id: str, expected_type: Optional[Type[Card]] = None) -> Card:
        """
        Validates that a card with a specific *instance ID* (UUID) is in the player's hand.
        """
        card = player.get_card_from_hand(card_id)
        if not card:
            raise ValueError(f"Card with ID {card_id} not found in your hand.")
        if expected_type and not isinstance(card, expected_type):
            raise ValueError(f"Invalid card type for {card.name}. Expected {expected_type.__name__}.")
        return card

    def validate_lure_not_used_last_round(self, player: PlayerState, lure_card_id: str):
        if lure_card_id == player.last_round_lure_id:
            raise ValueError("Cannot use the same Lure Card as last round.")

    def validate_threat_is_available(self, threat_id: str):
        if threat_id not in self.state.available_threat_ids:
            raise ValueError("That threat is not available.")

    def validate_lure_matches_threat(self, player: PlayerState, threat: ThreatCard):
        plan = self.state.player_plans.get(player.user_id)
        if not plan:
            raise ValueError("Cannot find your plan to validate lure match.")
        
        lure_card = self.validate_card_in_hand(player, plan.lure_card_id, LureCard)
        
        # --- FIX: Use Enum object as key, not string value ---
        lure_name_map = {
            ScrapType.PARTS: "Rags",
            ScrapType.WIRING: "Noises",
            ScrapType.PLATES: "Fruit"
        }
        lure_type_name = lure_name_map.get(lure_card.lure_type) # Use Enum object
        
        if not lure_type_name or lure_type_name not in threat.lure_type.split('/'):
            raise ValueError(f"Your lure ({lure_type_name}) does not match {threat.name} ({threat.lure_type}).")

    def validate_scrap_payment(self, player: PlayerState, scrap_spent: Dict[ScrapType, int], check_only=False):
        for scrap_type, count in scrap_spent.items():
            if player.scrap.get(scrap_type, 0) < count:
                raise ValueError(f"Not enough {scrap_type.value} scrap. You have {player.scrap.get(scrap_type, 0)}, need {count}.")

    def validate_arsenal_cards_in_hand(self, player: PlayerState, arsenal_card_ids: List[str]) -> List[ArsenalCard]:
        return [self.validate_card_in_hand(player, card_id, ArsenalCard) for card_id in arsenal_card_ids]

    def validate_special_defense_inputs(self, payload: DefensePayload, arsenal_cards: List[ArsenalCard]):
        has_lure_to_weakness = any(c.special_effect_id == ArsenalEffect.SPECIAL_LURE_TO_WEAKNESS for c in arsenal_cards)
        if has_lure_to_weakness and not payload.special_target_stat:
            raise ValueError("You must select a target stat for 'Lure to Weakness'.")

        has_corrosive = any(c.special_effect_id == ArsenalEffect.SPECIAL_CORROSIVE_SLUDGE for c in arsenal_cards)
        if has_corrosive and not payload.special_corrode_stat:
            raise ValueError("You must select a stat for 'Corrosive Sludge'.")

    def validate_action_is_not_prevented(self, player: PlayerState):
        if player.action_prevented:
            raise ValueError("Your action is prevented this round!")

    def validate_planned_action(self, player: PlayerState, expected_action: str):
        plan = self.state.player_plans.get(player.user_id)
        if not plan:
            raise ValueError("Cannot find your plan for this round.")
        action_card = self.validate_card_in_hand(player, plan.action_card_id, SurvivorActionCard)
        
        # --- FIX: Use simple name.upper() check, no replace() ---
        if action_card.name.upper() != expected_action:
            raise ValueError(f"Your planned action was {action_card.name}, not {expected_action}.")

    def validate_market_card(self, card_id: str, expected_type: Optional[Type[Card]] = None) -> Tuple[Card, List]:
        for card_list in [self.state.market.upgrade_faceup, self.state.market.arsenal_faceup]:
            for card in card_list:
                if card.id == card_id:
                    if expected_type and not isinstance(card, expected_type):
                        raise ValueError(f"Card {card.name} is not of expected type {expected_type.__name__}.")
                    return card, card_list
        raise ValueError(f"Card {card_id} not in market.")

    def validate_player_has_not_bought_or_passed(self, player: PlayerState):
        if self.state.intermission_purchases.get(player.user_id, 0) != 0:
            raise ValueError("You have already bought or passed.")