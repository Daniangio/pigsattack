import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Crown } from "lucide-react";
import { useStore } from "../store";
import { buildApiUrl } from "../utils/connection";

const normalizeTokens = (tokens = {}) => ({
  attack: Number(tokens.attack ?? tokens.ATTACK ?? 0),
  conversion: Number(tokens.conversion ?? tokens.CONVERSION ?? 0),
  mass: Number(tokens.mass ?? tokens.MASS ?? 0),
  wild: Number(tokens.wild ?? tokens.WILD ?? 0),
});

const normalizeResources = (resources = {}) => ({
  R: Number(resources.R ?? resources.r ?? resources.RED ?? 0),
  B: Number(resources.B ?? resources.b ?? resources.BLUE ?? 0),
  G: Number(resources.G ?? resources.g ?? resources.GREEN ?? 0),
});

const computeScore = (vp = 0, wounds = 0, providedScore = null) => {
  if (typeof providedScore === "number") return providedScore;
  const penalty = wounds >= 10 ? 20 : wounds >= 5 ? 10 : 0;
  return vp - penalty;
};

const tokenStyles = {
  attack: "border-red-500/40 bg-red-500/10 text-red-200",
  conversion: "border-sky-500/40 bg-sky-500/10 text-sky-200",
  mass: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
  wild: "border-amber-500/40 bg-amber-500/10 text-amber-200",
};

const resourceStyles = {
  R: "border-red-500/40 bg-red-500/10 text-red-200",
  B: "border-blue-500/40 bg-blue-500/10 text-blue-200",
  G: "border-emerald-500/40 bg-emerald-500/10 text-emerald-200",
};

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
  const inFlightRef = useRef(false);

  const fetchGameRecord = async (gameId, signal) => {
    const urls = [
      buildApiUrl(`/api/results/${gameId}`),
      buildApiUrl(`/api/games/${gameId}`),
    ];
    let lastError = null;
    for (const url of urls) {
      try {
        const res = await fetch(url, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          signal,
        });
        if (!res.ok) {
          lastError = new Error("Could not load game record.");
          continue;
        }
        return await res.json();
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError || new Error("Failed to load game record.");
  };

  useEffect(() => {
    if (!routeGameId) return;
    fetchedIdRef.current = null;
    setRecord(null);
    setError("");
  }, [routeGameId]);

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
    if (inFlightRef.current) return;
    if (fetchedIdRef.current === routeGameId && record) return;
    let cancelled = false;
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    inFlightRef.current = true;
    setLoading(true);
    setError("");
    fetchGameRecord(routeGameId, controller.signal)
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
          err?.name === "AbortError"
            ? "Request timed out while loading game record."
            : err?.message || "Failed to load game record.";
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
  }, [routeGameId, token, setGameResult, record]);

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
    if (roomState && roomState.status === "in_game" && roomState.game_record_id === routeGameId) {
      navigate(`/game/${routeGameId}`);
      return;
    }
    if (sendMessage) {
      sendMessage({ action: "spectate_game", payload: { game_record_id: routeGameId } });
    }
    navigate(`/game/${routeGameId}`);
  };

  const handleRetry = () => {
    fetchedIdRef.current = null;
    setRecord(null);
    setError("");
  };

  const reportPlayers = useMemo(() => {
    if (!record) return [];
    const finalStats = record.final_stats || record.finalStats || [];
    if (finalStats.length) {
      return finalStats.map((entry) => {
        const tokens = normalizeTokens(entry.tokens || {});
        const resources = normalizeResources(entry.resources || {});
        const weapons = (entry.weapons || []).map((w) =>
          typeof w === "string" ? { name: w, uses: null } : w
        );
        const upgrades = (entry.upgrades || []).map((u) =>
          typeof u === "string" ? u : u?.name || u?.id || "Unknown"
        );
        return {
          userId: entry.user_id || entry.userId || "",
          username: entry.username || "Unknown",
          status: entry.status || "",
          vp: Number(entry.vp ?? 0),
          wounds: Number(entry.wounds ?? 0),
          score: computeScore(Number(entry.vp ?? 0), Number(entry.wounds ?? 0), entry.score),
          tokens,
          resources,
          threatsDefeated: Number(entry.threats_defeated ?? entry.threatsDefeated ?? 0),
          defeatedThreats: entry.defeated_threats || entry.defeatedThreats || [],
          weapons,
          upgrades,
          stance: entry.stance || "",
        };
      });
    }
    const participants = record.participants || [];
    return participants.map((p) => ({
      userId: p.user?.id || p.id || "",
      username: p.user?.username || p.username || "Unknown",
      status: p.status || "",
      vp: 0,
      wounds: 0,
      score: 0,
      tokens: normalizeTokens({}),
      resources: normalizeResources({}),
      threatsDefeated: 0,
      defeatedThreats: [],
      weapons: [],
      upgrades: [],
      stance: "",
    }));
  }, [record]);

  const sortedPlayers = useMemo(() => {
    return [...reportPlayers].sort((a, b) => (b.score || 0) - (a.score || 0));
  }, [reportPlayers]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100">
        <div className="text-center">
          <h2 className="text-2xl font-semibold">Loading report...</h2>
          <p className="text-slate-400 mt-2">Compiling final stats.</p>
        </div>
      </div>
    );
  }

  if (!record) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100 px-6">
        <div className="max-w-md text-center">
          <h2 className="text-2xl font-semibold text-rose-300">Report Unavailable</h2>
          <p className="text-slate-400 mt-2">{error || "No game record found."}</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center mt-6">
            <button
              onClick={handleRetry}
              className="px-4 py-2 rounded-lg border border-slate-600 text-slate-200 hover:bg-slate-800"
            >
              Retry
            </button>
            <button
              onClick={handleReturnToLobby}
              className="px-4 py-2 rounded-lg border border-amber-400 text-amber-100 hover:bg-amber-400/10"
            >
              Return to Lobby
            </button>
          </div>
        </div>
      </div>
    );
  }

  const { winner, room_name, ended_at, started_at, status } = record;
  const winnerName = winner?.username || "No one";
  const isWinner = winner && user && winner.id === user.id;
  const startedAtLabel = started_at ? new Date(started_at).toLocaleString() : "Unknown";
  const endedAtLabel = ended_at ? new Date(ended_at).toLocaleString() : "In progress";

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100">
      <div className="max-w-6xl mx-auto px-6 py-10">
        <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.4em] text-slate-500">Postgame Report</div>
            <h1 className="text-4xl font-semibold text-amber-200 mt-2">
              {status === "completed" ? "Game Over" : "Game In Progress"}
            </h1>
            <p className="text-slate-400 mt-2">Room {room_name} • Game {record.id}</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3">
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
        </header>

        <section className="grid gap-4 md:grid-cols-3 mt-8">
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
            <div className="flex items-center gap-2 text-slate-400 text-xs uppercase tracking-[0.2em]">
              <Crown size={14} className="text-amber-300" />
              Winner
            </div>
            <div className={`text-2xl font-semibold mt-2 ${isWinner ? "text-emerald-200" : "text-slate-100"}`}>
              {winnerName}
            </div>
            <div className="text-xs text-slate-500 mt-1">{isWinner ? "You won this match." : "Final standings below."}</div>
          </div>
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
            <div className="text-slate-400 text-xs uppercase tracking-[0.2em]">Timeline</div>
            <div className="text-sm text-slate-200 mt-2">Start: {startedAtLabel}</div>
            <div className="text-sm text-slate-200 mt-1">End: {endedAtLabel}</div>
          </div>
          <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-4">
            <div className="text-slate-400 text-xs uppercase tracking-[0.2em]">Roster</div>
            <div className="text-2xl font-semibold text-slate-100 mt-2">{sortedPlayers.length} players</div>
            <div className="text-xs text-slate-500 mt-1">Detailed stats shown per player.</div>
          </div>
        </section>

        <section className="mt-8 bg-slate-900/50 border border-slate-800 rounded-2xl p-4">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm uppercase tracking-[0.2em] text-slate-400">Final Scores</div>
            <div className="text-xs text-slate-500">Score accounts for wound penalties.</div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 text-xs uppercase tracking-[0.18em] text-slate-500 mb-2">
            <div>Player</div>
            <div>Score</div>
            <div>VP</div>
            <div>Wounds</div>
          </div>
          <div className="space-y-2">
            {sortedPlayers.map((player, index) => (
              <div
                key={`${player.userId || player.username}-${index}`}
                className="grid grid-cols-1 md:grid-cols-4 gap-3 items-center bg-slate-900/70 border border-slate-800 rounded-xl px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <span className="text-slate-100 font-semibold">{player.username}</span>
                  {winner?.id && player.userId === winner.id ? (
                    <span className="text-[10px] px-2 py-1 rounded-full bg-amber-500/20 text-amber-200 uppercase">Winner</span>
                  ) : null}
                </div>
                <div className="text-slate-100 font-semibold">{player.score ?? 0}</div>
                <div className="text-slate-300">{player.vp ?? 0}</div>
                <div className="text-rose-200">{player.wounds ?? 0}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-8 space-y-4">
          {sortedPlayers.map((player, idx) => (
            <div
              key={`detail-${player.userId || player.username}-${idx}`}
              className="bg-slate-900/60 border border-slate-800 rounded-2xl p-5"
            >
              <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 mb-4">
                <div>
                  <div className="text-xs uppercase tracking-[0.2em] text-slate-500">Player</div>
                  <div className="text-2xl font-semibold text-slate-100">{player.username}</div>
                  <div className="text-xs text-slate-500 mt-1">Status: {String(player.status || "unknown").toLowerCase()}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <span className="px-3 py-1 rounded-full border border-slate-700 text-slate-200 text-xs">
                    Score {player.score ?? 0}
                  </span>
                  <span className="px-3 py-1 rounded-full border border-slate-700 text-slate-200 text-xs">
                    VP {player.vp ?? 0}
                  </span>
                  <span className="px-3 py-1 rounded-full border border-rose-500/30 text-rose-200 text-xs">
                    Wounds {player.wounds ?? 0}
                  </span>
                  <span className="px-3 py-1 rounded-full border border-slate-700 text-slate-200 text-xs">
                    Threats {player.threatsDefeated ?? 0}
                  </span>
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-3">
                <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4">
                  <div className="text-xs uppercase tracking-[0.2em] text-slate-500 mb-3">Resources</div>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(player.resources || {}).map(([key, value]) => (
                      <span
                        key={`${player.userId}-${key}`}
                        className={`px-3 py-1 rounded-full border text-xs ${resourceStyles[key] || "border-slate-700 text-slate-200"}`}
                      >
                        {key} {value}
                      </span>
                    ))}
                  </div>
                  <div className="text-xs text-slate-500 mt-3">Stance: {player.stance || "Unknown"}</div>
                </div>

                <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4">
                  <div className="text-xs uppercase tracking-[0.2em] text-slate-500 mb-3">Tokens</div>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(player.tokens || {}).map(([key, value]) => (
                      <span
                        key={`${player.userId}-${key}`}
                        className={`px-3 py-1 rounded-full border text-xs ${tokenStyles[key] || "border-slate-700 text-slate-200"}`}
                      >
                        {key} {value}
                      </span>
                    ))}
                  </div>
                </div>

                <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4">
                  <div className="text-xs uppercase tracking-[0.2em] text-slate-500 mb-3">Defeated Threats</div>
                  {player.defeatedThreats && player.defeatedThreats.length ? (
                    <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                      {player.defeatedThreats.map((t, tIdx) => (
                        <span
                          key={`${player.userId}-threat-${tIdx}`}
                          className="px-2 py-1 rounded-md border border-slate-700 text-xs text-slate-200"
                        >
                          {t}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-slate-500">No threats recorded.</div>
                  )}
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-2 mt-4">
                <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4">
                  <div className="text-xs uppercase tracking-[0.2em] text-slate-500 mb-3">Upgrades</div>
                  {player.upgrades.length ? (
                    <div className="flex flex-wrap gap-2">
                      {player.upgrades.map((u, uIdx) => (
                        <span
                          key={`${player.userId}-upgrade-${uIdx}`}
                          className="px-2 py-1 rounded-md border border-slate-700 text-xs text-slate-200"
                        >
                          {u}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-slate-500">None</div>
                  )}
                </div>

                <div className="bg-slate-950/60 border border-slate-800 rounded-xl p-4">
                  <div className="text-xs uppercase tracking-[0.2em] text-slate-500 mb-3">Weapons</div>
                  {player.weapons.length ? (
                    <div className="flex flex-wrap gap-2">
                      {player.weapons.map((w, wIdx) => (
                        <span
                          key={`${player.userId}-weapon-${wIdx}`}
                          className="px-2 py-1 rounded-md border border-slate-700 text-xs text-slate-200"
                        >
                          {w.name || "Weapon"}{w.uses !== null && w.uses !== undefined ? ` (${w.uses} uses)` : ""}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-slate-500">None</div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </section>
      </div>
    </div>
  );
};

export default PostGamePage;
