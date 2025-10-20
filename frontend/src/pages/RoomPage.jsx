import React from "react";
import { useStore } from "../store";

const RoomPage = ({ onLogout, sendMessage, onViewProfile }) => {
  const { user, roomState } = useStore();

  // When leaving a room, roomState becomes null.
  // This check prevents the component from crashing before the view switches back to the lobby.
  if (!roomState) {
    // This can be a loading spinner or just null
    return <div>Loading room...</div>;
  }

  const isHost = user?.id === roomState.host_id;
  const canStartGame = roomState.players.length >= 2;

  const handleLeaveRoom = () => {
    sendMessage({ action: "leave_room" });
  };

  const handleStartGame = () => {
    if (isHost && canStartGame) {
      sendMessage({ action: "start_game" });
    }
  };

  return (
    <div>
      <header className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">
          Room: <span className="text-indigo-400">{roomState.name}</span>
        </h1>
        <div className="flex items-center gap-4">
          <span className="text-lg">
            Welcome, <span className="font-semibold">{user?.username}</span>
          </span>
          <button onClick={onViewProfile} className="btn btn-secondary">
            View Profile
          </button>
          <button onClick={onLogout} className="btn btn-danger">
            Logout
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 p-6 bg-slate-700 rounded-lg shadow-lg">
          <h2 className="text-2xl font-semibold mb-4">Players in Room</h2>
          <ul className="space-y-2">
            {roomState.players.map((p) => (
              <li key={p.id} className="px-3 py-2 bg-slate-600 rounded-md">
                {p.username}
                {p.id === roomState.host_id && " (Host)"}
                {p.id === user.id && " (You)"}
              </li>
            ))}
          </ul>
        </div>

        <div className="p-6 bg-slate-700 rounded-lg shadow-lg flex flex-col justify-between">
          <div>
            <h2 className="text-2xl font-semibold mb-4">Actions</h2>
            {isHost && (
              <button
                onClick={handleStartGame}
                disabled={!canStartGame}
                className="btn btn-primary w-full mb-2 disabled:bg-slate-500 disabled:cursor-not-allowed"
              >
                Start Game
              </button>
            )}
            {!canStartGame && isHost && (
              <p className="text-sm text-slate-400 text-center mb-4">
                Need at least 2 players to start.
              </p>
            )}
          </div>
          <button
            onClick={handleLeaveRoom}
            className="btn btn-secondary w-full"
          >
            Leave Room
          </button>
        </div>
      </div>
    </div>
  );
};

export default RoomPage;
