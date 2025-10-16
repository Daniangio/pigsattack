from __future__ import annotations
import threading
from queue import Queue, Empty
import time
from typing import TYPE_CHECKING, Dict, Any, List

from pigsattack.core.game import Game
from pigsattack.core.bot_controller import NaiveBotController
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
        elif command == "add_ai" and self.room.is_host(client):
            self.room.add_ai_player()
        elif command == "remove_ai" and self.room.is_host(client):
            self.room.remove_ai_player()

    def on_client_disconnect(self, client: Client):
        self.room.broadcast_lobby_update()

    def _start_game(self, message: Dict[str, Any]):
        num_human_players = self.room.get_human_player_count()
        # Use the number of AI players stored in the room, not from the message
        num_ai_players = self.room.num_ai_players
        total_players = num_human_players + num_ai_players

        if self.room.server.MIN_PLAYERS <= total_players <= self.room.server.MAX_PLAYERS:
            print(f"Room {self.room.room_id[:6]}: Host starting game with {num_human_players} humans and {num_ai_players} AI.")
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
        # Immediately notify all clients in this room that the game is starting.
        # This is the trigger for the client-side UI to switch from lobby to game view.
        self.room.server.view._broadcast(self.room, {
            "type": "game_start"
        })

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
        elif message.get("command") == "surrender" and self.game_instance:
            # Let the game engine handle the logic of eliminating a player
            self.game_instance.eliminate_player_by_id(client.player_id)
            print(f"Room {self.room.room_id[:6]}: Player {client.player_id + 1} surrendered.")
        elif message.get("command") == "leave_room":
            # An eliminated player is leaving the game screen.
            self.room.remove_client(client)

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
            # Give the client a moment to switch to the game screen before the first prompt
            time.sleep(0.5)
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
        self.room.server.view._broadcast(self.room, {
            "type": "end_game",
            "winner": self.winner_name
        })

    def handle_client_message(self, client: Client, message: Dict[str, Any]):
        if message.get("command") == "leave_room":
            self.room.remove_client(client)
            # If the room is now empty, it will be auto-cleaned.


class GameRoom:
    """Represents a single, isolated game session (lobby and game)."""
    def __init__(self, server: Server, room_id: str, name: str):
        self.server = server
        self.room_id = room_id
        self.name = name
        self.clients: List[Client] = []
        self.num_ai_players = 0
        self.client_inputs: Dict[int, str] = {}
        
        self._state: GameRoomState = LobbyState(self)
        self._event_queue = Queue()
        self._thread = threading.Thread(target=self._run, daemon=True)
        self._thread.start()
        print(f"GameRoom '{name}' ({room_id[:6]}) thread started.")

    def add_client(self, client: Client):
        existing_ids = {c.player_id for c in self.clients}
        player_id = next((i for i in range(self.server.MAX_PLAYERS) if i not in existing_ids), -1)
        
        # Use the queue to safely add the client in the room's thread
        self._event_queue.put(("client_join", client, player_id))

    def _add_client_internal(self, client: Client, player_id: int):
        client.player_id = player_id
        client.room = self
        self.clients.append(client)
        # Use the thread-safe emit on the socketio object to join a room
        self.server.socketio.emit('join', {'room': self.room_id}, to=client.sid)
        print(f"Client {client.addr} joined room {self.name} as Player {player_id + 1}")
        self._state.on_enter()
        # The number of players in this room has changed, so update main menu clients.
        self.server.lobby_manager.broadcast_lobby_list()

    def remove_client(self, client: Client):
        # Use the queue to safely remove the client in the room's thread
        self._event_queue.put(("client_leave", client))

    def _remove_client_internal(self, client: Client):
        print(f"Client {client.addr} left room {self.name}")
        self.clients.remove(client)
        # Use the thread-safe emit on the socketio object to leave a room
        self.server.socketio.emit('leave', {'room': self.room_id}, to=client.sid)
        client.room = None
        client.player_id = -1
        # Now that the client has officially left, send them the updated lobby list.
        self.server.lobby_manager.handle_client_message(client, {"command": "get_lobbies"})
        self._state.on_client_disconnect(client)
        # If the room is now empty, tell the lobby manager to clean it up
        if not self.clients:
            self.server.lobby_manager.remove_room(self.room_id)
        else:
            self.server.lobby_manager.broadcast_lobby_list()

    def add_ai_player(self):
        self._event_queue.put(("add_ai",))

    def _add_ai_player_internal(self):
        total_players = self.get_human_player_count() + self.num_ai_players
        if total_players < self.server.MAX_PLAYERS:
            self.num_ai_players += 1
            print(f"Room {self.room_id[:6]}: Host added an AI. Total AI: {self.num_ai_players}")
            self.broadcast_lobby_update()

    def remove_ai_player(self):
        self._event_queue.put(("remove_ai",))

    def _remove_ai_player_internal(self):
        if self.num_ai_players > 0:
            self.num_ai_players -= 1
            print(f"Room {self.room.id[:6]}: Host removed an AI. Total AI: {self.num_ai_players}")
            self.broadcast_lobby_update()

    def set_state(self, new_state: GameRoomState):
        self._state.on_exit()
        self._state = new_state
        self._state.on_enter()

    def handle_message(self, client: Client, message: Dict[str, Any]):
        # Use the queue to safely handle messages in the room's thread
        self._event_queue.put(("client_message", client, message))

    def _run(self):
        """The main loop for the game room thread."""
        self.set_state(LobbyState(self)) # Initial state
        while True:
            try:
                # Wait for an event, but with a timeout to keep the thread alive
                event_type, *args = self._event_queue.get(timeout=1.0)

                if event_type == "client_join":
                    client, player_id = args
                    self._add_client_internal(client, player_id)
                elif event_type == "client_leave":
                    client = args[0]
                    self._remove_client_internal(client)
                elif event_type == "client_message":
                    client, message = args
                    self._state.handle_client_message(client, message)
                elif event_type == "add_ai":
                    self._add_ai_player_internal()
                elif event_type == "remove_ai":
                    self._remove_ai_player_internal()
            except Empty:
                continue # No events, just loop

    def get_human_player_count(self) -> int: return len(self.clients)
    def is_host(self, client: Client) -> bool: return client.player_id == 0
    def broadcast_lobby_update(self): self.server.view.broadcast_lobby_update(self)
    def to_dict(self): return {"id": self.room_id, "name": self.name, "players": len(self.clients), "max_players": self.server.MAX_PLAYERS}