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
        Called by RoomManager when a game starts.
        """
        if game_id in self.active_games:
            print(f"Warning: Game {game_id} already exists.")
            return
            
        try:
            game_instance = GameInstance(game_id, participants)
            self.active_games[game_id] = game_instance
            await self.broadcast_game_state(game_id)
            
        except Exception as e:
            print(f"Error creating game {game_id}: {e}")
            
    async def handle_game_action(self, user: User, game_id: str, action: str, payload: dict):
        """
        The single entry point for all in-game actions from the websocket.
        """
        game = self.active_games.get(game_id)
        if not game:
            print(f"Error: Game {game_id} not found for action {action}.")
            return
            
        # Check if user is an active player *for most actions*
        player = game.state.players.get(user.id)
        if action not in ["spectate_action"]: # Add any spectator actions here
            if not player or player.status != "ACTIVE":
                print(f"User {user.id} is not an active player in game {game_id}.")
                return

        action_success = False
        
        try:
            if action == "submit_plan":
                action_success = game.submit_plan(
                    user_id=user.id,
                    lure=LureCard(payload["lure"]),
                    action=SurvivorActionCard(payload["action"])
                )
                
            elif action == "submit_defense":
                scrap_spent_enum = {ScrapType(k): int(v) for k, v in payload.get("scrap_spent", {}).items()}
                action_success = game.submit_defense(
                    user_id=user.id,
                    scrap_spent=scrap_spent_enum,
                    arsenal_ids=payload.get("arsenal_ids", [])
                )
            
            elif action == "select_threat":
                action_success = game.select_threat(
                    user_id=user.id,
                    threat_id=payload.get("threat_id")
                )
            
            elif action == "submit_action_choice":
                action_success = game.submit_action_choice(
                    user_id=user.id,
                    choice=payload # e.g., {"choice_type": "SCAVENGE", "scraps": ["PARTS", "PARTS"]}
                )

            else:
                print(f"Unknown game action: {action}")
                
            if action_success:
                await self.broadcast_game_state(game_id)
                
                if game.state.phase == GamePhase.GAME_OVER:
                    winner_state = game.state.winner
                    await self.terminate_game(game_id, winner_state)
            else:
                # Optionally send an error to the user
                await self.conn_manager.send_to_user(user.id, {
                    "type": "error",
                    "payload": {"message": f"Invalid action: {action}"}
                })

        except Exception as e:
            print(f"Error handling action {action} for game {game_id}: {e}")
            await self.conn_manager.send_to_user(user.id, {
                "type": "error",
                "payload": {"message": f"An error occurred: {e}"}
            })

    async def handle_player_leave(self, user: User, game_id: str, status: PlayerStatus):
        """Handles a player disconnecting or surrendering."""
        game = self.active_games.get(game_id)
        if not game:
            return
            
        game.handle_player_leave(user.id, status.value)
        await self.broadcast_game_state(game_id)
        
        if game.state.phase == GamePhase.GAME_OVER:
            winner_state = game.state.winner
            await self.terminate_game(game_id, winner_state)

    async def broadcast_game_state(self, game_id: str):
        """Sends the appropriate redacted state to every player in the game."""
        game = self.active_games.get(game_id)
        if not game:
            return
            
        all_states = game.get_all_player_states()
        
        for user_id, state_payload in all_states.items():
            if user_id in self.conn_manager.active_connections:
                msg = {
                    "type": "game_state_update",
                    "payload": state_payload
                }
                await self.conn_manager.send_to_user(user_id, msg)
        
        # TODO: Send spectator state

    async def terminate_game(self, game_id: str, winner_state: Optional[PlayerState]):
        """
        Ends a game, notifies RoomManager to handle post-game UI,
        and cleans up the in-memory game instance.
        """
        print(f"Terminating game {game_id}...")

        if not self.room_manager:
            print(f"Error: RoomManager not injected. Cannot terminate game {game_id}.")
            if game_id in self.active_games:
                del self.active_games[game_id]
            return

        record = fake_games_db.get(game_id)
        if not record:
            print(f"Error: GameRecord {game_id} not found in fake_db.")
            if game_id in self.active_games:
                del self.active_games[game_id]
            return

        room: Optional[Room] = None
        for r in self.room_manager.rooms.values():
            if r.game_record_id == game_id:
                room = r
                break
        
        if not room:
            print(f"Error: Room for game {game_id} not found in RoomManager.")
            if game_id in self.active_games:
                del self.active_games[game_id]
            return

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

        await self.room_manager.end_game(
            room=room,
            record=record,
            manager=self.conn_manager,
            winner=winner_user
        )

        if game_id in self.active_games:
            del self.active_games[game_id]
            print(f"GameInstance {game_id} removed from active_games.")
        else:
            print(f"Warning: GameInstance {game_id} not found in self.active_games.")
