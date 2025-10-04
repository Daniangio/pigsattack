from __future__ import annotations
import uuid
import threading
from typing import TYPE_CHECKING, Dict, List, Optional

from .game_room import GameRoom, LobbyState

if TYPE_CHECKING:
    from .server import Server
    from .client_manager import Client

class LobbyManager:
    """Manages all game rooms on the server."""
    def __init__(self, server: Server):
        self.server = server
        self.rooms: Dict[str, GameRoom] = {}
        self.lock = threading.Lock()

    def handle_client_message(self, client: Client, message: Dict[str, Any]):
        command = message.get("command")
        if command == "get_lobbies":
            self.server.view.send_lobby_list(client, self.get_lobby_list())
        elif command == "create_lobby":
            self.create_lobby(client, message.get("name", "New Game"))
        elif command == "join_lobby":
            self.join_lobby(client, message.get("room_id"))

    def create_lobby(self, owner: Client, name: str):
        with self.lock:
            room_id = str(uuid.uuid4())
            new_room = GameRoom(self.server, room_id, name)
            self.rooms[room_id] = new_room
            print(f"Created new room: {name} ({room_id[:6]})")
        # The new room is empty, so we broadcast the updated list to everyone in the main menu.
        self.broadcast_lobby_list()
        self.join_lobby(owner, room_id)

    def join_lobby(self, client: Client, room_id: Optional[str]):
        with self.lock:
            room = self.rooms.get(room_id) if room_id else None
        # Check that the room exists, is not full, and is still in the LobbyState
        if room and isinstance(room.state, LobbyState) and room.get_human_player_count() < self.server.MAX_PLAYERS:
            # The client is about to join, so their old room (if any) is handled.
            # We add them to the new room. This will trigger another broadcast.
            room.add_client(client)
        # If checks fail, do nothing. The client remains in the main menu.

    def remove_room(self, room_id: str):
        with self.lock:
            if room_id in self.rooms:
                del self.rooms[room_id]
                print(f"Removed empty room {room_id[:6]}")
        self.broadcast_lobby_list()

    def get_lobby_list(self) -> List[Dict[str, Any]]:
        with self.lock:
            return [
                room.to_dict() for room in self.rooms.values()
                if isinstance(room.state, LobbyState) and room.get_human_player_count() < room.server.MAX_PLAYERS
            ]

    def broadcast_lobby_list(self):
        """Broadcasts the current list of lobbies to all clients in the main menu."""
        lobbies = self.get_lobby_list()
        all_clients = self.server.client_manager.get_all_clients()
        clients_in_main_menu = [c for c in all_clients if c.room is None]
        for client in clients_in_main_menu:
            self.server.view.send_lobby_list(client, lobbies)