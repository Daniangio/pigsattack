from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime

class User(BaseModel):
    id: str
    username: str

class UserInDB(User):
    hashed_password: str

class UserPublic(User):
    pass

class UserCreate(BaseModel):
    username: str
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str

class Room(BaseModel):
    id: str
    name: str
    host_id: str
    players: List[User] = Field(default_factory=list)
    status: str = "lobby"  # "lobby" or "in_game"

    def model_dump(self, *args, **kwargs):
        # Ensure players are serialized correctly
        dump = super().model_dump(*args, **kwargs)
        dump['players'] = [player.model_dump() for player in self.players]
        return dump

class LobbyState(BaseModel):
    users: List[dict]
    rooms: List[dict]

class GameRecord(BaseModel):
    id: str
    room_name: str
    players: List[User]
    winner: Optional[User] = None
    ended_at: datetime