import { create } from "zustand";
import { jwtDecode } from "jwt-decode";

export const useStore = create((set, get) => ({
  // State
  view: "auth", // Default view is always 'auth'
  token: sessionStorage.getItem("authToken") || null,
  user: null,
  isConnected: false, // This can stay as it's client-side state
  gameResult: null,
  lobbyState: { users: [], rooms: [] },
  roomState: null,
  gameState: null,

  // Actions
  // FIX: Add a dedicated action to handle client-side view changes.
  // The `set` function is only available inside the store's definition.
  setView: (view) => set({ view }),

  setToken: (token) => {
    sessionStorage.setItem("authToken", token);
    const decoded = jwtDecode(token);
    const user = {
      id: decoded.sub,
      username: decoded.username, // Assuming username is in the token
      currentRoomId: null,
    };
    // Don't set view here. The backend will send the authoritative state upon connection.
    set({ token, user });
  },

  clearAuth: () => {
    sessionStorage.removeItem("authToken");
    // Reset all state and return to auth view
    set({
      token: null,
      user: null,
      isConnected: false,
      view: "auth",
      roomState: null,
      lobbyState: { users: [], rooms: [] },
      gameResult: null,
      gameState: null,
    });
  },

  setConnectionStatus: (status) => set({ isConnected: status }),

  handleGuestAuth: (payload) => {
    const user = { id: payload.id, username: payload.username };
    // Don't set view here. The backend will send the authoritative state.
    set({ user });
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

  // REFACTOR: A single, authoritative state handler
  handleStateUpdate: (payload) => {
    // The backend sends the view and all relevant state.
    // The frontend's only job is to apply it. All logic is now on the backend.
    set((state) => ({
      ...state,
      ...payload,
      // If the new view is NOT 'game', explicitly clear the gameState.
      // This prevents stale game data from persisting when a player leaves a game.
      // If the payload doesn't include a view, gameState remains untouched.
      gameState:
        payload.view === "game"
          ? payload.gameState
          : payload.view
          ? null
          : state.gameState,
    }));
  },
}));
