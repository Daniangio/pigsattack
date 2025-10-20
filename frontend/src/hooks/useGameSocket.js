import { useRef, useCallback } from "react";
import { useStore } from "../store";

const useGameSocket = () => {
  const socketRef = useRef(null);
  const {
    setConnectionStatus,
    handleStateUpdate, // <-- The new unified handler
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
        error: handleError,
        state_update: handleStateUpdate, // <-- Route the new message type
      };

      actions[type]?.(payload);
    };

    ws.onclose = () => {
      console.log("WebSocket disconnected");
      socketRef.current = null;
      setConnectionStatus(false);
      // If the user had a token, they are a registered user.
      // A disconnect for them means they need to be logged out.
      if (useStore.getState().token) {
        clearAuth();
      }
    };
  }, []);

  const disconnect = useCallback(() => socketRef.current?.close(), []);

  const sendMessage = useCallback((message) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(message));
    }
  }, []);

  return {
    connect,
    disconnect,
    sendMessage,
    isConnected: useStore((s) => s.isConnected),
  };
};

export default useGameSocket;
