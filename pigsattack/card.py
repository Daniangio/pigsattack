# card.py
class Card:
    """Represents a single playing card with a suit, rank, value, and unique ID."""
    def __init__(self, suit: str, rank: str, value: int, card_id: int):
        self.suit = suit
        self.rank = rank
        self.value = value
        self.card_id = card_id  # Unique identifier from 0 to 51

    def __repr__(self) -> str:
        """String representation for a card, including its ID for debugging."""
        return f"{self.rank} of {self.suit}"
