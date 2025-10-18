import React from "react";
import { useStore } from "../store.js";
import useGameSocket from "../hooks/useGameSocket.js";

const RoomPage = ({ onLogout }) => {
  const { user, roomState } = useStore();
  const { sendMessage } = useGameSocket();

  const handleLeaveRoom = () => {
    sendMessage("leave_room", {});
  };

  if (!roomState) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p>Loading room...</p>
      </div>
    );
  }

  const isHost = user.id === roomState.host_id;

  return (
    <div>
      <header className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">{roomState.name}</h1>
        <div className="flex items-center gap-4">
          <span className="text-lg">
            Playing as <span className="font-semibold">{user?.username}</span>
          </span>
          <button onClick={onLogout} className="btn btn-danger">
            Logout
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Main Game Area */}
        <div className="md:col-span-2 p-6 bg-slate-700 rounded-lg shadow-lg min-h-[60vh]">
          <h2 className="text-2xl font-semibold mb-4">Game Board</h2>
          <p className="text-slate-400">The game will start here soon...</p>
          {/* This is where card components and game logic will be rendered */}
        </div>

        {/* Players & Controls */}
        <div className="p-6 bg-slate-700 rounded-lg shadow-lg">
          <h2 className="text-2xl font-semibold mb-4">Players in Room</h2>
          <ul className="space-y-2 mb-6">
            {roomState.players.map((player) => (
              <li
                key={player.id}
                className="px-3 py-2 bg-slate-600 rounded-md font-semibold"
              >
                {player.username}
                {player.id === roomState.host_id && (
                  <span className="ml-2 text-xs text-yellow-400">(Host)</span>
                )}
                {player.id === user.id && (
                  <span className="ml-2 text-xs text-indigo-400">(You)</span>
                )}
              </li>
            ))}
          </ul>

          <div className="space-y-2">
            {isHost && (
              <button className="w-full btn btn-primary">Start Game</button>
            )}
            <button onClick={handleLeaveRoom} className="w-full btn btn-danger">
              Leave Room
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RoomPage;
