import React, { useState, useEffect } from "react";
import { useStore } from "../store";

const ProfilePage = ({ onReturnToLobby }) => {
  const { user, token } = useStore();
  const [profileData, setProfileData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;

    const fetchProfile = async () => {
      setLoading(true);
      setError(null);
      try {
        // Reverted to use fetch
        const response = await fetch(
          `http://localhost:8000/api/players/${user.id}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
            },
          }
        );
        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.detail || "Failed to fetch player profile.");
        }
        const data = await response.json();
        setProfileData(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [user, token]);

  const handleViewGame = async (gameId) => {
    try {
      const response = await fetch(
        `http://localhost:8000/api/games/${gameId}`,
        {
          headers: {
            // This endpoint is secure and needs the token
            Authorization: `Bearer ${token}`,
          },
        }
      );
      if (!response.ok) {
        throw new Error("Failed to fetch game details.");
      }
      const data = await response.json();
      useStore.setState({
        gameResult: data,
        view: "post_game",
      });
    } catch (err) {
      console.error("Failed to fetch game record:", err);
      setError("Could not load game details.");
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-full">
        <div className="text-lg">Loading profile...</div>
      </div>
    );
  }

  if (error) {
    return <div className="text-red-400 text-center p-4">Error: {error}</div>;
  }

  if (!profileData) {
    return <div className="text-center p-4">No profile data found.</div>;
  }

  const { games_played, wins, game_history } = profileData;

  return (
    <div className="bg-slate-700 p-6 rounded-lg shadow-lg max-w-3xl mx-auto animate-fade-in">
      <div className="flex justify-between items-start mb-4">
        <h2 className="text-3xl font-bold text-yellow-300">
          Profile: {profileData.user.username}
        </h2>
        <button onClick={onReturnToLobby} className="btn">
          Back
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6 text-lg bg-slate-800 p-4 rounded-md">
        <p>
          <strong className="text-slate-300">Games Played:</strong>{" "}
          {games_played}
        </p>
        <p>
          <strong className="text-slate-300">Wins:</strong> {wins}
        </p>
      </div>

      <h3 className="text-2xl font-semibold mb-3">Game History</h3>
      <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
        {game_history && game_history.length > 0 ? (
          game_history
            .sort((a, b) => new Date(b.ended_at) - new Date(a.ended_at)) // Show most recent first
            .map((game) => (
              <div
                key={game.game_record_id}
                className={`p-3 rounded-md flex justify-between items-center cursor-pointer transition-colors hover:bg-slate-500 ${
                  game.ended_at
                    ? game.is_win
                      ? "bg-green-800/50"
                      : "bg-red-800/50"
                    : "bg-blue-800/50"
                }`}
                onClick={() => handleViewGame(game.game_record_id)}
              >
                <div>
                  <p className="font-semibold">{game.room_name}</p>
                  <p className="text-sm text-slate-300">
                    {new Date(
                      game.ended_at || game.started_at
                    ).toLocaleString()}
                  </p>
                </div>
                <div className="text-right">
                  <span
                    className={`font-bold text-lg ${
                      game.ended_at
                        ? game.is_win
                          ? "text-green-300"
                          : "text-red-300"
                        : "text-blue-300"
                    }`}
                  >
                    {game.ended_at
                      ? game.is_win
                        ? "Win"
                        : "Loss"
                      : "In Progress"}
                  </span>
                </div>
              </div>
            ))
        ) : (
          <p className="text-slate-400">No game history available yet.</p>
        )}
      </div>
    </div>
  );
};

export default ProfilePage;
