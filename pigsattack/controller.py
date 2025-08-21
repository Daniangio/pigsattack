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
    def choose_action(self, player: 'Player', game_state: 'GameState', available_actions: List[str]) -> str: pass
    @abstractmethod
    def choose_to_ask_for_help(self, player: 'Player', game_state: 'GameState') -> bool: pass
    @abstractmethod
    def offer_help(self, player: 'Player', attacker: 'Player', game_state: 'GameState') -> Optional['Card']: pass
    @abstractmethod
    def choose_helper(self, player: 'Player', offers: List[Tuple['Player', 'Card']], game_state: 'GameState') -> Optional[Tuple['Player', 'Card']]: pass
    @abstractmethod
    def choose_defense_cards(self, player: 'Player', game_state: 'GameState') -> List['Card']: pass
    @abstractmethod
    def choose_special_gear_card(self, player: 'Player', cards: List['Card'], action_name: str) -> 'Card': pass
    @abstractmethod
    def choose_sabotage_target(self, player: 'Player', targets: List['Player'], game_state: 'GameState') -> 'Player': pass
    @abstractmethod
    def choose_card_to_steal(self, player: 'Player', target: 'Player') -> 'Card': pass
    @abstractmethod
    def choose_wilderness_find_swap(self, player: 'Player', game_state: 'GameState') -> bool: pass
    @abstractmethod
    def choose_card_to_discard(self, player: 'Player', game_state: 'GameState', reason: str) -> Optional['Card']: pass


class HumanTerminalController(PlayerController):
    """A concrete controller that gets decisions from a human via the terminal."""
    def choose_action(self, player: 'Player', game_state: 'GameState', available_actions: List[str]) -> str:
        # ... (implementation remains the same) ...
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
        # ... (implementation remains the same) ...
        while True:
            choice = input("Do you want to ask other players for help? (yes/no): ").lower()
            if choice in ['yes', 'y']:
                return True
            elif choice in ['no', 'n']:
                return False
            else:
                print("Invalid input. Please enter 'yes' or 'no'.")

    def offer_help(self, player: 'Player', attacker: 'Player', game_state: 'GameState') -> Optional['Card']:
        # ... (implementation remains the same) ...
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
        # ... (implementation remains the same) ...
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
        # ... (implementation remains the same) ...
        print("\n--- Select Cards to Defend ---")
        if not player.hand:
            print("Your hand is empty. You cannot play any cards.")
            return []
            
        print("Your hand:")
        for i, card in enumerate(player.hand):
            print(f"  {i+1}. {card}")
        
        while True:
            choice_str = input("Enter card numbers to play (e.g., '1 3' or '2'), or 'done' to play no cards: ").lower()
            if choice_str == 'done':
                return []
            try:
                indices = [int(s.strip()) - 1 for s in choice_str.split()]
                if all(0 <= i < len(player.hand) for i in indices):
                    if len(indices) != len(set(indices)):
                         print("Error: You cannot select the same card twice.")
                         continue
                    return [player.hand[i] for i in indices]
                else:
                    print("Invalid number detected. Please check your input.")
            except ValueError:
                print("Invalid input. Please enter numbers separated by spaces.")

    def choose_special_gear_card(self, player: 'Player', cards: List['Card'], action_name: str) -> 'Card':
        # ... (implementation remains the same) ...
        print(f"\nYou have multiple cards for the action '{action_name}'. Which one do you want to use?")
        for i, card in enumerate(cards):
            print(f"  {i+1}. {card}")
        while True:
            try:
                choice = int(input(f"Choose a card (1-{len(cards)}): "))
                if 1 <= choice <= len(cards):
                    return cards[choice-1]
                else:
                    print("Invalid number.")
            except ValueError:
                print("Please enter a valid number.")

    def choose_sabotage_target(self, player: 'Player', targets: List['Player'], game_state: 'GameState') -> 'Player':
        # ... (implementation remains the same) ...
        print("\nChoose a player to Sabotage:")
        for i, target in enumerate(targets):
            print(f"  {i+1}. {target.name}")
        while True:
            try:
                choice = int(input(f"Choose a target (1-{len(targets)}): "))
                if 1 <= choice <= len(targets):
                    return targets[choice-1]
                else:
                    print("Invalid number.")
            except ValueError:
                print("Please enter a valid number.")

    def choose_card_to_steal(self, player: 'Player', target: 'Player') -> 'Card':
        # ... (implementation remains the same) ...
        print(f"\n{target.name}'s hand contains {len(target.hand)} cards. Choose one to steal:")
        for i, card in enumerate(target.hand):
            print(f"  {i+1}. {card}")
        while True:
            try:
                choice = int(input(f"Choose a card to steal (1-{len(target.hand)}): "))
                if 1 <= choice <= len(target.hand):
                    return target.hand[choice-1]
                else:
                    print("Invalid number.")
            except ValueError:
                print("Please enter a valid number.")

    def choose_wilderness_find_swap(self, player: 'Player', game_state: 'GameState') -> bool:
        # ... (implementation remains the same) ...
        while True:
            choice = input("You may discard one card to draw a new one. Swap? (yes/no): ").lower()
            if choice in ['yes', 'y']:
                return True
            elif choice in ['no', 'n']:
                return False
            else:
                print("Invalid input. Please enter 'yes' or 'no'.")

    def choose_card_to_discard(self, player: 'Player', game_state: 'GameState', reason: str) -> Optional['Card']:
        # ... (implementation remains the same) ...
        print(f"\n--- {reason} ---")
        if not player.hand:
            print("Your hand is empty. You have no cards to discard.")
            return None
        
        print("Your hand:")
        for i, card in enumerate(player.hand):
            print(f"  {i+1}. {card}")
        
        while True:
            try:
                choice = int(input("Choose a card to discard: "))
                index = choice - 1
                if 0 <= index < len(player.hand):
                    return player.hand[index]
                else:
                    print("Invalid number.")
            except ValueError:
                print("Invalid input. Please enter a number.")
