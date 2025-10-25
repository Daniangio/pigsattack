import React from "react";
import { useStore } from "../store";

const PostGamePage = ({ gameRecord, onReturnToLobby, sendMessage }) => {
  const { user } = useStore();
  if (!gameRecord) {
    return (
      <div className="text-center p-8">
        <h2 className="text-2xl font-bold text-red-500">Error</h2>
        <p>No game record found.</p>
        <button onClick={onReturnToLobby} className="btn btn-primary mt-4">
          Return to Lobby
        </button>
      </div>
    );
  }

  const handleSpectate = () => {
    sendMessage({
      action: "spectate_game",
      payload: { game_record_id: gameRecord.id },
    });
  };

  const { winner, participants, room_name, ended_at, status } = gameRecord;
  const isWinner = winner && user && winner.id === user.id;
  const myParticipantInfo = participants.find((p) => p.user.id === user?.id);
  const myStatus = myParticipantInfo?.status || "SPECTATOR";

  return (
    <div className="bg-slate-700 p-8 rounded-lg shadow-lg max-w-2xl mx-auto text-center animate-fade-in">
      <h1 className="text-5xl font-bold mb-4 text-yellow-300">
        {status === "completed" ? "Game Over" : "Game In Progress"}
      </h1>
      <div className="text-lg space-y-3 mb-8 bg-slate-800/50 p-6 rounded-md">
        <p>
          <strong>Room:</strong> {room_name}
        </p>
        {status === "completed" && (
          <p className="text-2xl">
            <strong>Winner:</strong>
            <span
              className={`font-semibold ml-2 ${
                isWinner ? "text-green-300" : "text-red-300"
              }`}
            >
              {winner ? winner.username : "No one"}
            </span>
          </p>
        )}
        <div>
          <strong className="block mb-2">Participants:</strong>
          <ul className="space-y-1">
            {participants.map((p) => (
              <li key={p.user.id}>
                {p.user.username} -{" "}
                <span className="text-slate-400 capitalize">
                  {p.status.toLowerCase()}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="flex justify-center space-x-4 mt-8">
        <button onClick={onReturnToLobby} className="btn btn-primary">
          Return to Lobby
        </button>
        {status === "in_progress" && myStatus !== "ACTIVE" && (
          <button onClick={handleSpectate} className="btn btn-info">
            Spectate Game
          </button>
        )}
      </div>
    </div>
  );
};

export default PostGamePage;
