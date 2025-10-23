from fastapi import (FastAPI, WebSocket, WebSocketDisconnect, Depends, Request)
from fastapi.middleware.cors import CORSMiddleware
from typing import Dict
import uuid

from .connection_manager import ConnectionManager
from .room_manager import RoomManager
from .models import User
from .routers import router as auth_router
from .player_router import router as player_router
from .routers import fake_users_db 
from .security import get_current_user

# --- NEW GAME CORE IMPORTS ---
from .game_manager import GameManager
# --- END NEW IMPORTS ---


app = FastAPI()

# CORS (Cross-Origin Resource Sharing)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
)

app.include_router(auth_router, prefix="/api")
app.include_router(player_router, prefix="/api")


# --- SINGLETON INSTANCES ---
# We now have three managers
connection_manager = ConnectionManager()
room_manager = RoomManager()
game_manager = GameManager(connection_manager) # Inject ConnectionManager

# --- DEPENDENCY INJECTION ---
# Give the RoomManager a reference to the GameManager
# so it can create games.
room_manager.set_game_manager(game_manager)

# Give the GameManager a reference to the RoomManager
# so it can terminate games and send players to post-game.
game_manager.set_room_manager(room_manager)
# --- END INJECTION ---


@app.get("/api/health")
def health_check():
    return {"status": "ok"}

# The main WebSocket endpoint
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """
    The main WebSocket endpoint for handling all real-time communication.
    """
    user_id_for_cleanup: str = None
    user: User = None
    try:
        # First, accept the connection
        await websocket.accept()

        # The first message from the client must be an auth token
        auth_data = await websocket.receive_json()
        token = auth_data.get("token")
        
        if token:
            user = get_current_user(token=token)
            await websocket.send_json({
                "type": "auth_success", "payload": user.model_dump()
            })
        else:
            guest_id = f"guest_{str(uuid.uuid4())[:8]}"
            user = User(id=guest_id, username=guest_id)
            fake_users_db[guest_id] = user
            await websocket.send_json({
                "type": "guest_auth_success", "payload": user.model_dump()
            })

        user_id_for_cleanup = user.id
        await connection_manager.add_connection(user.id, websocket)
        
        # --- RECONNECTION LOGIC ---
        # Check if user is in a game
        game_id = room_manager.find_game_by_user(user.id)
        if game_id:
            print(f"User {user.username} reconnected to active game {game_id}.")
            # The GameManager will send the latest state
            await game_manager.broadcast_game_state(game_id)
        
        # Check if user is in a pre-game room
        elif room_manager.find_room_by_user(user.id, include_spectators=True)[0]:
             await room_manager.handle_user_state_request(user, connection_manager)
        
        else:
            # If not in a game or room, add to lobby
            await room_manager.add_user_to_lobby(user, connection_manager)

        # Main message loop
        while True:
            data = await websocket.receive_json()
            action = data.get("action")
            payload = data.get("payload", {})

            # --- REFACTORED ROUTING LOGIC ---
            
            # --- Authoritative Game Check ---
            # First, check if this user is in an active game.
            current_game_id, current_room = room_manager.find_room_by_user(user.id)
            is_in_game = (current_room and 
                          current_room.status == "in_game" and 
                          current_room.game_record_id)

            if is_in_game:
                # --- User is IN-GAME ---
                # Only allow game-related actions
                
                if action == "game_action":
                    await game_manager.handle_game_action(
                        user=user,
                        game_id=current_room.game_record_id,
                        action=payload.get("game_action"), # e.g., "submit_plan"
                        payload=payload.get("data", {})     # e.g., {"lure": "...", "action": "..."}
                    )
                
                elif action == "surrender":
                    await room_manager.handle_surrender(user, connection_manager)
                
                elif action == "request_view":
                    # --- REFACTOR FIX ---
                    # User is in a game but requesting a pre-game view (e.g., "lobby")
                    # Deny the request and send them the game state instead.
                    print(f"User {user.username} requested view {payload.get('view')}, but is in game. Sending game state.")
                    await game_manager.broadcast_game_state(current_room.game_record_id)
                
                elif action == "request_game_state":
                    # Explicit action to get back to game
                    await game_manager.broadcast_game_state(current_room.game_record_id)

                elif action in ("create_room", "join_room", "leave_room", "start_game", "return_to_lobby"):
                    # Ignore other lobby/room actions while in-game
                    print(f"User {user.username} in game, ignoring action: {action}")
                    # Optionally send an error message to the client here
                    await connection_manager.send_to_user(user.id, {
                        "type": "error",
                        "payload": {"message": f"Cannot '{action}' while in an active game."}
                    })
                
                # Use 'continue' to skip the non-game logic below
                continue 
            
            # --- User is NOT IN-GAME ---
            # Process lobby/room actions as normal
            
            if action == "create_room":
                await room_manager.create_room(user, payload.get("room_name"), connection_manager)
            elif action == "join_room":
                await room_manager.join_room(user, payload.get("room_id"), connection_manager)
            elif action == "leave_room":
                await room_manager.leave_room_pre_game(user, connection_manager)
            elif action == "start_game":
                # This action transitions the user to the in_game state
                await room_manager.start_game(user, connection_manager)
            elif action == "return_to_lobby":
                # This is for post-game
                await room_manager.return_to_lobby(user, connection_manager)
            elif action == "request_view":
                # User is not in a game, so this is fine.
                await room_manager.handle_view_request(user, payload, connection_manager)
                
            # --- END ROUTING ---


    except WebSocketDisconnect:
        if user_id_for_cleanup:
            # Handle user disconnection
            await room_manager.handle_disconnect(user_id_for_cleanup, connection_manager)
            connection_manager.disconnect(user_id_for_cleanup)
    except Exception as e:
        print(f"An error occurred with user {user_id_for_cleanup or 'unknown'}: {e}")
        if user_id_for_cleanup:
            connection_manager.disconnect(user_id_for_cleanup)
