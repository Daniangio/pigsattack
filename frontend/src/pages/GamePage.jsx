import React from "react";
import { useStore } from "../store.js";

const PlayerStatusPill = ({ status }) => {
  const baseClasses = "px-3 py-1 text-sm font-semibold rounded-full";
  const statusStyles = {
    ACTIVE: "bg-green-500 text-white",
    SURRENDERED: "bg-yellow-500 text-black",
    DISCONNECTED: "bg-red-500 text-white",
  };
  return (
    <span className={`${baseClasses} ${statusStyles[status] || "bg-gray-500"}`}>
      {status}
    </span>
  );
};

const GamePage = ({ onLogout, sendMessage }) => {
  const { user, roomState } = useStore();

  if (!roomState || !roomState.game_details) {
    return <div>Loading game state...</div>;
  }

  const {
    name,
    game_details: { participants },
  } = roomState;
  const currentUserParticipant = participants.find(
    (p) => p.user.id === user.id
  );

  const isSpectator = !currentUserParticipant;
  const hasSurrendered = currentUserParticipant?.status === "SURRENDERED";

  const handleSurrender = () => sendMessage({ action: "surrender" });
  // A surrendered player leaving the game is the same as a player
  // leaving the post-game screen. They are acknowledging they are done
  // and want to return to the lobby.
  const handleReturnToLobby = () => sendMessage({ action: "return_to_lobby" });

  return (
    <div className="bg-slate-700 p-8 rounded-lg shadow-lg max-w-4xl mx-auto text-center">
      <header className="flex justify-between items-center mb-6">
        <h1 className="text-4xl font-bold text-indigo-400">
          Game in Progress: {name}
        </h1>
        <button onClick={onLogout} className="btn btn-danger">
          Logout
        </button>
      </header>

      <div className="my-8">
        <h2 className="text-2xl font-semibold mb-4">Players</h2>
        <ul className="space-y-3 text-lg">
          {participants.map(({ user: p, status }) => (
            <li
              key={p.id}
              className="px-4 py-3 bg-slate-600 rounded-md flex justify-between items-center animate-fade-in"
            >
              <span>
                {p.username}
                {p.id === user.id && " (You)"}
              </span>
              <PlayerStatusPill status={status} />
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-10">
        {isSpectator ? (
          <p className="text-slate-300 mb-4">You are spectating this game.</p>
        ) : hasSurrendered ? (
          <>
            <p className="text-yellow-300 text-xl mb-4">
              You have surrendered. You can watch until the game ends.
            </p>
            <button
              onClick={handleReturnToLobby}
              className="btn btn-primary text-xl px-8 py-3"
            >
              Return to Lobby
            </button>
          </>
        ) : (
          <>
            <p className="text-slate-300 mb-4">
              The game is happening! If you wish to leave, you can surrender.
            </p>
            <button
              onClick={handleSurrender}
              className="btn btn-warning text-xl px-8 py-3"
            >
              Surrender
            </button>
          </>
        )}
      </div>
    </div>
  );
};

export default GamePage;
