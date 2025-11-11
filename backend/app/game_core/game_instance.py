"""
The new GameInstance class (Refactored).

This class composes all the refactored services into a single, functional
game instance. It initializes the services, owns the state, and provides
the primary external-facing methods (`player_action`, `public_preview_defense`).
"""

from typing import List, Dict, Any
from pydantic import ValidationError

# Import the services
from .game_services.game_setup import GameSetupService
from .game_services.validation import GameValidator
from .game_services.calculation import GameCalculationService
from .game_services.phase_manager import GamePhaseManager
from .game_services.action_handler import GameActionHandler, ActionDispatcher

# Import models
from ..server_models import GameParticipant
from .game_models import PlayerState, GameState, PlayerStatus

# Custom exception for validation errors
class InvalidActionError(ValueError):
    """Custom exception for failed game logic validation."""
    pass

class GameInstance:
    """
    Manages the state and logic for a single game by composing
    the various game services.
    """
    
    def __init__(self, game_id: str, participants: List[GameParticipant]):
        """
        Creates, initializes, and wires up a new game instance.
        """
        # 1. Create the base GameState
        self.state: GameState = GameSetupService.create_game(game_id, participants)
        
        # 2. Initialize all services in the correct dependency order
        #    (Validator and Calculator are stateless or read-only)
        self.validator = GameValidator(self.state)
        self.calculator = GameCalculationService(self.state, self.validator)
        
        #    (PhaseManager is stateful, owns the scrap pool)
        self.phase_manager = GamePhaseManager(self.state, self.calculator, self.validator)
        
        #    (ActionHandler executes logic, needs PhaseManager for transitions)
        self.action_handler = GameActionHandler(self.state, self.validator, self.phase_manager)
        
        #    (Dispatcher routes validated commands)
        self.dispatcher = ActionDispatcher(self.action_handler, self.validator)
        
        self.state.add_log(f"Game instance {game_id} created and services initialized.")
        
        # 3. Perform initial state setup (scrap, market)
        #    (This was missing from game_setup.py)
        for player in self.state.players.values():
            if player.status == PlayerStatus.ACTIVE:
                self.phase_manager.draw_random_scrap(player, 2)
        
        self.phase_manager.refill_market()
        self.state.add_log("Initial scrap drawn and market stocked.")
        
        # 4. Log initial game state
        self.state.add_log(f"--- ROUND {self.state.round} (Era {self.state.era}) ---")
        self.state.add_log("--- PLANNING PHASE ---")
        self.state.add_log("All players: Plan your Lure and Action cards.")

    async def player_action(
        self, 
        player_id: str, 
        action: str, 
        payload: Dict[str, Any],
        conn_manager: Any # Placeholder for ConnectionManager
    ) -> bool:
        """
        Main entry point for all player actions.
        Validates, dispatches, and handles errors.
        """
        player: PlayerState = None
        try:
            player = self.state.players.get(player_id)
            if not player:
                raise InvalidActionError(f"Player {player_id} not found.")
            
            if player.status != PlayerStatus.ACTIVE and action not in ["disconnect", "surrender"]:
                 raise InvalidActionError(f"You are not an active player.")
                
            self.state.add_log(f"Player {player.username} attempting action: {action}")
            
            # Dispatch to the new action handler
            await self.dispatcher.dispatch(player, action, payload)
            
            # If we get here, the action was successful
            return True

        except (InvalidActionError, ValidationError, ValueError) as e:
            # Send a specific error message back to the player
            error_message = str(e)
            self.state.add_log(f"Invalid action from {player_id}: {error_message}")
            if conn_manager:
                await conn_manager.send_to_user(
                    player_id,
                    {"type": "error", "payload": {"message": error_message}}
                )
            return False # State did not change
        
        except Exception as e:
            # Handle unexpected system errors
            error_message = f"An unexpected server error occurred: {e}"
            self.state.add_log(f"CRITICAL ERROR for {player_id}: {error_message}")
            if conn_manager:
                await conn_manager.send_to_user(
                    player_id,
                    {"type": "error", "payload": {"message": error_message}}
                )
            return False # State did not change

    def public_preview_defense(self, player_id: str, defense_payload: Dict[str, Any]) -> Dict[str, Any]:
        """
        READ-ONLY.
        Delegates to the Calculation Service.
        """
        return self.calculator.public_preview_defense(player_id, defense_payload)