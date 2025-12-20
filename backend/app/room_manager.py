import uuid
import os
from datetime import datetime, timezone
from typing import Dict, List, Optional
from .server_models import User, Room, LobbyState, GameRecord, GameParticipant, PlayerStatus
from .connection_manager import ConnectionManager
from .routers import fake_games_db, fake_users_db
from .custom_content import (
    CUSTOM_THREATS_DIR,
    CUSTOM_BOSS_DIR,
    CUSTOM_UPGRADES_DIR,
    CUSTOM_WEAPONS_DIR,
)

# --- NEW GAME CORE IMPORTS ---
from typing import TYPE_CHECKING
if TYPE_CHECKING:
    from .game_manager import GameManager
# --- END NEW IMPORTS ---

class RoomManager:
    """Manages game rooms, lobby, and the lifecycle of games."""
    def __init__(self):
        self.rooms: Dict[str, Room] = {}
        self.lobby_users: Dict[str, User] = {}
        self.game_manager: Optional['GameManager'] = None

    def set_game_manager(self, game_manager: 'GameManager'):
        self.game_manager = game_manager

    def get_lobby_state(self) -> dict:
        """Constructs the current lobby state."""
        return LobbyState(
            users=[user.model_dump() for user in self.lobby_users.values()],
            rooms=[room.model_dump() for room in self.rooms.values()]
        ).model_dump()

    async def broadcast_lobby_state(self, manager: ConnectionManager):
        """Broadcasts the lobby state to all users in the lobby."""
        state_update_msg = {
            "type": "lobby_state",
            "payload": self.get_lobby_state()
        }
        await manager.broadcast_to_users(list(self.lobby_users.keys()), state_update_msg)

    async def add_user_to_lobby(self, user: User, manager: ConnectionManager):
        """Adds a user to the lobby and notifies everyone."""
        # Do not add to lobby if they are in an active game
        game_id = self.find_game_by_user(user.id)
        if game_id:
            print(f"User {user.username} is in active game {game_id}, not adding to lobby.")
            return
         
        # User is not in an active game, safe to add to lobby.
        # They might be in a PRE-GAME room, which is fine.        
        self.lobby_users[user.id] = user
        print(f"User {user.username} ({user.id}) entered lobby.")
        await self.broadcast_lobby_state(manager)
    
    def _remove_player_from_room(self, user_id: str):
        """Internal helper to remove a player from a room's player list."""
        room_id, room = self.find_room_by_user(user_id)
        if room:
            room.players = [p for p in room.players if p.id != user_id]
            return room_id, room
        return None, None

    def remove_user_from_any_room(self, user_id: str):
        """Helper to find and remove a user from any room."""
        room_id, room = self.find_room_by_user(user_id, include_spectators=True)
        if room:
            room.players = [p for p in room.players if p.id != user_id]
            room.spectators = [s for s in room.spectators if s.id != user_id]
            
            # If room is now empty and not in-game, dismantle it
            if not room.players and room.status != 'in_game':
                print(f"Room {room_id} is empty and dismantled.")
                del self.rooms[room_id]
            # If host left, assign a new host
            elif room.players and room.host_id == user_id:
                room.host_id = room.players[0].id
                print(f"Host transferred to {room.players[0].username} in room {room_id}.")

    async def create_room(self, host: User, room_name: str, manager: ConnectionManager):
        """Creates a new room, moves the host into it."""
        # --- Check if user is already in another room ---
        existing_room_id, existing_room = self.find_room_by_user(host.id)
        if existing_room:
            await manager.send_to_user(host.id, {
                "type": "error",
                "payload": {"message": f"You are already in room: {existing_room.name}"}
            })
            return

        if host.id not in self.lobby_users:
            print(f"Error: User {host.username} not in lobby, cannot create room.")
            return
        
        room_id = str(uuid.uuid4())[:8]
        new_room = Room(id=room_id, name=room_name or f"{host.username}'s Room", host_id=host.id)
        new_room.players.append(host)
        
        self.rooms[room_id] = new_room

        print(f"Room {room_id} created by {host.username}.")
        
        # --- REFACTOR ---
        # Send a special 'room_created' message *only* to the host.
        # This will trigger their client to navigate.
        await manager.send_to_user(host.id, {
            "type": "room_created",
            "payload": self.get_room_dump(new_room)
        })
        # Update everyone in the lobby
        await self.broadcast_lobby_state(manager)
        # --- END REFACTOR ---

    async def join_room(self, user: User, room_id: str, manager: ConnectionManager):
        """Allows a user from the lobby to join an existing room."""
        # --- Check if user is already in another room ---
        existing_room_id, existing_room = self.find_room_by_user(user.id)
        if existing_room:
            await manager.send_to_user(user.id, {
                "type": "error",
                "payload": {"message": f"You are already in room: {existing_room.name}"}
            })
            return

        if user.id not in self.lobby_users or room_id not in self.rooms:
            return

        room = self.rooms[room_id]
        if room.status != 'lobby' or len(room.players) >= 5:
            await manager.send_to_user(user.id, {"type": "error", "payload": {"message": "Room is full or in-game."}})
            return

        room.players.append(user)

        print(f"User {user.username} joined room {room_id}.")
        
        # Send the new room state to the user who just joined. This will
        # trigger their client's StateGuard to navigate them to the room page.
        await manager.send_to_user(user.id, {"type": "room_state", "payload": self.get_room_dump(room)})
        
        # Broadcast the updated room state to all *other* players in the room.
        await self.broadcast_room_state(room_id, manager, exclude_user_id=user.id)
        # Update the lobby for everyone.
        await self.broadcast_lobby_state(manager)

    async def _handle_spectator_join(self, user: User, room: Room, manager: ConnectionManager):
        """Internal helper to add a spectator to a room."""
        room.spectators.append(user)
        
        # This is the transition:
        if user.id in self.lobby_users:
            del self.lobby_users[user.id]
            
        print(f"User {user.username} is now spectating game in room {room.id}.")
        
        if self.game_manager:
            await self.game_manager.broadcast_game_state(room.game_record_id, specific_user_id=user.id)

        await self.broadcast_lobby_state(manager)

    async def spectate_game(self, user: User, game_record_id: str, manager: ConnectionManager):
        # --- Check if user is busy ---
        existing_room_id, existing_room = self.find_room_by_user(user.id, include_spectators=True)
        if existing_room:
             await manager.send_to_user(user.id, {
                "type": "error",
                "payload": {"message": "You cannot spectate while in a room."}
            })
             return

        # Find the room associated with the game_record_id
        room = next((r for r in self.rooms.values() if r.game_record_id == game_record_id), None)
        if room and room.status == 'in_game':
            await self._handle_spectator_join(user, room, manager)
        else:
             await manager.send_to_user(user.id, {
                "type": "error",
                "payload": {"message": "Game not found or not in progress."}
            })

    async def leave_room_pre_game(self, user: User, manager: ConnectionManager):
        """Handles a user leaving a room before the game starts."""
        room_id, room = self.find_room_by_user(user.id)
        if not room or room.status != 'lobby':
            return
        
        # Remove user and check for host migration
        self.remove_user_from_any_room(user.id)
        print(f"User {user.username} left pre-game room {room_id}.")
        # We just need to update state for everyone.
        
        # If room still exists, update its members
        if room_id in self.rooms:
            await self.broadcast_room_state(room_id, manager)
        
        # Send a message to the leaver to clear their room state
        await manager.send_to_user(user.id, {"type": "force_to_lobby"})
        
        # Add user to lobby model and broadcast lobby
        # This is safe because they are leaving a PRE-GAME room,
        # so they should be in the lobby.
        await self.add_user_to_lobby(user, manager)

    async def start_game(self, user: User, manager: ConnectionManager):
        """Delegates game creation to the GameManager."""
        room_id, room = self.find_room_by_user(user.id)
        if not room or room.host_id != user.id or len(room.players) < 2 or room.status != "lobby":
            return
        if not self.game_manager:
            return

        # --- Remove players from lobby when game starts ---
        for player in room.players:
            if player.id in self.lobby_users:
                del self.lobby_users[player.id]

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
        # GameManager will send 'game_state_update'.
        # Clients' <StateGuard> will handle navigation.
        await self.game_manager.create_game(
            game_record_id,
            participants,
            deck_selection={
                "threat_deck": room.threat_deck,
                "boss_deck": room.boss_deck,
                "upgrade_deck": room.upgrade_deck,
                "weapon_deck": room.weapon_deck,
            },
        )
        await self.broadcast_lobby_state(manager)

    async def end_game(self, room: Room, record: GameRecord, manager: ConnectionManager, winner: Optional[User]):
        """Called by GameManager when GameInstance enters GAME_OVER."""
        winner_name = winner.username if winner else "No one"
        print(f"Game {record.id} in room {room.id} ended. Winner: {winner_name}")
        
        record.winner = winner
        record.ended_at = datetime.now(timezone.utc)
        record.status = "completed"

        all_involved_ids = [p.user.id for p in record.participants] + [s.id for s in room.spectators]
        
        if room.id in self.rooms:
            del self.rooms[room.id]
        
        # Send a specific 'game_result' message.
        # The client's <StateGuard> will handle navigation.
        await manager.broadcast_to_users(
            all_involved_ids, 
            {"type": "game_result", "payload": record.model_dump(mode="json")}
        )
        await self.broadcast_lobby_state(manager)

    async def send_user_current_state(self, user: User, manager: ConnectionManager) -> bool:
        """
        On connection/reconnection, send the correct state.
        Returns True if user was reconnected to a game/room, False otherwise.
        """
        # 1. Check for active game
        game_id = self.find_game_by_user(user.id)
        if game_id and self.game_manager and game_id in self.game_manager.active_games:
            print(f"Reconnecting user {user.username} to active game {game_id}.")
            await self.game_manager.broadcast_game_state(game_id, specific_user_id=user.id)
            return True

        # 2. Check for pre-game room
        room_id, room = self.find_room_by_user(user.id, include_spectators=True)
        if room and room.status == 'lobby':
            print(f"Reconnecting user {user.username} to pre-game room {room.id}.")
            await manager.send_to_user(user.id, {"type": "room_state", "payload": self.get_room_dump(room)})
            return True
        elif room and room.status == 'in_game': # Reconnected as spectator
            print(f"Reconnecting user {user.username} as spectator to game {room.game_record_id}.")
            await self._handle_spectator_join(user, room, manager)
            await manager.send_to_user(user.id, {"type": "room_state", "payload": self.get_room_dump(room)})
            return True

        # 3. User is not in a game or room.
        return False

    async def handle_disconnect(self, user_id: str, manager: ConnectionManager):
        """Handles a user disconnecting from anywhere."""
        print(f"Handling disconnection for user_id: {user_id}")
        
        room_id, room = self.find_room_by_user(user_id, include_spectators=True)
        
        if room and room.status == "in_game" and room.game_record_id and self.game_manager:
            # Delegate to GameManager
            print(f"User {user_id} disconnected from active game. Notifying GameManager.")
            user_obj = next((p for p in room.players if p.id == user_id), None)
            if user_obj:
                record = fake_games_db.get(room.game_record_id)
                if record:
                    participant = next((p for p in record.participants if p.user.id == user_id), None)
                    if participant and participant.status == PlayerStatus.ACTIVE:
                        participant.status = PlayerStatus.DISCONNECTED
                await self.game_manager.handle_player_leave(user_obj, room.game_record_id, PlayerStatus.DISCONNECTED)
            else: # User was a spectator
                room.spectators = [s for s in room.spectators if s.id != user_id]
                print(f"Spectator {user_id} disconnected from game {room.game_record_id}.")
                # No further broadcast needed

        elif room: # Disconnected from a pre-game room
            user_in_room = next((p for p in room.players if p.id == user_id), None)
            if user_in_room:
                # This will handle host migration and broadcast
                self.remove_user_from_any_room(user_id)
                if room_id in self.rooms:
                    await self.broadcast_room_state(room_id, manager)
        
        elif user_id in self.lobby_users:
            del self.lobby_users[user_id]
        
        # --- FIX (v-next): This is causing a race condition. The broadcast
        # will be moved to main.py *after* the disconnect is complete. ---
        pass
            
    async def return_to_lobby(self, user: User, manager: ConnectionManager):
        """ Acknowledges post-game and returns to lobby."""
        print(f"User {user.username} is returning to the lobby.")
        # Remove the user from any room (players or spectators) first.
        self.remove_user_from_any_room(user.id)
        # This will remove them from any (now-defunct) room refs
        # and add them to the lobby.
        await self.add_user_to_lobby(user, manager)
        # Send them the lobby state.
        await manager.send_to_user(user.id, {"type": "lobby_state", "payload": self.get_lobby_state()})

    def get_room_dump(self, room: Room) -> dict:
        """Helper to get the dictionary representation of a room, enriched with game details."""
        if not hasattr(room, "meta"):
            try:
                object.__setattr__(room, "meta", {})
            except Exception:
                pass
        room_dump = room.model_dump()
        if room.status == "in_game" and room.game_record_id in fake_games_db:
            record = fake_games_db[room.game_record_id]
            room_dump['game_details'] = record.model_dump()
        return room_dump

    async def broadcast_room_state(self, room_id: str, manager: ConnectionManager, exclude_user_id: Optional[str] = None):
        """Broadcasts the detailed state of a specific pre-game room."""
        if room_id not in self.rooms:
            return
            
        room = self.rooms[room_id]
        room_dump = self.get_room_dump(room)

        state_update_msg = {
            "type": "room_state",
            "payload": room_dump
        }
        
        all_user_ids = [p.id for p in room.players] + [s.id for s in room.spectators]
        if exclude_user_id:
            all_user_ids = [uid for uid in all_user_ids if uid != exclude_user_id]
        await manager.broadcast_to_users(all_user_ids, state_update_msg)

    def _deck_exists(self, deck_name: str, folder: str) -> bool:
        if not deck_name or deck_name == "default":
            return True
        return os.path.isfile(os.path.join(folder, f"{deck_name}.json"))

    async def set_room_decks(self, user: User, payload: dict, manager: ConnectionManager):
        room_id, room = self.find_room_by_user(user.id)
        if not room or room.status != "lobby":
            return
        if room.host_id != user.id:
            await manager.send_to_user(user.id, {"type": "error", "payload": {"message": "Only host can set decks."}})
            return

        updates = {}
        threat_deck = payload.get("threat_deck")
        boss_deck = payload.get("boss_deck")
        upgrade_deck = payload.get("upgrade_deck")
        weapon_deck = payload.get("weapon_deck")

        if threat_deck is not None and self._deck_exists(threat_deck, CUSTOM_THREATS_DIR):
            updates["threat_deck"] = threat_deck or "default"
        if boss_deck is not None and self._deck_exists(boss_deck, CUSTOM_BOSS_DIR):
            updates["boss_deck"] = boss_deck or "default"
        if upgrade_deck is not None and self._deck_exists(upgrade_deck, CUSTOM_UPGRADES_DIR):
            updates["upgrade_deck"] = upgrade_deck or "default"
        if weapon_deck is not None and self._deck_exists(weapon_deck, CUSTOM_WEAPONS_DIR):
            updates["weapon_deck"] = weapon_deck or "default"

        if not updates:
            await manager.send_to_user(user.id, {"type": "error", "payload": {"message": "Invalid deck selection."}})
            return

        for key, val in updates.items():
            setattr(room, key, val)

        await self.broadcast_room_state(room_id, manager)

    def find_room_by_user(self, user_id: str, include_spectators: bool = False):
        """Finds the room a user is currently in."""
        for room_id, room in self.rooms.items():
            if any(player.id == user_id for player in room.players):
                return room_id, room
            if include_spectators and any(spectator.id == user_id for spectator in room.spectators):
                return room_id, room
        return None, None

    async def detach_player_from_game(self, user_id: str, game_id: str, manager: ConnectionManager):
        """
        Remove a surrendered player from the active game room so they can start/join other games.
        They are not kept as spectators; they can rejoin via spectate if desired.
        """
        room = next((r for r in self.rooms.values() if r.game_record_id == game_id), None)
        if not room:
            return
        before_players = len(room.players)
        room.players = [p for p in room.players if p.id != user_id]
        room.spectators = [s for s in room.spectators if s.id != user_id]
        if len(room.players) != before_players:
            # Update lobby state to include the detached user
            if user_id in fake_users_db:
                await self.add_user_to_lobby(fake_users_db[user_id], manager)
            # Optionally broadcast room state to remaining participants
            await self.broadcast_room_state(room.id, manager, exclude_user_id=user_id)

    async def mark_player_as_spectator(self, user_id: str, game_id: str, manager: ConnectionManager):
        """
        Move a surrendered player to spectators for the given game room.
        """
        room = next((r for r in self.rooms.values() if r.game_record_id == game_id), None)
        if not room:
            return
        # Remove from players
        room.players = [p for p in room.players if p.id != user_id]
        # Add to spectators if not already
        if not any(s.id == user_id for s in room.spectators):
            if user_id in fake_users_db:
                room.spectators.append(fake_users_db[user_id])
        await self.broadcast_room_state(room.id, manager, exclude_user_id=user_id)
        
    def find_game_by_user(self, user_id: str) -> Optional[str]:
        """Finds the game_record_id for a user in an 'in_game' room."""
        room_id, room = self.find_room_by_user(user_id, include_spectators=False)
        if room and room.status == "in_game":
            return room.game_record_id
        return None

    async def add_bot_to_room(self, host: User, room_id: str, manager: ConnectionManager):
        """Allows the room host to add a bot player before the game starts."""
        room = self.rooms.get(room_id)
        if not room or room.status != "lobby":
            return
        if room.host_id != host.id:
            await manager.send_to_user(host.id, {"type": "error", "payload": {"message": "Only host can add bots."}})
            return
        if len(room.players) >= 5:
            await manager.send_to_user(host.id, {"type": "error", "payload": {"message": "Room is full."}})
            return

        bot_id = f"bot_{uuid.uuid4().hex[:6]}"
        bot_user = User(id=bot_id, username=bot_id, is_bot=True, personality="greedy", bot_depth=2)
        room.players.append(bot_user)
        fake_users_db[bot_id] = bot_user
        print(f"Bot {bot_id} added to room {room_id}.")

        await self.broadcast_room_state(room_id, manager)

    async def remove_bot_from_room(self, host: User, room_id: str, bot_id: str, manager: ConnectionManager):
        room = self.rooms.get(room_id)
        if not room or room.status != "lobby":
            return
        if room.host_id != host.id:
            await manager.send_to_user(host.id, {"type": "error", "payload": {"message": "Only host can remove bots."}})
            return
        before = len(room.players)
        room.players = [p for p in room.players if p.id != bot_id]
        if len(room.players) == before:
            await manager.send_to_user(host.id, {"type": "error", "payload": {"message": "Bot not found."}})
            return
        print(f"Bot {bot_id} removed from room {room_id}.")
        await self.broadcast_room_state(room_id, manager)

    async def set_bot_personality(self, host: User, room_id: str, bot_id: str, personality: str, manager: ConnectionManager):
        """Host can set a bot's personality before the game starts."""
        room = self.rooms.get(room_id)
        if not room or room.status != "lobby":
            return
        if room.host_id != host.id:
            await manager.send_to_user(host.id, {"type": "error", "payload": {"message": "Only host can configure bots."}})
            return
        allowed = {"greedy", "top3", "softmax5"}
        if personality not in allowed:
            await manager.send_to_user(host.id, {"type": "error", "payload": {"message": "Invalid personality."}})
            return
        updated = False
        for idx, p in enumerate(room.players):
            if p.id == bot_id and p.is_bot:
                room.players[idx].personality = personality
                updated = True
                break
        if bot_id in fake_users_db and getattr(fake_users_db[bot_id], "is_bot", False):
            fake_users_db[bot_id].personality = personality
            updated = True
        if updated:
            print(f"Bot {bot_id} personality set to {personality} in room {room_id}.")
            await self.broadcast_room_state(room_id, manager)
        else:
            await manager.send_to_user(host.id, {"type": "error", "payload": {"message": "Bot not found."}})

    async def set_bot_depth(self, host: User, room_id: str, bot_id: str, depth: int, manager: ConnectionManager):
        """Host sets the bot lookahead depth for a specific bot."""
        room = self.rooms.get(room_id)
        if not room or room.status != "lobby":
            return
        if room.host_id != host.id:
            await manager.send_to_user(host.id, {"type": "error", "payload": {"message": "Only host can configure bots."}})
            return
        if not bot_id:
            await manager.send_to_user(host.id, {"type": "error", "payload": {"message": "Bot not found."}})
            return
        bot = next((p for p in room.players if p.id == bot_id and p.is_bot), None)
        if not bot:
            await manager.send_to_user(host.id, {"type": "error", "payload": {"message": "Bot not found."}})
            return
        try:
            depth_int = int(depth)
        except Exception:
            depth_int = 2
        depth_int = max(1, min(5, depth_int))
        bot.bot_depth = depth_int
        if bot_id in fake_users_db:
            fake_users_db[bot_id].bot_depth = depth_int
        await self.broadcast_room_state(room_id, manager)
