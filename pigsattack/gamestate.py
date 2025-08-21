# gamestate.py
import numpy as np
from typing import List, Optional

# Forward declarations to avoid circular imports
class Player: pass
class Deck: pass
class Card: pass

# --- Constants for Card Status ---
class CardStatus:
    IN_DECK = 0
    IN_HAND = 1
    DISCARDED = 2
    REVEALED_EVENT = 3 # The new state for an active event
    ACTIVE_BARRICADE = 4

class GameState:
    """
    A centralized, passive object that holds a numerical representation of the game state.
    It is updated by the Game controller by reading from the primary game objects.
    """
    MAX_PLAYERS = 8

    def __init__(self, players: List['Player'], deck: 'Deck'):
        # Store references to the sources of truth for syncing
        self._players = players
        self._deck = deck
        self.num_players = len(players)

        # Core Game State Variables
        self.current_player_index: int = 0
        self.is_nightfall: bool = False
        self.is_game_over: bool = False
        self.event_card: Optional[Card] = None # Holds the active event card object
        
        # NumPy State Representation
        self.player_eliminated = np.zeros(self.MAX_PLAYERS, dtype=bool)
        self.player_has_barricade = np.zeros(self.MAX_PLAYERS, dtype=bool)
        self.card_states = np.zeros((52, 2), dtype=int)

        self.sync_from_sources() # Initial sync

    def get_current_player(self) -> 'Player':
        """Returns the player object for the current turn."""
        return self._players[self.current_player_index]

    def advance_to_next_player(self):
        """Calculates and sets the index for the next non-eliminated player."""
        if self.is_game_over: return

        start_index = self.current_player_index
        next_index = (start_index + 1) % self.num_players
        while next_index != start_index:
            if not self.player_eliminated[next_index]:
                self.current_player_index = next_index
                return
            next_index = (next_index + 1) % self.num_players
        
        self.is_game_over = True

    def sync_from_sources(self):
        """
        Updates the entire GameState by reading the current state from the
        master Player and Deck objects. This is the core of the one-way data flow.
        """
        # Reset card states before syncing
        self.card_states.fill(-1)

        # Sync player states
        for i, player in enumerate(self._players):
            self.player_eliminated[i] = player.is_eliminated
            self.player_has_barricade[i] = player.has_barricade
            for card in player.hand:
                self.card_states[card.card_id, 0] = CardStatus.IN_HAND
                self.card_states[card.card_id, 1] = i

        # Sync deck and discard pile states
        for card in self._deck.cards:
            self.card_states[card.card_id, 0] = CardStatus.IN_DECK
        for card in self._deck.discard_pile:
            self.card_states[card.card_id, 0] = CardStatus.DISCARDED
        
        # Sync the active event card
        if self.event_card:
            self.card_states[self.event_card.card_id, 0] = CardStatus.REVEALED_EVENT
