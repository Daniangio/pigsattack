import React, { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useStore } from "../store";
import { apiBaseUrl } from "../utils/connection";

const PostGamePage = () => {
  const navigate = useNavigate();
  const { gameId: routeGameId } = useParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [record, setRecord] = useState(null);
  const fetchedIdRef = useRef(null);
  const user = useStore((state) => state.user);
  const gameRecord = useStore((state) => state.gameResult);
  const sendMessage = useStore((state) => state.sendMessage);
  const token = useStore((state) => state.token);
  const setGameResult = useStore((state) => state.handleGameResult);
  const clearGameResult = useStore((state) => state.clearGameResult);
  const roomState = useStore((state) => state.roomState);
  const apiBase = apiBaseUrl;
  const inFlightRef = useRef(false);

  // Sync store gameResult into local record when it matches
  useEffect(() => {
    if (gameRecord && gameRecord.id === routeGameId) {
      setRecord(gameRecord);
      setLoading(false);
      fetchedIdRef.current = routeGameId;
    }
  }, [gameRecord, routeGameId]);

  useEffect(() => {
    if (!routeGameId) return;
    if (record && record.id === routeGameId) {
      setLoading(false);
      return;
    }
    if (fetchedIdRef.current === routeGameId || inFlightRef.current) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    inFlightRef.current = true;
    setLoading(true);
    setError("");
    fetch(`${apiBase}/api/results/${routeGameId}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal: controller.signal,
    })
      .then((res) => {
        if (!res.ok) throw new Error("Could not load game record.");
        return res.json();
      })
      .then((data) => {
        if (cancelled) return;
        fetchedIdRef.current = routeGameId;
        setRecord(data);
        setGameResult?.(data);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error(err);
        const msg =
          err.name === "AbortError"
            ? "Request timed out while loading game record."
            : err.message || "Failed to load game record.";
        setError(msg);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
        inFlightRef.current = false;
        clearTimeout(timeoutId);
      });
    return () => {
      cancelled = true;
      controller.abort();
      clearTimeout(timeoutId);
    };
  }, [routeGameId, token, apiBase, setGameResult, record]);

  const handleReturnToLobby = () => {
    if (clearGameResult) {
      clearGameResult();
    }
    if (sendMessage) {
      sendMessage({ action: "return_to_lobby" });
    }
    navigate("/lobby");
  };

  const handleSpectate = () => {
    if (!routeGameId) return;
    if (clearGameResult) clearGameResult();
    // If we are already in a room for this game, just navigate to the game.
    if (roomState && roomState.status === "in_game" && roomState.game_record_id === routeGameId) {
      navigate(`/game/${routeGameId}`);
      return;
    }
    if (sendMessage) {
      sendMessage({ action: "spectate_game", payload: { game_record_id: routeGameId } });
    }
    navigate(`/game/${routeGameId}`);
  };

  if (loading) {
    return (
      <div className="text-center p-8">
        <h2 className="text-2xl font-bold text-slate-100">Loading...</h2>
        <p>Please wait while we load the game result.</p>
      </div>
    );
  }

  if (!record) {
    return (
      <div className="text-center p-8">
        <h2 className="text-2xl font-bold text-red-500">Error</h2>
        <p>{error || "No game record found."}</p>
        <button
          onClick={handleReturnToLobby}
          className="px-4 py-2 rounded-lg border border-amber-400 text-amber-100 hover:bg-amber-400/10 mt-4"
        >
          Return to Lobby
        </button>
      </div>
    );
  }

  const { winner, participants, room_name, ended_at, status } = record;
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
          onClick={handleReturnToLobby}
          className="px-4 py-2 rounded-lg border border-amber-400 text-amber-100 hover:bg-amber-400/10"
        >
          Return to Lobby
        </button>
        {status !== "completed" && (
          <button
            onClick={handleSpectate}
            className="px-4 py-2 rounded-lg border border-emerald-400 text-emerald-100 hover:bg-emerald-400/10"
          >
            Spectate (ongoing)
          </button>
        )}
      </div>
    </div>
  );
};

export default PostGamePage;
