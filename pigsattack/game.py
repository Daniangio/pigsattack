# game.py
import random
from typing import List, Optional, Tuple
from pigsattack.bot_controller import NaiveBotController
from pigsattack.controller import HumanTerminalController, PlayerController
from pigsattack.deck import Deck
from pigsattack.player import Player
from pigsattack.view import GameView, TextView
from pigsattack.gamestate import GameState
from pigsattack.card import Card

class Game:
    """The main game engine, orchestrating the flow and rules."""
    def __init__(self, player_controllers: List[PlayerController], view: GameView, room=None):
        self.view = view
        self._players = [Player(f"Player {i+1}", ctrl) for i, ctrl in enumerate(player_controllers)]
        self._deck = Deck()
        self.room = room # The GameRoom context
        self.game_state = GameState(self._players, self._deck)
        self._deck_has_been_reshuffled_once = False
        self._setup_game()

    def _setup_game(self):
        for player in self._players:
            for _ in range(3):
                card = self._deck.draw_card()
                if card: player.hand.append(card)
        self.game_state.sync_from_sources()

    def run_game(self):
        while not self.game_state.is_game_over:
            self.game_state.sync_from_sources()
            current_player = self.game_state.get_current_player()
            if not current_player.is_eliminated:
                self._take_turn(current_player)
            self._check_for_winner()
            if not self.game_state.is_game_over:
                self.game_state.advance_to_next_player()
        
        self.game_state.sync_from_sources()
        self.view.display_game_state(self.game_state, self.room)
        winner = self._get_winner()
        self.view.announce_winner(winner, self.room)

    def _trigger_nightfall(self):
        if not self.game_state.is_nightfall:
            self.game_state.is_nightfall = True
            self.view.announce_nightfall(self.room)

    def _draw_card_with_reshuffle(self) -> Optional[Card]:
        """Helper method to draw a card, handling reshuffles and Nightfall trigger."""
        card = self._deck.draw_card()
        if not card:
            if not self._deck_has_been_reshuffled_once:
                self._trigger_nightfall()
                self._deck_has_been_reshuffled_once = True
            
            self._deck.reshuffle_discard_pile()
            self.game_state.sync_from_sources()
            card = self._deck.draw_card()
        return card

    def _take_turn(self, player: Player):
        self.view.display_game_state(self.game_state, self.room)
        self.view.display_turn_start(player, self.room)
        self._resolve_event_phase(player)
        if self.game_state.is_game_over or player.is_eliminated: return
        self._resolve_action_phase(player)
        if self.game_state.is_game_over: return
        self._resolve_end_of_turn(player)

    def _resolve_event_phase(self, player: Player):
        card = self._draw_card_with_reshuffle()
        if not card:
            self.game_state.is_game_over = True
            return
        
        self.game_state.event_card = card
        self.game_state.sync_from_sources()
        
        # --- EVENT LOGIC ROUTER ---
        if 2 <= card.value <= 7:
            event_name = "Wild Pig Attack!"
            self.view.display_event(card, event_name, self.room)
            self._handle_pig_attack(player, card)
        
        elif 8 <= card.value <= 10:
            if self.game_state.is_nightfall:
                event_name = "Stray Piglet Attack!"
                self.view.display_event(card, event_name, self.room)
                # Create a dummy card for the attack, the original 8-10 is just the trigger
                piglet_card = Card("Wilderness", "Piglet", 5, -1)
                self._handle_pig_attack(player, piglet_card)
            else:
                event_name = "Rustling Leaves"
                self.view.display_event(card, event_name, self.room)
                self._handle_rustling_leaves(player)
            self._deck.discard(card)
        
        elif card.rank in ["Jack", "Queen"]:
            if self.game_state.is_nightfall:
                event_name = "Ambush!"
                self.view.display_event(card, event_name, self.room)
                self._handle_ambush(player)
            else:
                event_name = "Wilderness Find"
                self.view.display_event(card, event_name, self.room)
                self._handle_wilderness_find(player)
            self._deck.discard(card)

        elif card.rank == "Ace":
            event_name = "Alpha Pig Attack!"
            self.view.display_event(card, event_name, self.room)
            self._trigger_nightfall()
            self._handle_pig_attack(player, card)

        elif card.rank == "King":
            event_name = "The Stampede!"
            self.view.display_event(card, event_name, self.room)
            self._trigger_nightfall()
            self._handle_stampede(player, card)
        
        self.game_state.event_card = None

    def _handle_ambush(self, player: Player):
        """Handles the Ambush event at night."""
        if not player.hand:
            self.view.display_event_result("You were ambushed, but your hand is empty and you lose nothing.", self.room)
            return
        
        card_to_discard = random.choice(player.hand)
        player.hand.remove(card_to_discard)
        self._deck.discard(card_to_discard)
        self.view.display_event_result(f"You were ambushed and randomly discarded the {card_to_discard}!", self.room)


    def _handle_stampede(self, starting_player: Player, stampede_card: Card):
        print("\nA massive STAMPEDE thunders through the camp!")
        
        active_players = [p for p in self._players if not p.is_eliminated]
        try:
            start_index = active_players.index(starting_player)
        except ValueError:
            if not active_players: return
            start_index = 0

        attack_order = active_players[start_index:] + active_players[:start_index]

        for i, target_player in enumerate(attack_order):
            if target_player.is_eliminated:
                continue

            print(f"\n--- The Stampede turns its attention to {target_player.name}! ---")
            
            possible_helpers = attack_order[i+1:]
            
            self._handle_pig_attack(target_player, stampede_card, is_stampede=True, possible_helpers=possible_helpers)
            self.game_state.sync_from_sources()
        
        self._deck.discard(stampede_card)

    def _get_player_offers(self, attacker: Player, possible_helpers: List[Player]) -> List[Tuple[Player, Card]]:
        offers = []
        attacker_index = self._players.index(attacker)
        player_cycle = self._players[attacker_index+1:] + self._players[:attacker_index]

        for p in player_cycle:
            if p in possible_helpers:
                offer = p.controller.offer_help(p, attacker, self.game_state)
                if offer:
                    offers.append((p, offer))
        return offers

    def _handle_pig_attack(self, attacker: Player, attack_card: Card, is_stampede: bool = False, possible_helpers: Optional[List[Player]] = None):
        original_strength = attack_card.value
        if self.game_state.is_nightfall and attack_card.rank not in ["King", "Ace", "Piglet"]:
            original_strength += 2
        
        final_strength = original_strength
        if attacker.has_barricade:
            final_strength = max(0, final_strength - 3)
        
        self.view.display_attack(original_strength, final_strength, attacker.has_barricade)

        helper_card, helper = None, None
        
        # Players cannot ask for help against a stray piglet
        if attack_card.rank == "Piglet":
            print("You must face the stray piglet alone!")
            ask_for_help = False
        else:
            ask_for_help = attacker.controller.choose_to_ask_for_help(attacker, self.game_state)

        if ask_for_help:
            if possible_helpers is None:
                possible_helpers = [p for p in self._players if p is not attacker and not p.is_eliminated]
            
            offers = self._get_player_offers(attacker, possible_helpers)
            
            if offers:
                chosen_offer = attacker.controller.choose_helper(attacker, offers, self.game_state)
                if chosen_offer:
                    helper, helper_card = chosen_offer
                    helper.hand.remove(helper_card)
            else:
                print("No one offered to help.")

        defense_cards = attacker.controller.choose_defense_cards(attacker, self.game_state)
        
        used_ace = any(c.rank == "Ace" for c in defense_cards)
        total_defense = sum(c.value for c in defense_cards)
        if helper_card: total_defense += helper_card.value

        success = total_defense >= final_strength or used_ace
        self.view.display_defense_result(success, total_defense, final_strength)

        for card in defense_cards:
            attacker.hand.remove(card)
            self._deck.discard(card)
        if helper_card: self._deck.discard(helper_card)

        # Sync and broadcast the state so the player's hand is updated before the action phase
        self.game_state.sync_from_sources()
        self.view.display_game_state(self.game_state, self.room)

        if success:
            if helper:
                if is_stampede:
                    print(f"{helper.name} helped and draws a card as a reward.")
                    new_card = self._draw_card_with_reshuffle()
                    if new_card: helper.hand.append(new_card)
                elif attack_card.rank != "Piglet": # No spoil for a piglet
                    print(f"{helper.name} claims the spoil: {attack_card}")
                    helper.hand.append(attack_card)
            
            if not is_stampede and attack_card.rank != "Piglet":
                self._deck.discard(attack_card)
        else:
            num_eliminated_before = sum(1 for p in self._players if p.is_eliminated)
            attacker.is_eliminated = True
            if num_eliminated_before == 0:
                self._trigger_nightfall()

            for card in attacker.hand: self._deck.discard(card)
            attacker.hand = []
            if not is_stampede and attack_card.rank != "Piglet":
                self._deck.discard(attack_card)

    def _handle_rustling_leaves(self, player: Player):
        self.view.display_event_result("It was just the wind. You are safe.", self.room)

    def _handle_wilderness_find(self, player: Player):
        if not player.hand:
            self.view.display_event_result("You found something, but your hands are empty and you cannot swap.", self.room)
            return

        wants_to_swap = player.controller.choose_wilderness_find_swap(player, self.game_state)
        if wants_to_swap:
            card_to_discard = player.controller.choose_card_to_discard(player, self.game_state, "Choose a card to swap")
            if card_to_discard:
                player.hand.remove(card_to_discard)
                self._deck.discard(card_to_discard)
                
                new_card = self._draw_card_with_reshuffle()
                if new_card:
                    player.hand.append(new_card)
                    self.view.display_event_result(f"You discarded the {card_to_discard.rank} and drew a new card.", self.room)
                    self.view.display_player_hand(player)
                else:
                    self.view.display_event_result(f"You discarded the {card_to_discard.rank} but the deck is empty!", self.room)
        else:
            self.view.display_event_result("You decided not to swap any cards.", self.room)

    def _resolve_action_phase(self, player: Player):
        while True:
            available_actions = ["Scrounge", "Scout Ahead"]
            player_ranks = {card.rank for card in player.hand}
            if "Jack" in player_ranks and not player.has_barricade:
                available_actions.append("Build Barricade")
            if "Queen" in player_ranks:
                available_actions.append("Sabotage")
            if "King" in player_ranks:
                available_actions.append("King's Feast")
            available_actions.append("Show Discard Pile")

            action = player.controller.choose_action(player, self.game_state, available_actions)
            
            if action == "Scrounge":
                card = self._draw_card_with_reshuffle()
                if card:
                    self.view.show_drawn_card(card, "Scrounge")
                    player.hand.append(card)
                    self.view.display_player_hand(player)
                break

            elif action == "Scout Ahead":
                self._execute_scout_ahead(player)
                break

            elif action == "Show Discard Pile":
                self.view.show_discard_pile(self._deck.discard_pile)
                continue

            elif action == "Build Barricade":
                self._execute_barricade(player)
                break

            elif action == "Sabotage":
                self._execute_sabotage(player)
                break

            elif action == "King's Feast":
                self._execute_kings_feast(player)
                break
            
            else:
                print("Unknown action.")
                break
        
        # After any action, sync the state and broadcast it to all clients
        self.game_state.sync_from_sources()
        self.view.display_game_state(self.game_state, self.room)

    def _execute_scout_ahead(self, player: Player):
        revealed_card = self._draw_card_with_reshuffle()
        if not revealed_card:
            self.view.display_action_result("Scout Ahead failed, the deck is completely empty!")
            return
        
        success = 2 <= revealed_card.value <= 7
        self.view.display_scout_ahead_result(success, revealed_card)

        if success:
            player.hand.append(revealed_card)
            bonus_card = self._draw_card_with_reshuffle()
            if bonus_card:
                player.hand.append(bonus_card)
                print(f"Your bonus card is the {bonus_card}.")
            self.view.display_player_hand(player)
        else:
            self._deck.discard(revealed_card)

    def _get_card_to_play(self, player: Player, rank: str, action_name: str) -> Card:
        cards_of_rank = [card for card in player.hand if card.rank == rank]
        if len(cards_of_rank) == 1:
            return cards_of_rank[0]
        else:
            return player.controller.choose_special_gear_card(player, cards_of_rank, action_name)

    def _execute_barricade(self, player: Player):
        card_to_play = self._get_card_to_play(player, "Jack", "Build Barricade")
        player.hand.remove(card_to_play)
        player.has_barricade = True
        self._deck.discard(card_to_play)
        self.view.display_action_result(f"{player.name} built a permanent Barricade!", self.room)
        self._trigger_nightfall() # Building a barricade is a strategic choice to bring on the night

    def _execute_sabotage(self, player: Player):
        card_to_play = self._get_card_to_play(player, "Queen", "Sabotage")
        targets = [p for p in self._players if p is not player and not p.is_eliminated and p.hand]
        if not targets:
            self.view.display_action_result("There are no valid targets to Sabotage.", self.room)
            player.hand.remove(card_to_play)
            self._deck.discard(card_to_play)
            return

        target = player.controller.choose_sabotage_target(player, targets, self.game_state)
        card_to_steal = player.controller.choose_card_to_steal(player, target)

        target.hand.remove(card_to_steal)
        player.hand.append(card_to_steal)
        player.hand.remove(card_to_play)
        self._deck.discard(card_to_play)
        self.view.display_action_result(f"{player.name} sabotaged {target.name} and stole a card!", self.room)
        self.view.display_player_hand(player)

    def _execute_kings_feast(self, player: Player):
        card_to_play = self._get_card_to_play(player, "King", "King's Feast")
        player.hand.remove(card_to_play)
        self._deck.discard(card_to_play)

        for _ in range(3):
            card = self._draw_card_with_reshuffle()
            if card: player.hand.append(card)
        
        for p in self._players:
            if p is not player and not p.is_eliminated:
                card = self._draw_card_with_reshuffle()
                if card: p.hand.append(card)
        
        self.view.display_action_result(f"{player.name} held a King's Feast! Everyone drew cards.", self.room)
        self.view.display_player_hand(player)

    def _resolve_end_of_turn(self, player: Player):
        while len(player.hand) > 6:
            self.view.display_player_hand(player)
            reason = f"You have {len(player.hand)} cards and must discard down to 6."
            card_to_discard = player.controller.choose_card_to_discard(player, self.game_state, reason)
            if card_to_discard:
                player.hand.remove(card_to_discard)
                self._deck.discard(card_to_discard)
                self.view.display_action_result(f"You discarded the {card_to_discard.rank}.", self.room)
            else:
                break

    def _check_for_winner(self):
        active_players = [p for p in self._players if not p.is_eliminated]
        if len(active_players) <= 1:
            self.game_state.is_game_over = True
    
    def _get_winner(self) -> Optional[Player]:
        active_players = [p for p in self._players if not p.is_eliminated]
        return active_players[0] if active_players else None

def main():
    """Sets up and runs a new game, asking for the number of players."""
    print("--- Welcome to Wild Pigs Will Attack! ---")

    while True:
        try:
            num_humans = int(input("How many human players? (0-8): "))
            if not (0 <= num_humans <= 8):
                print("Please enter a number between 0 and 8.")
                continue

            num_bots = int(input(f"How many computer players? (0-{8-num_humans}): "))
            if not (0 <= num_bots <= 8):
                print("Please enter a number between 0 and 8.")
                continue

            total_players = num_humans + num_bots
            if 2 <= total_players <= 8:
                break
            else:
                print(f"Invalid total number of players ({total_players}). The total must be between 2 and 8.")
        except ValueError:
            print("Invalid input. Please enter a number.")

    controllers = []
    for i in range(num_humans):
        controllers.append(HumanTerminalController())
    for i in range(num_bots):
        controllers.append(NaiveBotController())

    view = TextView()
    game = Game(controllers, view) # The game will name players "Player 1", "Player 2", etc.
    game.run_game()

if __name__ == "__main__":
    main()
