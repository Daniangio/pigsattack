"""
The GameManager singleton.
"""

from typing import Dict, List, Optional, Any
from .connection_manager import ConnectionManager
from typing import TYPE_CHECKING
if TYPE_CHECKING:
    from .room_manager import RoomManager

from .server_models import User, Room, GameParticipant, PlayerStatus as ServerPlayerStatus
from game_core import GameSession, GamePhase, PlayerStatus
from game_core.session import InvalidActionError
from .routers import fake_games_db 

class GameManager:
    """Manages the lifecycle of all active game instances."""
    
    def __init__(self, conn_manager: ConnectionManager):
        self.active_games: Dict[str, GameSession] = {}
        self.conn_manager = conn_manager
        self.room_manager: Optional['RoomManager'] = None
        print("GameManager initialized.")
        
    def set_room_manager(self, room_manager: 'RoomManager'):
        """Inject the RoomManager instance."""
        self.room_manager = room_manager

    def _find_room_by_game_id(self, game_id: str) -> Optional[Room]:
        """Internal helper to find a room from the attached room_manager."""
        if not self.room_manager:
            return None
        for room in self.room_manager.rooms.values():
            if room.game_record_id == game_id:
                return room
        return None

    async def create_game(self, game_id: str, participants: List[GameParticipant]):
        """
        Creates a new GameInstance and stores it.
        """
        if game_id in self.active_games:
            print(f"Warning: Game {game_id} already exists. Overwriting.")
            
        try:
            # 1. Create the instance (synchronous)
            session_players = [{"id": p.user.id, "username": p.user.username} for p in participants]
            game = GameSession(game_id, session_players)
            # 2. Perform async setup (draw resources, start first round)
            await game.async_setup()
            
            self.active_games[game_id] = game
            print(f"GameInstance {game_id} created with {len(participants)} players.")
            
            # --- Broadcast initial state to all players ---
            for p in participants:
                redacted_state = game.state.get_redacted_state(p.user.id)
                await self.conn_manager.send_to_user(
                    p.user.id,
                    {"type": "game_state_update", "payload": redacted_state}
                )
            
            # --- Broadcast to spectators in the room ---
            if self.room_manager:
                # --- FIX: Use internal helper ---
                room = self._find_room_by_game_id(game_id)
                if room:
                    spectator_state = game.state.get_redacted_state("spectator")
                    
                    # --- FIX: Use correct broadcast_to_users method ---
                    msg = {"type": "game_state_update", "payload": spectator_state}
                    spectator_ids = [spec.id for spec in room.spectators]
                    if spectator_ids:
                        await self.conn_manager.broadcast_to_users(spectator_ids, msg)
                    # --- END FIX ---

        except Exception as e:
            print(f"ERROR creating game {game_id}: {e}")
            if self.room_manager:
                # --- FIX: Find room and broadcast manually ---
                room = self._find_room_by_game_id(game_id)
                if room:
                    # --- FIX: Use correct broadcast_to_users method ---
                    all_recipients = [p.id for p in room.players] + [s.id for s in room.spectators]
                    msg = {"type": "error", "payload": {"message": f"Failed to create game: {e}"}}
                    if all_recipients:
                        await self.conn_manager.broadcast_to_users(all_recipients, msg)
                    # --- END FIX ---

    async def remove_game(self, game_id: str):
        """Removes a game from the active list."""
        if game_id in self.active_games:
            del self.active_games[game_id]
            print(f"GameInstance {game_id} removed.")

    async def player_action(
        self, game_id: str, player_id: str, action: str, payload: Dict[str, Any]
    ):
        """
        Routes a player's action to the correct GameInstance.
        This is the main entry point from the WebSocket router.
        """
        
        game = self.active_games.get(game_id)
        if not game:
            print(f"Error: Game {game_id} not found for player action.")
            await self.conn_manager.send_to_user(
                player_id,
                {"type": "error", "payload": {"message": "Game not found."}}
            )
            return

        try:
            state_changed = await game.player_action(player_id, action, payload)

            if state_changed:
                if game.state.phase == GamePhase.GAME_OVER:
                    await self._handle_game_over(game_id, game.state)
                else:
                    await self.broadcast_game_state(game_id)

        except InvalidActionError as e:
            await self.conn_manager.send_to_user(
                player_id,
                {"type": "error", "payload": {"message": str(e)}}
            )
        except Exception as e:
            print(f"CRITICAL ERROR during player_action for game {game_id}: {e}")
            # This is a fallback for *unexpected* errors,
            # not InvalidActionError
            
            # --- FIX: Replace non-existent 'broadcast_to_game' ---
            # Manually find all recipients and use 'broadcast_to_users'
            all_recipients = []
            if self.room_manager and game:
                room = self._find_room_by_game_id(game_id)
                if room:
                    all_recipients = [p.id for p in room.players] + [s.id for s in room.spectators]
                else:
                    # Fallback to just players in game state
                    all_recipients = list(game.state.players.keys())
            
            if all_recipients:
                # --- FIX: Use correct broadcast_to_users method ---
                msg = {"type": "error", "payload": {"message": f"A critical server error occurred: {e}"}}
                await self.conn_manager.broadcast_to_users(all_recipients, msg)
                # --- END FIX ---

            # As a fallback, broadcast the last known state
            if game: # Check if game exists before broadcasting
                await self.broadcast_game_state(game_id)

    async def handle_player_leave(self, user: User, game_id: str, status: ServerPlayerStatus):
        """Handles a player leaving mid-game (surrender/disconnect)."""
        game = self.active_games.get(game_id)
        if not game:
            return

        player_state = game.state.players.get(user.id)
        if player_state and player_state.status == PlayerStatus.ACTIVE:
            action_to_take = ""
            if status == ServerPlayerStatus.DISCONNECTED:
                action_to_take = "disconnect"
            elif status == ServerPlayerStatus.SURRENDERED:
                 action_to_take = "surrender"
            
            if action_to_take:
                # Use the main player_action flow
                await self.player_action(game_id, user.id, action_to_take, {})

    async def preview_defense(
        self, game_id: str, player_id: str, payload: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        READ-ONLY.
        Routes a preview request to the correct GameInstance.
        """
        game = self.active_games.get(game_id)
        if not game:
            return {"error": "Game not found"}
        
        # This is a read-only operation, no broadcast needed
        return game.public_preview(player_id, payload)


    async def broadcast_game_state(self, game_id: str, 
                                 specific_user_id: Optional[str] = None,
                                 exclude_user_id: Optional[str] = None):
        """
        Sends the current game state to all (or one) players/spectators.
        """
        game = self.active_games.get(game_id)
        if not game:
            print(f"Cannot broadcast state: Game {game_id} not found.")
            return

        if not self.room_manager:
            print(f"Error: RoomManager not set in GameManager. Cannot broadcast.")
            return

        if specific_user_id:
            # Send to just one user (e.g., on reconnect or spectator join)
            state_payload = game.state.get_redacted_state(specific_user_id)
            msg = {"type": "game_state_update", "payload": state_payload}
            await self.conn_manager.send_to_user(specific_user_id, msg)
            return

        # Find the room to get ALL recipients (players + spectators)
        # --- FIX: Use internal helper ---
        room: Optional[Room] = self._find_room_by_game_id(game_id)
        
        if not room:
            print(f"Error: Room for game {game_id} not found. Broadcasting only to players in game state.")
            # Fallback: just broadcast to players in the game state
            all_recipients = set(game.state.players.keys())
        else:
            # Get all recipients
            player_ids = {p.id for p in room.players}
            spectator_ids = {s.id for s in room.spectators}
            all_recipients = player_ids.union(spectator_ids)

        spectator_payload = None # Lazy-load spectator state

        for user_id in all_recipients:
            if user_id == exclude_user_id:
                continue

            payload_to_send = None
            if user_id in game.state.players:
                # This user is a player (active, surrendered, etc.)
                payload_to_send = game.state.get_redacted_state(user_id)
            else:
                # This user is a pure spectator
                if spectator_payload is None:
                    spectator_payload = game.state.get_redacted_state("spectator")
                payload_to_send = spectator_payload
            
            if payload_to_send:
                msg = {"type": "game_state_update", "payload": payload_to_send}
                await self.conn_manager.send_to_user(user_id, msg)


    async def _handle_game_over(self, game_id: str, final_state: Any):
        """
        Handles the end-of-game process.
        """
        if not self.room_manager:
            print("Error: RoomManager not set in GameManager. Cannot end game.")
            return

        print(f"Game {game_id} is over. Winner: {final_state.winner_id or 'None'}")
        
        # 1. Broadcast the final state to everyone
        await self.broadcast_game_state(game_id)
        
        # 2. Find the GameRecord
        record = fake_games_db.get(game_id)
        if not record:
            print(f"Error: GameRecord {game_id} not found. Cannot update stats.")
            await self.remove_game(game_id)
            return

        # 3. Find the Room
        # --- FIX: Use internal helper ---
        room: Optional[Room] = self._find_room_by_game_id(game_id)
        
        if not room:
            print(f"Error: Room for game {game_id} not found in RoomManager.")
        
        # 4. Find the server-level User object for the winner
        winner_user: Optional[User] = None
        if final_state.winner_id:
            participant = next((p for p in record.participants if p.user.id == final_state.winner_id), None)
            if participant:
                winner_user = participant.user
                print(f"Winner found: {winner_user.username}")
            else:
                print(f"Warning: Winner state {final_state.winner_id} not found in record participants.")
        else:
            print("Game ended with no winner.")

        # 5. Tell RoomManager to end the game
        await self.room_manager.end_game(
            room=room, 
            record=record,
            manager=self.conn_manager,
            winner=winner_user
        )

        # 6. Remove game from active instances
        await self.remove_game(game_id)
