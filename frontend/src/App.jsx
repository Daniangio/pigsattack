import React, { useEffect, useRef } from "react";
import { useStore } from "./store.js";
import useGameSocket from "./hooks/useGameSocket.js";
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useNavigate,
  useLocation,
} from "react-router-dom";

// Import Pages
import AuthPage from "./pages/AuthPage.jsx";
import LobbyPage from "./pages/LobbyPage.jsx";
import RoomPage from "./pages/RoomPage.jsx";
import GamePage from "./pages/GamePage.jsx";
import ProfilePage from "./pages/ProfilePage.jsx";
import PostGamePage from "./pages/PostGamePage.jsx";

/**
 * This component enforces the core navigation rules.
 * It's the *only* place that should force-navigate the user based on game state.
 */
const StateGuard = ({ children }) => {
  // --- REFACTOR: Added roomState ---
  const { gameState, gameResult, token, roomState } = useStore();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // 1. Auth Rules (Unchanged)
    if (!token && location.pathname !== "/auth") {
      // If logged out, force to auth page.
      navigate("/auth", { replace: true });
      return;
    }
    if (token && location.pathname === "/auth") {
      // If logged in and on auth page, force to lobby.
      navigate("/lobby", { replace: true });
      return;
    }

    // 2. The "Active Game" Rule (Unchanged)
    // If we have an active game, we MUST be on the game page.
    const activeGameId = gameState?.game_id;
    if (activeGameId && location.pathname !== `/game/${activeGameId}`) {
      console.log(
        "StateGuard: Active game detected, forcing navigation to game."
      );
      navigate(`/game/${activeGameId}`, { replace: true });
      return;
    }

    // 3. The "Game Over" Rule (Unchanged)
    // If a game just ended, we MUST be on the post-game page.
    const gameResultId = gameResult?.id;
    if (gameResultId && location.pathname !== `/post-game/${gameResultId}`) {
      console.log(
        "StateGuard: Game result detected, forcing navigation to post-game."
      );
      navigate(`/post-game/${gameResultId}`, { replace: true });
      return;
    }

    // --- REMOVED: The "Pre-Game Room" Rule from StateGuard ---
    // As per request, StateGuard will no longer force navigation to the room page.
    // Users in a room can now freely navigate to other pages (like Lobby or Profile).
    // The CurrentRoomBanner will guide them back to their room.

    // 5. Cleanup Rules (Modified to include room cleanup)
    // If we are on a game page but have no game state, go to lobby.
    if (!activeGameId && location.pathname.startsWith("/game/")) {
      console.log("StateGuard: No game state, redirecting from game page.");
      navigate("/lobby", { replace: true });
    }

    // If we are on a post-game page but have no result, go to lobby.
    if (!gameResultId && location.pathname.startsWith("/post-game/")) {
      console.log("StateGuard: No game result, redirecting from post-game page.");
      navigate("/lobby", { replace: true });
    }

    // The RoomPage.jsx component now handles its own loading state.
    // The StateGuard was redirecting too quickly, causing a race condition
    // when joining a room. The RoomPage will now show "Loading..." until the state arrives.
  }, [gameState, gameResult, token, roomState, location, navigate]); // Added roomState

  return children; // Render the route
};

/**
 * A new wrapper component to ensure hooks from react-router-dom
 * are available for useGameSocket.
 */
function AppContent() {
  const { token, clearAuth, roomState } = useStore();
  const navigate = useNavigate();
  
  // Pass navigate to the socket hook. This allows the hook
  // to handle the 'room_created' message and navigate the user.
  const { connect, disconnect, isConnected } = useGameSocket(navigate);

  // Effect: Manage WebSocket connection
  useEffect(() => {
    if (token && !isConnected && token !== 'guest') {
      console.log("AppContent: Token found, connecting...");
      connect(token);
    }
  }, [token, isConnected, connect]);

  const handleGuestLogin = () => {
    console.log("AppContent: Connecting as guest...");
    connect(null); // Connect with no token
  };

  const handleLogout = () => {
    console.log("AppContent: Logging out...");
    disconnect();
    clearAuth();
    // StateGuard will handle navigation to /auth
  };

  // Define layout props that pages might need
  const layoutProps = {
    onLogout: handleLogout,
  };

  return (
    // Base styles
    <div className="bg-gray-900 min-h-screen text-gray-200 font-sans selection:bg-orange-500 selection:text-white">
      <StateGuard>
        <div className="container mx-auto p-4 md:p-6">
          <Routes>
            {/* Public Route */}
            <Route path="/auth" element={<AuthPage onGuestLogin={handleGuestLogin} />} />

            {/* Protected Routes */}
            <Route path="/lobby" element={token ? <LobbyPage {...layoutProps} /> : <Navigate to="/auth" />} />
            <Route path="/room/:roomId" element={token ? <RoomPage {...layoutProps} /> : <Navigate to="/auth" />} />
            <Route path="/game/:gameId" element={token ? <GamePage {...layoutProps} /> : <Navigate to="/auth" />} />
            <Route path="/profile/:userId" element={token ? <ProfilePage {...layoutProps} /> : <Navigate to="/auth" />} />
            <Route path="/post-game/:gameId" element={token ? <PostGamePage /> : <Navigate to="/auth" />} />

            {/* Default route */}
            <Route path="*" element={<Navigate to={token ? "/lobby" : "/auth"} />} />
          </Routes>
        </div>
      </StateGuard>
    </div>
  );
}

// Main App component wraps everything in the router
function App() {
  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}

export default App;