import { useRef, useCallback, useEffect } from "react"; // --- FIX: Import useEffect
import { useStore } from "../store";

const useGameSocket = () => {
  const socketRef = useRef(null);

  // --- FIX: Use individual selectors to get store actions ---
  // This is the idiomatic way and ensures functions are stable
  // and properly subscribed to by the hook.
  const setConnectionStatus = useStore((state) => state.setConnectionStatus);
  const handleStateUpdate = useStore((state) => state.handleStateUpdate);
  const handleAuthSuccess = useStore((state) => state.handleAuthSuccess);
  const handleGuestAuth = useStore((state) => state.handleGuestAuth);
  const handleError = useStore((state) => state.handleError);
  const clearAuth = useStore((state) => state.clearAuth);
  const handleGameStateUpdate = useStore(
    (state) => state.handleGameStateUpdate
  );
  const setSendMessage = useStore((state) => state.setSendMessage);
  // --- END FIX ---

  const connect = useCallback(
    (token) => {
      if (socketRef.current) return;

      const ws = new WebSocket("ws://localhost:8000/ws");
      socketRef.current = ws;

      ws.onopen = () => {
        console.log("WebSocket connected");
        setConnectionStatus(true);
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
          state_update: handleStateUpdate,
          game_state_update: handleGameStateUpdate,
        };

        if (actions[type]) {
          actions[type](payload);
        } else {
          console.warn(`No handler for message type: ${type}`);
        }
      };

      ws.onclose = () => {
        console.log("WebSocket disconnected");
        socketRef.current = null;
        setConnectionStatus(false);

        // --- CRITICAL FIX ---
        // We DO NOT clearAuth() here. A simple disconnect (like a wifi
        // flicker) should not log the user out. It should just set
        // isConnected to false and allow the app to attempt reconnection.
        // clearAuth() should ONLY be called from a user's explicit logout
        // or an auth_failed message from the server.
        //
        // if (useStore.getState().token) {
        //   clearAuth();
        // }
        // --- END FIX ---
      };

      ws.onerror = (err) => {
        console.error("WebSocket error:", err);
        handleError({ message: "WebSocket connection error." });
      };
    },
    [
      // The dependency array is now correct
      setConnectionStatus,
      handleStateUpdate,
      handleAuthSuccess,
      handleGuestAuth,
      handleError,
      clearAuth,
      handleGameStateUpdate,
    ]
  );

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.close();
    }
  }, []);

  const sendMessage = useCallback((message) => {
    // --- CRITICAL FIX ---
    // Throw an error if the socket is not open. This prevents
    // silent failures and allows UI components to handle the error
    // (e.g., stop a loading spinner).
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(message));
    } else {
      console.warn("WebSocket not connected. Message not sent:", message);
      throw new Error("WebSocket not connected.");
    }
    // --- END FIX ---
  }, []);

  // --- FIX: This effect runs when the hook is used (in App.jsx) ---
  // It puts the `sendMessage` function into the global store
  // so all other components (like GamePage) can access it.
  useEffect(() => {
    setSendMessage(sendMessage);
  }, [sendMessage, setSendMessage]);
  // --- END FIX ---

  return {
    connect,
    disconnect,
    sendMessage, // Still return it, in case App.jsx needs it directly
  };
};

export default useGameSocket;
