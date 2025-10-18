import { create } from "zustand";
import { jwtDecode } from "jwt-decode";

export const useStore = create((set, get) => ({
  // State
  view: "auth", // Default view is always 'auth'
  token: localStorage.getItem("authToken") || null,
  user: null,
  isConnected: false,
  lobbyState: { users: [], rooms: [] },
  roomState: null,

  // Actions
  setView: (view) => set({ view }),

  setToken: (token) => {
    localStorage.setItem("authToken", token);
    const decoded = jwtDecode(token);
    const user = {
      id: decoded.sub,
      username: decoded.username, // Assuming username is in the token
      currentRoomId: null,
    };
    set({ token, user, view: "lobby" }); // <-- Transition to lobby on successful login
  },

  clearAuth: () => {
    localStorage.removeItem("authToken");
    set({ token: null, user: null, isConnected: false, view: "auth" }); // <-- Return to auth on logout
  },

  setConnectionStatus: (status) => set({ isConnected: status }),

  handleLobbyState: (payload) => {
    // When we receive a lobby state update, it means we are in the lobby.
    // We must explicitly set the view and clear any room state.
    set({ lobbyState: payload, roomState: null, view: "lobby" });
  },

  handleRoomState: (payload) => {
    let view = "lobby"; // Default to lobby if payload is null
    if (payload) {
      const statusMap = {
        lobby: "room",
        in_game: "game",
        post_game: "post_game",
      };
      view = statusMap[payload.status] || "lobby";
    }

    set((state) => ({
      roomState: payload,
      user: { ...state.user, currentRoomId: payload ? payload.id : null },
      view: view,
    }));
  },

  handleGuestAuth: (payload) => {
    const user = {
      id: payload.id,
      username: payload.username,
      currentRoomId: null,
    };
    set({ user, view: "lobby" }); // <-- Transition to lobby on successful guest login
  },

  handleAuthSuccess: (payload) => {
    // This is called after the websocket confirms the token.
    // It's crucial to re-set the user object here to avoid it being cleared.
    const user = {
      id: payload.id,
      username: payload.username,
    };
    set({ user });
  },

  handleError: (payload) => {
    alert(`Server Error: ${payload.message}`);
  },

  handleGameOver: (payload) => {
    // Force a navigation to the results page. This is more reliable
    // than trying to manage URL state within React's render cycle.
    window.location.href = `/results/${payload.game_record_id}`;
  },
}));
