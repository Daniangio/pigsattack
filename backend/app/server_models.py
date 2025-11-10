from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime
from enum import Enum

# --- START NEW ADDITIONS ---
class PlayerStatus(str, Enum):
    """Enumeration for a player's status within a game."""
    ACTIVE = "ACTIVE"
    SURRENDERED = "SURRENDERED"
    DISCONNECTED = "DISCONNECTED"

class User(BaseModel):
    id: str
    username: str
    game_ids: List[str] = Field(default_factory=list)
    hashed_password: Optional[str] = None

class GameParticipant(BaseModel):
    """Represents a player's state within a specific game."""
    user: User
    status: PlayerStatus = PlayerStatus.ACTIVE

class Token(BaseModel):
    access_token: str
    token_type: str

class Room(BaseModel):
    id: str
    name: str
    host_id: str
    players: List[User] = Field(default_factory=list)
    spectators: List[User] = Field(default_factory=list)
    status: str = "lobby"  # 'lobby', 'in_game'
    game_record_id: Optional[str] = None

class LobbyState(BaseModel):
    users: List[dict]
    rooms: List[dict]

class GameRecord(BaseModel):
    """Represents the persistent state of a single game instance."""
    id: str
    room_name: str
    # This now stores a list of participants with their statuses, not just users.
    participants: List[GameParticipant]
    winner: Optional[User] = None
    started_at: datetime
    ended_at: Optional[datetime] = None
    status: str = "in_progress" # 'in_progress', 'completed'

    class Config:
        json_encoders = {
            datetime: lambda v: v.strftime('%Y-%m-%d %H:%M:%S')
        }

class UserCreate(BaseModel):
    username: str
    password: str
