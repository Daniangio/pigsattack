import React, { useState, useEffect } from "react";
import { useStore } from "../store";

const PostGamePage = ({ resultId, onReturnToLobby }) => {
  const [gameRecord, setGameRecord] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const fetchGameRecord = async () => {
      try {
        const response = await fetch(
          `http://localhost:8000/api/results/${resultId}`
        );
        if (!response.ok) {
          throw new Error("Game record not found.");
        }
        const data = await response.json();
        setGameRecord(data);
      } catch (err) {
        setError(err.message);
      }
    };

    fetchGameRecord();
  }, [resultId]);

  if (error) {
    return <div className="text-center text-red-400">{error}</div>;
  }

  if (!gameRecord) {
    return <div>Loading results...</div>;
  }

  const { winner } = gameRecord;

  return (
    <div className="text-center">
      <h1 className="text-5xl font-bold mb-4 text-yellow-400">Game Over</h1>
      <p className="text-2xl mb-8">
        {winner ? (
          <>
            Winner: <span className="font-semibold">{winner.username}</span>
          </>
        ) : (
          "The game ended in a draw. The pigs have won."
        )}
      </p>

      <button onClick={onReturnToLobby} className="btn btn-primary text-xl">
        Return to Lobby
      </button>
    </div>
  );
};

export default PostGamePage;
