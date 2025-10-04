import pygame
from typing import List, Dict, Any

# --- UI Constants ---
WINDOW_WIDTH = 1280
WINDOW_HEIGHT = 640
CARD_WIDTH = 110
CARD_HEIGHT = 154
LOG_PANEL_WIDTH = 400
BG_COLOR = (20, 40, 30)
TEXT_COLOR = (240, 240, 220)
BUTTON_COLOR = (70, 90, 80)
BUTTON_HOVER_COLOR = (100, 120, 110)
BUTTON_DISABLED_COLOR = (130, 50, 50)
CARD_SELECTED_COLOR = (255, 255, 0)

class Button:
    def __init__(self, rect: pygame.Rect, text: str, value: Any):
        self.rect = rect
        self.text = text
        self.value = value
        self.is_hovered = False
        self.is_disabled = False

    def handle_event(self, event: pygame.event.Event):
        if self.is_disabled:
            self.is_hovered = False
            return False
        if event.type == pygame.MOUSEMOTION:
            self.is_hovered = self.rect.collidepoint(event.pos)
        if event.type == pygame.MOUSEBUTTONDOWN and self.is_hovered:
            return True
        return False

    def draw(self, surface: pygame.Surface, font: pygame.font.Font):
        if self.is_disabled:
            color = BUTTON_DISABLED_COLOR
        else:
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

    def clear(self):
        self.messages.clear()
        self.scroll_y = 0

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

def draw_text(surface, text, pos, font, color=TEXT_COLOR, center=False, max_width=None):
    words = text.split(' ')
    lines = []
    current_line = ""
    for word in words:
        test_line = f"{current_line} {word}".strip()
        if max_width and font.size(test_line)[0] > max_width:
            lines.append(current_line)
            current_line = word
        else:
            current_line = test_line
    lines.append(current_line)
    
    y = pos[1]
    if center:
        total_height = len(lines) * font.get_height()
        y -= total_height / 2

    for i, line in enumerate(lines):
        text_surface = font.render(line, True, color)
        text_rect = text_surface.get_rect()
        line_y = y + (i * font.get_height())
        if center:
            text_rect.center = (pos[0], line_y + font.get_height() / 2)
        else:
            text_rect.topleft = (pos[0], line_y)
        surface.blit(text_surface, text_rect)

def get_card_rects(hand_size: int) -> List[pygame.Rect]:
    rects = []
    for i in range(hand_size):
        x = 50 + i * (CARD_WIDTH + 10)
        y = WINDOW_HEIGHT - CARD_HEIGHT - 50
        # Simple wrap for large hands
        if x + CARD_WIDTH > WINDOW_WIDTH - LOG_PANEL_WIDTH:
            x = 50 + (i - 6) * (CARD_WIDTH + 10)
            y -= (CARD_HEIGHT + 10)
        rects.append(pygame.Rect(x, y, CARD_WIDTH, CARD_HEIGHT))
    return rects