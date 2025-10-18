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

  handleLobbyState: (payload) => set({ lobbyState: payload }),

  handleRoomState: (payload) => {
    set((state) => ({
      roomState: payload,
      user: { ...state.user, currentRoomId: payload ? payload.id : null },
      view: payload ? "room" : "lobby", // <-- Automatically switch view
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

  handleError: (payload) => {
    alert(`Server Error: ${payload.message}`);
  },
}));
