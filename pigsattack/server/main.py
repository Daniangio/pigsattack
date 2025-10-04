import socket
import threading
import json
import time
from typing import List, Dict, Any, Optional, Tuple

# We assume the user's game files are in a package named 'pigsattack'
from pigsattack.game import Game
from pigsattack.card import Card
from pigsattack.player import Player # This now correctly uses the forward declaration
from pigsattack.view import GameView
from pigsattack.controller import PlayerController
from pigsattack.gamestate import GameState

# --- Server Configuration ---
# myipaddress = 158.47.246.62
HOST = '0.0.0.0'
PORT = 8080
MIN_PLAYERS = 2
MIN_TOTAL_PLAYERS = 2 # Min players including bots
MAX_PLAYERS = 8

# --- Global State ---
clients: Dict[socket.socket, Dict[str, Any]] = {}
game_instance: Optional[Game] = None
game_started = False
lock = threading.Lock()
client_inputs: Dict[int, str] = {}

# Import bot controller
from pigsattack.bot_controller import NaiveBotController
server_view = None # Will hold the ServerView instance

def reset_server_state():
    """Resets the server to its initial lobby state."""
    global game_instance, game_started, client_inputs
    game_instance = None
    game_started = False
    client_inputs = {}
    print("--- Server has been reset to lobby state. ---")

class NetworkController(PlayerController):
    """A controller that gets its input over the network via the ServerView."""
    def __init__(self, player_index: int, view: 'ServerView'):
        self.player_index = player_index
        self.view = view

    def _get_input(self, prompt: str, choices: Optional[List[Dict[str, Any]]] = None, mode: str = "buttons") -> str:
        """Sends a prompt to the client and blocks until an input is received."""
        self.view.prompt_for_input(self.player_index, prompt, choices, mode)
        
        while self.player_index not in client_inputs:
            if not game_started: return "" # Game ended while waiting
            time.sleep(0.1)
        
        with lock:
            user_input = client_inputs.pop(self.player_index, "")
        return user_input

    def choose_action(self, player: Player, game_state: GameState, available_actions: List[str]) -> str:
        choices = [{"text": action, "value": action} for action in available_actions]
        return self._get_input("Choose your action:", choices)
        
    def choose_to_ask_for_help(self, player: Player, game_state: GameState) -> bool:
        choices = [{"text": "Yes", "value": "yes"}, {"text": "No", "value": "no"}]
        return self._get_input("Ask others for help?", choices).lower() == 'yes'

    def offer_help(self, player: Player, attacker: Player, game_state: GameState) -> Optional[Card]:
        prompt = f"{attacker.name} is under attack! Click a card to offer, or click Skip."
        # Mode 'card_select' tells the client to make hand cards clickable
        card_id_str = self._get_input(prompt, mode="card_select")
        if card_id_str == 'skip':
            return None
        try:
            card_id = int(card_id_str)
            for card in player.hand:
                if card.card_id == card_id:
                    return card
        except (ValueError, TypeError):
            pass
        return None

    def choose_helper(self, player: Player, offers: List[Tuple[Player, Card]], game_state: GameState) -> Optional[Tuple[Player, Card]]:
        prompt = "Choose which offer of help to accept."
        choices = [
            {"text": f"{helper.name} offers {card}", "value": str(i)} 
            for i, (helper, card) in enumerate(offers)
        ]
        choice_idx_str = self._get_input(prompt, choices)
        try:
            choice_idx = int(choice_idx_str)
            if 0 <= choice_idx < len(offers):
                return offers[choice_idx]
        except (ValueError, TypeError):
            pass
        return None

    def choose_defense_cards(self, player: Player, game_state: GameState) -> List[Card]:
        prompt = "Select cards to defend (click cards, then 'Done')."
        # Mode 'multi_card_select' allows clicking multiple cards
        card_ids_str = self._get_input(prompt, mode="multi_card_select")
        if card_ids_str.lower() == 'done':
            return []
        try:
            card_ids = [int(s.strip()) for s in card_ids_str.split()]
            return [c for c in player.hand if c.card_id in card_ids]
        except (ValueError, TypeError):
            return []

    def choose_card_to_discard(self, player: Player, game_state: GameState, reason: str) -> Optional[Card]:
        prompt = f"{reason}. Click one card to discard."
        card_id_str = self._get_input(prompt, mode="card_select")
        try:
            card_id = int(card_id_str)
            for card in player.hand:
                if card.card_id == card_id:
                    return card
        except (ValueError, TypeError):
            pass
        return None
    
    def choose_wilderness_find_swap(self, player: Player, game_state: GameState) -> bool:
        choices = [{"text": "Yes, Swap", "value": "yes"}, {"text": "No, Keep", "value": "no"}]
        return self._get_input("Wilderness Find: Swap a card?", choices).lower() == 'yes'

    # Simplified versions for brevity; a full implementation would prompt for choices
    def choose_special_gear_card(self, p, cards, a): return cards[0]
    def choose_sabotage_target(self, p, targets, g): return targets[0]
    def choose_card_to_steal(self, p, target): return target.hand[0]


class ServerView(GameView):
    """A view that sends game information to all connected clients."""
    def _broadcast(self, message: Dict[str, Any]):
        message_json = json.dumps(message)
        with lock:
            for client_socket in list(clients.keys()):
                self._send(client_socket, message_json)

    def _send_to_player(self, player_index: int, message: Dict[str, Any]):
        message_json = json.dumps(message)
        with lock:
            for sock, client_data in clients.items():
                if client_data.get("player_id") == player_index:
                    self._send(sock, message_json)
                    break
    
    def _send(self, sock: socket.socket, message_json: str):
        try:
            sock.sendall(message_json.encode('utf-8') + b'\n')
        except:
            print(f"Failed to send to client {clients.get(sock, {}).get('addr')}. It may have disconnected.")

    def prompt_for_input(self, player_index: int, prompt_text: str, choices: Optional[List[Dict[str, Any]]], mode: str):
        self._send_to_player(player_index, {
            "type": "prompt",
            "prompt_text": prompt_text,
            "choices": choices,
            "input_mode": mode
        })

    def display_game_state(self, game_state: GameState):
        state_dict = {
            "type": "game_state",
            "num_players": game_state.num_players,
            "current_player_index": game_state.current_player_index,
            "is_nightfall": game_state.is_nightfall,
            "is_game_over": game_state.is_game_over,
            "players": [
                {
                    "name": p.name,
                    "is_eliminated": p.is_eliminated,
                    "has_barricade": p.has_barricade,
                    "hand": [{"repr": str(c), "id": c.card_id} for c in p.hand]
                } for p in game_state._players
            ],
            "discard_pile_top": str(game_state._deck.discard_pile[-1]) if game_state._deck.discard_pile else "Empty"
        }
        self._broadcast(state_dict)

    def display_event(self, event_card, event_name): self._broadcast({"type": "event", "message": f"EVENT: {event_name} ({event_card})"})
    def display_action_result(self, message: str): self._broadcast({"type": "event", "message": f"ACTION: {message}"})
    def announce_winner(self, player): self._broadcast({"type": "event", "message": f"GAME OVER! Winner is {player.name if player else 'NO ONE'}!"})
    def display_turn_start(self, player: Player): pass
    def display_player_hand(self, player: Player): self._broadcast({"type": "event", "message": f"It is now {player.name}'s turn."})
    def show_drawn_card(self, card: Card, action: str): pass
    def show_discard_pile(self, discard_pile: list): pass
    def display_attack(self, o, f, b): pass
    def display_defense_result(self, s, t, a): pass
    def display_event_result(self, message: str): self._broadcast({"type": "event", "message": f"{message}"})
    def announce_nightfall(self): pass
    def display_scout_ahead_result(self, s, r): pass
    def display_forage_result(self, s, i, c): pass


def handle_client(client_socket, addr):
    """Thread function to handle a single client connection."""
    player_id = -1
    with lock:
        # Find the first available player ID slot if any
        existing_ids = {data['player_id'] for data in clients.values()}
        for i in range(MAX_PLAYERS):
            if i not in existing_ids:
                player_id = i
                break
        
        if player_id == -1: # Should not happen due to main thread check
            client_socket.close()
            return

        clients[client_socket] = {"addr": addr, "player_id": player_id}
        print(f"New connection from {addr}, assigned Player {player_id + 1}")
    
    broadcast_lobby_update()

    try:
        buffer = ""
        while client_socket in clients:
            data = client_socket.recv(1024).decode('utf-8')
            if not data: break
            
            buffer += data
            while '\n' in buffer:
                message_str, buffer = buffer.split('\n', 1)
                try:
                    handle_client_message(player_id, json.loads(message_str))
                except json.JSONDecodeError:
                    print(f"Malformed JSON from Player {player_id + 1}: {message_str}")
    
    except ConnectionResetError:
        print(f"Player {player_id + 1} ({addr}) disconnected abruptly.")
    finally:
        with lock:
            if client_socket in clients:
                del clients[client_socket]
                print(f"Player {player_id + 1} ({addr}) has left.")
                if not clients and game_started:
                    reset_server_state()
        broadcast_lobby_update()
        client_socket.close()

def handle_client_message(player_id: int, message: Dict):
    global game_started, game_instance, server_view
    command = message.get("command")
    
    with lock:
        current_host_id = -1
        if clients:
            current_host_id = min(data['player_id'] for data in clients.values())

        if command == "start_game" and not game_started and player_id == current_host_id:
            num_human_players = len(clients)
            num_ai_players = message.get("num_ai", 0)
            total_players = num_human_players + num_ai_players

            if MIN_TOTAL_PLAYERS <= total_players <= MAX_PLAYERS:
                print(f"Host (Player {player_id + 1}) starting game with {num_human_players} humans and {num_ai_players} bots.")
                game_started = True
                
                # Create controllers for human players
                player_ids = sorted([data['player_id'] for data in clients.values()])
                controllers = [NetworkController(pid, server_view) for pid in player_ids]

                # Add bot controllers
                for _ in range(num_ai_players):
                    controllers.append(NaiveBotController())
                
                game_instance = Game(controllers, server_view)
                
                game_thread = threading.Thread(target=game_instance.run_game, daemon=True)
                game_thread.start()
            else:
                print(f"Start failed: {total_players} total players, need {MIN_TOTAL_PLAYERS}-{MAX_PLAYERS}.")

        elif command == "input" and game_started:
            client_inputs[player_id] = message.get("value")

def broadcast_lobby_update():
    with lock:
        if not game_started and clients:
            current_host_id = min(data['player_id'] for data in clients.values())
            status = {
                "type": "lobby_update", 
                "num_players": len(clients), 
                "min_players": MIN_PLAYERS,
                "max_players": MAX_PLAYERS
            }
            for sock, data in clients.items():
                payload = status.copy()
                payload["is_host"] = (data['player_id'] == current_host_id)
                payload["player_id"] = data['player_id']
                server_view._send(sock, json.dumps(payload))

def main():
    global server_view
    server_view = ServerView()
    server_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    server_socket.bind((HOST, PORT))
    server_socket.listen(MAX_PLAYERS)
    server_socket.settimeout(1.0)  # Unblock every second
    print(f"Server listening on {HOST}:{PORT}")

    try:
        while True:
            try:
                client_socket, addr = server_socket.accept()
                with lock:
                    if len(clients) >= MAX_PLAYERS or game_started:
                        print(f"Rejecting connection from {addr}, server full/game in progress.")
                        client_socket.close()
                        continue
                
                thread = threading.Thread(target=handle_client, args=(client_socket, addr), daemon=True)
                thread.start()
            except socket.timeout:
                # This is expected when no client connects within the timeout
                continue
    except KeyboardInterrupt:
        print("Shutting down server.")
    finally:
        server_socket.close()

if __name__ == "__main__":
    main()
