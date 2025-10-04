# player.py
from typing import List
from .card import Card

# Forward declaration for type hinting
class PlayerController: pass

class Player:
    """Represents a player's state within the game."""

    def __init__(self, name: str, controller: 'PlayerController'):
        self.name = name
        self.controller = controller
        self.hand: List[Card] = []
        self.is_eliminated: bool = False
        self.has_barricade: bool = False

    def __repr__(self) -> str:
        return self.name
