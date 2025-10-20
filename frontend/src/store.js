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
    // The frontend's job is just to apply it. The logic to protect special views
    // has been moved to the backend's `handle_view_request`.
    // If a field isn't in the payload, it keeps its existing value from the store.
    set((state) => ({ ...state, ...payload }));
  },
}));
