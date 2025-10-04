from __future__ import annotations
import pygame
from typing import TYPE_CHECKING, List, Dict, Any

from .ui import (
    draw_text, get_card_rects, Button,
    WINDOW_WIDTH, LOG_PANEL_WIDTH, WINDOW_HEIGHT, CARD_WIDTH, CARD_HEIGHT,
    TEXT_COLOR, CARD_SELECTED_COLOR
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
        self.quit_button = Button(pygame.Rect(WINDOW_WIDTH - LOG_PANEL_WIDTH - 170, 20, 150, 40), "Surrender", "surrender")

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
        if my_player_data and my_player_data.get("is_eliminated"):
            self.quit_button.text = "Quit to Menu"
            self.quit_button.value = "leave_room"
            self.quit_button.is_disabled = False # Re-enable the button
        else:
            self.quit_button.text = "Surrender"
            self.quit_button.value = "surrender"
            self.quit_button.is_disabled = False

        # Transition to EndGameState if game is over
        if message and message.get("type") == "end_game":
            self.client.set_state(EndGameState(self.client))

    def handle_event(self, event: pygame.event.Event):
        if not self.input_prompt: return

        input_mode = self.input_prompt.get("input_mode")
        if event.type == pygame.MOUSEBUTTONDOWN:
            if input_mode in ['card_select', 'multi_card_select']:
                my_hand = self._get_my_hand()
                card_rects = get_card_rects(len(my_hand))
                for i, rect in enumerate(card_rects):
                    if rect.collidepoint(event.pos):
                        card_id = my_hand[i]['id']
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
        
        if self.quit_button.handle_event(event):
            if self.quit_button.value == "leave_room":
                self.client.network.send_message({"command": "leave_room"})
                self.client.set_state(MainMenuState(self.client))
            else: # Surrender
                self.client.network.send_message({"command": "surrender"})

    def draw(self, screen: pygame.Surface):
        state = self.client.game_data
        my_id = state.get("player_id", -1)
        players = state.get("players", [])
        my_hand = self._get_my_hand()
        card_rects = get_card_rects(len(my_hand))

        draw_text(screen, f"You are Player {my_id + 1}", (20, 20), self.client.fonts['m'])
        for i, p in enumerate(players):
            status = "ELIMINATED" if p["is_eliminated"] else f"{len(p['hand'])} cards"
            barricade = " | BARRICADE" if p["has_barricade"] else ""
            turn_marker = "<- TURN" if i == state.get("current_player_index") else ""
            draw_text(screen, f"{p['name']}: {status}{barricade} {turn_marker}", (20, 60 + i * 40), self.client.fonts['m'])

        for i, rect in enumerate(card_rects):
            card_data = my_hand[i]
            pygame.draw.rect(screen, (50, 70, 60), rect, border_radius=8)
            border_color = TEXT_COLOR
            if self.input_prompt and card_data['id'] in self.selected_cards:
                border_color = CARD_SELECTED_COLOR
            pygame.draw.rect(screen, border_color, rect, 2, border_radius=8)
            
            parts = card_data['repr'].split(" of ")
            rank, suit = (parts[0], parts[1]) if len(parts) > 1 else (parts[0], "")
            draw_text(screen, rank, (rect.x + 10, rect.y + 10), self.client.fonts['s'])
            draw_text(screen, f"(ID:{card_data['id']})", (rect.x + 10, rect.y + CARD_HEIGHT - 25), self.client.fonts['xs'])

        if self.input_prompt:
            prompt_rect = pygame.Rect(20, WINDOW_HEIGHT - 380, WINDOW_WIDTH - LOG_PANEL_WIDTH - 40, 70)
            draw_text(screen, self.input_prompt.get('prompt_text', ''), prompt_rect.topleft, self.client.fonts['m'], max_width=prompt_rect.width)
            for btn in self.action_buttons:
                btn.draw(screen, self.client.fonts['s'])
        
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
        choices = prompt.get("choices")
        mode = prompt.get("input_mode")

        if mode == 'card_select':
            rect = pygame.Rect(WINDOW_WIDTH - LOG_PANEL_WIDTH - 220, WINDOW_HEIGHT - 120, 200, 50)
            self.action_buttons.append(Button(rect, "Skip", "skip"))
        elif mode == 'multi_card_select':
            rect = pygame.Rect(WINDOW_WIDTH - LOG_PANEL_WIDTH - 220, WINDOW_HEIGHT - 120, 200, 50)
            self.action_buttons.append(Button(rect, "Done", "done"))
        elif choices:
            for i, choice in enumerate(choices):
                rect = pygame.Rect(50 + (i % 3) * 220, WINDOW_HEIGHT - 350 + (i // 3) * 60, 200, 50)
                self.action_buttons.append(Button(rect, choice['text'], choice['value']))

class EndGameState(ClientState):
    def __init__(self, client: Client):
        super().__init__(client)
        self.quit_button = Button(pygame.Rect((WINDOW_WIDTH - LOG_PANEL_WIDTH) / 2 - 100, WINDOW_HEIGHT / 2 + 50, 200, 50), "Quit to Menu", "leave_room")

    def on_enter(self):
        self.client.log_panel.clear()

    def handle_event(self, event: pygame.event.Event):
        if self.quit_button.handle_event(event):
            self.client.network.send_message({"command": "leave_room"})
            self.client.set_state(MainMenuState(self.client))

    def draw(self, screen: pygame.Surface):
        winner_name = self.client.game_data.get("winner", "NO ONE")
        center_x = (WINDOW_WIDTH - LOG_PANEL_WIDTH) / 2
        
        draw_text(screen, "Game Over!", (center_x, WINDOW_HEIGHT / 2 - 100), self.client.fonts['l'], center=True)
        draw_text(screen, f"The winner is {winner_name}!", (center_x, WINDOW_HEIGHT / 2 - 40), self.client.fonts['m'], center=True)

        self.quit_button.draw(screen, self.client.fonts['m'])