import React from "react";
import { useStore } from "../store";

const GamePage = ({ onLogout, sendMessage }) => {
  const { user, roomState } = useStore();

  if (!roomState) {
    return <div>Loading game...</div>;
  }

  const handleSurrender = () => {
    // This message tells the backend the current player has surrendered.
    // The backend will respond by sending a 'game_over' message to this client,
    // which will transition the view to the post-game page.
    sendMessage({ action: "surrender" });
  };

  return (
    <div className="bg-slate-700 p-8 rounded-lg shadow-lg max-w-4xl mx-auto text-center">
      <header className="flex justify-between items-center mb-6">
        <h1 className="text-4xl font-bold text-indigo-400">
          Game in Progress: {roomState.name}
        </h1>
        <button onClick={onLogout} className="btn btn-danger">
          Logout
        </button>
      </header>

      <div className="my-8">
        <h2 className="text-2xl font-semibold mb-4">Active Players</h2>
        <ul className="space-y-2 text-lg">
          {roomState.players.map((p) => (
            <li
              key={p.id}
              className="px-4 py-2 bg-slate-600 rounded-md animate-fade-in"
            >
              {p.username}
              {p.id === user.id && " (You)"}
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-10">
        <p className="text-slate-300 mb-4">
          The game is happening! If you wish to leave, you can surrender.
        </p>
        <button
          onClick={handleSurrender}
          className="btn btn-warning text-xl px-8 py-3"
        >
          Surrender & Leave Game
        </button>
      </div>
    </div>
  );
};

export default GamePage;
