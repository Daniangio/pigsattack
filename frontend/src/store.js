import { create } from "zustand";
import { jwtDecode } from "jwt-decode";

export const useStore = create((set, get) => ({
  // State
  view: "auth", // Default view is always 'auth'
  token: sessionStorage.getItem("authToken") || null,
  user: null,
  isConnected: false,
  gameResultId: null, // Add state to hold the game result ID
  lobbyState: { users: [], rooms: [] },
  roomState: null,
  previousView: "auth", // Keep track of the previous view

  // Actions
  setView: (view) => set((state) => ({ previousView: state.view, view })),

  setToken: (token) => {
    sessionStorage.setItem("authToken", token);
    const decoded = jwtDecode(token);
    const user = {
      id: decoded.sub,
      username: decoded.username, // Assuming username is in the token
      currentRoomId: null,
    };
    set({ token, user, view: "lobby" }); // <-- Transition to lobby on successful login
  },

  clearAuth: () => {
    sessionStorage.removeItem("authToken");
    set({ token: null, user: null, isConnected: false, view: "auth" });
  },

  setConnectionStatus: (status) => set({ isConnected: status }),

  handleLobbyState: (payload) => {
    set((state) => {
      // If the user is in a special view (like 'profile'), only update the state
      // in the background. Don't force a view change.
      if (["profile"].includes(state.view)) {
        return { lobbyState: payload, roomState: null };
      }
      return { lobbyState: payload, roomState: null, view: "lobby" };
    });
  },

  handleRoomState: (payload) => {
    set((state) => {
      // Do not kick the user from the profile page when room state changes.
      if (state.view === "profile") {
        // If a game starts, it's a high-priority event and should force a view change.
        if (payload?.status === "in_game") {
          return { roomState: payload, view: "game" };
        }
        // Otherwise, just update the room state in the background.
        return { roomState: payload };
      }

      // If payload is null, it means the user left a room or it was dismantled.
      // The backend will follow up with a `lobby_state` message to handle the view change.
      if (!payload) {
        return { roomState: null };
      }

      // Determine view based on room status.
      const view = payload.status === "in_game" ? "game" : "room";
      return { roomState: payload, view };
    });
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
    set({ view: "post_game", gameResultId: payload.game_record_id });
  },
}));
