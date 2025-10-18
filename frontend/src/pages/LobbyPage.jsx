import React, { useState } from "react";
import { useStore } from "../store";
import useGameSocket from "../hooks/useGameSocket";

const LobbyPage = ({ onLogout }) => {
  const { user, lobbyState } = useStore();
  const { sendMessage } = useGameSocket();
  const [newRoomName, setNewRoomName] = useState("");

  const handleCreateRoom = (e) => {
    e.preventDefault();
    if (newRoomName.trim()) {
      sendMessage("create_room", { room_name: newRoomName });
      setNewRoomName("");
    }
  };

  const handleJoinRoom = (roomId) => {
    sendMessage("join_room", { room_id: roomId });
  };

  return (
    <div>
      <header className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Lobby</h1>
        <div className="flex items-center gap-4">
          <span className="text-lg">
            Welcome, <span className="font-semibold">{user?.username}</span>
          </span>
          <button onClick={onLogout} className="btn btn-danger">
            Logout
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Rooms List */}
        <div className="md:col-span-2 p-6 bg-slate-700 rounded-lg shadow-lg">
          <h2 className="text-2xl font-semibold mb-4">Game Rooms</h2>
          <form onSubmit={handleCreateRoom} className="flex gap-2 mb-4">
            <input
              type="text"
              value={newRoomName}
              onChange={(e) => setNewRoomName(e.target.value)}
              placeholder="New room name..."
              className="flex-grow px-3 py-2 bg-slate-600 border border-slate-500 rounded-md focus:outline-none focus:ring focus:ring-indigo-500"
            />
            <button type="submit" className="btn btn-primary">
              Create Room
            </button>
          </form>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {lobbyState.rooms.length > 0 ? (
              lobbyState.rooms.map((room) => (
                <div
                  key={room.id}
                  className="flex justify-between items-center p-3 bg-slate-600 rounded-md"
                >
                  <div>
                    <p className="font-semibold">{room.name}</p>
                    <p className="text-sm text-slate-300">
                      {room.players.length} player(s)
                    </p>
                  </div>
                  <button
                    onClick={() => handleJoinRoom(room.id)}
                    className="btn btn-secondary"
                  >
                    Join
                  </button>
                </div>
              ))
            ) : (
              <p className="text-slate-400">No rooms available. Create one!</p>
            )}
          </div>
        </div>

        {/* Players List */}
        <div className="p-6 bg-slate-700 rounded-lg shadow-lg">
          <h2 className="text-2xl font-semibold mb-4">Players in Lobby</h2>
          <ul className="space-y-2 max-h-[28rem] overflow-y-auto">
            {lobbyState.users.map((lobbyUser) => (
              <li
                key={lobbyUser.id}
                className="px-3 py-2 bg-slate-600 rounded-md"
              >
                {lobbyUser.username} {lobbyUser.id === user.id && "(You)"}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};

export default LobbyPage;
