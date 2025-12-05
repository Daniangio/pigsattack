import React, { useState, useEffect } from "react";
import { useStore } from "../store";
import { useParams, useNavigate } from "react-router-dom"; // Import hooks
import { playerIcons as availablePlayerIcons } from "./game/GameConstants";

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
        You are in room:{" "}
        <span className="font-bold text-orange-300">{roomState.name}</span>
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

// This component no longer needs props for navigation
const ProfilePage = ({ onLogout }) => {
  const { user, token, roomState, avatarChoice, setAvatarChoice } = useStore();
  const { userId } = useParams(); // Get user ID from URL
  const navigate = useNavigate(); // Get navigation function

  const [profileData, setProfileData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const btn =
    "py-2 px-4 font-semibold rounded-md shadow-md transition duration-200 ease-in-out disabled:opacity-50";
  const btnSecondary = `${btn} bg-gray-600 hover:bg-gray-500 text-white`;
  const btnDanger = `${btn} bg-red-700 hover:bg-red-800 text-white`;
  const btnGhost = `${btn} bg-gray-700 hover:bg-gray-600 text-white border border-gray-600`;
  const apiBase = import.meta.env.VITE_API_URL || "http://localhost:8000";

  useEffect(() => {
    // Use the userId from the URL param, fall back to current user if missing
    const targetUserId = userId || user?.id;
    if (!targetUserId) {
      setError("No user selected.");
      setLoading(false);
      return;
    }

    let timeoutId;
    let cancelled = false;

    const fetchProfile = async () => {
      console.log("[ProfilePage] Fetching profile", {
        targetUserId,
        apiBase,
        hasToken: !!token,
      });
      setLoading(true);
      setError(null);
      timeoutId = setTimeout(() => {
        setError("Profile request timed out. Please try again.");
        setLoading(false);
      }, 8000);
      try {
        // Fetch profile for the user in the URL
        const headers = token ? { Authorization: `Bearer ${token}` } : {};
        const response = await fetch(`${apiBase}/api/players/${targetUserId}`, {
          headers,
        });
        if (!response.ok) {
          const errData = await response.json();
          throw new Error(errData.detail || "Failed to fetch player profile.");
        }
        const data = await response.json();
        if (!cancelled) setProfileData(data);
      } catch (err) {
        console.error("Failed to load profile", err);
        if (!cancelled) setError(err.message);
      } finally {
        clearTimeout(timeoutId);
        if (!cancelled) setLoading(false);
      }
    };

    fetchProfile();
    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [userId, user?.id, token, apiBase]); // Effect depends on URL param

  const handleViewGame = (gameId) => {
    // Simply navigate. The PostGamePage will be responsible
    // for fetching its own data based on the gameId param.
    navigate(`/post-game/${gameId}`);
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
    return (
      <div className="text-center p-4 text-gray-400">
        No profile data found.
      </div>
    );
  }

  const { games_played, wins, game_history } = profileData;
  const currentAvatar = avatarChoice;

  return (
    <div className="bg-gray-800 p-6 rounded-lg border border-gray-700 max-w-3xl mx-auto animate-fade-in">
      <header className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
        <h1 className="text-3xl font-bold text-orange-400">
          Profile:{" "}
          <span className="text-gray-200">{profileData.user.username}</span>
        </h1>
        <div className="flex items-center gap-3">
          <span className="text-lg text-gray-300">
            Player:{" "}
            <span className="font-semibold text-orange-400">
              {user?.username}
            </span>
          </span>
          <button onClick={() => navigate("/lobby")} className={btnSecondary}>
            Lobby
          </button>
          <button
            onClick={() => navigate(`/profile/${user.id}`)}
            className={btnSecondary}
            disabled={user.id === userId}
          >
            Profile
          </button>
          <button onClick={onLogout} className={btnDanger}>
            Logout
          </button>
        </div>
      </header>

      <CurrentRoomBanner />

      <div className="mb-6 bg-gray-900 p-4 rounded-md border border-gray-700">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h3 className="text-lg font-semibold text-gray-100">Avatar</h3>
            <p className="text-sm text-gray-400">Choose the icon shown for you in game.</p>
          </div>
          {currentAvatar ? (
            <div
              className="w-12 h-12 rounded-full border-2 border-orange-400 bg-gray-800 overflow-hidden"
              title="Current avatar"
            >
              <img src={currentAvatar} alt="Selected avatar" className="w-full h-full object-cover" />
            </div>
          ) : (
            <div className="text-xs text-gray-400">No avatar selected</div>
          )}
        </div>
        <div className="grid grid-cols-5 gap-3">
          {availablePlayerIcons.map((icon, idx) => {
            const selected = currentAvatar === icon;
            return (
              <button
                key={idx}
                onClick={() => setAvatarChoice(icon)}
                className={`relative rounded-full overflow-hidden border-2 transition ${
                  selected ? "border-orange-400 shadow-[0_0_0_3px_rgba(251,146,60,0.25)]" : "border-gray-700 hover:border-orange-300"
                }`}
                title="Set as avatar"
              >
                <img src={icon} alt={`Avatar ${idx + 1}`} className="w-14 h-14 object-cover" />
                {selected && (
                  <span className="absolute inset-0 rounded-full ring-2 ring-orange-400/70 pointer-events-none" />
                )}
              </button>
            );
          })}
        </div>
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

      <h3 className="text-2xl font-semibold mb-3 text-gray-100">
        Game History
      </h3>
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
                  <p className="font-semibold text-gray-100">
                    {game.room_name}
                  </p>
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
