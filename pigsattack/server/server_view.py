import json
import socket
from typing import Dict, Any, Optional, List

from pigsattack.view import GameView
from pigsattack.gamestate import GameState
from pigsattack.card import Card
from pigsattack.player import Player
from .client_manager import Client, ClientManager
from .game_room import GameRoom

class ServerView(GameView):
    """A view that sends game information to all connected clients."""
    def __init__(self, client_manager: ClientManager):
        self.client_manager = client_manager

    def _broadcast(self, clients: List[Client], message: Dict[str, Any]):
        message_json = json.dumps(message)
        for client in clients:
            self._send(client.socket, message_json)

    def send_lobby_list(self, client: Client, lobbies: List[Dict[str, Any]]):
        self.send_to_client(client, {
            "type": "lobby_list",
            "lobbies": lobbies
        })

    def send_to_client(self, client: Client, message: Dict[str, Any]):
        message_json = json.dumps(message)
        self._send(client.socket, message_json)

    def _send_to_player(self, player_index: int, message: Dict[str, Any]):
        message_json = json.dumps(message)
        for client in self.client_manager.get_all_clients(): # This will need context of a room
            if client.room and client.player_id == player_index:
                self._send(client.socket, message_json)
                break
    
    def _send(self, sock: socket.socket, message_json: str):
        try:
            sock.sendall(message_json.encode('utf-8') + b'\n')
        except OSError:
            # The client manager will handle the disconnection
            pass

    def broadcast_lobby_update(self, room: GameRoom):
        status = {
            "type": "lobby_update",
            "room_id": room.room_id,
            "num_players": room.get_human_player_count(),
            "min_players": self.client_manager.server.MIN_PLAYERS,
            "max_players": self.client_manager.server.MAX_PLAYERS
        }
        for client in room.clients:
            payload = status.copy()
            payload["is_host"] = room.is_host(client)
            payload["player_id"] = client.player_id
            self.send_to_client(client, payload)

    # This is a bit of a hack. The Game object doesn't know about rooms.
    # A better solution would be to have the Game object take the room's clients list in its constructor.
    # For now, let's just override all methods to accept a room.
    # The NetworkController will provide this.
    def prompt_for_input(self, player_index: int, prompt_text: str, choices: Optional[List[Dict[str, Any]]], mode: str, room: GameRoom):
        msg = {"type": "prompt", "prompt_text": prompt_text, "choices": choices, "input_mode": mode}
        for client in room.clients:
            if client.player_id == player_index:
                self.send_to_client(client, msg)
                break

    def display_game_state(self, game_state: GameState, room: GameRoom):
        state_dict = {
            "type": "game_state",
            "num_players": game_state.num_players,
            "current_player_index": game_state.current_player_index,
            "is_nightfall": game_state.is_nightfall,
            "is_game_over": game_state.is_game_over,
            "deck_size": len(game_state._deck.cards),
            "event_card": {"repr": str(c), "id": c.card_id, "value": c.value} if (c := game_state.event_card) else None,
            "players": [
                {
                    "name": p.name,
                    "is_eliminated": p.is_eliminated,
                    "has_barricade": p.has_barricade,
                    "hand": [{"repr": str(c), "id": c.card_id, "value": c.value} for c in p.hand]
                } for p in game_state._players
            ],
            "discard_pile_top": str(game_state._deck.discard_pile[-1]) if game_state._deck.discard_pile else "Empty"
        }
        self._broadcast(room.clients, state_dict)

    def display_defense_result(self, success: bool, total_defense: int, attack_strength: int, attacker_name: str, cards_played: List[str], room: GameRoom):
        cards_str = ", ".join(cards_played) if cards_played else "no cards"
        message = f"{attacker_name} defended with {total_defense} (using {cards_str}) against Strength {attack_strength}. "
        if success:
            message += "SUCCESS!"
        else:
            message += "FAILURE! They are eliminated."
        self._broadcast(room.clients, {"type": "event", "message": message})

    def display_event(self, event_card, event_name, room): self._broadcast(room.clients, {"type": "event", "message": f"EVENT: {event_name} ({event_card})"})
    def display_action_result(self, message: str, room): self._broadcast(room.clients, {"type": "event", "message": f"ACTION: {message}"})
    def announce_winner(self, player, room): self._broadcast(room.clients, {"type": "event", "message": f"GAME OVER! Winner is {player.name if player else 'NO ONE'}!"})
    def display_turn_start(self, player: Player, room): self._broadcast(room.clients, {"type": "event", "message": f"It is now {player.name}'s turn."})
    def display_event_result(self, message: str, room): self._broadcast(room.clients, {"type": "event", "message": f"{message}"})
    def announce_nightfall(self, room): self._broadcast(room.clients, {"type": "event", "message": "NIGHT HAS FALLEN!"})

    # These methods are not used by the client, so they can be left as pass
    def display_player_hand(self, player: Player): pass
    def show_drawn_card(self, card: Card, action: str): pass
    def show_discard_pile(self, discard_pile: list): pass
    def display_attack(self, o, f, b, room): pass
    def display_scout_ahead_result(self, s, r): pass
    def display_forage_result(self, s, i, c): pass