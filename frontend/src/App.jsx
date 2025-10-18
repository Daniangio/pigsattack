import React, { useEffect } from "react";
import { useStore } from "./store.js";
import useGameSocket from "./hooks/useGameSocket.js";
import AuthPage from "./pages/AuthPage.jsx";
import LobbyPage from "./pages/LobbyPage.jsx";
import RoomPage from "./pages/RoomPage.jsx";

function App() {
  const { view, token, clearAuth } = useStore();
  const { connect, disconnect, isConnected } = useGameSocket();

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

  const renderView = () => {
    // The view is now derived directly from the store's state,
    // which is updated by websocket events. This is much cleaner.
    switch (view) {
      case "lobby":
        return <LobbyPage onLogout={handleLogout} />;
      case "room":
        return <RoomPage onLogout={handleLogout} />;
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
