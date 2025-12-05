import React, { useState } from "react";
import { useStore } from "../store.js";
import { useNavigate, Link } from "react-router-dom";
import { playerIcons as defaultPlayerIcons } from "./game/GameConstants";

const CurrentRoomBanner = () => {
  const { roomState, gameState } = useStore();
  const navigate = useNavigate();

  const isInRoom = roomState && !gameState;

  if (!isInRoom) {
    return null;
  }

  return (
    <div className="bg-blue-900/80 backdrop-blur-sm text-white p-3 rounded-lg mb-6 flex justify-between items-center animate-fade-in-down border border-blue-700">
      <p className="font-medium">
        You are in room: <span className="font-bold text-orange-300">{roomState.name}</span>
      </p>
      <button
        onClick={() => navigate(`/room/${roomState.id}`)}
        className="py-1 px-4 font-semibold rounded-md shadow-md transition duration-200 ease-in-out bg-orange-600 hover:bg-orange-700 text-white"
      >
        Go to Room
      </button>
    </div>
  );
};

const LobbyPage = ({ onLogout }) => { // --- REFACTOR: Added roomState ---
  const { user, lobbyState, roomState, avatarChoice } = useStore();
  const sendMessage = useStore((state) => state.sendMessage);
  const [newRoomName, setNewRoomName] = useState("");
  const navigate = useNavigate();

  if (!lobbyState) {
    return <div>Loading lobby...</div>;
  }

  const isInRoom = !!roomState;

  const handleCreateRoom = (e) => {
    e.preventDefault();
    if (newRoomName.trim() && sendMessage && !isInRoom) {
      sendMessage({
        action: "create_room",
        payload: { room_name: newRoomName },
      });
      setNewRoomName("");
    }
  };

  const handleJoinRoom = (roomId) => {
    if (sendMessage && !isInRoom) {
      sendMessage({ action: "join_room", payload: { room_id: roomId } });
      navigate(`/room/${roomId}`);
    }
  };

  const handleSpectateGame = (gameRecordId) => {
    if (sendMessage && !isInRoom) {
      sendMessage({
        action: "spectate_game",
        payload: { game_record_id: gameRecordId },
      });
      // We don't navigate here. The server's game_state response
      // will trigger the StateGuard.
    }
  };
  
  const handleViewProfile = () => {
    navigate(`/profile/${user.id}`);
  };

  const btn = "py-2 px-4 font-semibold rounded-md shadow-md transition duration-200 ease-in-out disabled:opacity-50";
  const btnPrimary = `${btn} bg-orange-600 hover:bg-orange-700 text-white`;
  const btnSecondary = `${btn} bg-gray-600 hover:bg-gray-500 text-white`;
  const btnDanger = `${btn} bg-red-700 hover:bg-red-800 text-white`;
  const btnInfoAlt = `${btn} bg-blue-800 hover:bg-blue-700 text-white`;
  const btnInfo = `${btn} bg-blue-600 hover:bg-blue-700 text-white`;
  const resolveIcon = (lobbyUser, idx) => {
    if (lobbyUser?.icon) return lobbyUser.icon;
    if (lobbyUser?.id === user?.id && avatarChoice) return avatarChoice;
    if (!defaultPlayerIcons?.length) return null;
    if (lobbyUser?.id) {
      const str = String(lobbyUser.id);
      let sum = 0;
      for (let i = 0; i < str.length; i += 1) {
        sum += str.charCodeAt(i);
      }
      return defaultPlayerIcons[sum % defaultPlayerIcons.length];
    }
    return defaultPlayerIcons[idx % defaultPlayerIcons.length];
  };

  return (
    <div className="animate-fade-in">
      <header className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
        <h1 className="text-3xl font-bold text-orange-400">
          Game Lobby
        </h1>
        <div className="flex items-center gap-3">
          <span className="text-lg text-gray-300">
            Welcome, <span className="font-semibold text-orange-400">{user?.username}</span>
          </span>
          <button onClick={handleViewProfile} className={btnSecondary}>
            Profile
          </button>
          <button onClick={onLogout} className={btnDanger}>
            Logout
          </button>
        </div>
      </header>

      <CurrentRoomBanner />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Game Rooms List */}
        <div className="md:col-span-2 p-6 bg-gray-800 rounded-lg border border-gray-700">
          <h2 className="text-2xl font-semibold mb-4 text-gray-100">Game Rooms</h2>
          <form onSubmit={handleCreateRoom} className="flex gap-2 mb-4">
            <input
              type="text"
              value={newRoomName}
              onChange={(e) => setNewRoomName(e.target.value)}
              placeholder="New room name..."
              className="flex-grow px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
            />
            <button type="submit" className={btnPrimary} disabled={isInRoom} title={isInRoom ? "You must leave your current room first" : ""}>
              Create Room
            </button>
          </form>
          {isInRoom && <p className="text-center text-amber-400 mb-3 -mt-2 text-sm">You must leave your current room to create or join another.</p>}
          
          <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
            {lobbyState.rooms.length > 0 ? (
              lobbyState.rooms.map((room) => (
                <div
                  key={room.id}
                  className="flex justify-between items-center p-3 bg-gray-700 rounded-md border border-gray-600 hover:bg-gray-600 transition-colors"
                > {roomState?.id === room.id && (
                    <div className="absolute -left-1 h-full w-1.5 bg-orange-500 rounded-l-md"></div>
                  )}
                  <div>
                    <p className="font-semibold text-gray-100">{room.name}</p>
                    <div className="flex items-center gap-3 text-sm text-gray-400">
                      <span>{room.players.length} player(s)</span>
                      <span
                        className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          room.status === "in_game"
                            ? "bg-red-900 text-red-300"
                            : "bg-green-900 text-green-300"
                        }`}
                      >
                        {room.status === "in_game" ? "In Game" : "Waiting"}
                      </span>
                    </div>
                  </div>
                  {room.status === "in_game" ? (
                    <button
                      onClick={() => handleSpectateGame(room.game_record_id)}
                      className={btnInfo}
                      disabled={isInRoom}
                      title={isInRoom ? "You must leave your current room first" : ""}
                    >
                      Spectate
                    </button>
                  ) : (
                    <button
                      onClick={() => handleJoinRoom(room.id)}
                      className={btnSecondary}
                      disabled={isInRoom}
                      title={isInRoom ? "You must leave your current room first" : ""}
                    >
                      Join
                    </button>
                  )}
                </div>
              ))
            ) : (
              <p className="text-gray-400 text-center py-4">
                No rooms available. Create one!
              </p>
            )}
          </div>
        </div>

        {/* Players in Lobby List */}
        <div className="p-6 bg-gray-800 rounded-lg border border-gray-700">
          <h2 className="text-2xl font-semibold mb-4 text-gray-100">Players in Lobby</h2>
          <ul className="space-y-2 max-h-[28rem] overflow-y-auto pr-2">
            {lobbyState.users.map((lobbyUser, idx) => (
              <li
                key={lobbyUser.id}
                className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-gray-300 flex items-center gap-2"
              >
                <div className="w-9 h-9 rounded-full overflow-hidden border border-gray-500 shrink-0">
                  <img
                    src={resolveIcon(lobbyUser, idx)}
                    alt={`${lobbyUser.username} avatar`}
                    className="w-full h-full object-cover"
                  />
                </div>
                <Link to={`/profile/${lobbyUser.id}`} className="hover:text-orange-400 flex-1">
                  {lobbyUser.username}
                </Link>
                {lobbyUser.id === user.id && (
                  <span className="text-orange-400 font-medium"> (You)</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
};

export default LobbyPage;
