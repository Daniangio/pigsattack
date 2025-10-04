import pygame
from typing import Dict, Any

from .network import NetworkManager
from .state import ClientState, ConnectingState, EndGameState, MainMenuState, LobbyState, InGameState, DisconnectedState
from .ui import LogCanvas, WINDOW_WIDTH, WINDOW_HEIGHT, LOG_PANEL_WIDTH, LOG_PANEL_RATIO, BG_COLOR

class Client:
    SERVER_HOST = 'localhost'
    SERVER_PORT = 8080

    def __init__(self):
        pygame.init()
        self.width, self.height = WINDOW_WIDTH, WINDOW_HEIGHT
        # Add the RESIZABLE flag
        self.screen = pygame.display.set_mode((self.width, self.height), pygame.RESIZABLE)
        pygame.display.set_caption("Pigs Will Attack - Client")
        self.fonts = {
            'l': pygame.font.Font(None, 48),
            'm': pygame.font.Font(None, 32),
            's': pygame.font.Font(None, 24),
            'xs': pygame.font.Font(None, 18)
        }
        self.clock = pygame.time.Clock()
        initial_log_width = int(self.width * LOG_PANEL_RATIO)
        self.log_panel = LogCanvas(pygame.Rect(self.width - initial_log_width, 0, initial_log_width, self.height), self.fonts['xs'], self)
        
        self.network = NetworkManager(self, self.SERVER_HOST, self.SERVER_PORT)
        self.state: ClientState = ConnectingState(self)
        self.game_data: Dict[str, Any] = {}
        self._running = True

    def set_state(self, new_state: ClientState):
        if self.state:
            self.state.on_exit()
        self.state = new_state
        self.state.on_enter()

    def run(self):
        self.state.on_enter()
        while self._running:
            self._handle_events()
            self._update()
            self._draw()
            self.clock.tick(30)
        
        print("Shutting down client...")
        self.network.disconnect()
        pygame.quit()

    def _handle_events(self):
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                self._running = False
            elif event.type == pygame.VIDEORESIZE:
                self._on_resize(event.w, event.h)
            
            # Pass event to log panel first, as it might trigger a layout change
            self.log_panel.handle_event(event) 
            self.state.handle_event(event)

    def _update(self):
        self._process_server_messages()
        self.state.update()

    def _draw(self):
        self.screen.fill(BG_COLOR)
        self.state.draw(self.screen)
        # Only draw the log panel in states where it's relevant
        if isinstance(self.state, (InGameState, EndGameState)):
            self.log_panel.draw(self.screen)
        pygame.display.flip()

    def _on_resize(self, width: int, height: int):
        self.width, self.height = width, height
        self.screen = pygame.display.set_mode((self.width, self.height), pygame.RESIZABLE)
        self.on_layout_change()

    def on_layout_change(self):
        """Called when window resizes or log panel is toggled."""
        # Use the current log width if resizing, otherwise calculate from ratio
        new_log_width = self.log_panel.rect.width if self.log_panel.is_resizing else int(self.width * LOG_PANEL_RATIO)
        log_rect = pygame.Rect(self.width - new_log_width, 0, new_log_width, self.height)
        self.log_panel.resize(log_rect)
        self.state.recalculate_layout(self.width, self.height)
        pygame.display.flip()

    def _process_server_messages(self):
        while msg := self.network.get_message():
            self.state.update(msg) # Pass message to state for handling
            msg_type = msg.get("type")

            if msg_type == "lobby_list":
                self.game_data.clear() # Clear old data on getting a fresh list
                self.game_data.update(msg) 
                if not isinstance(self.state, MainMenuState):
                    self.set_state(MainMenuState(self))

            elif msg_type == "lobby_update":
                self.game_data.update(msg)
                if not isinstance(self.state, LobbyState):
                    self.set_state(LobbyState(self))
            
            elif msg_type == "game_state":
                self.game_data.update(msg)
                if not isinstance(self.state, InGameState):
                    self.set_state(InGameState(self))

            elif msg_type == "end_game":
                self.game_data.update(msg)
                if not isinstance(self.state, EndGameState):
                    self.set_state(EndGameState(self))

            elif msg_type == "prompt":
                self.game_data['prompt'] = msg

            elif msg_type == "event":
                self.log_panel.add_message(msg.get("message", ""))
                # If game ends, server resets to lobby. Client should follow.
                if "GAME OVER" in msg.get("message", ""):
                    self.game_data.pop("prompt", None) # Clear any lingering prompts