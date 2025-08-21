# controller.py
from abc import ABC, abstractmethod
from typing import List, Optional, Tuple

# Forward declarations for type hinting
class Player: pass
class GameState: pass
class Card: pass

class PlayerController(ABC):
    """Abstract Base Class for player decision-making."""
    @abstractmethod
    def choose_action(self, player: 'Player', game_state: 'GameState', available_actions: List[str]) -> str:
        """Determines the player's main action for the turn."""
        pass

    @abstractmethod
    def choose_to_ask_for_help(self, player: 'Player', game_state: 'GameState') -> bool:
        """Asks the player if they want to request help defending."""
        pass

    @abstractmethod
    def offer_help(self, player: 'Player', attacker: 'Player', game_state: 'GameState') -> Optional['Card']:
        """Allows a player to offer one card to help the attacker, or None to skip."""
        pass

    @abstractmethod
    def choose_helper(self, player: 'Player', offers: List[Tuple['Player', 'Card']], game_state: 'GameState') -> Optional[Tuple['Player', 'Card']]:
        """Allows the attacked player to choose from the offers."""
        pass

    @abstractmethod
    def choose_defense_cards(self, player: 'Player', game_state: 'GameState') -> List['Card']:
        """Asks the player to select one or more cards from their hand to defend."""
        pass


class HumanTerminalController(PlayerController):
    """A concrete controller that gets decisions from a human via the terminal."""
    def choose_action(self, player: 'Player', game_state: 'GameState', available_actions: List[str]) -> str:
        print("\n" + "-"*20)
        print(f"{player.name}, it's your Action Phase.")
        print("Available Actions:")
        for i, action in enumerate(available_actions):
            print(f"  {i+1}. {action}")
        
        while True:
            try:
                choice = int(input(f"Choose an action (1-{len(available_actions)}): "))
                if 1 <= choice <= len(available_actions):
                    return available_actions[choice-1]
                else:
                    print("Invalid number.")
            except ValueError:
                print("Please enter a valid number.")

    def choose_to_ask_for_help(self, player: 'Player', game_state: 'GameState') -> bool:
        while True:
            choice = input("Do you want to ask other players for help? (yes/no): ").lower()
            if choice in ['yes', 'y']:
                return True
            elif choice in ['no', 'n']:
                return False
            else:
                print("Invalid input. Please enter 'yes' or 'no'.")

    def offer_help(self, player: 'Player', attacker: 'Player', game_state: 'GameState') -> Optional['Card']:
        print(f"\n--- {player.name}, {attacker.name} is asking for help! ---")
        if not player.hand:
            print("Your hand is empty. You cannot help.")
            return None
            
        print("Your hand:")
        for i, card in enumerate(player.hand):
            print(f"  {i+1}. {card}")
        
        while True:
            choice = input("Enter the number of the card you wish to offer, or 'skip': ").lower()
            if choice == 'skip':
                return None
            try:
                index = int(choice) - 1
                if 0 <= index < len(player.hand):
                    return player.hand[index]
                else:
                    print("Invalid number.")
            except ValueError:
                print("Invalid input. Please enter a number or 'skip'.")

    def choose_helper(self, player: 'Player', offers: List[Tuple['Player', 'Card']], game_state: 'GameState') -> Optional[Tuple['Player', 'Card']]:
        print("\n--- Offers of Help ---")
        for i, (helper, card) in enumerate(offers):
            print(f"  {i+1}. {helper.name} offers: {card}")
        
        while True:
            try:
                choice = int(input("Enter the number of the offer you wish to accept: "))
                index = choice - 1
                if 0 <= index < len(offers):
                    return offers[index]
                else:
                    print("Invalid number.")
            except ValueError:
                print("Invalid input. Please enter a number.")

    def choose_defense_cards(self, player: 'Player', game_state: 'GameState') -> List['Card']:
        print("\n--- Select Cards to Defend ---")
        if not player.hand:
            print("Your hand is empty. You cannot play any cards.")
            return []
            
        print("Your hand:")
        for i, card in enumerate(player.hand):
            print(f"  {i+1}. {card}")
        
        while True:
            choice_str = input("Enter card numbers to play (e.g., '1 3' or '2'), or 'skip' if you cannot defend: ").lower()
            if choice_str == 'skip':
                return []
            try:
                indices = [int(s.strip()) - 1 for s in choice_str.split()]
                if all(0 <= i < len(player.hand) for i in indices):
                    # Check for duplicate selections
                    if len(indices) != len(set(indices)):
                         print("Error: You cannot select the same card twice.")
                         continue
                    return [player.hand[i] for i in indices]
                else:
                    print("Invalid number detected. Please check your input.")
            except ValueError:
                print("Invalid input. Please enter numbers separated by spaces.")
