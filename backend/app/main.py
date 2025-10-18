from fastapi import (FastAPI, WebSocket, WebSocketDisconnect, Depends, Request)
from fastapi.middleware.cors import CORSMiddleware
from typing import Dict
import uuid

from .connection_manager import ConnectionManager
from .room_manager import RoomManager
from .models import User
from .routers import router
from .security import get_current_user

app = FastAPI()

# CORS (Cross-Origin Resource Sharing)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
)

# Include the authentication router
app.include_router(router, prefix="/api")

# Singleton instances of our managers
connection_manager = ConnectionManager()
room_manager = RoomManager()


@app.get("/api/health")
def health_check():
    return {"status": "ok"}

# The main WebSocket endpoint
@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """
    The main WebSocket endpoint for handling all real-time communication.
    A client connects with a token which is used for initial identification.
    """
    user_id_for_cleanup: str = None
    try:
        # First, accept the connection
        await websocket.accept()

        # The first message from the client must be an auth token
        auth_data = await websocket.receive_json()
        token = auth_data.get("token")
        
        if token:
            # Authenticated user
            user: User = get_current_user(token=token)
            # Send a specific message to the authenticated client to confirm their identity
            await websocket.send_json({
                "type": "auth_success", "payload": user.model_dump()
            })
        else:
            # Guest user
            guest_id = f"guest_{str(uuid.uuid4())[:8]}"
            user = User(id=guest_id, username=guest_id)
            # Send a specific message to the guest client to confirm their identity
            await websocket.send_json({
                "type": "guest_auth_success", "payload": user.model_dump()
            })

        user_id_for_cleanup = user.id
        await connection_manager.add_connection(user.id, websocket)
        
        # Add user to the lobby and broadcast the new lobby state
        await room_manager.add_user_to_lobby(user, connection_manager)

        # Main message loop
        while True:
            data = await websocket.receive_json()
            action = data.get("action")
            payload = data.get("payload", {})

            if action == "create_room":
                await room_manager.create_room(user, payload.get("room_name"), connection_manager)
            elif action == "join_room":
                await room_manager.join_room(user, payload.get("room_id"), connection_manager)
            elif action == "leave_room":
                await room_manager.leave_room(user, connection_manager)
            # Add other game-related actions here later

    except WebSocketDisconnect:
        if user_id_for_cleanup:
            # Handle user disconnection
            await room_manager.handle_disconnect(user_id_for_cleanup, connection_manager)
            connection_manager.disconnect(user_id_for_cleanup)
    except Exception as e:
        print(f"An error occurred with user {user_id_for_cleanup or 'unknown'}: {e}")
        if user_id_for_cleanup:
            connection_manager.disconnect(user_id_for_cleanup)
