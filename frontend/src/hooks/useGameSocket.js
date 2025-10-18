import { useRef, useCallback } from "react";
import { useStore } from "../store";

const useGameSocket = () => {
  const socketRef = useRef(null);
  const {
    setConnectionStatus,
    handleLobbyState,
    handleRoomState,
    handleAuthSuccess,
    handleGuestAuth,
    handleError,
    clearAuth,
  } = useStore.getState();

  const connect = useCallback((token) => {
    if (socketRef.current) return;

    const ws = new WebSocket("ws://localhost:8000/ws");
    socketRef.current = ws;

    ws.onopen = () => {
      console.log("WebSocket connected");
      setConnectionStatus(true);
      // Send auth token immediately after connection
      ws.send(JSON.stringify({ token }));
    };

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      console.log("Received message:", message);

      const { type, payload } = message;
      const actions = {
        guest_auth_success: handleGuestAuth,
        auth_success: handleAuthSuccess,
        lobby_state: handleLobbyState,
        room_state: handleRoomState,
        error: handleError,
      };

      actions[type]?.(payload);
    };

    ws.onclose = () => {
      console.log("WebSocket disconnected");
      socketRef.current = null;
      clearAuth(); // Reset state on disconnect
    };
  }, []);

  const disconnect = useCallback(() => socketRef.current?.close(), []);

  return { connect, disconnect, isConnected: useStore((s) => s.isConnected) };
};

export default useGameSocket;
