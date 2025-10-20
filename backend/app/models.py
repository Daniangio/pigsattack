from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime

class User(BaseModel):
    id: str
    username: str
    game_ids: List[str] = Field(default_factory=list)
    hashed_password: Optional[str] = None

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
    id: str
    room_name: str
    players: List[User]
    winner: Optional[User] = None
    ended_at: Optional[datetime] = None
    status: str = "in_progress" # 'in_progress', 'completed'

class UserCreate(BaseModel):
    username: str
    password: str
