import pygame
from typing import List, Dict, Any

# --- UI Constants ---
WINDOW_WIDTH = 1280
WINDOW_HEIGHT = 640
LOG_PANEL_RATIO = 0.3  # Log panel will try to be 30% of the window width
CARD_WIDTH = 110 # Base card width, can be scaled in the future
CARD_HEIGHT = 154
LOG_PANEL_WIDTH = 400
BG_COLOR = (20, 40, 30)
TEXT_COLOR = (240, 240, 220)
BUTTON_COLOR = (70, 90, 80)
BUTTON_HOVER_COLOR = (100, 120, 110)
BUTTON_DISABLED_COLOR = (130, 50, 50)
CARD_SELECTED_COLOR = (255, 255, 0)

class CardSprite(pygame.sprite.Sprite):
    """A sprite for visually representing a card with a title, image, and effect area."""
    def __init__(self, card_data: Dict[str, Any], rect: pygame.Rect, fonts: Dict[str, pygame.font.Font]):
        super().__init__()
        self.card_data = card_data
        self.image = pygame.Surface(rect.size, pygame.SRCALPHA)
        self.rect = rect
        self.is_selected = False
        self._font_m = fonts['m']
        self._font_s = fonts['s']
        self._font_xs = fonts['xs']
        self.draw()

    def update(self, is_selected: bool):
        """Update the selected state and redraw if it changed."""
        if is_selected != self.is_selected:
            self.is_selected = is_selected
            self.draw()

    def draw(self):
        """Draws the card onto its internal surface."""
        self.image.fill((0, 0, 0, 0)) # Clear

        # Card Body
        pygame.draw.rect(self.image, (50, 70, 60), self.image.get_rect(), border_radius=8)
        
        # --- Layout Areas ---
        title_rect = pygame.Rect(5, 5, self.rect.width - 10, 25)
        image_rect = pygame.Rect(10, 35, self.rect.width - 20, 60)
        effect_rect = pygame.Rect(10, 100, self.rect.width - 20, 50)

        # Card Title (Name)
        parts = self.card_data['repr'].split(" of ")
        name = parts[0]
        draw_text(self.image, name, title_rect.center, self._font_s, center=True)

        # Placeholder for Card Image
        pygame.draw.rect(self.image, (30, 50, 40), image_rect)
        draw_text(self.image, "img", image_rect.center, self._font_xs, center=True)

        # Effect Text (placeholder for now)
        effect_text = f"Value: {self.card_data.get('value', 'N/A')}"
        draw_text(self.image, effect_text, effect_rect.topleft, self._font_xs, max_width=effect_rect.width)

        # Border (shows selection)
        border_color = CARD_SELECTED_COLOR if self.is_selected else TEXT_COLOR
        pygame.draw.rect(self.image, border_color, self.image.get_rect(), 2, border_radius=8)

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

class LogCanvas:
    def __init__(self, rect: pygame.Rect, font: pygame.font.Font, client):
        self.rect = rect
        self.font = font
        self.client = client
        self.messages: List[str] = []
        self.scroll_y = 0
        self.is_visible = True
        self.toggle_button = self._create_toggle_button()

    def _create_toggle_button(self) -> Button:
        text = ">" if self.is_visible else "<"
        if self.is_visible:
            # Position button on the left edge of the visible panel
            button_rect = pygame.Rect(self.rect.left - 20, self.rect.centery - 15, 20, 30)
        else:
            # Position button on the far right of the screen when panel is hidden
            button_rect = pygame.Rect(self.client.width - 25, self.rect.centery - 15, 20, 30)
        return Button(button_rect, text, "toggle_log")

    def add_message(self, message: str):
        self.messages.append(message)
        # Auto-scroll to the bottom
        self.scroll_y = max(0, len(self.messages) * self.font.get_height() - self.rect.height)

    def resize(self, new_rect: pygame.Rect):
        self.rect = new_rect
        self.toggle_button = self._create_toggle_button()

    def clear(self):
        self.messages.clear()
        self.scroll_y = 0

    def handle_event(self, event: pygame.event.Event):
        if self.toggle_button.handle_event(event):
            self.is_visible = not self.is_visible
            self.toggle_button = self._create_toggle_button()
            self.client.on_layout_change() # Notify client to resize other elements

        if self.is_visible and event.type == pygame.MOUSEWHEEL and self.rect.collidepoint(pygame.mouse.get_pos()):
            self.scroll_y -= event.y * 20
            max_scroll = max(0, len(self.messages) * self.font.get_height() - self.rect.height)
            self.scroll_y = max(0, min(self.scroll_y, max_scroll))

    def draw(self, surface: pygame.Surface):
        if self.is_visible:
            pygame.draw.rect(surface, (10, 20, 15), self.rect)
            y_pos = self.rect.top - self.scroll_y
            for msg in self.messages:
                if y_pos + self.font.get_height() > self.rect.top and y_pos < self.rect.bottom:
                     draw_text(surface, msg, (self.rect.left + 10, y_pos), self.font, max_width=self.rect.width - 20)
                y_pos += self.font.get_height()
            pygame.draw.rect(surface, TEXT_COLOR, self.rect, 2) # Border
        self.toggle_button.draw(surface, self.font)

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

def get_card_rects(hand_size: int, canvas_width: int) -> List[pygame.Rect]:
    rects = []
    if hand_size == 0:
        return rects

    x_margin = 20
    y_pos = 20 # Y position relative to the HandCanvas surface
    available_width = canvas_width - (x_margin * 2)
    
    # Overlap cards if they don't fit
    card_spacing = CARD_WIDTH + 10
    total_width = hand_size * CARD_WIDTH + (hand_size - 1) * 10
    if total_width > available_width:
        card_spacing = (available_width - CARD_WIDTH) / (hand_size - 1)

    for i in range(hand_size):
        x = x_margin + i * card_spacing
        rects.append(pygame.Rect(x, y_pos, CARD_WIDTH, CARD_HEIGHT))
    return rects