# view.py
import numpy as np
from abc import ABC, abstractmethod
from .card import Card
from .player import Player
from .gamestate import GameState, CardStatus
from typing import List, Optional, Tuple

class GameView(ABC):
    """Abstract base class for displaying game information."""

    @abstractmethod
    def display_game_state(self, game_state: GameState):
        pass

    @abstractmethod
    def display_turn_start(self, player: Player):
        pass

    @abstractmethod
    def display_event(self, event_card: Card, event_name: str):
        pass

    @abstractmethod
    def display_player_hand(self, player: Player):
        pass
    
    @abstractmethod
    def announce_winner(self, player: Optional[Player]):
        pass

    @abstractmethod
    def show_drawn_card(self, card: Card, action: str):
        pass

    @abstractmethod
    def show_discard_pile(self, discard_pile: List[Card]):
        pass

    @abstractmethod
    def display_attack(self, original_strength: int, final_strength: int, barricade_active: bool):
        pass

    @abstractmethod
    def display_defense_result(self, success: bool, total_defense: int, attack_strength: int, attacker_name: str, cards_played: List[str]):
        pass

    @abstractmethod
    def display_action_result(self, message: str):
        pass
        
    @abstractmethod
    def display_event_result(self, message: str):
        pass

    @abstractmethod
    def announce_nightfall(self):
        pass

    @abstractmethod
    def display_scout_ahead_result(self, success: bool, revealed_card: Card):
        pass
        
    @abstractmethod
    def display_forage_result(self, success: bool, initiator: Player, contributors: List[Player]):
        pass


class TextView(GameView):
    """A concrete view that prints game information to the console."""
    def display_game_state(self, game_state: GameState):
        print("\n" + "="*40)
        print("GAME STATE")
        print("="*40)
        for i in range(game_state.num_players):
            player_name = f"Player {i+1}"
            is_eliminated = game_state.player_eliminated[i]
            has_barricade = game_state.player_has_barricade[i]
            hand_size = np.sum((game_state.card_states[:, 0] == CardStatus.IN_HAND) & (game_state.card_states[:, 1] == i))

            status = "ELIMINATED" if is_eliminated else f"{hand_size} cards"
            barricade = " | BARRICADE" if has_barricade else ""
            current_marker = "<- CURRENT" if i == game_state.current_player_index else ""
            
            print(f"{player_name}: {status}{barricade} {current_marker}")

        draw_pile_size = np.sum(game_state.card_states[:, 0] == CardStatus.IN_DECK)
        discard_pile_size = np.sum(game_state.card_states[:, 0] == CardStatus.DISCARDED)
        nightfall = "YES" if game_state.is_nightfall else "NO"

        print("-" * 40)
        print(f"Draw Pile: {draw_pile_size} | Discard Pile: {discard_pile_size} | Nightfall: {nightfall}")
        print("="*40)

    def display_turn_start(self, player: Player):
        print(f"\n--- It's {player.name}'s turn. ---")
        self.display_player_hand(player)

    def display_player_hand(self, player: Player):
        hand_str = ", ".join([str(c) for c in player.hand]) if player.hand else "Empty"
        print(f"Your hand: [{hand_str}]")

    def display_event(self, event_card: Card, event_name: str):
        print(f"\nEVENT CARD DRAWN: {event_card}")
        print(f"EVENT: {event_name}!")
        
    def announce_winner(self, player: Optional[Player]):
        winner_name = player.name if player else "NO ONE"
        print(f"\n{'*'*40}\nTHE GAME IS OVER! The sole survivor is {winner_name}!\n{'*'*40}")

    def show_drawn_card(self, card: Card, action: str):
        print(f"You chose to {action} and drew: {card}")

    def show_discard_pile(self, discard_pile: List[Card]):
        print("\n--- Discard Pile (Most Recent First) ---")
        if not discard_pile:
            print("The discard pile is empty.")
        else:
            for card in reversed(discard_pile[-10:]):
                print(f"  {card}")
        print("----------------------------------------")
        
    def display_defense_result(self, success: bool, total_defense: int, attack_strength: int, attacker_name: str, cards_played: List[str]):
        cards_str = ", ".join(cards_played) if cards_played else "no cards"
        print(f"{attacker_name} defended with {total_defense} (using {cards_str}) against Strength {attack_strength}.")
        if success:
            print("SUCCESS! They survived the attack.")
        else:
            print("FAILURE! They have been eliminated by the wild pigs.")
            
    def display_attack(self, original_strength: int, final_strength: int, barricade_active: bool):
        print(f"\nA Wild Pig ATTACKS with base Strength {original_strength}!")
        if barricade_active:
            print(f"Your Barricade reduces the strength by 3! The final attack strength is {final_strength}.")

    def display_action_result(self, message: str):
        print(f"ACTION RESULT: {message}")

    def display_event_result(self, message: str):
        print(f"EVENT RESULT: {message}")

    def announce_nightfall(self):
        print("\n" + "#"*40)
        print("## The sun sets. A chill runs down your spine. ##")
        print("## NIGHTFALL has begun! The pigs are stronger now. ##")
        print("#"*40)

    def display_scout_ahead_result(self, success: bool, revealed_card: Card):
        print(f"You scout ahead and reveal: {revealed_card}")
        if success:
            print("ACTION RESULT: Success! You take the card and draw a bonus card.")
        else:
            print("ACTION RESULT: Failure! The card is discarded and you get nothing.")
            
    def display_forage_result(self, success: bool, initiator: Player, contributors: List[Player]):
        if success:
            contributor_names = ", ".join([p.name for p in contributors])
            print(f"ACTION RESULT: Forage successful! {contributor_names} each draw two cards.")
        else:
            print(f"ACTION RESULT: Forage failed! {initiator.name} lost their contributed card.")
