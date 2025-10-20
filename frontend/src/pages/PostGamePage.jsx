import React, { useState, useEffect } from "react";

// --- START MODIFICATION: Add polling for game status ---
const PostGamePage = ({ resultId, onReturnToLobby }) => {
  const [gameRecord, setGameRecord] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchGameRecord = async () => {
      // No need to set loading to true on polls
      try {
        // The correct endpoint is /api/games/{game_record_id}
        const response = await fetch(`/api/games/${resultId}`);
        if (!response.ok) {
          // Robust error handling: Check content-type before parsing
          const contentType = response.headers.get("content-type");
          let errorMessage = "An unknown error occurred.";
          if (contentType && contentType.includes("application/json")) {
            const errData = await response.json();
            errorMessage = errData.detail || "Game record not found.";
          } else {
            errorMessage = await response.text();
          }
          throw new Error(errorMessage);
        }
        const data = await response.json();
        setGameRecord(data);
      } catch (err) {
        // Only set error on initial fetch, not on polling errors
        if (loading) {
          setError(err.message);
        }
        console.error("Failed to fetch game record:", err);
      } finally {
        // Only set loading to false on the initial fetch
        if (loading) {
          setLoading(false);
        }
      }
    };

    fetchGameRecord(); // Initial fetch

    // Set up an interval to poll for updates if the game is in progress
    const intervalId = setInterval(() => {
      setGameRecord((currentRecord) => {
        if (currentRecord && currentRecord.status === "in_progress") {
          fetchGameRecord();
        }
        return currentRecord;
      });
    }, 5000); // Poll every 5 seconds

    return () => clearInterval(intervalId); // Cleanup on unmount
  }, [resultId]); // Rerun effect if resultId changes
  // --- END MODIFICATION ---

  if (loading) {
    return <div>Loading results...</div>;
  }

  const isGameInProgress = gameRecord?.status === "in_progress";

  return (
    <div className="bg-slate-700 p-8 rounded-lg shadow-lg max-w-2xl mx-auto text-center">
      <h1 className="text-5xl font-bold mb-4 text-yellow-300">
        {isGameInProgress ? "Game in Progress" : "Game Over"}
      </h1>

      {isGameInProgress && (
        <p className="text-slate-300 mb-6">
          You have left the game. Waiting for the final results...
        </p>
      )}

      {error && <p className="text-red-400 text-xl mb-6">{error}</p>}

      {gameRecord && (
        <div className="text-lg space-y-3 mb-8">
          <p>
            <strong>Room:</strong> {gameRecord.room_name}
          </p>
          <p>
            <strong>Winner:</strong>
            <span className="font-semibold ml-2">
              {isGameInProgress
                ? "To be determined..."
                : gameRecord.winner
                ? gameRecord.winner.username
                : "The Pigs have won."}
            </span>
          </p>
          <p>
            <strong>Players:</strong>{" "}
            {gameRecord.players.map((p) => p.username).join(", ")}
          </p>
        </div>
      )}

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
