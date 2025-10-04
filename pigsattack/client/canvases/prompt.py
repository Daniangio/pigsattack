from __future__ import annotations
import pygame
from typing import TYPE_CHECKING, Any, Dict, List

from .base import GameCanvas
from ..ui import draw_text, Button

if TYPE_CHECKING:
    from ..client import Client


class PromptCanvas(GameCanvas):
    def _draw_content(self, game_data: Dict[str, Any]):
        super()._draw_content(game_data)
        prompt = game_data.get("prompt")
        if not prompt:
            return

        prompt_rect = pygame.Rect(20, 20, self.rect.width - 40, 70)
        draw_text(self.surface, prompt.get('prompt_text', ''), prompt_rect.topleft, self.client.fonts['m'], max_width=prompt_rect.width)

    def get_buttons_for_drawing(self, game_data: Dict[str, Any]) -> List[Button]:
        prompt = game_data.get("prompt")
        if prompt and "action_buttons" in game_data:
            return game_data.get("action_buttons", [])
        return []