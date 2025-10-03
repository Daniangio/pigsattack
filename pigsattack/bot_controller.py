# bot_controller.py
import random
from typing import List, Optional, Tuple

from pigsattack.controller import PlayerController
from pigsattack.card import Card

# Forward declarations for type hinting
class Player: pass
class GameState: pass


class NaiveBotController(PlayerController):
    """A simple AI controller with a naive, selfish strategy."""

    def choose_action(self, player: 'Player', game_state: 'GameState', available_actions: List[str]) -> str:
        # Prioritize special actions, otherwise just draw a card.
        if "Build Barricade" in available_actions:
            return "Build Barricade"
        if "King's Feast" in available_actions:
            return "King's Feast"
        if "Sabotage" in available_actions:
            return "Sabotage"
        return "Scrounge"

    def choose_to_ask_for_help(self, player: 'Player', game_state: 'GameState') -> bool:
        # Always ask for help, it can't hurt.
        return True

    def offer_help(self, player: 'Player', attacker: 'Player', game_state: 'GameState') -> Optional['Card']:
        # Naive bot is selfish and never helps.
        return None

    def choose_helper(self, player: 'Player', offers: List[Tuple['Player', 'Card']], game_state: 'GameState') -> Optional[Tuple['Player', 'Card']]:
        # Accept the offer with the highest value card.
        if not offers:
            return None
        return max(offers, key=lambda offer: offer[1].value)

    def choose_defense_cards(self, player: 'Player', game_state: 'GameState') -> List['Card']:
        # This bot is not smart. It just throws all its cards at the problem.
        # A better bot would use the minimum necessary.
        return player.hand[:]

    def choose_special_gear_card(self, player: 'Player', cards: List['Card'], action_name: str) -> 'Card':
        # Just use the first available card.
        return cards[0]

    def choose_sabotage_target(self, player: 'Player', targets: List['Player'], game_state: 'GameState') -> 'Player':
        # Pick a random target.
        return random.choice(targets)

    def choose_card_to_steal(self, player: 'Player', target: 'Player') -> 'Card':
        # Steal the highest value card from the target.
        if not target.hand:
            # This case should be handled by the game logic, but as a fallback:
            return None 
        return max(target.hand, key=lambda card: card.value)

    def choose_wilderness_find_swap(self, player: 'Player', game_state: 'GameState') -> bool:
        # Always swap, hoping for a better card.
        return True

    def choose_card_to_discard(self, player: 'Player', game_state: 'GameState', reason: str) -> Optional['Card']:
        # Discard the lowest value card.
        if not player.hand:
            return None
        return min(player.hand, key=lambda card: card.value)