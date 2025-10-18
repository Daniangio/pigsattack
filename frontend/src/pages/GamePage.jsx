import React from "react";
import { useStore } from "../store";

const GamePage = ({ onLogout, sendMessage }) => {
  const { user, roomState } = useStore();

  if (!roomState) {
    return <div>Loading game...</div>;
  }

  const handleSurrender = () => {
    // Example of sending a game action
    sendMessage({ action: "surrender" });
  };

  return (
    <div className="text-center">
      <h1 className="text-4xl font-bold mb-4">
        Game in Progress: {roomState.name}
      </h1>
      <p className="mb-8">Welcome, {user?.username}!</p>

      <div className="p-8 bg-slate-700 rounded-lg">
        <h2 className="text-2xl mb-4">Game Board</h2>
        <p className="text-slate-400">(Your game logic and UI will go here)</p>
      </div>

      <button onClick={handleSurrender} className="btn btn-danger mt-8">
        Surrender
      </button>
    </div>
  );
};

export default GamePage;
