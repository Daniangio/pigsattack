"""
Core game engine package for Wild Pigs Will Attack.

This package is intentionally decoupled from FastAPI/backend concerns so it can
be imported by any host (server, CLI, tests). The backend should only manage
transport/session/lobby concerns and call into this package for game logic.
"""

from .models import (
    GamePhase,
    PlayerStatus,
    ResourceType,
    Stance,
    TokenType,
    GameState,
    PlayerBoard,
)
from .session import GameSession
from .data_loader import GameDataLoader
from .threats import ThreatManager, ThreatDeckData, ThreatInstance

__all__ = [
    "GamePhase",
    "PlayerStatus",
    "ResourceType",
    "Stance",
    "TokenType",
    "GameState",
    "PlayerBoard",
    "GameSession",
    "GameDataLoader",
    "ThreatManager",
    "ThreatDeckData",
    "ThreatInstance",
]
