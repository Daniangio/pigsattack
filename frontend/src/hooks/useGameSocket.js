import { useRef, useCallback } from "react";
import { useStore } from "../store";

const useGameSocket = () => {
  const socketRef = useRef(null);
  const {
    setConnectionStatus,
    handleStateUpdate,
    handleAuthSuccess,
    handleGuestAuth,
    handleError,
    clearAuth,
    handleGameStateUpdate, // Ensure this is destructured from the store
  } = useStore.getState();

  const connect = useCallback(
    (token) => {
      if (socketRef.current) return;

      const ws = new WebSocket("ws://localhost:8000/ws");
      socketRef.current = ws;

      ws.onopen = () => {
        console.log("WebSocket connected");
        setConnectionStatus(true);
        // Send auth token immediately after connection
        // Send as an object, as expected by the backend
        ws.send(JSON.stringify({ token }));
      };

      ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        console.log("Received message:", message);

        const { type, payload } = message;

        // --- FIX: This is the corrected, single actions map ---
        // It now correctly includes all message types.
        const actions = {
          guest_auth_success: handleGuestAuth,
          auth_success: handleAuthSuccess,
          error: handleError,
          state_update: handleStateUpdate,
          game_state_update: handleGameStateUpdate, // <-- This was the missing route
        };

        // Call the appropriate handler based on the message type
        if (actions[type]) {
          actions[type](payload);
        } else {
          console.warn(`No handler for message type: ${type}`);
        }
      };
      // --- END FIX: The duplicate, out-of-scope 'actions' block has been removed ---

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

      ws.onerror = (err) => {
        console.error("WebSocket error:", err);
        handleError({ message: "WebSocket connection error." });
      };
    },
    [
      setConnectionStatus,
      handleStateUpdate,
      handleAuthSuccess,
      handleGuestAuth,
      handleError,
      clearAuth,
      handleGameStateUpdate,
    ]
  ); // Add all store actions to dependency array

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.close();
    }
  }, []);

  const sendMessage = useCallback((message) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(message));
    } else {
      console.warn("WebSocket not connected. Message not sent:", message);
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
