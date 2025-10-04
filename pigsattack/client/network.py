from __future__ import annotations
import socket
import threading
import json
from typing import TYPE_CHECKING, Dict, Any, Optional
from queue import Queue, Empty

if TYPE_CHECKING:
    from .client import Client

class NetworkManager:
    def __init__(self, client: Client, host: str, port: int):
        self.client = client
        self.host = host
        self.port = port
        self.socket: Optional[socket.socket] = None
        self.listener_thread: Optional[threading.Thread] = None
        self.stop_event = threading.Event()
        self.message_queue = Queue()

    def connect(self) -> bool:
        try:
            self.socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            self.socket.connect((self.host, self.port))
            self.stop_event.clear()
            self.listener_thread = threading.Thread(target=self._listen, daemon=True)
            self.listener_thread.start()
            return True
        except (ConnectionRefusedError, OSError) as e:
            print(f"Connection failed: {e}")
            self.socket = None
            return False

    def disconnect(self):
        self.stop_event.set()
        if self.socket:
            self.socket.close()
            self.socket = None
        if self.listener_thread and self.listener_thread.is_alive():
            self.listener_thread.join(timeout=1)

    def send_message(self, message: Dict[str, Any]):
        if self.socket and not self.stop_event.is_set():
            try:
                payload = json.dumps(message).encode('utf-8') + b'\n'
                self.socket.sendall(payload)
            except OSError as e:
                print(f"Send error: {e}")
                self.disconnect()

    def get_message(self) -> Optional[Dict[str, Any]]:
        try:
            return self.message_queue.get_nowait()
        except Empty:
            return None

    def _listen(self):
        buffer = ""
        while not self.stop_event.is_set() and self.socket:
            try:
                data = self.socket.recv(4096).decode('utf-8')
                if not data: break
                buffer += data
                while '\n' in buffer:
                    message_str, buffer = buffer.split('\n', 1)
                    self.message_queue.put(json.loads(message_str))
            except (OSError, json.JSONDecodeError):
                break
        # If the loop breaks, it means the connection is lost.
        # Signal the main thread to handle the disconnection state change.
        if not self.stop_event.is_set():
            print("Connection to server lost. Shutting down client.")
            self.client._running = False