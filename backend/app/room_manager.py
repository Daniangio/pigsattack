import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional
from .models import User, Room, LobbyState, GameRecord, GameParticipant, PlayerStatus
from .connection_manager import ConnectionManager
from .routers import fake_games_db, fake_users_db

# --- NEW GAME CORE IMPORTS ---
# Use TYPE_CHECKING to avoid circular import at runtime
from typing import TYPE_CHECKING
if TYPE_CHECKING:
    from .game_manager import GameManager
# --- END NEW IMPORTS ---

class RoomManager:
    """Manages game rooms, lobby, and the lifecycle of games."""
    def __init__(self):
        self.rooms: Dict[str, Room] = {}
        self.lobby_users: Dict[str, User] = {}
        # This will be injected by main.py
        self.game_manager: Optional['GameManager'] = None

    def set_game_manager(self, game_manager: 'GameManager'):
        """Inject the GameManager instance."""
        self.game_manager = game_manager

    def get_lobby_state(self) -> dict:
        """Constructs the current lobby state."""
        return LobbyState(
            users=[user.model_dump() for user in self.lobby_users.values()],
            rooms=[room.model_dump() for room in self.rooms.values()] # Show all rooms (lobby and in_game)
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
        if len(room.players) >= 5: # Rulebook: 2-5 players
            return

        room.players.append(user)
        del self.lobby_users[user.id]

        print(f"User {user.username} joined room {room_id}.")
        await self.broadcast_room_state(room_id, manager)
        await self.broadcast_lobby_state(manager)

    async def spectate_game(self, user: User, game_record_id: str, manager: ConnectionManager):
        """Allows a user to join an in-progress game as a spectator."""
        if user.id not in self.lobby_users:
            return

        # Find the room by game_record_id
        room = None
        for r in self.rooms.values():
            if r.game_record_id == game_record_id:
                room = r
                break

        if not room or room.status != 'in_game':
            return

        room.spectators.append(user)
        del self.lobby_users[user.id]
        
        print(f"User {user.username} is now spectating game {game_record_id} in room {room.id}.")
        # Send the current game state to the new spectator
        if self.game_manager:
            await self.game_manager.broadcast_game_state(game_record_id, specific_user_id=user.id)
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
        """
        Delegates game creation to the GameManager.
        """
        room_id, room = self.find_room_by_user(user.id)
        if not room or room.host_id != user.id or len(room.players) < 2 or room.status != "lobby":
            return
            
        if not self.game_manager:
            print("Error: GameManager not initialized.")
            return

        print(f"Host {user.username} is starting the game in room {room_id}.")
        
        game_record_id = str(uuid.uuid4())[:8]
        participants = [GameParticipant(user=p, status=PlayerStatus.ACTIVE) for p in room.players]
        record = GameRecord(
            id=game_record_id, 
            room_name=room.name, 
            participants=participants, 
            status="in_progress",
            started_at=datetime.now(timezone.utc)
        )
        fake_games_db[game_record_id] = record
        
        room.game_record_id = game_record_id
        for p in room.players:
            if p.id in fake_users_db:
                fake_users_db[p.id].game_ids.append(game_record_id)

        room.status = "in_game"
        
        # --- DELEGATE TO GAMEMANAGER ---
        # The GameManager will create the GameInstance and send the
        # first "game_state_update" to the players, which replaces
        # the old broadcast_room_state call.
        await self.game_manager.create_game(game_record_id, participants)
        # --- END DELEGATION ---

        await self.broadcast_lobby_state(manager)


    async def handle_surrender(self, user: User, manager: ConnectionManager):
        """
        Delegates a surrender to the GameManager.
        """
        room_id, room = self.find_room_by_user(user.id, include_spectators=False)
        if not room or room.status != "in_game" or not room.game_record_id:
            return
            
        if not self.game_manager:
            print("Error: GameManager not initialized.")
            return

        record = fake_games_db.get(room.game_record_id)
        if not record: return
        
        # Update persistent record
        participant = next((p for p in record.participants if p.user.id == user.id), None)
        if participant and participant.status == PlayerStatus.ACTIVE:
            participant.status = PlayerStatus.SURRENDERED
            print(f"User {user.username} surrendered in game {record.id}. Status set to SURRENDERED.")
        else:
            return

        # --- Move surrendering player to spectators ---
        # This allows them to receive game state updates as a spectator
        # and prevents issues if they try to "spectate" from the post-game screen.
        surrendering_player_obj = next((p for p in room.players if p.id == user.id), None)
        if surrendering_player_obj:
            room.players = [p for p in room.players if p.id != user.id]
            room.spectators.append(surrendering_player_obj)
        # --- DELEGATE TO GAMEMANAGER ---
        # Tell the game instance to update the player's status
        await self.game_manager.handle_player_leave(user, room.game_record_id, PlayerStatus.SURRENDERED)
        # --- END DELEGATION ---



    async def end_game(self, room: Room, record: GameRecord, manager: ConnectionManager, winner: Optional[User]):
        """
        This function is now called by the GameManager when the
        GameInstance enters the GAME_OVER state.
        """
        winner_name = winner.username if winner else "No one"
        print(f"Game {record.id} in room {room.id} ended. Winner: {winner_name}")
        
        record.winner = winner
        record.ended_at = datetime.now(timezone.utc)
        record.status = "completed"

        all_involved_ids = [p.user.id for p in record.participants] + [s.id for s in room.spectators]
        
        if room.id in self.rooms:
            del self.rooms[room.id]
        
        await manager.broadcast_to_users(
            all_involved_ids, 
            {"type": "state_update", "payload": {"view": "post_game", "gameResult": record.model_dump(mode="json"), "force": True}}
        )
        await self.broadcast_lobby_state(manager)


    async def handle_user_state_request(self, user: User, manager: ConnectionManager):
        """On connection/reconnection, send the correct state."""
        # Find the game ID *first*
        game_id = self.find_game_by_user(user.id)
        if game_id and self.game_manager:
            # User is in an active game. GameManager handles state.
            print(f"User {user.username} is in game {game_id}. Deferring to GameManager.")
            await self.game_manager.broadcast_game_state(game_id)
            return

        # User is not in an active game, check for pre-game rooms
        room_id, room = self.find_room_by_user(user.id, include_spectators=True)
        if room:
            print(f"User {user.username} is in pre-game room {room.id}. Sending room state.")
            await self.broadcast_room_state(room_id, manager)
            return

        # If none of the above, they belong in the lobby.
        print(f"User {user.username} is not in a room. Adding to lobby.")
        await self.add_user_to_lobby(user, manager)


    async def handle_disconnect(self, user_id: str, manager: ConnectionManager):
        """Handles a user disconnecting from anywhere."""
        print(f"Handling disconnection for user_id: {user_id}")
        
        # Check if in an active game
        room_id, room = self.find_room_by_user(user_id, include_spectators=False)
        
        if room and room.status == "in_game" and room.game_record_id and self.game_manager:
            # --- DELEGATE TO GAMEMANAGER ---
            print(f"User {user_id} disconnected from active game. Notifying GameManager.")
            user_obj = next((p.user for p in room.players if p.id == user_id), None)
            if user_obj:
                # Update persistent record
                record = fake_games_db.get(room.game_record_id)
                if record:
                    participant = next((p for p in record.participants if p.user.id == user_id), None)
                    if participant and participant.status == PlayerStatus.ACTIVE:
                        participant.status = PlayerStatus.DISCONNECTED
                
                # Tell the game instance
                await self.game_manager.handle_player_leave(user_obj, room.game_record_id, PlayerStatus.DISCONNECTED)
            
        elif room: # Disconnected from a pre-game room
            user_in_room = next((p for p in room.players if p.id == user_id), None)
            if user_in_room:
                await self.leave_room_pre_game(user_in_room, manager)
        
        elif user_id in self.lobby_users:
            # Disconnected from the main lobby
            del self.lobby_users[user_id]
            await self.broadcast_lobby_state(manager)
            
    async def return_to_lobby(self, user: User, manager: ConnectionManager):
        """ Acknowledges post-game and returns to lobby."""
        print(f"User {user.username} is returning to the lobby.")
        await self.add_user_to_lobby(user, manager)

    async def handle_view_request(self, user: User, payload: dict, manager: ConnectionManager):
        """Handles a client's request to change their view."""
        requested_view = payload.get("view")
        if not requested_view:
            return

        # THE ONE RULE: Is the player in an active, non-surrendered game?
        game_id = self.find_game_by_user(user.id)
        if game_id and self.game_manager:
            game = self.game_manager.active_games.get(game_id)
            if game:
                player_state = game.state.players.get(user.id)
                if player_state and player_state.status == "ACTIVE" and game.state.phase != GamePhase.GAME_OVER:
                    print(f"FORCE: User {user.username} is in an active game. Denying '{requested_view}' request.")
                    # Force the game state back to them
                    await self.game_manager.broadcast_game_state(game_id)
                    return

        # Rule: If in pre-game room, deny 'lobby' request
        room_id, room = self.find_room_by_user(user.id, include_spectators=False)
        if room and room.status == "lobby" and requested_view == "lobby":
            print(f"DENY: User {user.username} is in a pre-game room. Sending 'room' view.")
            await self.broadcast_room_state(room.id, manager)
            return

        # If the rule above doesn't apply, the user is free to navigate.
        print(f"GRANT: Granting {user.username}'s request for '{requested_view}' view.")
        if requested_view == "lobby":
            await self.add_user_to_lobby(user, manager)
        elif requested_view == "profile":
            await manager.send_to_user(user.id, {"type": "state_update", "payload": {"view": "profile"}})
        elif requested_view == "post_game":
            # This is requested by a surrendered player who is spectating
            room_id, room = self.find_room_by_user(user.id, include_spectators=True)
            if room and room.game_record_id and room.game_record_id in fake_games_db:
                record = fake_games_db[room.game_record_id]
                await manager.send_to_user(user.id, {
                    "type": "state_update",
                    "payload": {"view": "post_game", "gameResult": record.model_dump(mode="json"), "force": True}
                })
            else:
                print(f"Could not find game record for user {user.id} requesting post_game view.")
        else:
            print(f"Warning: Unhandled view request for '{requested_view}'")

    def get_room_dump(self, room: Room) -> dict:
        """Helper to get the dictionary representation of a room, enriched with game details."""
        room_dump = room.model_dump()
        if room.status == "in_game" and room.game_record_id in fake_games_db:
            record = fake_games_db[room.game_record_id]
            room_dump['game_details'] = record.model_dump()
        return room_dump

    async def broadcast_room_state(self, room_id: str, manager: ConnectionManager, force_view: bool = False):
        """Broadcasts the detailed state of a specific pre-game room."""
        if room_id not in self.rooms:
            return
            
        room = self.rooms[room_id]
        room_dump = self.get_room_dump(room)

        # This should only be called for 'lobby' status rooms now
        view = "room"
        
        state_update_msg = {
            "type": "state_update",
            "payload": {"view": view, "roomState": room_dump, "force": force_view}
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
        
    def find_game_by_user(self, user_id: str) -> Optional[str]:
        """Finds the game_record_id for a user in an 'in_game' room."""
        room_id, room = self.find_room_by_user(user_id, include_spectators=False)
        if room and room.status == "in_game":
            return room.game_record_id
        return None
