from __future__ import annotations
import pygame
from typing import TYPE_CHECKING, List, Dict, Any

from .canvases import PlaymatCanvas, HandCanvas, PromptCanvas
from .ui import (
    LOG_PANEL_WIDTH, draw_text, Button,
    WINDOW_WIDTH, WINDOW_HEIGHT,
)

if TYPE_CHECKING:
    from .client import Client

class ClientState:
    def __init__(self, client: Client):
        self.client = client

    def handle_event(self, event: pygame.event.Event): pass
    def update(self, message: Dict[str, Any] | None = None): pass
    def draw(self, screen: pygame.Surface): pass
    def on_enter(self): pass
    def recalculate_layout(self, width: int, height: int): pass
    def on_exit(self): pass

class ConnectingState(ClientState):
    def on_enter(self):
        if self.client.network.connect():
            # On successful connection, we go to the main menu, not a lobby
            self.client.set_state(MainMenuState(self.client))
        else:
            self.client.set_state(DisconnectedState(self.client, "Connection refused. Is the server running?"))

    def draw(self, screen: pygame.Surface):
        draw_text(screen, "Connecting...", (WINDOW_WIDTH / 2, WINDOW_HEIGHT / 2), self.client.fonts['l'], center=True)

class MainMenuState(ClientState):
    def __init__(self, client: Client):
        super().__init__(client)
        self.buttons: List[Button] = []

    def on_enter(self):
        self.client.game_data.clear()
        self.client.network.send_message({"command": "get_lobbies"})

    def update(self, message: Dict[str, Any] | None = None):
        # Only rebuild the button list when we receive a lobby_list message
        if message and message.get("type") == "lobby_list":
            lobbies = message.get("lobbies", [])
            self.buttons.clear()
            # "Create Lobby" button
            self.buttons.append(Button(pygame.Rect(50, 50, 250, 50), "Create New Lobby", "create"))
            # Buttons for each existing lobby
            for i, lobby in enumerate(lobbies):
                text = f"Join '{lobby['name']}' ({lobby['players']}/{lobby['max_players']})"
                rect = pygame.Rect(50, 120 + i * 60, 400, 50)
                self.buttons.append(Button(rect, text, lobby['id']))

    def handle_event(self, event: pygame.event.Event):
        for btn in self.buttons:
            if btn.handle_event(event):
                if btn.value == "create":
                    # For now, use a default name. A text input box would be a future improvement.
                    self.client.network.send_message({"command": "create_lobby", "name": "A New Camp"})
                else: # It's a room_id
                    self.client.network.send_message({"command": "join_lobby", "room_id": btn.value})
                break

    def draw(self, screen: pygame.Surface):
        draw_text(screen, "Main Menu", ((WINDOW_WIDTH - LOG_PANEL_WIDTH) / 2, 50), self.client.fonts['l'], center=True)
        for btn in self.buttons:
            btn.draw(screen, self.client.fonts['s'])


class DisconnectedState(ClientState):
    def __init__(self, client: Client, message: str):
        super().__init__(client)
        self.message = message

    def draw(self, screen: pygame.Surface):
        draw_text(screen, "Disconnected", (WINDOW_WIDTH / 2, WINDOW_HEIGHT / 2 - 40), self.client.fonts['l'], center=True)
        draw_text(screen, self.message, (WINDOW_WIDTH / 2, WINDOW_HEIGHT / 2 + 20), self.client.fonts['m'], center=True)

class LobbyState(ClientState):
    def on_enter(self):
        self.client.game_data.setdefault('num_ai', 0)

    def handle_event(self, event: pygame.event.Event):
        is_host = self.client.game_data.get("is_host", False)
        if not is_host or event.type != pygame.KEYDOWN:
            return

        num_human = self.client.game_data.get("num_players", 0)
        max_players = self.client.game_data.get("max_players", 8)
        num_ai = self.client.game_data.get('num_ai', 0)

        if event.key == pygame.K_s:
            # The server knows which room we are in
            self.client.network.send_message({"command": "start_game", "num_ai": num_ai}) 
        elif event.key == pygame.K_UP and num_human + num_ai < max_players:
            self.client.game_data['num_ai'] += 1
        elif event.key == pygame.K_DOWN and num_ai > 0:
            self.client.game_data['num_ai'] -= 1

    def draw(self, screen: pygame.Surface):
        lobby_center_x = (WINDOW_WIDTH - LOG_PANEL_WIDTH) / 2
        draw_text(screen, "Lobby", (lobby_center_x, 50), self.client.fonts['l'], center=True)

        num_human = self.client.game_data.get("num_players", 0)
        is_host = self.client.game_data.get("is_host", False)
        my_id = self.client.game_data.get("player_id", -1)

        draw_text(screen, f"{num_human} Human Players Connected", (lobby_center_x, 120), self.client.fonts['m'], center=True)

        if is_host:
            num_ai = self.client.game_data.get('num_ai', 0)
            draw_text(screen, f"Computer Players: {num_ai}", (lobby_center_x, 200), self.client.fonts['m'], center=True)
            draw_text(screen, "Use UP/DOWN arrows to change bot count", (lobby_center_x, 240), self.client.fonts['s'], center=True)
            draw_text(screen, "You are the host. Press 'S' to start.", (lobby_center_x, 300), self.client.fonts['m'], center=True)
        else:
            draw_text(screen, f"Waiting for host... (You are Player {my_id + 1})", (lobby_center_x, 200), self.client.fonts['m'], center=True)


class InGameState(ClientState):
    def __init__(self, client: Client):
        super().__init__(client)
        self.action_buttons: List[Button] = []
        self.selected_cards: List[int] = []
        self.input_prompt: Dict[str, Any] = {}
        self.quit_button: Button | None = None

        self.playmat_canvas: PlaymatCanvas | None = None
        self.prompt_canvas: PromptCanvas | None = None
        self.hand_canvas: HandCanvas | None = None
        self.canvases: List[PlaymatCanvas | HandCanvas | PromptCanvas] = []
        self.recalculate_layout(self.client.width, self.client.height)

    def recalculate_layout(self, width: int, height: int):
        log_width = self.client.log_panel.rect.width if self.client.log_panel.is_visible else 0
        game_area_width = width - log_width

        playmat_height = 300
        prompt_height = 150
        hand_height = height - playmat_height - prompt_height

        self.playmat_canvas = PlaymatCanvas(pygame.Rect(0, 0, game_area_width, playmat_height), self.client)
        self.prompt_canvas = PromptCanvas(pygame.Rect(0, playmat_height, game_area_width, prompt_height), self.client)
        self.hand_canvas = HandCanvas(pygame.Rect(0, playmat_height + prompt_height, game_area_width, hand_height), self.client)
        self.canvases = [self.playmat_canvas, self.prompt_canvas, self.hand_canvas]
        self.quit_button = Button(pygame.Rect(game_area_width - 170, 20, 150, 40), "Surrender", "surrender")

    def update(self, message: Dict[str, Any] | None = None):
        # Check for new prompts from the server
        prompt = self.client.game_data.get("prompt")
        if prompt and prompt != self.input_prompt:
            self.input_prompt = prompt
            self.selected_cards.clear()
            self.action_buttons.clear()
            self._create_buttons_for_prompt(prompt)
        
        # Update quit button based on player status
        my_player_data = self._get_my_player_data()
        if self.quit_button and my_player_data and my_player_data.get("is_eliminated"):
            self.quit_button.text = "Quit to Menu"
            self.quit_button.value = "leave_room"
            self.quit_button.is_disabled = False # Re-enable the button
        elif self.quit_button:
            self.quit_button.text = "Surrender"
            self.quit_button.value = "surrender"
            self.quit_button.is_disabled = False

        # Transition to EndGameState if game is over
        if message and message.get("type") == "end_game":
            self.client.set_state(EndGameState(self.client))

    def handle_event(self, event: pygame.event.Event):
        if not self.input_prompt or not self.hand_canvas: return

        input_mode = self.input_prompt.get("input_mode")
        if event.type == pygame.MOUSEBUTTONDOWN:
            if input_mode in ['card_select', 'multi_card_select']:
                # Translate mouse position to hand canvas coordinates
                local_pos = (event.pos[0] - self.hand_canvas.rect.x, event.pos[1] - self.hand_canvas.rect.y)
                # Check for collision with card sprites
                for sprite in self.hand_canvas.card_sprites:
                    if sprite.rect.collidepoint(local_pos):
                        card_id = sprite.card_data['id']
                        if input_mode == 'card_select':
                            self._send_input(str(card_id))
                        elif input_mode == 'multi_card_select':
                            if card_id in self.selected_cards: self.selected_cards.remove(card_id)
                            else: self.selected_cards.append(card_id)

        for btn in self.action_buttons:
            if btn.handle_event(event):
                value = btn.value
                if value == "done": value = " ".join(map(str, self.selected_cards))
                self._send_input(value)
                break
        
        if self.quit_button and self.quit_button.handle_event(event):
            if self.quit_button.value == "leave_room":
                self.client.network.send_message({"command": "leave_room"})
                self.client.set_state(MainMenuState(self.client))
            else: # Surrender
                self.client.network.send_message({"command": "surrender"})

    def draw(self, screen: pygame.Surface):
        # Pass dynamic data to canvases for drawing
        draw_data = self.client.game_data.copy()
        draw_data["selected_cards"] = self.selected_cards
        draw_data["action_buttons"] = self.action_buttons

        for canvas in self.canvases:
            canvas.draw(screen, draw_data)

        # Buttons are still drawn on the main screen for now
        for btn in self.action_buttons:
            btn.draw(screen, self.client.fonts['s'])
        if self.quit_button:
            self.quit_button.draw(screen, self.client.fonts['s'])

    def _get_my_hand(self) -> List[Dict[str, Any]]:
        my_id = self.client.game_data.get("player_id", -1)
        players = self.client.game_data.get("players", [])
        if 0 <= my_id < len(players):
            return players[my_id].get("hand", [])
        return []

    def _get_my_player_data(self) -> Dict[str, Any] | None:
        my_id = self.client.game_data.get("player_id", -1)
        players = self.client.game_data.get("players", [])
        if 0 <= my_id < len(players):
            return players[my_id]
        return None

    def _send_input(self, value: str):
        self.client.network.send_message({"command": "input", "value": value})
        self.input_prompt.clear()
        self.client.game_data.pop("prompt", None)

    def _create_buttons_for_prompt(self, prompt: Dict[str, Any]):
        if not self.prompt_canvas: return
        mode = prompt.get("input_mode")

        if mode == 'card_select':
            # Position relative to prompt canvas
            rect = pygame.Rect(self.prompt_canvas.rect.x + 20, self.prompt_canvas.rect.y + 80, 200, 50)
            self.action_buttons.append(Button(rect, "Skip", "skip"))
        elif mode == 'multi_card_select':
            rect = pygame.Rect(self.prompt_canvas.rect.x + 20, self.prompt_canvas.rect.y + 80, 200, 50)
            self.action_buttons.append(Button(rect, "Done", "done"))
        elif choices := prompt.get("choices"):
            for i, choice in enumerate(choices):
                # Position relative to prompt canvas
                rect = pygame.Rect(self.prompt_canvas.rect.x + 20 + (i % 3) * 220, self.prompt_canvas.rect.y + 80 + (i // 3) * 60, 200, 50)
                self.action_buttons.append(Button(rect, choice['text'], choice['value']))

class EndGameState(ClientState):
    def __init__(self, client: Client):
        super().__init__(client)
        self.quit_button: Button | None = None
        self.recalculate_layout(client.width, client.height)

    def recalculate_layout(self, width: int, height: int):
        log_width = self.client.log_panel.rect.width if self.client.log_panel.is_visible else 0
        center_x = (width - log_width) / 2
        self.quit_button = Button(pygame.Rect(center_x - 100, height / 2 + 50, 200, 50), "Quit to Menu", "leave_room")

    def on_enter(self):
        self.client.log_panel.clear() # Using the new name for clarity

    def handle_event(self, event: pygame.event.Event):
        if self.quit_button.handle_event(event):
            self.client.network.send_message({"command": "leave_room"})
            self.client.set_state(MainMenuState(self.client))

    def draw(self, screen: pygame.Surface):
        winner_name = self.client.game_data.get("winner", "NO ONE")
        log_width = self.client.log_panel.rect.width if self.client.log_panel.is_visible else 0
        center_x = (self.client.width - log_width) / 2
        
        draw_text(screen, "Game Over!", (center_x, self.client.height / 2 - 100), self.client.fonts['l'], center=True)
        draw_text(screen, f"The winner is {winner_name}!", (center_x, self.client.height / 2 - 40), self.client.fonts['m'], center=True)

        if self.quit_button:
            self.quit_button.draw(screen, self.client.fonts['m'])