from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime
from .models import User, GameParticipant

class UserPublic(BaseModel):
    """A schema for user information that is safe to be exposed to clients."""
    id: str
    username: str

class GameHistoryEntry(BaseModel):
    """Represents a single game in a player's history."""
    game_record_id: str
    room_name: str
    started_at: datetime
    ended_at: Optional[datetime] = None
    is_win: bool

    class Config:
        json_encoders = {
            datetime: lambda v: v.strftime('%Y-%m-%d %H:%M:%S')
        }

class PlayerProfile(BaseModel):
    """The complete profile for a player, including game history."""
    user: UserPublic
    games_played: int
    wins: int
    game_history: List[GameHistoryEntry]

class GameRecordDetails(BaseModel):
    """Represents the detailed record of a finished or in-progress game."""
    id: str
    room_name: str
    # The API will now return the list of participants with their statuses
    participants: List[GameParticipant]
    winner: Optional[User] = None
    started_at: datetime
    ended_at: Optional[datetime] = None
    status: str # e.g., 'in_progress', 'completed'

    class Config:
        json_encoders = {
            datetime: lambda v: v.strftime('%Y-%m-%d %H:%M:%S')
        }