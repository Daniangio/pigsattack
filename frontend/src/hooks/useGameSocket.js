import { useRef, useCallback, useEffect } from "react";
import { useStore } from "../store.js";
import { buildWsUrl } from "../utils/connection";

const useGameSocket = (navigate) => {
  const socketRef = useRef(null);

  const navigateRef = useRef(navigate);
  useEffect(() => {
    navigateRef.current = navigate;
  }, [navigate]);

  const {
    setConnectionStatus,
    handleAuthSuccess,
    handleGuestAuth,
    handleError,
    clearAuth,
    handleLobbyState,
    handleLobbyChatHistory,
    handleLobbyChatMessage,
    handleRoomState,
    handleGameStateUpdate,
    handleGameResult,
    handleForceToLobby,
    setSendMessage,
  } = useStore((state) => ({
    setConnectionStatus: state.setConnectionStatus,
    handleAuthSuccess: state.handleAuthSuccess,
    handleGuestAuth: state.handleGuestAuth,
    handleError: state.handleError,
    clearAuth: state.clearAuth,
    handleLobbyState: state.handleLobbyState,
    handleLobbyChatHistory: state.handleLobbyChatHistory,
    handleLobbyChatMessage: state.handleLobbyChatMessage,
    handleRoomState: state.handleRoomState,
    handleGameStateUpdate: state.handleGameStateUpdate,
    handleGameResult: state.handleGameResult,
    handleForceToLobby: state.handleForceToLobby,
    setSendMessage: state.setSendMessage,
  }));

  const connect = useCallback(
    (token) => {
      if (socketRef.current) {
        console.warn("Socket already connecting/connected.");
        return;
      }

      const WS_URL = buildWsUrl("/ws");
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

        const actions = {
          guest_auth_success: (ignoredPayload) => {
            // Pass the entire message object to the handler
            handleGuestAuth(message);
          },
          auth_success: handleAuthSuccess,
          error: handleError,
          lobby_state: handleLobbyState,
          lobby_chat_history: handleLobbyChatHistory,
          lobby_chat_message: handleLobbyChatMessage,
          room_state: handleRoomState,
          game_state_update: handleGameStateUpdate,
          game_result: handleGameResult,
          force_to_lobby: handleForceToLobby,
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

      ws.onclose = (e) => {
        console.log(`WebSocket disconnected: ${e.code} ${e.reason}`);
        socketRef.current = null;
        setConnectionStatus(false);
        if (e.code !== 1000) {
          console.log("Abnormal disconnect, clearing auth.");
          clearAuth();
        }
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
      handleLobbyChatHistory,
      handleLobbyChatMessage,
      handleRoomState,
      handleGameStateUpdate,
      handleGameResult,
      handleForceToLobby,
    ]
  );

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      console.log("Manually disconnecting WebSocket...");
      socketRef.current.close(1000, "User logged out");
      socketRef.current = null;
    }
  }, []);

  const sendMessage = useCallback(
    (message) => {
      if (
        socketRef.current &&
        socketRef.current.readyState === WebSocket.OPEN
      ) {
        socketRef.current.send(JSON.stringify(message));
      } else {
        console.warn("WebSocket not connected. Message not sent:", message);
        handleError({ message: "Not connected to server." });
      }
    },
    [handleError]
  );

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
