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
  sendMessage: null, // --- FIX: Add sendMessage to the store state

  // Actions
  setView: (view) => set({ view }),

  // --- FIX: Add a setter for sendMessage ---
  setSendMessage: (fn) => set({ sendMessage: fn }),

  setToken: (token) => {
    sessionStorage.setItem("authToken", token);
    const decoded = jwtDecode(token);
    const user = {
      id: decoded.sub,
      username: decoded.username,
      currentRoomId: null,
    };
    set({ token, user });
  },

  clearAuth: () => {
    sessionStorage.removeItem("authToken");
    set({
      token: null,
      user: null,
      isConnected: false,
      view: "auth",
      roomState: null,
      lobbyState: { users: [], rooms: [] },
      gameResult: null,
      gameState: null,
      sendMessage: null, // --- FIX: Clear sendMessage on logout
    });
  },

  setConnectionStatus: (status) => set({ isConnected: status }),

  handleGuestAuth: (payload) => {
    const user = { id: payload.id, username: payload.username };
    set({ user });
  },

  handleAuthSuccess: (payload) => {
    const user = {
      id: payload.id,
      username: payload.username,
    };
    set({ user });
  },

  handleError: (payload) => {
    alert(`Server Error: ${payload.message}`);
  },

  handleStateUpdate: (payload) => {
    set((state) => {
      // --- FIX for Bug 1: Allow navigation *out* of game ---
      // If a new view is 'lobby' or 'auth', it's a navigation
      // command that should *always* be obeyed, and it should
      // clear the game state.
      if (payload.view && payload.view !== "game") {
        console.warn(
          `Force navigating to ${payload.view}, clearing game state.`
        );
        return { ...state, ...payload, gameState: null, gameResult: null };
      }

      // Original race condition fix:
      // If we are in a game, ignore stale lobby/room updates.
      if (state.gameState) {
        console.warn("Ignoring stale 'state_update' while in game.");
        return state; // Ignore the update
      }
      // --- END FIX ---

      // If we are not in a game, process the update.
      return { ...state, ...payload };
    });
  },

  handleGameStateUpdate: (payload) => {
    // This handler is now the *only* one that sets the game state
    // and forces the view to 'game'.
    set({ gameState: payload, view: "game" });
  },
}));
