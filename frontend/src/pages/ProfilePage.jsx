import React, { useState, useEffect } from "react";
import { useStore } from "../store";
import { useParams, useNavigate } from "react-router-dom"; // Import hooks

// This component no longer needs props for navigation
const ProfilePage = () => {
  const { user, token } = useStore();
  const { userId } = useParams(); // Get user ID from URL
  const navigate = useNavigate(); // Get navigation function
  
  const [profileData, setProfileData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  // Button Style
  const btn = "py-2 px-4 font-semibold rounded-md shadow-md transition duration-200 ease-in-out disabled:opacity-50";
  const btnSecondary = `${btn} bg-gray-600 hover:bg-gray-500 text-white`;

  useEffect(() => {
    // Use the userId from the URL param, not from the store
    if (!userId) return;

    const fetchProfile = async () => {
      setLoading(true);
      setError(null);
      try {
        // Fetch profile for the user in the URL
        const response = await fetch(
          `http://localhost:8000/api/players/${userId}`,
          {
            headers: {
              Authorization: `Bearer ${token}`, // Still need our own token for auth
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
  }, [userId, token]); // Effect depends on URL param

  const handleViewGame = (gameId) => {
    // Simply navigate. The PostGamePage will be responsible
    // for fetching its own data based on the gameId param.
    navigate(`/post-game/${gameId}`);
  };

  const handleReturnToLobby = () => {
    navigate("/lobby"); // Simple navigation
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-full pt-20">
        <div className="text-lg text-gray-400">Loading profile...</div>
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-400 ml-3"></div>
      </div>
    );
  }

  if (error) {
    return <div className="text-red-400 text-center p-4">Error: {error}</div>;
  }

  if (!profileData) {
    return <div className="text-center p-4 text-gray-400">No profile data found.</div>;
  }

  const { games_played, wins, game_history } = profileData;

  return (
    <div className="bg-gray-800 p-6 rounded-lg border border-gray-700 max-w-3xl mx-auto animate-fade-in">
      <div className="flex justify-between items-start mb-4">
        <h2 className="text-3xl font-bold text-orange-400">
          Profile: {profileData.user.username}
        </h2>
        <button onClick={handleReturnToLobby} className={btnSecondary}>
          Back to Lobby
        </button>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6 text-lg bg-gray-900 p-4 rounded-md border border-gray-700">
        <p>
          <strong className="text-gray-400">Games Played:</strong>{" "}
          <span className="text-orange-400 font-bold">{games_played}</span>
        </p>
        <p>
          <strong className="text-gray-400">Wins:</strong>{" "}
          <span className="text-green-400 font-bold">{wins}</span>
        </p>
      </div>

      <h3 className="text-2xl font-semibold mb-3 text-gray-100">Game History</h3>
      <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
        {game_history && game_history.length > 0 ? (
          game_history
            .sort((a, b) => new Date(b.ended_at) - new Date(a.ended_at))
            .map((game) => (
              <div
                key={game.game_record_id}
                className={`p-3 rounded-md flex justify-between items-center cursor-pointer transition-colors hover:bg-gray-600 border ${
                  game.ended_at
                    ? game.is_win
                      ? "bg-green-900/50 border-green-700/50"
                      : "bg-red-900/50 border-red-700/50"
                    : "bg-blue-900/50 border-blue-700/50"
                }`}
                onClick={() => handleViewGame(game.game_record_id)}
              >
                <div>
                  <p className="font-semibold text-gray-100">{game.room_name}</p>
                  <p className="text-sm text-gray-400">
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
          <p className="text-gray-400">No game history available yet.</p>
        )}
      </div>
    </div>
  );
};

export default ProfilePage;