from __future__ import annotations
import pygame
from typing import TYPE_CHECKING, Any, Dict

from .base import GameCanvas
from ..ui import draw_text, CardSprite, CARD_WIDTH, CARD_HEIGHT

if TYPE_CHECKING:
    from ..client import Client


class PlaymatCanvas(GameCanvas):
    def _draw_content(self, game_data: Dict[str, Any]):
        super()._draw_content(game_data)
        my_id = game_data.get("player_id", -1)
        players = game_data.get("players", [])

        # --- Player Info ---
        draw_text(self.surface, f"You are Player {my_id + 1}", (20, 20), self.client.fonts['m'])
        for i, p in enumerate(players):
            status = "ELIMINATED" if p["is_eliminated"] else f"{len(p['hand'])} cards"
            barricade = " | BARRICADE" if p["has_barricade"] else ""
            turn_marker = "<- TURN" if i == game_data.get("current_player_index") else ""
            draw_text(self.surface, f"{p['name']}: {status}{barricade} {turn_marker}", (20, 60 + i * 40), self.client.fonts['m'])

        # --- Deck and Event Card ---
        y_pos = 80 # New Y position, moved down by 20
        deck_rect = pygame.Rect(self.rect.width - CARD_WIDTH - 20, y_pos, CARD_WIDTH, CARD_HEIGHT)
        event_card_rect = pygame.Rect(deck_rect.left - CARD_WIDTH - 20, y_pos, CARD_WIDTH, CARD_HEIGHT)

        # Draw Deck
        pygame.draw.rect(self.surface, (20, 30, 25), deck_rect, border_radius=8)
        draw_text(self.surface, "DECK", deck_rect.center, self.client.fonts['m'], center=True)
        draw_text(self.surface, f"{game_data.get('deck_size', 0)}", (deck_rect.centerx, deck_rect.bottom + 15), self.client.fonts['s'], center=True)

        # Draw Active Event Card if it exists
        if event_card_data := game_data.get("event_card"):
            event_card_sprite = CardSprite(event_card_data, event_card_rect, self.client.fonts)
            event_card_sprite.draw() # Ensure it's drawn on its surface
            self.surface.blit(event_card_sprite.image, event_card_sprite.rect)
            draw_text(self.surface, "EVENT", (event_card_rect.centerx, event_card_rect.bottom + 15), self.client.fonts['s'], center=True)