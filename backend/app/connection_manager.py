from fastapi import WebSocket
from typing import Dict, List

class ConnectionManager:
    """Manages active WebSocket connections."""
    def __init__(self):
        # Maps user_id to their active WebSocket connection
        self.active_connections: Dict[str, WebSocket] = {}

    async def add_connection(self, user_id: str, websocket: WebSocket):
        """Adds an already accepted WebSocket connection to the manager."""
        self.active_connections[user_id] = websocket
        print(f"User connected: {user_id}. Total connections: {len(self.active_connections)}")

    def disconnect(self, user_id: str):
        """Removes a WebSocket connection."""
        if user_id in self.active_connections:
            del self.active_connections[user_id]
            print(f"User disconnected: {user_id}. Total connections: {len(self.active_connections)}")

    async def send_to_user(self, user_id: str, message: dict):
        """Sends a JSON message to a specific user."""
        if user_id in self.active_connections:
            await self.active_connections[user_id].send_json(message)

    async def broadcast_to_users(self, user_ids: List[str], message: dict):
        """Sends a JSON message to a list of users."""
        for user_id in user_ids:
            await self.send_to_user(user_id, message)
    
    async def broadcast_to_all(self, message: dict):
        """Sends a JSON message to all connected users."""
        for user_id in list(self.active_connections.keys()):
             await self.send_to_user(user_id, message)
