import { create } from "zustand";
import { jwtDecode } from "jwt-decode";

export const useStore = create((set, get) => ({
  // State
  // 'view' is removed. Navigation is handled by react-router.
  token: sessionStorage.getItem("authToken") || null,
  user: null,
  isConnected: false,
  gameResult: null,
  lobbyState: { users: [], rooms: [] },
  roomState: null,
  gameState: null,
  sendMessage: null,

  // Actions
  setSendMessage: (fn) => set({ sendMessage: fn }),

  setToken: (token) => {
    sessionStorage.setItem("authToken", token);
    try {
      const decoded = jwtDecode(token);
      if (decoded && decoded.sub) {
        const user = {
          id: decoded.sub,
          username: decoded.username,
        };
        // Set token and user.
        // The <StateGuard> will handle navigation to /lobby.
        set({ token, user });
      } else {
        throw new Error("Invalid token structure.");
      }
    } catch (error) {
      console.error("Could not decode token or token is invalid:", error);
      get().clearAuth();
    }
  },

  clearAuth: () => {
    sessionStorage.removeItem("authToken");
    set({
      token: null,
      user: null,
      isConnected: false,
      // 'view' is removed
      roomState: null,
      lobbyState: { users: [], rooms: [] },
      gameResult: null,
      gameState: null,
    });
    // The <StateGuard> will handle navigation to /auth.
  },

  setConnectionStatus: (status) => set({ isConnected: status }),

  handleGuestAuth: (message) => {
    // The user object is the payload, the token is a top-level property
    const user = { id: message.payload.id, username: message.payload.username };
    const token = message.token;
    sessionStorage.setItem("authToken", token);
    set({ user, token });
  },

  handleAuthSuccess: (payload) => {
    const user = {
      id: payload.id,
      username: payload.username,
    };
    set({ user });
  },

  handleError: (payload) => {
    console.error(`Server Error: ${payload.message}`, payload);
    // TODO: Implement a toast notification system
  },

  // --- NEW, SPECIFIC STATE HANDLERS ---

  handleLobbyState: (payload) => {
    // If we are NOT in a room, receiving a lobby state should clear other states.
    if (!get().roomState) {
      set({ lobbyState: payload, gameState: null, gameResult: null });
    } else {
      // If we ARE in a room, just update the lobby data in the background.
      set({ lobbyState: payload });
    }
  },

  handleRoomState: (payload) => {
    // When we receive a room state, we set it. We no longer clear the lobby state,
    // allowing the user to navigate back to the lobby and see its contents.
    set({ roomState: payload });
  },

  handleForceToLobby: () => {
    // Server is telling us we are no longer in a room (e.g., we left/were kicked)
    set({ roomState: null, gameState: null, gameResult: null });
    // The <StateGuard> will NOT navigate us, but if we are on a /room/ page,
    // that page should handle this null state gracefully (e.g., by navigating).
    // Let's refine this: RoomPage.jsx will handle this.
    // For now, just clear the state.
  },

  handleGameStateUpdate: (payload) => {
    // When a game update comes in, we set the state.
    // The <StateGuard> component will handle the forced navigation.
    set({ gameState: payload, roomState: null, gameResult: null });
  },

  handleGameResult: (payload) => {
    // The <StateGuard> will handle the forced navigation.
    set({ gameResult: payload, gameState: null, roomState: null });
  },

  // --- Reusable Authenticated Fetch (Unchanged) ---
  httpGameRequest: async (gameId, endpoint, method = "POST", body = {}) => {
    // ... (this logic is fine and remains unchanged) ...
    const { token, handleError } = get();

    if (!token || token === "guest") {
      console.error("Attempted HTTP request as guest.");
      handleError({ message: "Guests cannot perform this action." });
      return null;
    }

    const url = `http://localhost:8000/api/game/${gameId}/${endpoint}`;

    try {
      const response = await fetch(url, {
        method: method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.detail || `HTTP Error: ${response.statusText}`);
      }

      return await response.json(); // Return the JSON response
    } catch (err) {
      console.error(`HTTP request to ${url} failed:`, err);
      handleError({ message: err.message || "A network error occurred." });
      return null;
    }
  },
}));
