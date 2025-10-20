import uuid
from datetime import datetime, timezone
from typing import Dict, List
from .models import User, Room, LobbyState
from .connection_manager import ConnectionManager
# Import the fake DB to store game results
from .routers import fake_games_db, fake_users_db
from .models import GameRecord
class RoomManager:
    """Manages game rooms and the lobby."""
    def __init__(self):
        self.rooms: Dict[str, Room] = {}
        self.lobby_users: Dict[str, User] = {}

    def get_lobby_state(self) -> dict:
        """Constructs the current lobby state."""
        return LobbyState(
            users=[user.model_dump() for user in self.lobby_users.values()],
            # Only show rooms that are in the 'lobby' state
            rooms=[room.model_dump() for room in self.rooms.values() if room.status == 'lobby']
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

        # Add the user back to the lobby and broadcast the updated state to everyone.
        # The add_user_to_lobby method handles sending the correct state to both
        # the user who just joined the lobby and all other lobby members.
        await self.add_user_to_lobby(user, manager)
    
    async def start_game(self, user: User, manager: ConnectionManager):
        """Starts the game in a room if the user is the host and conditions are met."""
        room_id, room = self.find_room_by_user(user.id)
        if not room:
            return

        # Check if the user is the host and if there are enough players
        if room.host_id == user.id and len(room.players) >= 2 and room.status == "lobby":
            # --- START MODIFICATION: Create GameRecord on game start ---
            print(f"Host {user.username} is starting the game in room {room_id}.")
            
            # Create and store a persistent game record immediately
            game_record_id = str(uuid.uuid4())[:8]
            record = GameRecord(id=game_record_id, room_name=room.name, players=room.players[:], winner=None, ended_at=None, status="in_progress")
            fake_games_db[game_record_id] = record
            room.game_record_id = game_record_id # Associate record with the room

            # Associate the game record with each player
            for p in room.players:
                if p.id in fake_users_db:
                    fake_users_db[p.id].game_ids.append(game_record_id)
            # --- END MODIFICATION ---

            # Transition the room to the 'in_game' state
            room.status = "in_game"
            await self.broadcast_room_state(room_id, manager)
            await self.broadcast_lobby_state(manager)

    async def handle_surrender(self, user: User, manager: ConnectionManager):
        """Handles a player surrendering from an active game."""
        room_id, room = self.find_room_by_user(user.id, include_spectators=False)
        if not room or room.status != "in_game":
            return

        # --- Handle surrender without ending game for others ---

        # Move the surrendering player to spectators and immediately send them to post-game
        surrendering_player = next((p for p in room.players if p.id == user.id), None)
        if not surrendering_player:
            return

        active_players = [p for p in room.players if p.id != user.id]
        room.players = active_players
        room.spectators.append(surrendering_player)

        print(f"User {user.username} surrendered from room {room_id}.")

        # Send the surrendering player to the post-game screen
        await manager.send_to_user(user.id, {"type": "game_over", "payload": {"game_record_id": room.game_record_id}})

        # Check if the game should end
        if len(active_players) <= 1:
            winner = active_players[0] if active_players else None
            winner_name = winner.username if winner else "No one"
            print(f"Game in room {room_id} ended. Winner: {winner_name}")
            
            # Update the existing game record
            if room.game_record_id in fake_games_db:
                record = fake_games_db[room.game_record_id]
                record.winner = winner
                record.ended_at = datetime.now(timezone.utc)
                record.status = "completed"

            # Notify all remaining players and spectators of the game over event
            all_involved_ids = [p.id for p in active_players] + [s.id for s in room.spectators]
            await manager.broadcast_to_users(all_involved_ids, {"type": "game_over", "payload": {"game_record_id": room.game_record_id}})
            
            # The game is over, dismantle the room
            del self.rooms[room_id]
            await self.broadcast_lobby_state(manager) # Update lobby since room is gone
        else:
             # If game is not over, just update the room state for remaining players
            await self.broadcast_room_state(room_id, manager)
        
    async def return_to_lobby(self, user: User, manager: ConnectionManager):
        """
        Handles a user's request to return to the lobby.
        If the user is in any room (pre-game or in-game), it resends their current room state.
        If the user is not in a room, it adds them to the main lobby.
        """
        room_id, room = self.find_room_by_user(user.id, include_spectators=True)
        if room:
            # User is in a room, send them back to it (pre-game or in-game)
            await self.broadcast_room_state(room_id, manager)
        else:
            # User is not in any room, send them to the main lobby.
            await self.add_user_to_lobby(user, manager)

    async def handle_disconnect(self, user_id: str, manager: ConnectionManager):
        """Handles a user disconnecting from anywhere."""
        # Find the room the user is in, and the user object itself.
        room_id, room = self.find_room_by_user(user_id, include_spectators=True)
        user_in_room = None
        if room:
            user_in_room = next((p for p in room.players if p.id == user_id), None)
            if not user_in_room:
                 user_in_room = next((p for p in room.spectators if p.id == user_id), None)

        user_in_lobby = self.lobby_users.get(user_id)
        user = user_in_room or user_in_lobby

        if not user:
            print(f"Disconnected user {user_id} not found in any active session.")
            return

        if room and room.status == "in_game":
            # If a user disconnects from an active game, treat it as a surrender.
            print(f"User {user.username} disconnected from an active game. Treating as surrender.")
            await self.handle_surrender(user, manager)
        elif room and room.status == "lobby":
            # If user was in a pre-game lobby, handle their departure normally.
            await self.leave_room(user, manager)
        elif user_in_lobby:
            # If user was just in the main lobby.
            del self.lobby_users[user_id]
            await self.broadcast_lobby_state(manager)

    async def broadcast_room_state(self, room_id: str, manager: ConnectionManager):
        """Broadcasts the state of a specific room to all its members."""
        if room_id in self.rooms:
            room = self.rooms[room_id]
            room_state_msg = {"type": "room_state", "payload": room.model_dump()}
            all_user_ids = [p.id for p in room.players] + [s.id for s in room.spectators]
            await manager.broadcast_to_users(all_user_ids, room_state_msg)

    def find_room_by_user(self, user_id: str, include_spectators: bool = False):
        """Finds the room a user is currently in."""
        for room_id, room in self.rooms.items():
            for player in room.players:
                if player.id == user_id:
                    return room_id, room
            if include_spectators:
                for spectator in room.spectators:
                    if spectator.id == user_id:
                        return room_id, room
        return None, None
