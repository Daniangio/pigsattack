"""
The GameManager singleton.
This service acts as the bridge between the ConnectionManager/RoomManager
and the individual GameInstance objects.
"""

from typing import Dict, List, Optional
from .connection_manager import ConnectionManager
# Use TYPE_CHECKING to avoid circular import at runtime
from typing import TYPE_CHECKING
if TYPE_CHECKING:
    from .room_manager import RoomManager

from .models import User, Room, GameParticipant, PlayerStatus
from .game_instance import GameInstance
from .game_core.models import GameState, PlayerState, GamePhase, LureCard, SurvivorActionCard, ScrapType
from .routers import fake_games_db # Import the fake_db

# A simple in-memory store for active games
active_games: Dict[str, GameInstance] = {}

class GameManager:
    """Manages the lifecycle of all active game instances."""
    
    def __init__(self, conn_manager: ConnectionManager):
        self.conn_manager = conn_manager
        # This will be injected by main.py
        self.room_manager: Optional['RoomManager'] = None
        print("GameManager initialized.")
        
    def set_room_manager(self, room_manager: 'RoomManager'):
        """Inject the RoomManager instance."""
        self.room_manager = room_manager

    async def create_game(self, game_id: str, participants: List[GameParticipant]):
        """
        Creates a new GameInstance and stores it.
        Called by RoomManager when a game starts.
        """
        if game_id in active_games:
            print(f"Warning: Game {game_id} already exists.")
            return
            
        try:
            # 1. Create the game instance
            game_instance = GameInstance(game_id, participants)
            active_games[game_id] = game_instance
            
            # 2. Broadcast the initial state to all players
            await self.broadcast_game_state(game_id)
            
        except Exception as e:
            print(f"Error creating game {game_id}: {e}")
            # TODO: Send error message back to players
            
    async def handle_game_action(self, user: User, game_id: str, action: str, payload: dict):
        """
        The single entry point for all in-game actions from the websocket.
        """
        game = active_games.get(game_id)
        if not game:
            print(f"Error: Game {game_id} not found for action {action}.")
            return
            
        player = game.state.players.get(user.id)
        if not player or player.status != "ACTIVE":
            print(f"User {user.id} is not an active player in game {game_id}.")
            return

        action_success = False
        
        try:
            # --- Route the action to the correct GameInstance method ---
            
            if action == "submit_plan":
                action_success = game.submit_plan(
                    user_id=user.id,
                    lure=LureCard(payload["lure"]),
                    action=SurvivorActionCard(payload["action"])
                )
                
            elif action == "submit_defense":
                # Convert scrap keys from strings back to Enums
                scrap_spent_enum = {ScrapType(k): v for k, v in payload.get("scrap_spent", {}).items()}
                action_success = game.submit_defense(
                    user_id=user.id,
                    scrap_spent=scrap_spent_enum,
                    arsenal_ids=payload.get("arsenal_ids", [])
                )
            
            # TODO: Add other actions like "buy_upgrade", "buy_arsenal"
            
            else:
                print(f"Unknown game action: {action}")
                # TODO: Send error to user
                
            if action_success:
                # If the action was successful, broadcast the new state
                await self.broadcast_game_state(game_id)
                
                # Check if the game is over
                if game.state.phase == GamePhase.GAME_OVER:
                    # --- Read the winner object directly from game state ---
                    winner_state = game.state.winner
                    await self.terminate_game(game_id, winner_state)
            else:
                # TODO: Send error to user (e.g., "Not in PLANNING phase")
                pass

        except Exception as e:
            print(f"Error handling action {action} for game {game_id}: {e}")
            # TODO: Send error to user

    async def handle_player_leave(self, user: User, game_id: str, status: PlayerStatus):
        """Handles a player disconnecting or surrendering."""
        game = active_games.get(game_id)
        if not game:
            return
            
        game.handle_player_leave(user.id, status.value)
        
        # Broadcast the state change
        await self.broadcast_game_state(game_id)
        
        # Check if the game is over
        if game.state.phase == GamePhase.GAME_OVER:
            # --- Read the winner object directly from game state ---
            winner_state = game.state.winner
            await self.terminate_game(game_id, winner_state)

    async def broadcast_game_state(self, game_id: str):
        """Sends the appropriate redacted state to every player in the game."""
        game = active_games.get(game_id)
        if not game:
            return
            
        all_states = game.get_all_player_states()
        
        for user_id, state_payload in all_states.items():
            # Check if player is still connected
            if user_id in self.conn_manager.active_connections:
                msg = {
                    "type": "game_state_update",
                    "payload": state_payload
                }
                await self.conn_manager.send_to_user(user_id, msg)
        
        # TODO: Send spectator state to spectators

    async def terminate_game(self, game_id: str, winner_state: Optional[PlayerState]):
        """
        Ends a game, notifies RoomManager to handle post-game UI,
        and cleans up the in-memory game instance.
        """
        print(f"Terminating game {game_id}...")

        if not self.room_manager:
            print(f"Error: RoomManager not injected. Cannot terminate game {game_id}.")
            if game_id in active_games:
                del active_games[game_id] # Clean up anyway
            return

        # 1. Find the persistent GameRecord
        record = fake_games_db.get(game_id)
        if not record:
            print(f"Error: GameRecord {game_id} not found in fake_db.")
            if game_id in active_games:
                del active_games[game_id] # Clean up anyway
            return

        # 2. Find the in-memory Room
        # We need to find the room that holds this game_record_id
        room: Optional[Room] = None
        for r in self.room_manager.rooms.values():
            if r.game_record_id == game_id:
                room = r
                break
        
        if not room:
            print(f"Error: Room for game {game_id} not found in RoomManager.")
            # This shouldn't happen, but if it does, we'll
            # log and clean up the game instance.
            if game_id in active_games:
                del active_games[game_id]
            return

        # 3. Determine the winner (as a User object)
        winner_user: Optional[User] = None
        if winner_state:
            # Find the full User object from the participants list in the record
            participant = next((p for p in record.participants if p.user.id == winner_state.user_id), None)
            if participant:
                winner_user = participant.user
                print(f"Winner found: {winner_user.username}")
            else:
                print(f"Warning: Winner state {winner_state.user_id} not found in record participants.")
        else:
            print("Game ended with no winner.")

        # 4. Delegate to RoomManager to end the game
        # This will update the record, send the 'post_game' view,
        # and delete the in-memory Room object.
        await self.room_manager.end_game(
            room=room,
            record=record,
            manager=self.conn_manager,
            winner=winner_user
        )

        # 5. Clean up the in-memory GameInstance
        if game_id in active_games:
            del active_games[game_id]
            print(f"GameInstance {game_id} removed from active_games.")
