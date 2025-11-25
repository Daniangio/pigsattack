import React from "react"; // --- REFACTOR: Removed useEffect and useRef
import { useStore } from "../store.js";
import { useParams, useNavigate } from "react-router-dom";

const RoomPage = ({ onLogout }) => {
  const { user, roomState } = useStore();
  const sendMessage = useStore((state) => state.sendMessage);
  const { roomId } = useParams();
  const navigate = useNavigate();

  // --- REFACTOR: Removed the complex useEffect and hasLoadedRoom ref ---
  // The StateGuard in App.jsx now handles all navigation logic:
  // 1. If roomState is null, StateGuard redirects from /room/* to /lobby.
  // 2. If roomState is for a different room, StateGuard redirects to the correct room.
  
  // This loading gate is now the *only* logic needed.
  // It handles the initial load while waiting for the server
  // to send the room_state message.
  if (!roomState || roomState.id !== roomId) {
    return (
      <div className="flex justify-center items-center h-screen">
         <div className="text-lg text-gray-400">Loading room...</div>
      </div>
    );
  }
  // --- END REFACTOR ---


  // If we get here, roomState is valid and matches roomId.

  const btn = "py-2 px-4 font-semibold rounded-md shadow-md transition duration-200 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed";
  const btnPrimary = `${btn} bg-orange-600 hover:bg-orange-700 text-white`;
  const btnSecondary = `${btn} bg-gray-600 hover:bg-gray-500 text-white`;
  const btnInfo = `${btn} bg-blue-600 hover:bg-blue-700 text-white`;
  const btnDanger = `${btn} bg-red-700 hover:bg-red-800 text-white`;

  const isHost = user?.id === roomState.host_id;
  const canStartGame = roomState.players.length >= 2;
  const roomFull = roomState.players.length >= 5;
  const bots = roomState.players.filter((p) => p.is_bot);

  const handleLeaveRoom = () => {
    if (sendMessage) {
      sendMessage({ action: "leave_room" });
      // We still optimistically navigate here. The StateGuard
      // will also get the updated state and confirm this.
      navigate("/lobby");
    }
  };
  
  const handleStartGame = () => {
    if (isHost && canStartGame && sendMessage) {
      sendMessage({ action: "start_game" });
      // No navigation needed. StateGuard will handle the
      // navigation to /game/:gameId when gameState is received.
    }
  };

  const handleViewProfile = () => {
    navigate(`/profile/${user.id}`);
  };

  const handleGoToLobby = () => {
    navigate('/lobby');
  };

  const handleAddBot = () => {
    if (!sendMessage || !isHost) return;
    sendMessage({ action: "add_bot", payload: { room_id: roomId } });
  };

  const handleRemoveBot = () => {
    if (!sendMessage || !isHost) return;
    const bot = roomState.players.find((p) => p.is_bot);
    if (!bot) return;
    sendMessage({ action: "remove_bot", payload: { room_id: roomId, bot_id: bot.id } });
  };

  return (
    <div className="animate-fade-in">
      <header className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
        <h1 className="text-3xl font-bold">
          Room: <span className="text-orange-400">{roomState.name}</span>
        </h1>
        <div className="flex items-center gap-3">
          <span className="text-lg text-gray-300">
            Player: <span className="font-semibold text-orange-400">{user?.username}</span>
          </span>
          <button onClick={handleGoToLobby} className={btnSecondary}>
            Lobby
          </button>
          <button onClick={handleViewProfile} className={btnSecondary}>
            Profile
          </button>
          <button onClick={onLogout} className={btnDanger}>
            Logout
          </button>
        </div>
      </header>

      <div className="grid md:grid-cols-3 gap-6">
        {/* Players List */}
        <div className="md:col-span-2 p-6 bg-gray-800 rounded-lg border border-gray-700">
          <h2 className="text-2xl font-semibold mb-4 text-gray-100">Players</h2>
          <ul className="space-y-2">
            {roomState.players.map((p) => (
              <li key={p.id} className="p-3 bg-gray-700 border border-gray-600 rounded-md text-gray-200">
                {p.username}
                {p.id === roomState.host_id && (
                  <span className="ml-2 text-xs font-bold text-orange-400">(Host)</span>
                )}
                {p.id === user.id && (
                  <span className="ml-2 text-xs font-medium text-gray-400">(You)</span>
                )}
              </li>
            ))}
          </ul>
        </div>

        {/* Actions */}
        <div className="p-6 bg-gray-800 rounded-lg border border-gray-700 flex flex-col justify-between">
          <div>
            <h2 className="text-2xl font-semibold mb-4 text-gray-100">Actions</h2>
            {isHost && (
              <button
                onClick={handleStartGame}
                disabled={!canStartGame}
                className={`${btnPrimary} w-full mb-2`}
              >
                Start Game
              </button>
            )}
            {!canStartGame && isHost && (
              <p className="text-sm text-gray-400 text-center mb-4">
                Need at least 2 players to start.
              </p>
            )}
            {isHost && canStartGame && (
               <p className="text-sm text-green-400 text-center mb-4">
                Ready to start!
              </p>
            )}
            {!isHost && (
              <p className="text-sm text-gray-400 text-center mb-4">
                Waiting for host to start the game...
              </p>
            )}
            {isHost && (
              <div className="mt-4 space-y-2">
                <button
                  onClick={handleAddBot}
                  disabled={roomFull}
                  className={`${btnInfo} w-full`}
                  title={roomFull ? "Room is full" : "Add a bot to this room"}
                >
                  Add Bot
                </button>
                <button
                  onClick={handleRemoveBot}
                  disabled={!bots.length}
                  className={`${btnSecondary} w-full`}
                  title={!bots.length ? "No bots to remove" : "Remove a bot from this room"}
                >
                  Remove Bot
                </button>
              </div>
            )}
          </div>
          <button
            onClick={handleLeaveRoom}
            className={`${btnSecondary} w-full mt-auto`}
          >
            Leave Room
          </button>
        </div>
      </div>
    </div>
  );
};

export default RoomPage;
