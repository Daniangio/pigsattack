from __future__ import annotations
import threading
from typing import TYPE_CHECKING, Dict, Any, List

from pigsattack.game import Game
from pigsattack.bot_controller import NaiveBotController
from .network_controller import NetworkController

if TYPE_CHECKING:
    from .server import Server
    from .client_manager import Client

class ServerState:
    """Abstract base class for a server state."""
    def __init__(self, server: Server):
        self.server = server

    def handle_client_message(self, client: Client, message: Dict[str, Any]):
        """Handles a message from a specific client."""
        print(f"State {self.__class__.__name__} ignoring message from {client.addr}: {message}")

    def on_client_disconnect(self, client: Client):
        """Handles a client disconnecting."""
        pass

    def on_enter(self):
        """Code to run when entering this state."""
        pass

    def on_exit(self):
        """Code to run when exiting this state."""
        pass


class LobbyState(ServerState):
    """The server state while waiting for players in the lobby."""
    def on_enter(self):
        print("--- Server is in Lobby State. Waiting for players... ---")
        self.server.client_manager.broadcast_lobby_update()

    def handle_client_message(self, client: Client, message: Dict[str, Any]):
        command = message.get("command")
        if command == "start_game" and self.server.client_manager.is_host(client):
            self._start_game(message)

    def on_client_disconnect(self, client: Client):
        self.server.client_manager.broadcast_lobby_update()

    def _start_game(self, message: Dict[str, Any]):
        num_human_players = self.server.client_manager.get_human_player_count()
        num_ai_players = message.get("num_ai", 0)
        total_players = num_human_players + num_ai_players

        if self.server.MIN_TOTAL_PLAYERS <= total_players <= self.server.MAX_PLAYERS:
            print(f"Host starting game with {num_human_players} humans and {num_ai_players} bots.")
            self.server.set_state(GameState(self.server, num_ai_players))
        else:
            print(f"Start failed: {total_players} total players, need {self.server.MIN_TOTAL_PLAYERS}-{self.server.MAX_PLAYERS}.")


class GameState(ServerState):
    """The server state while a game is in progress."""
    def __init__(self, server: Server, num_ai_players: int):
        super().__init__(server)
        self.game_instance: Game | None = None
        self.num_ai_players = num_ai_players

    def on_enter(self):
        print("--- Server is in Game State. ---")
        # Create controllers for human players
        controllers: List[NetworkController | NaiveBotController] = []
        human_clients = self.server.client_manager.get_all_clients()
        for client in sorted(human_clients, key=lambda c: c.player_id):
            controllers.append(NetworkController(client.player_id, self.server.view))

        # Add bot controllers
        for _ in range(self.num_ai_players):
            controllers.append(NaiveBotController())

        self.game_instance = Game(controllers, self.server.view)

        # Run the game in a separate thread
        game_thread = threading.Thread(target=self._run_game_and_reset, daemon=True)
        game_thread.start()

    def handle_client_message(self, client: Client, message: Dict[str, Any]):
        command = message.get("command")
        if command == "input":
            self.server.client_inputs[client.player_id] = message.get("value")

    def on_client_disconnect(self, client: Client):
        # If all human players disconnect, reset the server
        if self.server.client_manager.get_human_player_count() == 0:
            print("All human players have disconnected. Resetting server.")
            self.server.set_state(LobbyState(self.server))

    def on_exit(self):
        self.game_instance = None
        self.server.client_inputs.clear()

    def _run_game_and_reset(self):
        if self.game_instance:
            self.game_instance.run_game()
        print("--- Game has finished. Resetting to lobby. ---")
        self.server.set_state(LobbyState(self.server))