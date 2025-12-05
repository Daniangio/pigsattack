import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useStore } from "../store";

const PostGamePage = ({ onReturnToLobby }) => {
  const navigate = useNavigate();
  const { gameId: routeGameId } = useParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const hasFetched = useRef(false);
  const { user, gameRecord, sendMessage, token, setGameResult, clearGameResult } = useStore(
    (state) => ({
      user: state.user,
      gameRecord: state.gameResult,
      sendMessage: state.sendMessage,
      token: state.token,
      setGameResult: (payload) => state.handleGameResult(payload),
      clearGameResult: state.clearGameResult,
    })
  );

  useEffect(() => {
    const needsFetch = !gameRecord || (routeGameId && gameRecord?.id !== routeGameId);
    if (!needsFetch || !routeGameId || hasFetched.current) return;
    const fetchResult = async () => {
      setLoading(true);
      setError("");
      try {
        const res = await fetch(`http://localhost:8000/api/results/${routeGameId}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) {
          throw new Error("Could not load game result.");
        }
        const data = await res.json();
        if (setGameResult) {
          setGameResult(data);
        }
      } catch (err) {
        console.error(err);
        setError(err.message || "Failed to load game result.");
      } finally {
        setLoading(false);
        hasFetched.current = true;
      }
    };
    fetchResult();
  }, [routeGameId, gameRecord, token, setGameResult]);

  if (loading) {
    return (
      <div className="text-center p-8">
        <h2 className="text-2xl font-bold text-slate-100">Loading...</h2>
        <p>Please wait while we load the game result.</p>
      </div>
    );
  }

  if (!gameRecord) {
    return (
      <div className="text-center p-8">
        <h2 className="text-2xl font-bold text-red-500">Error</h2>
        <p>{error || "No game record found."}</p>
        <button onClick={onReturnToLobby} className="btn btn-primary mt-4">
          Return to Lobby
        </button>
      </div>
    );
  }

  const { winner, participants, room_name, ended_at, status } = gameRecord;
  const isWinner = winner && user && winner.id === user.id;

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
              <li key={p.user?.id || p.id || p.username}>
                {p.username} -{" "}
                <span className="text-slate-400 capitalize">
                  {p.status.toLowerCase()}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="flex justify-center space-x-4 mt-8">
        <button
          onClick={() => {
            if (clearGameResult) {
              clearGameResult();
            }
            hasFetched.current = false;
            onReturnToLobby?.();
            navigate("/lobby");
          }}
          className="btn btn-primary"
        >
          Return to Lobby
        </button>
      </div>
    </div>
  );
};

export default PostGamePage;
