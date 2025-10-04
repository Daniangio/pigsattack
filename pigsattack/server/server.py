import socket
from typing import Dict, Any

from .client_manager import ClientManager
from .server_view import ServerView
from .lobby_manager import LobbyManager

class Server:
    HOST = '0.0.0.0'
    PORT = 8080
    MIN_PLAYERS = 2
    MIN_TOTAL_PLAYERS = 2
    MAX_PLAYERS = 8

    def __init__(self):
        self.server_socket = self._create_socket()
        self.client_manager = ClientManager(self)
        self.lobby_manager = LobbyManager(self)
        self.view = ServerView(self.client_manager)
        self.client_inputs: Dict[int, str] = {}
        self._running = True

    def _create_socket(self) -> socket.socket:
        server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        server_socket.bind((self.HOST, self.PORT))
        server_socket.listen(self.MAX_PLAYERS)
        server_socket.settimeout(1.0)
        return server_socket

    def run(self):
        print(f"Server listening on {self.HOST}:{self.PORT}")
        try:
            while self._running:
                try:
                    client_socket, addr = self.server_socket.accept()
                    # All clients are accepted by the client manager now
                    self.client_manager.add_client(client_socket, addr)
                except socket.timeout:
                    continue
        except KeyboardInterrupt:
            print("\nShutting down server.")
        finally:
            self.shutdown()

    def shutdown(self):
        self._running = False
        for client in self.client_manager.get_all_clients():
            client.socket.close()
        self.server_socket.close()
        print("Server has been shut down.")