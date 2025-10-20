import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional
from .models import User, Room, LobbyState, GameRecord, GameParticipant, PlayerStatus
from .connection_manager import ConnectionManager
# Import the fake DB to store game results
from .routers import fake_games_db, fake_users_db

class RoomManager:
    """Manages game rooms, lobby, and the lifecycle of games."""
    def __init__(self):
        self.rooms: Dict[str, Room] = {}
        self.lobby_users: Dict[str, User] = {}

    def get_lobby_state(self) -> dict:
        """Constructs the current lobby state."""
        return LobbyState(
            users=[user.model_dump() for user in self.lobby_users.values()],
            rooms=[room.model_dump() for room in self.rooms.values() if room.status == 'lobby']
        ).model_dump()

    async def broadcast_lobby_state(self, manager: ConnectionManager):
        """Broadcasts the lobby state to all users in the lobby."""
        state_update_msg = {
            "type": "state_update",
            "payload": {"view": "lobby", "lobbyState": self.get_lobby_state()}
        }
        await manager.broadcast_to_users(list(self.lobby_users.keys()), state_update_msg)

    async def add_user_to_lobby(self, user: User, manager: ConnectionManager):
        """Adds a user to the lobby and notifies everyone."""
        self.remove_user_from_any_room(user.id)
        
        self.lobby_users[user.id] = user
        print(f"User {user.username} ({user.id}) entered lobby.")
        await self.broadcast_lobby_state(manager)

    def remove_user_from_any_room(self, user_id: str):
        """Helper to find and remove a user from any room."""
        room_id, room = self.find_room_by_user(user_id, include_spectators=True)
        if room:
            room.players = [p for p in room.players if p.id != user_id]
            room.spectators = [s for s in room.spectators if s.id != user_id]
            if not room.players and room.status != 'in_game':
                print(f"Room {room_id} is empty and dismantled.")
                del self.rooms[room_id]

    async def create_room(self, host: User, room_name: str, manager: ConnectionManager):
        """Creates a new room, moves the host into it."""
        if host.id not in self.lobby_users:
            print(f"Error: User {host.username} not in lobby, cannot create room.")
            return
        
        room_id = str(uuid.uuid4())[:8]
        new_room = Room(id=room_id, name=room_name or f"{host.username}'s Room", host_id=host.id)
        new_room.players.append(host)
        
        self.rooms[room_id] = new_room
        del self.lobby_users[host.id]

        print(f"Room {room_id} created by {host.username}.")
        await self.broadcast_room_state(room_id, manager)
        await self.broadcast_lobby_state(manager)

    async def join_room(self, user: User, room_id: str, manager: ConnectionManager):
        """Allows a user from the lobby to join an existing room."""
        if user.id not in self.lobby_users or room_id not in self.rooms:
            return

        room = self.rooms[room_id]
        if len(room.players) >= 4: # Example max players
            # Optionally send an error message to the user
            return

        room.players.append(user)
        del self.lobby_users[user.id]

        print(f"User {user.username} joined room {room_id}.")
        await self.broadcast_room_state(room_id, manager)
        await self.broadcast_lobby_state(manager)

    async def leave_room_pre_game(self, user: User, manager: ConnectionManager):
        """Handles a user leaving a room before the game starts."""
        room_id, room = self.find_room_by_user(user.id)
        if not room or room.status != 'lobby':
            return
        
        room.players = [p for p in room.players if p.id != user.id]
        print(f"User {user.username} left pre-game room {room_id}.")

        if not room.players:
            del self.rooms[room_id]
            print(f"Room {room_id} dismantled.")
        else:
            if room.host_id == user.id:
                room.host_id = room.players[0].id
                print(f"Host transferred to {room.players[0].username} in room {room_id}.")
            await self.broadcast_room_state(room_id, manager)

        await self.add_user_to_lobby(user, manager)


    async def start_game(self, user: User, manager: ConnectionManager):
        """Starts the game, creating a persistent GameRecord."""
        room_id, room = self.find_room_by_user(user.id)
        if not room or room.host_id != user.id or len(room.players) < 2 or room.status != "lobby":
            return

        print(f"Host {user.username} is starting the game in room {room_id}.")
        
        game_record_id = str(uuid.uuid4())[:8]
        # REFACTOR: Create a list of GameParticipants with 'ACTIVE' status
        participants = [GameParticipant(user=p, status=PlayerStatus.ACTIVE) for p in room.players]
        record = GameRecord(id=game_record_id, room_name=room.name, participants=participants, status="in_progress")
        fake_games_db[game_record_id] = record
        
        room.game_record_id = game_record_id
        for p in room.players:
            if p.id in fake_users_db:
                fake_users_db[p.id].game_ids.append(game_record_id)

        room.status = "in_game"
        # The room's 'players' list is now just for broadcasting, the GameRecord is the truth
        await self.broadcast_room_state(room_id, manager)
        await self.broadcast_lobby_state(manager)


    async def handle_surrender(self, user: User, manager: ConnectionManager):
        """Handles a player surrendering. Their state is updated, but the game continues."""
        room_id, room = self.find_room_by_user(user.id, include_spectators=False)
        if not room or room.status != "in_game" or not room.game_record_id:
            return

        record = fake_games_db.get(room.game_record_id)
        if not record: return
        
        # REFACTOR: Update the player's status in the persistent GameRecord
        participant = next((p for p in record.participants if p.user.id == user.id), None)
        if participant and participant.status == PlayerStatus.ACTIVE:
            participant.status = PlayerStatus.SURRENDERED
            print(f"User {user.username} surrendered in game {record.id}. Status set to SURRENDERED.")
        else:
            return # Player was not active, so they cannot surrender.

        # Now, check if the game should end
        active_participants = [p for p in record.participants if p.status == PlayerStatus.ACTIVE]

        if len(active_participants) <= 1:
            await self.end_game(room, record, manager, winner=active_participants[0].user if active_participants else None)
        else:
            # Game continues, broadcast the updated state.
            # Let everyone know the player surrendered.
            await self.broadcast_room_state(room_id, manager)
            # Send a special confirmation to the surrendered player so they see the option to leave.
            # This doesn't change their view, just updates their state.
            surrendered_player_state = {
                "type": "state_update",
                "payload": {"view": "game", "roomState": self.get_room_dump(room)}
            }
            await manager.send_to_user(user.id, surrendered_player_state)


    async def end_game(self, room: Room, record: GameRecord, manager: ConnectionManager, winner: Optional[User]):
        """Centralized logic to end a game, update records, and notify players."""
        winner_name = winner.username if winner else "No one"
        print(f"Game {record.id} in room {room.id} ended. Winner: {winner_name}")
        
        record.winner = winner
        record.ended_at = datetime.now(timezone.utc)
        record.status = "completed"

        all_involved_ids = [p.user.id for p in record.participants] + [s.id for s in room.spectators]
        
        # The backend is now authoritative. It tells the frontend to go to the post_game view.
        await manager.broadcast_to_users(
            all_involved_ids, 
            {"type": "state_update", "payload": {
                "view": "post_game", "gameResult": record.model_dump(mode="json"), "force": True
            }}
        )
        
        # The game is over, dismantle the in-memory room object
        if room.id in self.rooms:
            del self.rooms[room.id]
        
        # Update the lobby since a game room has been removed
        await self.broadcast_lobby_state(manager)


    async def handle_user_state_request(self, user: User, manager: ConnectionManager):
        """On connection/reconnection, determine and send the correct state to the user."""
        # Is the user part of an active game?
        room_id, room = self.find_room_by_user(user.id, include_spectators=True)
        if room:
            # If they are in a room (pre-game or in-game), send them the current room state.
            # The frontend will use this to route them to the correct page.
            print(f"User {user.username} is in room {room.id}. Sending authoritative state.")
            
            if room.game_record_id and room.status == 'in_game':
                record = fake_games_db.get(room.game_record_id)
                if record:
                    participant = next((p for p in record.participants if p.user.id == user.id), None)
                    if participant and participant.status == PlayerStatus.DISCONNECTED:
                        participant.status = PlayerStatus.ACTIVE
                        print(f"User {user.username} reconnected. Status set back to ACTIVE.")
            
            await self.broadcast_room_state(room_id, manager) # This will now send the correct view
            return

        # Is the user associated with a completed game they haven't "left" yet?
        # (This logic can be added if you want to force users to view post-game stats)

        # If none of the above, they belong in the lobby.
        print(f"User {user.username} is not in a room. Adding to lobby.")
        await self.add_user_to_lobby(user, manager)


    async def handle_disconnect(self, user_id: str, manager: ConnectionManager):
        """Handles a user disconnecting from anywhere."""
        print(f"Handling disconnection for user_id: {user_id}")
        room_id, room = self.find_room_by_user(user_id, include_spectators=True)
        
        if room and room.status == "in_game" and room.game_record_id:
            # REFACTOR: Don't treat as surrender. Just mark as disconnected.
            record = fake_games_db.get(room.game_record_id)
            if not record: return
            
            participant = next((p for p in record.participants if p.user.id == user_id), None)
            user_obj = participant.user if participant else None

            if participant and participant.status == PlayerStatus.ACTIVE:
                participant.status = PlayerStatus.DISCONNECTED
                print(f"User {user_obj.username} disconnected from active game. Status set to DISCONNECTED.")
                
                # Check if the game should end now
                active_participants = [p for p in record.participants if p.status == PlayerStatus.ACTIVE]
                if len(active_participants) <= 1:
                    await self.end_game(room, record, manager, winner=active_participants[0].user if active_participants else None)
                else:
                    await self.broadcast_room_state(room_id, manager) # Notify others of the disconnection
            
        elif room: # Disconnected from a pre-game room
            user_in_room = next((p for p in room.players if p.id == user_id), None)
            if user_in_room:
                await self.leave_room_pre_game(user_in_room, manager)
        
        elif user_id in self.lobby_users:
            # Disconnected from the main lobby
            del self.lobby_users[user_id]
            await self.broadcast_lobby_state(manager)
            
    async def return_to_lobby(self, user: User, manager: ConnectionManager):
        """ Acknowledges the user has seen the post-game and is ready to return to the lobby."""
        # This function essentially frees the user from their 'game context'.
        # The game record remains, but the user is no longer associated in a way that
        # forces them back into the game/post-game screen on reconnect.
        # Here, we just send them to the lobby.
        print(f"User {user.username} has left the post-game screen and is returning to the lobby.")
        await self.add_user_to_lobby(user, manager)

    async def handle_view_request(self, user: User, payload: dict, manager: ConnectionManager):
        """
        Handles a client's request to change their view. This is the authoritative gatekeeper.
        
        The core rule: If a player is in an active game, they are ALWAYS forced back to the game view.
        Otherwise, the user's request is granted.
        """
        requested_view = payload.get("view")
        if not requested_view:
            return

        # THE ONE RULE: Is the player in an active, non-surrendered game?
        room_id, room = self.find_room_by_user(user.id, include_spectators=False)
        if room and room.status == "in_game":
            record = fake_games_db.get(room.game_record_id)
            if record:
                participant = next((p for p in record.participants if p.user.id == user.id), None)
                if participant and participant.status == PlayerStatus.ACTIVE:
                    print(f"FORCE: User {user.username} is in an active game. Denying '{requested_view}' request and forcing 'game' view.")
                    # Send the full, authoritative game state back to the user.
                    await self.broadcast_room_state(room.id, manager, force_view=True)
                    return

        # NEW RULE: If user is in a pre-game room and requests the lobby (e.g. from profile page),
        # send them back to their room instead of kicking them out.
        if room and room.status == "lobby" and requested_view == "lobby":
            print(f"DENY: User {user.username} is in a pre-game room. Denying 'lobby' request and sending 'room' view.")
            await self.broadcast_room_state(room.id, manager)
            return

        # If the rule above doesn't apply, the user is free to navigate.
        print(f"GRANT: Granting {user.username}'s request for '{requested_view}' view.")
        if requested_view == "lobby":
            # This will now only be reached if the user is NOT in a pre-game room.
            await self.add_user_to_lobby(user, manager)
        elif requested_view == "profile":
            # Just grant the view change without any other state.
            await manager.send_to_user(user.id, {"type": "state_update", "payload": {"view": "profile"}})
        else:
            # This can be expanded for other views if needed.
            print(f"Warning: Unhandled view request for '{requested_view}'")

    def get_room_dump(self, room: Room) -> dict:
        """Helper to get the dictionary representation of a room, enriched with game details."""
        room_dump = room.model_dump()
        if room.status == "in_game" and room.game_record_id in fake_games_db:
            record = fake_games_db[room.game_record_id]
            room_dump['game_details'] = record.model_dump()
        return room_dump

    async def broadcast_room_state(self, room_id: str, manager: ConnectionManager, force_view: bool = False):
        """Broadcasts the detailed state of a specific room to all its members."""
        if room_id not in self.rooms:
            return
            
        room = self.rooms[room_id]
        room_dump = self.get_room_dump(room)

        # The backend authoritatively determines the view based on room status.
        view = "game" if room.status == "in_game" else "room"
        
        # A game start is always a forced view change.
        should_force = force_view or (view == "game")

        state_update_msg = {
            "type": "state_update",
            "payload": {"view": view, "roomState": room_dump, "force": should_force}
        }
        all_user_ids = [p.id for p in room.players] + [s.id for s in room.spectators]
        await manager.broadcast_to_users(all_user_ids, state_update_msg)

    def find_room_by_user(self, user_id: str, include_spectators: bool = False):
        """Finds the room a user is currently in."""
        for room_id, room in self.rooms.items():
            if any(player.id == user_id for player in room.players):
                return room_id, room
            if include_spectators and any(spectator.id == user_id for spectator in room.spectators):
                return room_id, room
        return None, None
