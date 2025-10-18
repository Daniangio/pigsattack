from pydantic import BaseModel
from typing import List, Optional

# API Models for incoming data and responses
class UserCreate(BaseModel):
    username: str
    password: str

class UserPublic(BaseModel):
    id: str
    username: str

class Token(BaseModel):
    access_token: str
    token_type: str

class TokenData(BaseModel):
    username: Optional[str] = None

# Internal model for storing user data, including sensitive info
class UserInDB(BaseModel):
    username: str
    hashed_password: str

# Application State Models used for WebSocket communication
class User(BaseModel):
    id: str
    username: str

class Room(BaseModel):
    id: str
    name: str
    host_id: str
    players: List[User] = []

class LobbyState(BaseModel):
    users: List[User]
    rooms: List[Room]
