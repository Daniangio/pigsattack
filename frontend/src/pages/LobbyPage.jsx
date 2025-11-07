import React, { useState } from "react";
import { useStore } from "../store";
import { useNavigate, Link } from "react-router-dom";

// onLogout is passed down from AppContent
const LobbyPage = ({ onLogout }) => {
  const { user, lobbyState } = useStore();
  const sendMessage = useStore((state) => state.sendMessage);
  const [newRoomName, setNewRoomName] = useState("");
  const navigate = useNavigate();

  if (!lobbyState) {
    return <div>Loading lobby...</div>; // Safety check
  }

  const handleCreateRoom = (e) => {
    e.preventDefault();
    if (newRoomName.trim() && sendMessage) {
      // We send the message.
      // The server will reply with a 'room_created' message.
      // The useGameSocket hook will catch that message and navigate us.
      sendMessage({
        action: "create_room",
        payload: { room_name: newRoomName },
      });
      setNewRoomName("");
    }
  };

  const handleJoinRoom = (roomId) => {
    if (sendMessage) {
      // We explicitly navigate. The server will send a 'room_state'
      // broadcast, which our store will pick up, updating the page
      // we just landed on.
      sendMessage({ action: "join_room", payload: { room_id: roomId } });
      navigate(`/room/${roomId}`);
    }
  };

  const handleSpectateGame = (gameRecordId) => {
    if (sendMessage) {
      // Spectating is like joining a room, but the server
      // will send a 'game_state_update' instead, and the
      // StateGuard will force us to the game page.
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

  // Button Styles
  const btn = "py-2 px-4 font-semibold rounded-md shadow-md transition duration-200 ease-in-out disabled:opacity-50";
  const btnPrimary = `${btn} bg-orange-600 hover:bg-orange-700 text-white`;
  const btnSecondary = `${btn} bg-gray-600 hover:bg-gray-500 text-white`;
  const btnDanger = `${btn} bg-red-700 hover:bg-red-800 text-white`;
  const btnInfo = `${btn} bg-blue-600 hover:bg-blue-700 text-white`;

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
            <button type="submit" className={btnPrimary}>
              Create Room
            </button>
          </form>
          
          <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
            {lobbyState.rooms.length > 0 ? (
              lobbyState.rooms.map((room) => (
                <div
                  key={room.id}
                  className="flex justify-between items-center p-3 bg-gray-700 rounded-md border border-gray-600 hover:bg-gray-600 transition-colors"
                >
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
                    >
                      Spectate
                    </button>
                  ) : (
                    <button
                      onClick={() => handleJoinRoom(room.id)}
                      className={btnSecondary}
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
            {lobbyState.users.map((lobbyUser) => (
              <li
                key={lobbyUser.id}
                className="px-3 py-2 bg-gray-700 border border-gray-600 rounded-md text-gray-300"
              >
                <Link to={`/profile/${lobbyUser.id}`} className="hover:text-orange-400">
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