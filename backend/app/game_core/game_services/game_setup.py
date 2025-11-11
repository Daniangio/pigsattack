"""
Handles the creation and initialization of a new game instance.
FIXED: Removed all scrap pool logic. This is stateful and belongs
to the PhaseManager. This service is now only responsible for
creating the initial GameState, Players, and Decks.
"""
import random
from typing import List
from ..game_models import GameState, PlayerState, GamePhase, ScrapType
from ..deck_factory import (
    create_threat_deck, create_upgrade_deck, create_arsenal_deck,
    create_initial_lure_cards, create_initial_action_cards
)
from ...server_models import GameParticipant

class GameSetupService:
    """A factory/builder for creating a fully initialized GameState."""

    @staticmethod
    def create_game(game_id: str, participants: List[GameParticipant]) -> GameState:
        """
        Creates, initializes, and returns a new GameState.
        Does NOT draw initial scrap or fill the market.
        """
        state = GameState(game_id=game_id)
        player_count = len(participants)

        # 1. Initialize Decks
        state.threat_deck = create_threat_deck(player_count)
        state.market.upgrade_deck = create_upgrade_deck()
        state.market.arsenal_deck = create_arsenal_deck()

        # 2. Initialize Players (without scrap)
        for p in participants:
            new_player = PlayerState(
                user_id=p.user.id,
                username=p.user.username,
                lure_cards=create_initial_lure_cards(),
                action_cards=create_initial_action_cards()
            )
            state.players[new_player.user_id] = new_player

        # 3. Set Initiative & Market
        state.initiative_queue = [p.user.id for p in participants]
        for i, player_id in enumerate(state.initiative_queue):
            state.players[player_id].initiative = i + 1
            
        state.market.faceup_limit = max(2, min(player_count - 1, 4))

        state.add_log("Game state created.")
        state.phase = GamePhase.PLANNING
        
        return state