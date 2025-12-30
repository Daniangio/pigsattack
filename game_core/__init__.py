"""
Core game engine package for Wild Pigs Will Attack.

This package is intentionally decoupled from FastAPI/backend concerns so it can
be imported by any host (server, CLI, tests). The backend should only manage
transport/session/lobby concerns and call into this package for game logic.
"""

from .models import (
    BossCard,
    BossThreshold,
    CardType,
    GamePhase,
    GameState,
    MarketCard,
    PlayerStatus,
    Reward,
    ResourceType,
    Stance,
    TokenType,
    PlayerBoard,
    clamp_cost,
    resource_to_wire,
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
    "BossCard",
    "BossThreshold",
    "CardType",
    "MarketCard",
    "Reward",
    "clamp_cost",
    "resource_to_wire",
    "GameSession",
    "GameDataLoader",
    "ThreatManager",
    "ThreatDeckData",
    "ThreatInstance",
]
