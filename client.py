import socket
import threading
import json
import pygame
import time
from typing import List, Dict, Any

# --- Configuration ---
SERVER_HOST = '127.0.0.1'
SERVER_PORT = 12346
WINDOW_WIDTH = 1280
WINDOW_HEIGHT = 720
CARD_WIDTH = 110
CARD_HEIGHT = 154
LOG_PANEL_WIDTH = 400
BG_COLOR = (20, 40, 30)
TEXT_COLOR = (240, 240, 220)
BUTTON_COLOR = (70, 90, 80)
BUTTON_HOVER_COLOR = (100, 120, 110)
CARD_SELECTED_COLOR = (255, 255, 0)

# --- Global State ---
client_socket: socket.socket = None
stop_event = threading.Event()
game_state: Dict[str, Any] = {}
log_panel = None
my_player_id = -1
input_prompt: Dict[str, Any] = {}
action_buttons: List['Button'] = []
selected_cards: List[int] = []
lock = threading.Lock()

class Button:
    def __init__(self, rect: pygame.Rect, text: str, value: Any):
        self.rect = rect
        self.text = text
        self.value = value
        self.is_hovered = False

    def handle_event(self, event: pygame.event.Event):
        if event.type == pygame.MOUSEMOTION: self.is_hovered = self.rect.collidepoint(event.pos)
        if event.type == pygame.MOUSEBUTTONDOWN and self.is_hovered: return True
        return False

    def draw(self, surface: pygame.Surface, font: pygame.font.Font):
        color = BUTTON_HOVER_COLOR if self.is_hovered else BUTTON_COLOR
        pygame.draw.rect(surface, color, self.rect, border_radius=8)
        draw_text(surface, self.text, self.rect.center, font, center=True)

class LogPanel:
    def __init__(self, rect: pygame.Rect, font: pygame.font.Font):
        self.rect = rect
        self.font = font
        self.messages: List[str] = []
        self.scroll_y = 0

    def add_message(self, message: str):
        self.messages.append(message)
        # Auto-scroll to the bottom
        self.scroll_y = max(0, len(self.messages) * self.font.get_height() - self.rect.height)

    def handle_event(self, event: pygame.event.Event):
        if event.type == pygame.MOUSEWHEEL and self.rect.collidepoint(pygame.mouse.get_pos()):
            self.scroll_y -= event.y * 20
            max_scroll = max(0, len(self.messages) * self.font.get_height() - self.rect.height)
            self.scroll_y = max(0, min(self.scroll_y, max_scroll))

    def draw(self, surface: pygame.Surface):
        pygame.draw.rect(surface, (10, 20, 15), self.rect)
        y_pos = self.rect.top - self.scroll_y
        for msg in self.messages:
            if y_pos + self.font.get_height() > self.rect.top and y_pos < self.rect.bottom:
                 draw_text(surface, msg, (self.rect.left + 10, y_pos), self.font, max_width=self.rect.width - 20)
            y_pos += self.font.get_height()
        pygame.draw.rect(surface, TEXT_COLOR, self.rect, 2) # Border

def listen_to_server():
    global game_state, my_player_id, input_prompt, action_buttons, log_panel
    buffer = ""
    while not stop_event.is_set():
        try:
            data = client_socket.recv(4096).decode('utf-8')
            if not data: break
            buffer += data
            while '\n' in buffer:
                message_str, buffer = buffer.split('\n', 1)
                try:
                    message = json.loads(message_str)
                    with lock:
                        msg_type = message.get("type")
                        if msg_type in ["lobby_update", "game_state"]:
                            game_state = message
                            if "player_id" in message: my_player_id = message["player_id"]
                        elif msg_type == "event" and log_panel:
                            log_panel.add_message(message.get("message", ""))
                        elif msg_type == "prompt":
                            input_prompt = message
                            action_buttons.clear()
                            selected_cards.clear()
                            choices = message.get("choices")
                            mode = message.get("input_mode")
                            if mode == 'card_select':
                                rect = pygame.Rect(WINDOW_WIDTH - LOG_PANEL_WIDTH - 220, WINDOW_HEIGHT - 120, 200, 50)
                                action_buttons.append(Button(rect, "Skip", "skip"))
                            elif mode == 'multi_card_select':
                                rect = pygame.Rect(WINDOW_WIDTH - LOG_PANEL_WIDTH - 220, WINDOW_HEIGHT - 120, 200, 50)
                                action_buttons.append(Button(rect, "Done", "done"))
                            elif choices:
                                for i, choice in enumerate(choices):
                                    rect = pygame.Rect(50 + (i % 3) * 220, WINDOW_HEIGHT - 300 + (i // 3) * 60, 200, 50)
                                    action_buttons.append(Button(rect, choice['text'], choice['value']))
                except json.JSONDecodeError: print(f"Malformed JSON: {message_str}")
        except (ConnectionResetError, ConnectionAbortedError): print("Disconnected from server."); break
        except Exception as e:
            if not stop_event.is_set(): print(f"Listener error: {e}"); break
    stop_event.set()

def send_to_server(message: dict):
    if client_socket:
        try: client_socket.sendall(json.dumps(message).encode('utf-8') + b'\n')
        except OSError as e: print(f"Send error: {e}")

def draw_text(surface, text, pos, font, color=TEXT_COLOR, center=False, max_width=None):
    words = text.split(' ')
    lines = []
    current_line = ""
    for word in words:
        if max_width and font.size(current_line + " " + word)[0] > max_width:
            lines.append(current_line)
            current_line = word
        else:
            current_line += " " + word
    lines.append(current_line.strip())
    
    y = pos[1]
    if center:
        total_height = len(lines) * font.get_height()
        y -= total_height / 2

    for line in lines:
        text_surface = font.render(line, True, color)
        text_rect = text_surface.get_rect()
        if center: text_rect.center = (pos[0], y + font.get_height() / 2)
        else: text_rect.topleft = (pos[0], y)
        surface.blit(text_surface, text_rect)
        y += font.get_height()

def get_card_rects(hand: List[Dict]) -> List[pygame.Rect]:
    rects = []
    for i, _ in enumerate(hand):
        x = 50 + i * (CARD_WIDTH + 10)
        y = WINDOW_HEIGHT - CARD_HEIGHT - 50
        if x + CARD_WIDTH > WINDOW_WIDTH - LOG_PANEL_WIDTH:
            x = 50 + (i - 6) * (CARD_WIDTH + 10)
            y -= (CARD_HEIGHT + 10)
        rects.append(pygame.Rect(x, y, CARD_WIDTH, CARD_HEIGHT))
    return rects

def main():
    global client_socket, log_panel
    pygame.init()
    screen = pygame.display.set_mode((WINDOW_WIDTH, WINDOW_HEIGHT))
    pygame.display.set_caption("Pigs Will Attack - Client")
    fonts = {'l': pygame.font.Font(None, 48), 'm': pygame.font.Font(None, 32), 's': pygame.font.Font(None, 24), 'xs': pygame.font.Font(None, 18)}
    clock = pygame.time.Clock()
    log_panel = LogPanel(pygame.Rect(WINDOW_WIDTH - LOG_PANEL_WIDTH, 0, LOG_PANEL_WIDTH, WINDOW_HEIGHT), fonts['s'])

    try:
        client_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        client_socket.connect((SERVER_HOST, SERVER_PORT))
        threading.Thread(target=listen_to_server, daemon=True).start()
    except ConnectionRefusedError: print("Connection refused. Is the server running?"); return

    running = True
    while running and not stop_event.is_set():
        with lock:
            current_state, prompt = game_state.copy(), input_prompt.copy()
            buttons = action_buttons.copy()
            my_hand = []
            if current_state.get("type") == "game_state":
                players = current_state.get("players", [])
                if 0 <= my_player_id < len(players): my_hand = players[my_player_id].get("hand", [])
        
        card_rects = get_card_rects(my_hand)

        for event in pygame.event.get():
            if event.type == pygame.QUIT: running = False
            log_panel.handle_event(event)

            if prompt:
                input_mode = prompt.get("input_mode")
                if event.type == pygame.MOUSEBUTTONDOWN:
                    if input_mode in ['card_select', 'multi_card_select']:
                        for i, rect in enumerate(card_rects):
                            if rect.collidepoint(event.pos):
                                card_id = my_hand[i]['id']
                                if input_mode == 'card_select':
                                    send_to_server({"command": "input", "value": str(card_id)})
                                    with lock: input_prompt.clear()
                                elif input_mode == 'multi_card_select':
                                    if card_id in selected_cards: selected_cards.remove(card_id)
                                    else: selected_cards.append(card_id)

                for btn in buttons:
                    if btn.handle_event(event):
                        value = btn.value
                        if value == "done": value = " ".join(map(str, selected_cards))
                        send_to_server({"command": "input", "value": value})
                        with lock: input_prompt.clear()
                        break
        
        screen.fill(BG_COLOR)
        state_type = current_state.get("type")

        if state_type == "lobby_update":
            draw_text(screen, "Lobby", (WINDOW_WIDTH / 2, 50), fonts['l'], center=True)
            draw_text(screen, f"{current_state.get('num_players', 0)} players.", (WINDOW_WIDTH / 2, 120), fonts['m'], center=True)
            if current_state.get("is_host"):
                draw_text(screen, "You are the host. Press 'S' to start.", (WINDOW_WIDTH / 2, 200), fonts['m'], center=True)
                if pygame.key.get_pressed()[pygame.K_s]: send_to_server({"command": "start_game"}); time.sleep(0.2)
            else: draw_text(screen, f"Waiting for host... (You are Player {my_player_id + 1})", (WINDOW_WIDTH / 2, 200), fonts['m'], center=True)
        
        elif state_type == "game_state":
            players = current_state.get("players", [])
            draw_text(screen, f"You are Player {my_player_id + 1}", (20, 20), fonts['m'])
            for i, p in enumerate(players):
                status = "ELIMINATED" if p["is_eliminated"] else f"{len(p['hand'])} cards"
                barricade = " | BARRICADE" if p["has_barricade"] else ""
                turn_marker = "<- TURN" if i == current_state.get("current_player_index") else ""
                draw_text(screen, f"{p['name']}: {status}{barricade} {turn_marker}", (20, 60 + i * 40), fonts['m'])

            for i, rect in enumerate(card_rects):
                card_data = my_hand[i]
                pygame.draw.rect(screen, (50, 70, 60), rect, border_radius=8)
                border_color = TEXT_COLOR
                if prompt and card_data['id'] in selected_cards: border_color = CARD_SELECTED_COLOR
                pygame.draw.rect(screen, border_color, rect, 2, border_radius=8)
                
                parts = card_data['repr'].split(" of "); rank, suit = (parts[0], parts[1]) if len(parts) > 1 else (parts[0], "")
                color = (200, 20, 20) if suit in ["Hearts", "Diamonds"] else (40, 40, 40)
                draw_text(screen, rank, (rect.x + 10, rect.y + 10), fonts['s'], color)
                draw_text(screen, f"(ID:{card_data['id']})", (rect.x + 10, rect.y + CARD_HEIGHT - 25), fonts['xs'])

            if prompt:
                prompt_rect = pygame.Rect(20, WINDOW_HEIGHT - 380, WINDOW_WIDTH - LOG_PANEL_WIDTH - 40, 70)
                draw_text(screen, prompt.get('prompt_text', ''), prompt_rect.topleft, fonts['m'], max_width=prompt_rect.width)
                for btn in buttons: btn.draw(screen, fonts['s'])

        log_panel.draw(screen)
        pygame.display.flip()
        clock.tick(30)

    print("Shutting down client...")
    stop_event.set()
    if client_socket: client_socket.close()
    pygame.quit()

if __name__ == '__main__':
    main()

