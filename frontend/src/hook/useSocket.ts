import { useState, useEffect, useRef } from 'react';
import { useGameStore } from '../state/gameStore';

export const useSocket = (url: string) => {
  const socket = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  
  // Get the state update function from our Zustand store
  const { setLobbies, setRoom, setView } = useGameStore();

  useEffect(() => {
    socket.current = new WebSocket(url);

    socket.current.onopen = () => {
      console.log('WebSocket Connected');
      setIsConnected(true);
    };

    socket.current.onclose = () => {
      console.log('WebSocket Disconnected');
      setIsConnected(false);
    };

    socket.current.onmessage = (event) => {
      const message = JSON.parse(event.data);
      console.log('Received:', message);

      // --- Message Router: Update state based on message type ---
      switch (message.type) {
        case 'lobby_list':
          setLobbies(message.lobbies);
          break;
        case 'room_update':
          setRoom(message.room);
          setView('room'); // Automatically switch to the room view
          break;
        case 'game_start':
            setView('game');
            break;
        // Add more cases for game_state_update, prompts, etc.
      }
    };
    
    // Cleanup on component unmount
    return () => {
      socket.current?.close();
    };
  }, [url, setLobbies, setRoom, setView]);

  const sendMessage = (message: object) => {
    if (socket.current && socket.current.readyState === WebSocket.OPEN) {
      socket.current.send(JSON.stringify(message));
    }
  };

  return { sendMessage, isConnected };
};
