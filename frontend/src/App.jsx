import React, { useEffect } from "react";
import { useStore } from "./store.js";
import useGameSocket from "./hooks/useGameSocket.js";
import AuthPage from "./pages/AuthPage.jsx";
import LobbyPage from "./pages/LobbyPage.jsx";
import RoomPage from "./pages/RoomPage.jsx";
import GamePage from "./pages/GamePage.jsx";
import ProfilePage from "./pages/ProfilePage.jsx";
import PostGamePage from "./pages/PostGamePage.jsx";

function App() {
  const { view, token, clearAuth, gameResult, setView } = useStore();
  const { connect, disconnect, sendMessage, isConnected } = useGameSocket();

  // This effect now runs whenever the token changes.
  useEffect(() => {
    if (token && !isConnected) {
      connect(token);
    }
  }, [token, isConnected, connect]);

  const handleLogout = () => {
    disconnect();
    clearAuth();
    // The view will change to 'auth' automatically via the store's logic
  };

  const handleReturnToLobby = () => {
    // The frontend now ASKS the backend to go to the lobby.
    // The backend will validate this request and send back the appropriate `state_update`.
    // This handles leaving a pre-game room, a post-game screen, or a profile page.
    sendMessage({ action: "request_view", payload: { view: "lobby" } });
  };

  const renderView = () => {
    // The view is now derived directly from the store's state,
    // which is updated by websocket events. This is much cleaner.
    switch (view) {
      case "lobby":
        return (
          <LobbyPage
            onLogout={handleLogout}
            sendMessage={sendMessage}
            onViewProfile={() =>
              sendMessage({
                action: "request_view",
                payload: { view: "profile" },
              })
            }
          />
        );
      case "room":
        return (
          <RoomPage
            onLogout={handleLogout}
            sendMessage={sendMessage}
            onViewProfile={() =>
              sendMessage({
                action: "request_view",
                payload: { view: "profile" },
              })
            }
          />
        );
      case "game":
        return <GamePage onLogout={handleLogout} sendMessage={sendMessage} />;
      case "post_game":
        // The gameResult is now an object directly in the store
        return (
          <PostGamePage
            gameRecord={gameResult}
            onReturnToLobby={handleReturnToLobby}
          />
        );
      case "profile":
        return <ProfilePage onReturnToLobby={handleReturnToLobby} />;
      case "auth":
      default:
        // We pass the connect function to the AuthPage for guest login
        return <AuthPage onGuestLogin={() => connect(null)} />;
    }
  };

  return (
    <div className="bg-slate-800 min-h-screen text-white font-sans">
      <div className="container mx-auto p-4">{renderView()}</div>
    </div>
  );
}

export default App;
