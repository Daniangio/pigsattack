from __future__ import annotations
import threading
import uuid
from typing import TYPE_CHECKING, Dict, Any, List

from pigsattack.game import Game
from pigsattack.bot_controller import NaiveBotController
from .network_controller import NetworkController

if TYPE_CHECKING:
    from .server import Server
    from .client_manager import Client

class GameRoomState:
    """Abstract base class for a game room's state."""
    def __init__(self, room: GameRoom):
        self.room = room

    def handle_client_message(self, client: Client, message: Dict[str, Any]): pass
    def on_client_disconnect(self, client: Client): pass
    def on_enter(self): pass
    def on_exit(self): pass

class LobbyState(GameRoomState):
    """The room state while waiting for players in the lobby."""
    def on_enter(self):
        print(f"Room {self.room.room_id[:6]}: Now in Lobby State.")
        self.room.broadcast_lobby_update()

    def handle_client_message(self, client: Client, message: Dict[str, Any]):
        command = message.get("command")
        if command == "start_game" and self.room.is_host(client):
            self._start_game(message)
        elif command == "leave_room":
            # Client wants to leave the lobby and go back to the main menu
            self.room.remove_client(client)
            self.room.server.lobby_manager.handle_client_message(client, {"command": "get_lobbies"})

    def on_client_disconnect(self, client: Client):
        self.room.broadcast_lobby_update()

    def _start_game(self, message: Dict[str, Any]):
        num_human_players = self.room.get_human_player_count()
        num_ai_players = message.get("num_ai", 0)
        total_players = num_human_players + num_ai_players

        if self.room.server.MIN_TOTAL_PLAYERS <= total_players <= self.room.server.MAX_PLAYERS:
            print(f"Room {self.room.room_id[:6]}: Host starting game.")
            self.room.set_state(GameState(self.room, num_ai_players))
            # The room is no longer in the lobby, so update main menu clients
            self.room.server.lobby_manager.broadcast_lobby_list()
        else:
            print(f"Room {self.room.room_id[:6]}: Start failed, invalid player count.")

class GameState(GameRoomState):
    """The room state while a game is in progress."""
    def __init__(self, room: GameRoom, num_ai_players: int):
        super().__init__(room)
        self.game_instance: Game | None = None
        self.num_ai_players = num_ai_players

    def on_enter(self):
        print(f"Room {self.room.room_id[:6]}: Now in Game State.")
        controllers: List[NetworkController | NaiveBotController] = []
        for client in sorted(self.room.clients, key=lambda c: c.player_id):
            controllers.append(NetworkController(client.player_id, self.room.server.view, self.room))

        for _ in range(self.num_ai_players):
            controllers.append(NaiveBotController())

        self.game_instance = Game(controllers, self.room.server.view, self.room)
        game_thread = threading.Thread(target=self._run_game_and_reset, daemon=True)
        game_thread.start()

    def handle_client_message(self, client: Client, message: Dict[str, Any]):
        if message.get("command") == "input":
            self.room.client_inputs[client.player_id] = message.get("value")
        elif message.get("command") == "surrender":
            player_obj = next((p for p in self.game_instance._players if p.controller.player_index == client.player_id), None)
            if player_obj and not player_obj.is_eliminated:
                player_obj.is_eliminated = True
                print(f"Room {self.room.room_id[:6]}: Player {client.player_id + 1} surrendered.")
        elif message.get("command") == "leave_room":
            # An eliminated player is leaving the game screen.
            self.room.remove_client(client)
            self.room.server.lobby_manager.handle_client_message(client, {"command": "get_lobbies"})

    def on_client_disconnect(self, client: Client):
        if self.room.get_human_player_count() == 0:
            print(f"Room {self.room.room_id[:6]}: All players left. Resetting.")
            self.room.set_state(LobbyState(self.room))

    def on_exit(self):
        self.game_instance = None
        self.room.client_inputs.clear()

    def _run_game_and_reset(self):
        # Keep a local reference to the game instance.
        # This prevents a crash if self.game_instance is cleared by another thread (e.g., on_exit).
        game = self.game_instance
        if game:
            game.run_game()
        
        winner_obj = game._get_winner() if game else None
        winner_name = winner_obj.name if winner_obj else "NO ONE"
        print(f"Room {self.room.room_id[:6]}: Game finished. Winner: {winner_name}")
        self.room.set_state(EndGameState(self.room, winner_name))

class EndGameState(GameRoomState):
    """The room state after a game has finished, before returning to lobby."""
    def __init__(self, room: GameRoom, winner_name: str):
        super().__init__(room)
        self.winner_name = winner_name

    def on_enter(self):
        print(f"Room {self.room.room_id[:6]}: Now in EndGame State.")
        self.room.server.view._broadcast(self.room.clients, {
            "type": "end_game",
            "winner": self.winner_name
        })

    def handle_client_message(self, client: Client, message: Dict[str, Any]):
        if message.get("command") == "leave_room":
            self.room.remove_client(client)
            # If the room is now empty, it will be auto-cleaned.
            # Otherwise, the remaining players stay in the end-game screen.
            # Send the departing client the new lobby list.
            self.room.server.lobby_manager.handle_client_message(client, {"command": "get_lobbies"})


class GameRoom:
    """Represents a single, isolated game session (lobby and game)."""
    def __init__(self, server: Server, room_id: str, name: str):
        self.server = server
        self.room_id = room_id
        self.name = name
        self.clients: List[Client] = []
        self.state: GameRoomState = LobbyState(self)
        self.client_inputs: Dict[int, str] = {}

    def add_client(self, client: Client):
        existing_ids = {c.player_id for c in self.clients}
        player_id = next((i for i in range(self.server.MAX_PLAYERS) if i not in existing_ids), -1)
        
        client.player_id = player_id
        client.room = self
        self.clients.append(client)
        print(f"Client {client.addr} joined room {self.name} as Player {player_id + 1}")
        self.state.on_enter()
        # The number of players in this room has changed, so update main menu clients.
        self.server.lobby_manager.broadcast_lobby_list()

    def remove_client(self, client: Client):
        print(f"Client {client.addr} left room {self.name}")
        self.clients.remove(client)
        client.room = None
        client.player_id = -1
        self.state.on_client_disconnect(client)
        # If the room is now empty, tell the lobby manager to clean it up
        if not self.clients:
            self.server.lobby_manager.remove_room(self.room_id)
        else:
            self.server.lobby_manager.broadcast_lobby_list()

    def set_state(self, new_state: GameRoomState):
        self.state.on_exit()
        self.state = new_state
        self.state.on_enter()

    def get_human_player_count(self) -> int: return len(self.clients)
    def is_host(self, client: Client) -> bool: return client.player_id == 0
    def broadcast_lobby_update(self): self.server.view.broadcast_lobby_update(self)
    def handle_message(self, client: Client, message: Dict[str, Any]): self.state.handle_client_message(client, message)
    def to_dict(self): return {"id": self.room_id, "name": self.name, "players": len(self.clients), "max_players": self.server.MAX_PLAYERS}