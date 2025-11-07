"""
The GameManager singleton.
...
v1.9.1 - Defense Preview Refactor
- Added `preview_defense` function. This is a read-only
  pass-through to the new GameInstance.public_preview_defense.
  It is intended to be called by a new HTTP endpoint,
  *not* by the main WebSocket `player_action` dispatcher.
"""

from typing import Dict, List, Optional, Any
# --- FIX: Reverted to relative imports ---\
from .connection_manager import ConnectionManager
# Use TYPE_CHECKING to avoid circular import at runtime
from typing import TYPE_CHECKING
if TYPE_CHECKING:
    from .room_manager import RoomManager

from .server_models import User, Room, GameParticipant, PlayerStatus as ServerPlayerStatus
from .game_instance import GameInstance
# Note: We only import GamePhase for the GAME_OVER check.
from .game_core.game_models import GameState, PlayerState, GamePhase, PlayerStatus
from .routers import fake_games_db # Import the fake_db

class GameManager:
    """Manages the lifecycle of all active game instances."""
    
    def __init__(self, conn_manager: ConnectionManager):
        self.active_games: Dict[str, GameInstance] = {}
        self.conn_manager = conn_manager
        self.room_manager: Optional['RoomManager'] = None
        print("GameManager initialized.")
        
    def set_room_manager(self, room_manager: 'RoomManager'):
        """Inject the RoomManager instance."""
        self.room_manager = room_manager

    async def create_game(self, game_id: str, participants: List[GameParticipant]):
        """
        Creates a new GameInstance and stores it.
        """
        if game_id in self.active_games:
            print(f"Warning: Game {game_id} already exists. Overwriting.")
            
        try:
            game = GameInstance.create(game_id, participants)
            self.active_games[game_id] = game
            print(f"GameInstance {game_id} created with {len(participants)} players.")
            
            # Get the initial state to broadcast
            initial_state = game.state
            
            # --- Broadcast initial state to all players ---
            # We must redact it for each player
            for p in participants:
                redacted_state = initial_state.get_redacted_state(p.user.id)
                await self.conn_manager.send_to_user(
                    p.user.id,
                    {"type": "game_state_update", "data": redacted_state}
                )
                
        except Exception as e:
            print(f"ERROR creating game {game_id}: {e}")
            # TODO: Tell the room/players something went wrong

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
            # TODO: Send an error back to the player
            return

        try:
            # --- Perform the action ---
            # The game instance will mutate its own state
            updated_state = await game.player_action(player_id, action, payload)
            
            # --- Check for Game Over ---
            if updated_state.phase == GamePhase.GAME_OVER:
                await self._handle_game_over(game_id, updated_state)
            
            # --- Broadcast the new state to all players ---
            else:
                await self._broadcast_game_state(game_id, updated_state)
                
        except Exception as e:
            print(f"ERROR during player_action for game {game_id}: {e}")
            # TODO: Send an error back to the player
            # As a fallback, broadcast the last known state
            await self.conn_manager.broadcast_to_game(
                game_id,
                {"type": "game_error", "message": str(e)}
            )
            await self._broadcast_game_state(game_id, game.state)

    # --- NEW: Read-only preview function ---
    async def preview_defense(
        self, game_id: str, player_id: str, payload: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        READ-ONLY.
        Routes a preview request to the correct GameInstance.
        This is intended to be called from a separate HTTP endpoint.
        """
        game = self.active_games.get(game_id)
        if not game:
            return {"error": "Game not found"}
        
        # This is a read-only operation, no broadcast needed
        return game.public_preview_defense(player_id, payload)


    async def _broadcast_game_state(self, game_id: str, state: GameState):
        """Helper to broadcast the redacted state to all players in a game."""
        
        # Get all players in the game
        player_ids = list(state.players.keys())
        
        for pid in player_ids:
            # Get the version of the state redacted for this player
            redacted_state = state.get_redacted_state(pid)
            
            # Send it
            await self.conn_manager.send_to_user(
                pid,
                
                {"type": "game_state_update", "data": redacted_state}
            )
    
    async def broadcast_game_state(self, game_id: str, 
                                 specific_user_id: Optional[str] = None,
                                 exclude_user_id: Optional[str] = None):
        """
        Sends the current game state to all (or one) players in a game.
        """
        game = self.active_games.get(game_id)
        if not game:
            print(f"Cannot broadcast state: Game {game_id} not found.")
            return

        if not self.room_manager:
            print(f"Error: RoomManager not set in GameManager. Cannot broadcast.")
            return

        # --- REFACTORED BROADCAST LOGIC ---
        
        if specific_user_id:
            # Send to just one user (e.g., on reconnect or spectator join)
            state_payload = game.get_state(specific_user_id)
            msg = {"type": "game_state_update", "payload": state_payload}
            await self.conn_manager.send_to_user(specific_user_id, msg)
            return

        # Find the room to get ALL recipients (players + spectators)
        room: Optional[Room] = None
        for r in self.room_manager.rooms.values():
            if r.game_record_id == game_id:
                room = r
                break
        
        if not room:
            print(f"Error: Room for game {game_id} not found. Cannot broadcast.")
            return

        # Get all states
        all_states = game.get_all_player_states()
        
        # Get all recipients
        player_ids = {p.id for p in room.players}
        spectator_ids = {s.id for s in room.spectators}
        all_recipients = player_ids.union(spectator_ids)

        spectator_payload = None # Lazy-load spectator state

        for user_id in all_recipients:
            if user_id == exclude_user_id:
                continue

            payload_to_send = None
            if user_id in all_states:
                # This user is a player (active, surrendered, etc.)
                payload_to_send = all_states[user_id]
            else:
                # This user is a pure spectator
                if spectator_payload is None:
                    # "spectator" is a magic string for get_state
                    spectator_payload = game.get_state("spectator") 
                payload_to_send = spectator_payload
            
            if payload_to_send:
                msg = {"type": "game_state_update", "payload": payload_to_send}
                await self.conn_manager.send_to_user(user_id, msg)


    async def _handle_game_over(self, game_id: str, final_state: GameState):
        """
        Handles the end-of-game process.
        - Broadcasts final state
        - Updates RoomManager
        - Cleans up the game instance
        """
        if not self.room_manager:
            print("Error: RoomManager not set in GameManager. Cannot end game.")
            return

        print(f"Game {game_id} is over. Winner: {final_state.winner.username if final_state.winner else 'None'}")
        
        # 1. Broadcast the final, unredacted state to everyone
        #    (so everyone can see the scores)
        await self.conn_manager.broadcast_to_game(
            game_id,
            # We send the *full* state dump, not redacted
            {"type": "game_over", "data": final_state.model_dump()}
        )
        
        # 2. Find the GameRecord and Room
        record = self.room_manager.db.get_game_record(game_id)
        if not record:
            print(f"Error: GameRecord {game_id} not found. Cannot update stats.")
            # Still remove the game
            await self.remove_game(game_id)
            return

        winner_state = final_state.winner
        
        # 3. Find the Room
        room: Optional[Room] = None
        for r in self.room_manager.rooms.values():
            if r.game_record_id == game_id:
                room = r
                break
        
        if not room:
            print(f"Error: Room for game {game_id} not found in RoomManager.")
            # We can still proceed to clean up the game instance
            # and record, but we can't broadcast to the room.
        
        # 4. Find the server-level User object for the winner
        winner_user: Optional[User] = None
        if winner_state:
            participant = next((p for p in record.participants if p.user.id == winner_state.user_id), None)
            if participant:
                winner_user = participant.user
                print(f"Winner found: {winner_user.username}")
            else:
                print(f"Warning: Winner state {winner_state.user_id} not found in record participants.")
        else:
            print("Game ended with no winner.")

        # 5. Tell RoomManager to end the game
        # RoomManager will update the room, record, and broadcast
        await self.room_manager.end_game(
            room=room, # Pass room, even if None (end_game handles it)
            record=record,
            manager=self.conn_manager,
            winner=winner_user
        )

        # 6. Remove game from active instances
        if game_id in self.active_games:
            del self.active_games[game_id]
            print(f"GameInstance {game_id} removed from active games.")