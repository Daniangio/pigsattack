# game.py
from typing import List, Optional, Tuple
from pigsattack.controller import HumanTerminalController, PlayerController
from pigsattack.deck import Deck
from pigsattack.player import Player
from pigsattack.view import GameView, TextView
from pigsattack.gamestate import GameState
from pigsattack.card import Card

class Game:
    """The main game engine, orchestrating the flow and rules."""
    def __init__(self, player_controllers: List[PlayerController], view: GameView):
        self.view = view
        self._players = [Player(f"Player {i+1}", ctrl) for i, ctrl in enumerate(player_controllers)]
        self._deck = Deck()
        self.game_state = GameState(self._players, self._deck)
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
        self.view.display_game_state(self.game_state)
        winner = self._get_winner()
        self.view.announce_winner(winner)

    def _take_turn(self, player: Player):
        self.view.display_game_state(self.game_state)
        self.view.display_turn_start(player)
        self._resolve_event_phase(player)
        if self.game_state.is_game_over or player.is_eliminated: return
        self._resolve_action_phase(player)
        if self.game_state.is_game_over: return
        self._resolve_end_of_turn(player)

    def _resolve_event_phase(self, player: Player):
        card = self._deck.draw_card()
        if not card:
            self._deck.reshuffle_discard_pile()
            self.game_state.sync_from_sources()
            card = self._deck.draw_card()
            if not card:
                self.game_state.is_game_over = True
                return
        
        self.game_state.event_card = card
        self.game_state.sync_from_sources()
        
        event_name = "Placeholder"
        # --- ATTACK LOGIC ---
        if 2 <= card.value <= 7:
            event_name = "Wild Pig Attack!"
            self.view.display_event(card, event_name)
            self._handle_pig_attack(player, card)
        else:
            # Placeholder for other events
            self.view.display_event(card, "Some other event")
            self._deck.discard(card)
            self.game_state.event_card = None

    def _handle_pig_attack(self, attacker: Player, attack_card: Card):
        attack_strength = attack_card.value
        if self.game_state.is_nightfall:
            attack_strength += 2
        
        self.view.display_attack(attack_strength)

        # --- Ask for Help Phase ---
        helper_card = None
        helper = None
        ask_for_help = attacker.controller.choose_to_ask_for_help(attacker, self.game_state)
        if ask_for_help:
            offers: List[Tuple[Player, Card]] = []
            for p in self._players:
                if p is not attacker and not p.is_eliminated:
                    offer = p.controller.offer_help(p, attacker, self.game_state)
                    if offer:
                        offers.append((p, offer))
            
            if offers:
                chosen_offer = attacker.controller.choose_helper(attacker, offers, self.game_state)
                if chosen_offer:
                    helper, helper_card = chosen_offer
                    # Remove offered card from helper's hand
                    helper.hand.remove(helper_card)
            else:
                print("No one offered to help.")

        # --- Defend Phase ---
        defense_cards = attacker.controller.choose_defense_cards(attacker, self.game_state)
        
        # Calculate total defense
        total_defense = sum(c.value for c in defense_cards)
        if helper_card:
            total_defense += helper_card.value

        # Check result
        success = total_defense >= attack_strength
        self.view.display_defense_result(success, total_defense, attack_strength)

        # --- Resolution Phase ---
        # Discard defending cards
        for card in defense_cards:
            attacker.hand.remove(card)
            self._deck.discard(card)
        if helper_card:
            self._deck.discard(helper_card)

        if success:
            if helper: # Savior's Spoils
                print(f"{helper.name} claims the spoil: {attack_card}")
                helper.hand.append(attack_card)
            else:
                self._deck.discard(attack_card)
        else: # Defense failed
            attacker.is_eliminated = True
            # Discard attacker's entire hand
            for card in attacker.hand:
                self._deck.discard(card)
            attacker.hand = []
            self._deck.discard(attack_card)
        
        self.game_state.event_card = None


    def _resolve_action_phase(self, player: Player):
        while True:
            available_actions = ["Scrounge", "Show Discard Pile"]
            action = player.controller.choose_action(player, self.game_state, available_actions)
            if action == "Scrounge":
                card = self._deck.draw_card()
                if not card:
                    self._deck.reshuffle_discard_pile()
                    card = self._deck.draw_card()
                if card:
                    self.view.show_drawn_card(card, "Scrounge")
                    player.hand.append(card)
                    self.view.display_player_hand(player)
                break
            elif action == "Show Discard Pile":
                self.view.show_discard_pile(self._deck.discard_pile)
            else:
                print("Unknown action.")
                break

    def _resolve_end_of_turn(self, player: Player):
        pass

    def _check_for_winner(self):
        active_players = [p for p in self._players if not p.is_eliminated]
        if len(active_players) <= 1:
            self.game_state.is_game_over = True
    
    def _get_winner(self) -> Optional[Player]:
        active_players = [p for p in self._players if not p.is_eliminated]
        return active_players[0] if active_players else None

if __name__ == "__main__":
    controllers = [HumanTerminalController() for _ in range(4)]
    view = TextView()
    game = Game(controllers, view)
    game.run_game()
