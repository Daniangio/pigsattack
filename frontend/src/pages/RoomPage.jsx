import React, { useEffect } from "react";
import { useStore } from "../store.js";
import { useParams, useNavigate } from "react-router-dom";

// onLogout is passed down from AppContent
const RoomPage = ({ onLogout }) => {
  const { user, roomState } = useStore();
  const sendMessage = useStore((state) => state.sendMessage);
  const { roomId } = useParams(); // Get room ID from URL
  const navigate = useNavigate();

  // Button Styles
  const btn = "py-2 px-4 font-semibold rounded-md shadow-md transition duration-200 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed";
  const btnPrimary = `${btn} bg-orange-600 hover:bg-orange-700 text-white`;
  const btnSecondary = `${btn} bg-gray-600 hover:bg-gray-500 text-white`;
  const btnDanger = `${btn} bg-red-700 hover:bg-red-800 text-white`;

  // This effect handles being kicked or the room dissolving.
  // If roomState becomes null while we are on this page, go to lobby.
  useEffect(() => {
    if (roomState === null) {
      console.log("Room state is null, navigating to lobby.");
      navigate("/lobby", { replace: true });
    }
    // Also check if the roomState.id matches our URL param
    if (roomState && roomState.id !== roomId) {
      console.log("Room state mismatch, navigating to lobby.");
      navigate("/lobby", { replace: true });
    }
  }, [roomState, navigate, roomId]);

  if (!roomState || roomState.id !== roomId) {
    // This also handles the case where the user joins via URL
    // before the roomState has populated.
    return (
      <div className="flex justify-center items-center h-screen">
         <div className="text-lg text-gray-400">Loading room...</div>
      </div>
    );
  }

  const isHost = user?.id === roomState.host_id;
  const canStartGame = roomState.players.length >= 2;

  const handleLeaveRoom = () => {
    if (sendMessage) {
      sendMessage({ action: "leave_room" });
      // We explicitly navigate away. The server will update
      // everyone else and send a 'force_to_lobby' to us.
      navigate("/lobby");
    }
  };
  
  const handleStartGame = () => {
    if (isHost && canStartGame && sendMessage) {
      // Send start message. The server will reply with
      // 'game_state_update', and the StateGuard will
      // navigate us to the game.
      sendMessage({ action: "start_game" });
    }
  };

  const handleViewProfile = () => {
    navigate(`/profile/${user.id}`);
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