from __future__ import annotations
import pygame
from typing import TYPE_CHECKING, Any, Dict, List

from .base import GameCanvas
from ..ui import get_card_rects, CardSprite

if TYPE_CHECKING:
    from ..client import Client


class HandCanvas(GameCanvas):
    def __init__(self, rect: pygame.Rect, client: Client, visible: bool = True):
        super().__init__(rect, client, visible)
        self.card_sprites = pygame.sprite.Group()

    def _draw_content(self, game_data: Dict[str, Any]):
        super()._draw_content(game_data)
        my_hand = self._get_my_hand(game_data)
        selected_cards = game_data.get("selected_cards", [])

        if len(self.card_sprites) != len(my_hand) or any(cs.card_data['id'] != h['id'] for cs, h in zip(self.card_sprites, my_hand)):
            self.card_sprites.empty()
            card_rects = get_card_rects(len(my_hand), self.rect.width)
            for i, card_data in enumerate(my_hand):
                sprite = CardSprite(card_data, card_rects[i], self.client.fonts)
                self.card_sprites.add(sprite)

        for sprite in self.card_sprites:
            sprite.update(is_selected=(sprite.card_data['id'] in selected_cards))
        self.card_sprites.draw(self.surface)

    def _get_my_hand(self, game_data: Dict[str, Any]) -> List[Dict[str, Any]]:
        my_id = game_data.get("player_id", -1)
        players = game_data.get("players", [])
        if 0 <= my_id < len(players):
            return players[my_id].get("hand", [])
        return []