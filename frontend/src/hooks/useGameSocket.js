import { useRef, useCallback, useEffect } from "react";
import { useStore } from "../store.js";

// The hook now accepts the `Maps` function from react-router-dom
const useGameSocket = (navigate) => {
  const socketRef = useRef(null);
  
  // Create a ref for navigate to avoid stale closures in callbacks
  const navigateRef = useRef(navigate);
  useEffect(() => {
    navigateRef.current = navigate;
  }, [navigate]);

  // Get all handlers from the store
  const {
    setConnectionStatus,
    handleAuthSuccess,
    handleGuestAuth,
    handleError,
    clearAuth,
    handleLobbyState,
    handleRoomState,
    handleGameStateUpdate,
    handleGameResult,
    handleForceToLobby,
    setSendMessage,
  } = useStore(
    (state) => ({
      setConnectionStatus: state.setConnectionStatus,
      handleAuthSuccess: state.handleAuthSuccess,
      handleGuestAuth: state.handleGuestAuth,
      handleError: state.handleError,
      clearAuth: state.clearAuth,
      // New specific handlers
      handleLobbyState: state.handleLobbyState,
      handleRoomState: state.handleRoomState,
      handleGameStateUpdate: state.handleGameStateUpdate,
      handleGameResult: state.handleGameResult,
      handleForceToLobby: state.handleForceToLobby,
      setSendMessage: state.setSendMessage,
    })
  );

  const connect = useCallback(
    (token) => {
      if (socketRef.current) {
        console.warn("Socket already connecting/connected.");
        return;
      }

      const WS_URL = "ws://localhost:8000/ws";
      console.log(`Connecting to WebSocket at ${WS_URL}`);
      const ws = new WebSocket(WS_URL);
      socketRef.current = ws;

      ws.onopen = () => {
        console.log("WebSocket connected");
        setConnectionStatus(true);
        const authMessage = token ? { token } : { action: "guest_auth" };
        ws.send(JSON.stringify(authMessage));
      };

      ws.onmessage = (event) => {
        const message = JSON.parse(event.data);
        console.log("Received message:", message);

        const { type, payload } = message;

        // Message handler mapping with new specific types
        const actions = {
          guest_auth_success: handleGuestAuth,
          auth_success: handleAuthSuccess,
          error: handleError,
          
          lobby_state: handleLobbyState,
          room_state: handleRoomState,
          game_state_update: handleGameStateUpdate,
          game_result: handleGameResult,
          force_to_lobby: handleForceToLobby,
          
          // This is the one special case where the server
          // responds to a user's action and we need to navigate.
          room_created: (payload) => {
            handleRoomState(payload);
            console.log("Room created, navigating to room...");
            navigateRef.current(`/room/${payload.id}`);
          },
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
        // On a sudden disconnect, clear auth, which will
        // trigger the StateGuard to show the Auth page.
        clearAuth();
      };

      ws.onerror = (err) => {
        console.error("WebSocket error:", err);
        handleError({ message: "WebSocket connection error. Check console." });
        socketRef.current = null;
        setConnectionStatus(false);
      };
    },
    [
      setConnectionStatus,
      handleAuthSuccess,
      handleGuestAuth,
      handleError,
      clearAuth,
      handleLobbyState,
      handleRoomState,
      handleGameStateUpdate,
      handleGameResult,
      handleForceToLobby,
      // navigateRef is stable, no need to include
    ]
  ); // `connect` doesn't need setSendMessage

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      console.log("Manually disconnecting WebSocket...");
      socketRef.current.close(1000, "User logged out"); // 1000 is a normal closure
      socketRef.current = null;
    }
  }, []);

  const sendMessage = useCallback((message) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(message));
    } else {
      console.warn("WebSocket not connected. Message not sent:", message);
      handleError({ message: "Not connected to server." });
    }
  }, [handleError]);

  // Effect to set the sendMessage function in the store
  useEffect(() => {
    setSendMessage(sendMessage);
  }, [sendMessage, setSendMessage]);

  return {
    connect,
    disconnect,
    sendMessage,
    isConnected: useStore((state) => state.isConnected),
  };
};

export default useGameSocket;