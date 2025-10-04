from __future__ import annotations
import socket
import threading
import json
from typing import Dict, Any, Optional, List, TYPE_CHECKING

if TYPE_CHECKING:
    from .game_room import GameRoom
    from .server import Server

class Client:
    """Represents a connected client."""
    def __init__(self, sock: socket.socket, addr: tuple, handler_thread: threading.Thread):
        self.socket = sock
        self.addr = addr
        self.thread = handler_thread
        self.room: Optional[GameRoom] = None
        self.player_id: int = -1 # Player ID within a room

class ClientManager:
    """Manages all connected clients for the server."""
    def __init__(self, server: Server):
        self.server = server
        self.clients: Dict[socket.socket, Client] = {}
        self.lock = threading.Lock()

    def get_all_clients(self) -> List[Client]:
        with self.lock:
            return list(self.clients.values())

    def add_client(self, sock: socket.socket, addr: tuple):
        with self.lock:
            handler_thread = threading.Thread(target=self._handle_client_io, args=(sock, addr), daemon=True)
            client = Client(sock, addr, handler_thread)
            self.clients[sock] = client
            print(f"New connection from {addr}")
            handler_thread.start()
            # Send initial lobby list
            self.server.lobby_manager.handle_client_message(client, {"command": "get_lobbies"})

    def remove_client(self, sock: socket.socket):
        with self.lock:
            client = self.clients.pop(sock, None)
        if client:
            print(f"Client {client.addr} has disconnected.")
            if client.room:
                client.room.remove_client(client)
            sock.close()

    def _handle_client_io(self, sock: socket.socket, addr: tuple):
        """Thread function to handle a single client's I/O."""
        buffer = ""
        try:
            while True:
                with self.lock:
                    client = self.clients.get(sock)
                if not client: break

                data = sock.recv(1024).decode('utf-8')
                if not data:
                    break
                buffer += data
                while '\n' in buffer:
                    message_str, buffer = buffer.split('\n', 1)
                    try:
                        message = json.loads(message_str)
                        # If client is in a room, forward message to the room.
                        # Otherwise, forward to the lobby manager.
                        if client.room:
                            client.room.handle_message(client, message)
                        else:
                            self.server.lobby_manager.handle_client_message(client, message)
                    except json.JSONDecodeError:
                        print(f"Malformed JSON from {addr}: {message_str}")
        except (ConnectionResetError, ConnectionAbortedError):
            print(f"Client {addr} disconnected abruptly.")
        finally:
            self.remove_client(sock)