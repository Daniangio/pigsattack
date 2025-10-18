import uuid
from typing import Dict, List
from .models import User, Room, LobbyState
from .connection_manager import ConnectionManager

class RoomManager:
    """Manages game rooms and the lobby."""
    def __init__(self):
        self.rooms: Dict[str, Room] = {}
        self.lobby_users: Dict[str, User] = {}

    def get_lobby_state(self) -> dict:
        """Constructs the current lobby state."""
        return LobbyState(
            users=[user.model_dump() for user in self.lobby_users.values()],
            rooms=[room.model_dump() for room in self.rooms.values()]
        ).model_dump()

    async def broadcast_lobby_state(self, manager: ConnectionManager):
        """Broadcasts the lobby state to all users in the lobby."""
        lobby_state_msg = {"type": "lobby_state", "payload": self.get_lobby_state()}
        await manager.broadcast_to_users(list(self.lobby_users.keys()), lobby_state_msg)

    async def add_user_to_lobby(self, user: User, manager: ConnectionManager):
        """Adds a user to the lobby and notifies everyone."""
        self.lobby_users[user.id] = user
        # Send the current lobby state to the new user
        await manager.send_to_user(user.id, {"type": "lobby_state", "payload": self.get_lobby_state()})
        # Broadcast the updated state to others
        await self.broadcast_lobby_state(manager)
        print(f"User {user.username} entered lobby.")

    async def create_room(self, host: User, room_name: str, manager: ConnectionManager):
        """Creates a new room, moves the host into it."""
        if host.id not in self.lobby_users:
            return
        
        room_id = str(uuid.uuid4())[:8]
        new_room = Room(id=room_id, name=room_name or f"{host.username}'s Room", host_id=host.id)
        new_room.players.append(host)
        
        self.rooms[room_id] = new_room
        del self.lobby_users[host.id]

        print(f"Room {room_id} created by {host.username}.")
        
        # Notify the host they are in the room
        await manager.send_to_user(host.id, {"type": "room_state", "payload": new_room.model_dump()})
        # Update everyone in the lobby
        await self.broadcast_lobby_state(manager)

    async def join_room(self, user: User, room_id: str, manager: ConnectionManager):
        """Allows a user from the lobby to join an existing room."""
        if user.id not in self.lobby_users or room_id not in self.rooms:
            return

        room = self.rooms[room_id]
        # You might want to add a max players check here
        room.players.append(user)
        del self.lobby_users[user.id]

        print(f"User {user.username} joined room {room_id}.")

        # Notify the new user they are in the room
        await manager.send_to_user(user.id, {"type": "room_state", "payload": room.model_dump()})
        # Notify all other players in the room of the new arrival
        await self.broadcast_room_state(room_id, manager)
        # Update everyone in the lobby
        await self.broadcast_lobby_state(manager)

    async def leave_room(self, user: User, manager: ConnectionManager):
        """Removes a user from their current room."""
        room_id, room = self.find_room_by_user(user.id)
        if not room:
            return
        
        room.players = [p for p in room.players if p.id != user.id]
        print(f"User {user.username} left room {room_id}.")

        if not room.players:
            # If the room is empty, dismantle it
            del self.rooms[room_id]
            print(f"Room {room_id} dismantled.")
        else:
            # If the host left, transfer host role
            if room.host_id == user.id:
                room.host_id = room.players[0].id
                print(f"Host transferred to {room.players[0].username} in room {room_id}.")
            # Notify remaining players of the change
            await self.broadcast_room_state(room_id, manager)

        # Move the user back to the lobby
        await self.add_user_to_lobby(user, manager)
    
    async def handle_disconnect(self, user_id: str, manager: ConnectionManager):
        """Handles a user disconnecting from anywhere."""
        # Find the user object if they are in a room or lobby
        user_in_room = next((p for room in self.rooms.values() for p in room.players if p.id == user_id), None)
        user_in_lobby = self.lobby_users.get(user_id)
        user = user_in_room or user_in_lobby

        # If user was in a room, handle their departure
        if user_in_room and user:
            await self.leave_room(user, manager)
        elif user_in_lobby:
            del self.lobby_users[user_id]
            await self.broadcast_lobby_state(manager)

    async def broadcast_room_state(self, room_id: str, manager: ConnectionManager):
        """Broadcasts the state of a specific room to all its members."""
        if room_id in self.rooms:
            room = self.rooms[room_id]
            room_state_msg = {"type": "room_state", "payload": room.model_dump()}
            player_ids = [p.id for p in room.players]
            await manager.broadcast_to_users(player_ids, room_state_msg)

    def find_room_by_user(self, user_id: str):
        """Finds the room a user is currently in."""
        for room_id, room in self.rooms.items():
            for player in room.players:
                if player.id == user_id:
                    return room_id, room
        return None, None