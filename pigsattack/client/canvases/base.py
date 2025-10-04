from __future__ import annotations
import pygame
from typing import TYPE_CHECKING, Any, Dict

if TYPE_CHECKING:
    from . import Client

class GameCanvas:
    """
    A base class for a drawable area of the screen (a canvas).
    It manages its own surface and position, making it easy to rearrange.
    """
    def __init__(self, rect: pygame.Rect, client: Client, visible: bool = True):
        self.client = client
        self.rect = rect
        self.surface = pygame.Surface(rect.size, pygame.SRCALPHA)
        self.is_visible = visible

    def draw(self, parent_surface: pygame.Surface, game_data: Dict[str, Any]):
        """Draws the canvas's content and blits it to the parent."""
        if not self.is_visible:
            return
        self._draw_content(game_data)
        parent_surface.blit(self.surface, self.rect.topleft)

    def _draw_content(self, game_data: Dict[str, Any]):
        """Subclasses implement this to draw their specific content."""
        self.surface.fill((0, 0, 0, 0)) # Clear with transparency