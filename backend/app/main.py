from fastapi import FastAPI
app = FastAPI()
@app.get("/")
def read_root():
    return {"Hello": "World"}

# from fastapi import FastAPI, WebSocket, WebSocketDisconnect
# import asyncio
# import uuid
# from typing import Dict, List, Any, Optional

# # --- Your Core Game Logic Integration ---
# # I am integrating the necessary classes from the files you provided.
# # In your actual project, these would be in separate files and imported.

# class Card:
#     def __init__(self, suit: str, rank: str, value: int, card_id: int):
#         self.suit, self.rank, self.value, self.card_id = suit, rank, value, card_id
#     def __repr__(self): return f"{self.rank} of {self.suit}"
#     def to_dict(self): return {"repr": str(self), "id": self.card_id, "value": self.value}

# class Deck:
#     def __init__(self):
#         self.cards: List[Card] = []
#         self.discard_pile: List[Card] = []
#         card_id = 0
#         for suit in ["Hearts", "Diamonds", "Clubs", "Spades"]:
#             for rank, value in {"2":2,"3":3,"4":4,"5":5,"6":6,"7":7,"8":8,"9":9,"10":10,"J":11,"Q":12,"K":13,"A":14}.items():
#                 self.cards.append(Card(suit, rank, value, card_id))
#                 card_id += 1
#         import random
#         random.shuffle(self.cards)
#     def draw(self):
#         if not self.cards: self.reshuffle()
#         return self.cards.pop() if self.cards else None
#     def reshuffle(self):
#         print("Reshuffling discard pile.")
#         self.cards.extend(self.discard_pile)
#         self.discard_pile = []
#         import random
#         random.shuffle(self.cards)

# class Player:
#     def __init__(self, name: str):
#         self.name = name
#         self.hand: List[Card] = []
#         self.is_eliminated = False
#     def to_dict(self):
#         return {"name": self.name, "is_eliminated": self.is_eliminated, "hand": [c.to_dict() for c in self.hand]}

# class Game:
#     def __init__(self, player_names: List[str], broadcast_callback):
#         self.players = [Player(name) for name in player_names]
#         self.deck = Deck()
#         self.broadcast = broadcast_callback # Function to send state to clients
#         self.current_player_idx = 0
#         self.is_over = False
#         print(f"Game started with: {', '.join(player_names)}")
#         # Initial deal
#         for p in self.players:
#             for _ in range(3): p.hand.append(self.deck.draw())

#     async def run_game_loop(self):
#         while not self.is_over:
#             await self.broadcast_game_state()
#             # This is where your turn-based logic from game.py would go.
#             # For this example, we'll simulate a simple turn.
#             await asyncio.sleep(5) 
#             self.current_player_idx = (self.current_player_idx + 1) % len(self.players)
#             if self.current_player_idx == 0: # Simulate end of round
#                 print("Simulating end of round.")
#                 if len([p for p in self.players if not p.is_eliminated]) <= 1:
#                     self.is_over = True
#         print("Game Over!")
#         await self.broadcast_game_state() # Final state broadcast
        
#     async def surrender_player(self, client_id: str):
#         player = next((p for p in self.players if p.name == client_id), None)
#         if player and not player.is_eliminated:
#             player.is_eliminated = True
#             print(f"Player {client_id} has surrendered/disconnected from the game.")
#             # Check for winner
#             active_players = [p for p in self.players if not p.is_eliminated]
#             if len(active_players) <= 1:
#                 self.is_over = True
#             await self.broadcast_game_state()

#     async def broadcast_game_state(self):
#         state = {
#             "type": "game_state",
#             "players": [p.to_dict() for p in self.players],
#             "current_player": self.players[self.current_player_idx].name,
#             "is_over": self.is_over
#         }
#         await self.broadcast(state)


# # --- WebSocket and Game Management ---

# class ConnectionManager:
#     def __init__(self):
#         self.active_connections: Dict[str, WebSocket] = {}
#     async def connect(self, websocket: WebSocket, client_id: str):
#         await websocket.accept()
#         self.active_connections[client_id] = websocket
#         print(f"Client connected: {client_id}")
#     def disconnect(self, client_id: str):
#         if client_id in self.active_connections: del self.active_connections[client_id]
#         print(f"Client disconnected: {client_id}")
#     async def broadcast(self, message: dict):
#         for connection in self.active_connections.values(): await connection.send_json(message)

# class GameRoom:
#     def __init__(self, name: str, host_id: str, manager: 'GameManager'):
#         self.id, self.name, self.host_id, self.manager = str(uuid.uuid4()), name, host_id, manager
#         self.clients: Dict[str, WebSocket] = {host_id: manager.conn_manager.active_connections[host_id]}
#         self.bots: List[str] = []
#         self.in_game = False
#         self.game_instance: Optional[Game] = None

#     def get_player_names(self) -> List[str]: return list(self.clients.keys()) + self.bots
    
#     async def broadcast(self, message: dict):
#         for client_ws in self.clients.values(): await client_ws.send_json(message)

#     async def broadcast_room_update(self):
#         await self.broadcast({"type": "room_update", "room": self.to_dict()})

#     async def add_client(self, client_id: str, websocket: WebSocket):
#         if not self.in_game and len(self.get_player_names()) < 5:
#             self.clients[client_id] = websocket
#             await self.broadcast_room_update()

#     async def remove_client(self, client_id: str):
#         if client_id in self.clients:
#             del self.clients[client_id]
#             # --- DISCONNECT LOGIC ---
#             if self.in_game and self.game_instance:
#                 # If in game, the player surrenders but the game continues
#                 await self.game_instance.surrender_player(client_id)
#             elif client_id == self.host_id:
#                 # If host leaves a lobby, dismantle the room
#                 await self.manager.dismantle_room(self.id)
#             elif self.clients:
#                 # If a non-host leaves a lobby, update remaining players
#                 if self.host_id not in self.clients: self.host_id = list(self.clients.keys())[0] # Promote new host
#                 await self.broadcast_room_update()
#             else: # Room is now empty
#                 await self.manager.dismantle_room(self.id)

#     async def add_bot(self):
#         if not self.in_game and len(self.get_player_names()) < 5:
#             self.bots.append(f"Bot_{len(self.bots) + 1}")
#             await self.broadcast_room_update()

#     async def remove_bot(self):
#         if not self.in_game and self.bots:
#             self.bots.pop()
#             await self.broadcast_room_update()

#     async def start_game(self):
#         if len(self.get_player_names()) >= 2:
#             self.in_game = True
#             await self.broadcast({"type": "game_start"})
#             await self.broadcast_room_update()
#             # Create and run the game instance
#             self.game_instance = Game(player_names=self.get_player_names(), broadcast_callback=self.broadcast)
#             asyncio.create_task(self.game_instance.run_game_loop())

#     def to_dict(self):
#         return {"id": self.id, "name": self.name, "players": self.get_player_names(), "host": self.host_id, "in_game": self.in_game}

# class GameManager:
#     def __init__(self, conn_manager: ConnectionManager):
#         self.conn_manager, self.rooms = conn_manager, {}
        
#     async def handle_disconnect(self, client_id: str):
#         """Main entry point for handling a client disconnection."""
#         room_to_update = next((room for room in self.rooms.values() if client_id in room.clients), None)
#         if room_to_update:
#             await room_to_update.remove_client(client_id)
#         await self.broadcast_lobby_list()

#     async def handle_message(self, client_id: str, websocket: WebSocket, message: dict):
#         command, room_id = message.get("command"), message.get("room_id")
#         room = self.rooms.get(room_id) if room_id else None
        
#         if command == "create_room":
#             new_room = GameRoom(name=message.get("name", "New Game"), host_id=client_id, manager=self)
#             self.rooms[new_room.id] = new_room
#             await new_room.broadcast_room_update()
#         elif command == "surrender" and room and room.in_game and room.game_instance:
#              await room.game_instance.surrender_player(client_id)
#         elif room and command == "join_room": await room.add_client(client_id, websocket)
#         elif room and command == "leave_room": await room.remove_client(client_id)
#         elif room and command == "add_bot" and room.host_id == client_id: await room.add_bot()
#         elif room and command == "remove_bot" and room.host_id == client_id: await room.remove_bot()
#         elif room and command == "start_game" and room.host_id == client_id:
#             await room.start_game()
        
#         await self.broadcast_lobby_list()

#     async def dismantle_room(self, room_id: str):
#         if room_id in self.rooms:
#             room = self.rooms.pop(room_id)
#             await room.broadcast({"type": "dismantle_room"})
#             print(f"Dismantled room {room_id}")
#             await self.broadcast_lobby_list()

#     async def broadcast_lobby_list(self):
#         await self.conn_manager.broadcast({
#             "type": "lobby_list", "lobbies": [r.to_dict() for r in self.rooms.values() if not r.in_game]
#         })

# # --- FastAPI Application ---
# app = FastAPI()
# conn_manager = ConnectionManager()
# game_manager = GameManager(conn_manager)

# @app.get("/")
# async def read_root(): return {"status": "ok"}

# @app.websocket("/ws/{client_id}")
# async def websocket_endpoint(websocket: WebSocket, client_id: str):
#     await conn_manager.connect(websocket, client_id)
#     await game_manager.broadcast_lobby_list()
#     try:
#         while True:
#             data = await websocket.receive_json()
#             await game_manager.handle_message(client_id, websocket, data)
#     except WebSocketDisconnect:
#         conn_manager.disconnect(client_id)
#         # --- THIS IS THE KEY ---
#         # When a client disconnects, this logic is triggered.
#         await game_manager.handle_disconnect(client_id)