import React from "react";

const PostGamePage = ({ gameRecord, onReturnToLobby }) => {
  if (!gameRecord) {
    return <div>Loading results...</div>;
  }

  const { room_name, winner, participants } = gameRecord;

  return (
    <div className="bg-slate-700 p-8 rounded-lg shadow-lg max-w-2xl mx-auto text-center animate-fade-in">
      <h1 className="text-5xl font-bold mb-4 text-yellow-300">Game Over</h1>
      <div className="text-lg space-y-3 mb-8 bg-slate-800/50 p-6 rounded-md">
        <p>
          <strong>Room:</strong> {room_name}
        </p>
        <p className="text-2xl">
          <strong>Winner:</strong>
          <span className="font-semibold ml-2 text-green-300">
            {winner ? winner.username : "No one"}
          </span>
        </p>
        <div>
          <strong className="block mb-2">Participants:</strong>
          <ul className="space-y-1">
            {participants.map((p) => (
              <li key={p.user.id}>
                {p.user.username} -{" "}
                <span className="text-slate-400">{p.status}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <button
        onClick={onReturnToLobby}
        className="btn btn-primary text-xl px-8 py-3"
      >
        Return to Lobby
      </button>
    </div>
  );
};

export default PostGamePage;
