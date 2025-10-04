import time
from typing import List, Dict, Any, Optional, Tuple, TYPE_CHECKING

from pigsattack.core.card import Card
from pigsattack.core.player import Player
from pigsattack.core.controller import PlayerController
from pigsattack.core.gamestate import GameState

if TYPE_CHECKING:
    from .server_view import ServerView
    from .game_room import GameRoom

class NetworkController(PlayerController):
    """A controller that gets its input over the network via the ServerView."""
    def __init__(self, player_index: int, view: 'ServerView', room: 'GameRoom'):
        self.player_index = player_index
        self.view = view
        self.room = room
        self.client_inputs = room.client_inputs

    def _get_input(self, prompt: str, choices: Optional[List[Dict[str, Any]]] = None, mode: str = "buttons") -> str:
        """Sends a prompt to the client and blocks until an input is received."""
        # Pass the room context to the view
        self.view.prompt_for_input(self.player_index, prompt, choices, mode, self.room)
        
        while self.player_index not in self.client_inputs:
            # Check if the game has ended while waiting for input
            # The room's state is the source of truth now
            # Use a string for the class name to avoid runtime import
            state_class_name = self.room.state.__class__.__name__
            if state_class_name != 'GameState':
                return ""
            
            # Check if the current player has been eliminated (e.g., by surrendering)
            # The game_instance is on the state object, not the room itself.
            if not hasattr(self.room.state, 'game_instance') or not self.room.state.game_instance:
                return "" # Game instance not ready, exit gracefully
            player_obj = self.room.state.game_instance._players[self.player_index]
            if player_obj.is_eliminated:
                return ""
            time.sleep(0.1)
        
        user_input = self.client_inputs.pop(self.player_index, "")
        return user_input

    def choose_action(self, player: Player, game_state: GameState, available_actions: List[str]) -> str:
        choices = [{"text": action, "value": action} for action in available_actions]
        return self._get_input("Choose your action:", choices)
        
    def choose_to_ask_for_help(self, player: Player, game_state: GameState) -> bool:
        choices = [{"text": "Yes", "value": "yes"}, {"text": "No", "value": "no"}]
        return self._get_input("Ask others for help?", choices).lower() == 'yes'

    def offer_help(self, player: Player, attacker: Player, game_state: GameState) -> Optional[Card]:
        prompt = f"{attacker.name} is under attack! Click a card to offer, or click Skip."
        card_id_str = self._get_input(prompt, mode="card_select")
        if card_id_str == 'skip':
            return None
        try:
            card_id = int(card_id_str)
            return next((card for card in player.hand if card.card_id == card_id), None)
        except (ValueError, TypeError):
            return None

    def choose_helper(self, player: Player, offers: List[Tuple[Player, Card]], game_state: GameState) -> Optional[Tuple[Player, Card]]:
        prompt = "Choose which offer of help to accept."
        choices = [{"text": f"{helper.name} offers {card}", "value": str(i)} for i, (helper, card) in enumerate(offers)]
        choice_idx_str = self._get_input(prompt, choices)
        try:
            choice_idx = int(choice_idx_str)
            if 0 <= choice_idx < len(offers):
                return offers[choice_idx]
        except (ValueError, TypeError):
            return None

    def choose_defense_cards(self, player: Player, game_state: GameState) -> List[Card]:
        prompt = "Select cards to defend (click cards, then 'Done')."
        card_ids_str = self._get_input(prompt, mode="multi_card_select")
        if not card_ids_str or card_ids_str.lower() == 'done':
            return []
        try:
            card_ids = {int(s.strip()) for s in card_ids_str.split()}
            return [c for c in player.hand if c.card_id in card_ids]
        except (ValueError, TypeError):
            return []

    def choose_card_to_discard(self, player: Player, game_state: GameState, reason: str) -> Optional[Card]:
        prompt = f"{reason}. Click one card to discard."
        card_id_str = self._get_input(prompt, mode="card_select")
        try:
            card_id = int(card_id_str)
            return next((card for card in player.hand if card.card_id == card_id), None)
        except (ValueError, TypeError):
            return None
    
    def choose_wilderness_find_swap(self, player: Player, game_state: GameState) -> bool:
        choices = [{"text": "Yes, Swap", "value": "yes"}, {"text": "No, Keep", "value": "no"}]
        return self._get_input("Wilderness Find: Swap a card?", choices).lower() == 'yes'

    # Simplified versions for brevity; a full implementation would prompt for choices
    def choose_special_gear_card(self, p, cards, a): return cards[0]
    def choose_sabotage_target(self, p, targets, g): return targets[0]
    def choose_card_to_steal(self, p, target): return target.hand[0]