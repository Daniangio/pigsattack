from fastapi import (FastAPI, WebSocket, WebSocketDisconnect, Depends, Request)
from fastapi.middleware.cors import CORSMiddleware
from typing import Dict, Any
import uuid

from .connection_manager import ConnectionManager
from .room_manager import RoomManager
from .server_models import User
from .routers import router as auth_router
from .player_router import router as player_router
from .routers import fake_users_db 
from .security import get_current_user

# --- GAME CORE IMPORTS ---
from .game_manager import GameManager
from game_core import PlayerStatus
from backend.app import security


app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix="/api")
app.include_router(player_router, prefix="/api")


# --- SINGLETON INSTANCES ---
connection_manager = ConnectionManager()
room_manager = RoomManager()
game_manager = GameManager(connection_manager)
# --- DEPENDENCY INJECTION ---
room_manager.set_game_manager(game_manager)
game_manager.set_room_manager(room_manager)
# --- END INJECTION ---


@app.get("/api/health")
def health_check():
    return {"status": "ok"}


# --- HTTP Endpoint for Defense Preview (Unchanged) ---
@app.post("/api/game/{game_id}/preview_defense")
async def http_preview_defense(
    game_id: str,
    payload: Dict[str, Any], 
    user: User = Depends(get_current_user)
):
    result = await game_manager.preview_defense(
        game_id=game_id,
        player_id=user.id,
        payload=payload
    )
    return result

# --- HTTP Endpoint for Fight Preview ---
@app.post("/api/game/{game_id}/preview_fight")
async def http_preview_fight(
    game_id: str,
    payload: Dict[str, Any],
    user: User = Depends(get_current_user)
):
    result = await game_manager.preview_fight(
        game_id=game_id,
        player_id=user.id,
        payload=payload
    )
    return result


# The main WebSocket endpoint
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """
    The main WebSocket endpoint for handling all real-time communication.
    """
    user_id_for_cleanup: str = None
    user: User = None
    try:
        await websocket.accept()

        auth_data = await websocket.receive_json()
        token = auth_data.get("token")
        
        if token:
            user = get_current_user(token=token)
            await websocket.send_json({
                "type": "auth_success",
                "payload": user.model_dump(),
                "token": token 
            })
        else:
            guest_id = f"guest_{str(uuid.uuid4())[:8]}"
            user = User(id=guest_id, username=guest_id)
            # --- FIX: Create a token for the guest user ---
            token = security.create_access_token(
                data={"sub": user.username, "username": user.username}
            )
            fake_users_db[guest_id] = user
            await websocket.send_json({
                "type": "guest_auth_success", 
                "payload": user.model_dump(),
                "token": token # Send the token to the guest client
            })

        user_id_for_cleanup = user.id
        await connection_manager.add_connection(user.id, websocket)
        
        # --- RECONNECTION LOGIC ---
        # If send_user_current_state returns False, it means the user was not in a
        # game or room, so we should add them to the lobby and broadcast.
        is_reconnected = await room_manager.send_user_current_state(user, connection_manager)
        if not is_reconnected:
            await room_manager.add_user_to_lobby(user, connection_manager)
        # --- END RECONNECTION/JOIN LOGIC ---

        # Main message loop
        while True:
            data = await websocket.receive_json()
            action = data.get("action")
            payload = data.get("payload", {})

            # --- Authoritative Game Check ---
            current_game_id, current_room = room_manager.find_room_by_user(user.id)
            
            player_status = None
            game_instance = None
            if current_room and current_room.game_record_id and game_manager.active_games.get(current_room.game_record_id):
                game_instance = game_manager.active_games.get(current_room.game_record_id)
                player_state = game_instance.state.players.get(user.id)
                if player_state:
                    player_status = player_state.status

            if game_instance and player_status == PlayerStatus.ACTIVE:
                # --- User is IN-GAME ---
                if action == "game_action":
                    sub_action = payload.get("sub_action")
                    sub_payload = payload.get("data", {})
                    if not sub_action: continue
                    await game_manager.player_action(
                        game_id=current_room.game_record_id,
                        player_id=user.id,
                        action=sub_action,
                        payload=sub_payload
                    )
                elif action == "surrender":
                    await game_manager.player_action(
                        game_id=current_room.game_record_id,
                        player_id=user.id,
                        action="surrender",
                        payload={}
                    )
                elif action == "request_game_state":
                    await game_manager.broadcast_game_state(
                        current_room.game_record_id, 
                        specific_user_id=user.id
                    )
                elif action in ("create_room", "join_room", "leave_room", "start_game"):
                    await connection_manager.send_to_user(user.id, {
                        "type": "error",
                        "payload": {"message": f"Cannot '{action}' while in an active game."}
                    })
                
                continue 
            
            # --- User is NOT IN-GAME ---
            if action == "create_room":
                await room_manager.create_room(user, payload.get("room_name"), connection_manager)
            elif action == "join_room":
                await room_manager.join_room(user, payload.get("room_id"), connection_manager)
            elif action == "spectate_game":
                await room_manager.spectate_game(user, payload.get("game_record_id"), connection_manager)
            elif action == "leave_room":
                await room_manager.leave_room_pre_game(user, connection_manager)
            elif action == "start_game":
                await room_manager.start_game(user, connection_manager)
            elif action == "return_to_lobby":
                await room_manager.return_to_lobby(user, connection_manager)
            
            # 'request_view' is gone.
                
    except WebSocketDisconnect:
        if user_id_for_cleanup:
            await room_manager.handle_disconnect(user_id_for_cleanup, connection_manager)
            connection_manager.disconnect(user_id_for_cleanup)
    except Exception as e:
        print(f"An error occurred with user {user_id_for_cleanup or 'unknown'}: {e}")
        if user_id_for_cleanup:
            await room_manager.handle_disconnect(user_id_for_cleanup, connection_manager)
            connection_manager.disconnect(user_id_for_cleanup)
