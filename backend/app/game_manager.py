"""
The GameManager singleton.
This service acts as the bridge between the ConnectionManager/RoomManager
and the individual GameInstance objects.
"""

from typing import Dict, List, Optional, Any
# --- FIX: Reverted to relative imports ---
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
        Called by RoomManager when the host starts the game.
        """
        try:
            game = GameInstance(game_id, participants)
            self.active_games[game_id] = game
            print(f"GameInstance {game.state.game_id} created.")
            # Send the initial state to all players
            await self.broadcast_game_state(game_id)
        except Exception as e:
            print(f"Error creating game {game_id}: {e}")
            import traceback
            traceback.print_exc()
            # TODO: Notify players of the error
            
    async def handle_game_action(self, user: User, game_id: str, action: str, **payload: Any):
        """
        Routes a game action from a user to the correct GameInstance.
        
        FIX: Changed signature from (self, user, game_id, payload)
             to (self, user, game_id, action, **payload)
             to match how the router is calling it.
        """
        game = self.active_games.get(game_id)
        if not game:
            print(f"Error: Game {game_id} not found for action.")
            return

        # 'action' is now a direct argument
        if not action:
            return

        action_success = False
        
        try:
            if action == "submit_plan":
                action_success = game.submit_plan(
                    player_id=user.id,
                    lure_card=payload.get("lure_card"),
                    action_card=payload.get("action_card")
                )
                
            elif action == "submit_defense":
                action_success = game.submit_defense(
                    player_id=user.id,
                    scrap_spent=payload.get("scrap_spent", {}),
                    arsenal_ids=payload.get("arsenal_ids", [])
                )
            
            elif action == "attract_threat":
                action_success = game.attract_threat(
                    player_id=user.id,
                    threat_id=payload.get("threat_id")
                )
            
            elif action == "submit_action_choice":
                # FIX: 'payload' is now the choice_payload, since 'action'
                # was a separate argument.
                choice_payload = payload
                action_success = game.submit_action_choice(
                    player_id=user.id,
                    payload=choice_payload
                )

            elif action == "buy_market_card":
                action_success = game.buy_market_card(
                    user_id=user.id,
                    card_id=payload.get("card_id"),
                    card_type=payload.get("card_type")
                )
            
            elif action == "pass_intermission_turn":
                action_success = game.pass_intermission_turn(
                    player_id=user.id
                )
            
            elif action == "surrender":
                print(f"User {user.username} is surrendering in {game_id}.")
                # This action is handled by room_manager, but we can
                # tell the game instance immediately.
                game.surrender_player(user.id)
                action_success = True # The action was processed
            
            else:
                print(f"Unknown game action: {action}")

        except Exception as e:
            print(f"Error processing action {action} for user {user.username}: {e}")
            import traceback
            traceback.print_exc()
            action_success = False # Ensure we don't broadcast on error

        if action_success:
            # If the action was successful, broadcast the new state
            await self.broadcast_game_state(game_id)
            
            # Check for game over
            if game.state.phase == GamePhase.GAME_OVER:
                await self.end_game(game_id)
        else:
            # TODO: Send an error message back to the user?
            print(f"Action '{action}' by {user.username} was not successful.")

    async def handle_player_connect(self, user: User, game_id: str):
        """Handle a player reconnecting to a game."""
        game = self.active_games.get(game_id)
        if not game:
            print(f"Warning: Player {user.username} reconnected to game {game_id}, but instance not found.")
            return
            
        game.on_player_reconnect(user.id)
        # Send full state just to the reconnecting user
        await self.broadcast_game_state(game_id, specific_user_id=user.id)
        # Send update to all other users
        await self.broadcast_game_state(game_id, exclude_user_id=user.id)

    async def handle_player_leave(self, user: User, game_id: str, status: ServerPlayerStatus):
        """
        Handle a player leaving a game.
        Note: Takes a `ServerPlayerStatus` from RoomManager.
        """
        game = self.active_games.get(game_id)
        if not game:
            print(f"Warning: Player {user.username} left game {game_id}, but game instance not found.")
            return

        print(f"Player {user.username} is leaving game {game_id} with server status {status.value}.")
        
        # Translate Server status to Game status
        if status == ServerPlayerStatus.DISCONNECTED:
            game.on_player_disconnect(user.id)
        elif status == ServerPlayerStatus.SURRENDERED:
            game.surrender_player(user.id)
        
        # Broadcast the updated state (e.g., player is_connected = False)
        # This broadcast will now correctly reach the surrendered player.
        await self.broadcast_game_state(game_id)
        
        # Check if the game should end (e.g., all players disconnected/surrendered)
        if game.state.phase != GamePhase.GAME_OVER:
            active_players = game.state.get_active_players_in_order()
            
            # --- FIX: Check for 0 or 1 active players ---
            if not active_players:
                print(f"Game {game_id} has no active players. Ending game.")
                # No winner in this case
                game.state.phase = GamePhase.GAME_OVER # Manually set phase
                await self.end_game(game_id)
            elif len(active_players) == 1:
                winner = active_players[0]
                print(f"Game {game_id} has only one active player left ({winner.username}). Ending game.")
                # Set the winner and end the game
                game.state.winner = winner
                game.state.phase = GamePhase.GAME_OVER
                await self.end_game(game_id)
            # --- END FIX ---

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

        # --- END REFACTORED LOGIC ---


    async def end_game(self, game_id: str):
        """
        Cleans up a finished game.
        Called by handle_game_action when phase becomes GAME_OVER
        or by handle_player_leave when all players are gone.
        """
        if not self.room_manager:
            print("Error: RoomManager not set in GameManager.")
            return
            
        game = self.active_games.get(game_id)
        if not game:
            print(f"Error: Tried to end game {game_id}, but it was not active.")
            return
            
        print(f"Game {game_id} has ended. Cleaning up...")
        
        # 1. Get final state and winner
        winner_state = game.state.winner
        
        # 2. Get the GameRecord from the fake_db
        record = fake_games_db.get(game_id)
        if not record:
            print(f"Error: GameRecord {game_id} not found in fake_db.")
            if game_id in self.active_games:
                del self.active_games[game_id]
            return

        # 3. Find the Room associated with this game
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
