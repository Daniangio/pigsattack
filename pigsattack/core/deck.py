# deck.py
import random
from typing import List, Optional
from .card import Card

class Deck:
    """Represents the deck of 52 cards, handling shuffling and dealing."""

    def __init__(self):
        self.cards: List[Card] = []
        self.discard_pile: List[Card] = []
        self._create_deck()
        self.shuffle()

    def _create_deck(self):
        """Initializes a standard 52-card deck, assigning a unique ID to each card."""
        suits = ["Hearts", "Diamonds", "Clubs", "Spades"]
        ranks = {
            "2": 2, "3": 3, "4": 4, "5": 5, "6": 6, "7": 7, "8": 8, "9": 9, "10": 10,
            "Jack": 11, "Queen": 12, "King": 13, "Ace": 14
        }
        
        card_id_counter = 0
        for suit in suits:
            for rank, value in ranks.items():
                self.cards.append(Card(suit, rank, value, card_id_counter))
                card_id_counter += 1

    def shuffle(self):
        """Shuffles the main deck."""
        random.shuffle(self.cards)

    def draw_card(self) -> Optional[Card]:
        """Draws a card from the deck. The Game controller handles reshuffling."""
        if not self.cards:
            return None # Signal to the Game controller that a reshuffle is needed
        return self.cards.pop()

    def discard(self, card: Card):
        """Adds a card to the discard pile."""
        self.discard_pile.append(card)

    def reshuffle_discard_pile(self):
        """Moves all cards from the discard pile to the main deck and shuffles."""
        print("--- Reshuffling discard pile into deck. ---")
        self.cards.extend(self.discard_pile)
        self.discard_pile = []
        self.shuffle()
