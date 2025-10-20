from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
from .models import User # Now imports the unified User model

class UserPublic(BaseModel):
    """A schema for user information that is safe to be exposed to clients."""
    id: str
    username: str

class GameHistoryEntry(BaseModel):
    """Represents a single game in a player's history."""
    game_record_id: str
    room_name: str
    ended_at: Optional[datetime] = None
    is_win: bool

class PlayerProfile(BaseModel):
    """The complete profile for a player, including game history."""
    user: UserPublic
    games_played: int
    wins: int
    game_history: List[GameHistoryEntry]

class GameRecordDetails(BaseModel):
    """Represents the detailed record of a finished game."""
    id: str
    room_name: str
    players: List[User]
    winner: Optional[User] = None
    ended_at: Optional[datetime] = None
    status: str # e.g., 'in_progress', 'completed'