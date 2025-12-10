import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import GameApp from "../app/GameApp.jsx";
import { useStore } from "../store.js";
import { useParams, useNavigate } from "react-router-dom";

const bannerText = (gameState) => {
  if (!gameState) return "Connecting to game...";
  const phase = gameState.phase || "SETUP";
  const round = gameState.round || 0;
  return `Round ${round} • Phase ${phase}`;
};

export default function GamePage() {
  const { gameId: routeGameId } = useParams();
  const navigate = useNavigate();
  const { gameState, user } = useStore((state) => ({
    gameState: state.gameState,
    user: state.user,
  }));
  const sendMessage = useStore((state) => state.sendMessage);
  const token = useStore((state) => state.token);

  const activePlayerId = gameState?.active_player_id || gameState?.activePlayerId;
  const isMyTurn = activePlayerId === user?.id;
  const [toastLogs, setToastLogs] = useState([]);
  const [isLogOpen, setIsLogOpen] = useState(false);
  const [isBotLogOpen, setIsBotLogOpen] = useState(false);
  const [selectedBotId, setSelectedBotId] = useState(null);
  const [selectedRunId, setSelectedRunId] = useState(null);
  const [selectedRoundFilter, setSelectedRoundFilter] = useState(undefined);
  const prevLogLength = useRef(0);
  const toastTimers = useRef([]);
  const prevActivePlayer = useRef(activePlayerId);
  const apiBase = import.meta.env.VITE_API_URL || "http://localhost:8000";
  const recordCheckRef = useRef(false);

  useEffect(() => {
    recordCheckRef.current = false;
  }, [routeGameId]);

  const handleGameAction = useCallback(
    (action, data = {}) => {
      if (!sendMessage || !gameState) return;
      sendMessage({
        action: "game_action",
        payload: {
          sub_action: action,
          data,
        },
      });
    },
    [sendMessage, gameState]
  );

  const handleFightRow = useCallback(
    (payload) => {
      if (!payload || payload.row === undefined || payload.row === null) return;
      handleGameAction("fight", payload);
    },
    [handleGameAction]
  );

  const handleConvert = useCallback(
    (fromRes, toRes, amount) => {
      if (!fromRes || !toRes) return;
      const payload = { from: fromRes, to: toRes };
      if (amount) payload.amount = amount;
      handleGameAction("convert", payload);
    },
    [handleGameAction]
  );

  const handleBuyUpgrade = useCallback(
    (card) => handleGameAction("buy_upgrade", { card_id: card?.id }),
    [handleGameAction]
  );

  const handleBuyWeapon = useCallback(
    (card) => handleGameAction("buy_weapon", { card_id: card?.id }),
    [handleGameAction]
  );

  const handlePickToken = useCallback(
    (token) => handleGameAction("pick_token", { token }),
    [handleGameAction]
  );

  const handleExtendSlot = useCallback(
    (slotType = "upgrade") => handleGameAction("extend_slot", { slot_type: slotType }),
    [handleGameAction]
  );

  const handleActivateCard = useCallback(
    (cardId, token, resource) => {
      if (!cardId) return;
      const payload = { card_id: cardId };
      if (token) payload.token = token;
      if (resource) payload.resource = resource;
      handleGameAction("activate_card", payload);
    },
    [handleGameAction]
  );

  const handleRealign = useCallback(
    (stance = "BALANCED") => handleGameAction("realign", { stance: stance.toUpperCase() }),
    [handleGameAction]
  );

  const handleEndTurn = useCallback(
    (payload = {}) => handleGameAction("end_turn", payload),
    [handleGameAction]
  );
  const handleSurrender = useCallback(() => handleGameAction("surrender", {}), [handleGameAction]);

  const logMessages = useMemo(() => gameState?.log || [], [gameState?.log]);
  const playersArr = useMemo(() => {
    if (Array.isArray(gameState?.players)) return gameState.players;
    if (gameState?.players && typeof gameState.players === "object") {
      return Object.values(gameState.players);
    }
    return [];
  }, [gameState?.players]);

  const meState = useMemo(
    () => playersArr.find((p) => p.id === user?.id || p.user_id === user?.id),
    [playersArr, user?.id]
  );
  const myStatus = meState?.status || "ACTIVE";
  const isSpectating = !meState || myStatus !== "ACTIVE";
  const gameOver = (gameState?.phase || "").toUpperCase() === "GAME_OVER";
  const botRunsAll = useMemo(
    () => gameState?.bot_runs || gameState?.botRuns || [],
    [gameState?.bot_runs, gameState?.botRuns]
  );
  const botPlayers = useMemo(() => {
    const list = [];
    const players = gameState?.players || {};
    Object.entries(players).forEach(([id, p]) => {
      if (p?.is_bot) {
        list.push({ id, name: p.username || id });
      }
    });
    return list;
  }, [gameState?.players]);
  const rawBotLogs = useMemo(
    () => gameState?.bot_logs || gameState?.botLogs || {},
    [gameState?.bot_logs, gameState?.botLogs]
  );
  const botLogMap = useMemo(() => {
    if (Array.isArray(rawBotLogs)) {
      return { all: rawBotLogs };
    }
    if (rawBotLogs && typeof rawBotLogs === "object") {
      return rawBotLogs;
    }
    return {};
  }, [rawBotLogs]);
  const botLogKeys = Object.keys(botLogMap);
  const scopedRuns = useMemo(() => {
    if (!selectedBotId || selectedBotId === "all") return botRunsAll;
    return botRunsAll.filter((run) => run.bot_id === selectedBotId || run.botId === selectedBotId);
  }, [botRunsAll, selectedBotId]);
  const availableRounds = useMemo(() => {
    const set = new Set();
    scopedRuns.forEach((run) => {
      if (run?.round !== undefined && run?.round !== null) set.add(run.round);
    });
    return Array.from(set).sort((a, b) => a - b);
  }, [scopedRuns]);
  const filteredRuns = useMemo(() => {
    if (selectedRoundFilter === null || selectedRoundFilter === undefined) return scopedRuns;
    return scopedRuns.filter((run) => run?.round === selectedRoundFilter);
  }, [scopedRuns, selectedRoundFilter]);
  const botRuns = useMemo(() => filteredRuns, [filteredRuns]);
  const selectedBotLogs = useMemo(() => {
    if (selectedBotId === "all") {
      return Object.values(botLogMap).flat();
    }
    if (selectedBotId && botLogMap[selectedBotId]) {
      return botLogMap[selectedBotId];
    }
    if (botLogKeys.length) {
      return botLogMap[botLogKeys[0]] || [];
    }
    return [];
  }, [botLogMap, botLogKeys, selectedBotId]);

  useEffect(() => {
    if (botPlayers.length && (!selectedBotId || !botPlayers.some((b) => b.id === selectedBotId))) {
      setSelectedBotId(botPlayers[0].id);
    } else if (!botPlayers.length && selectedBotId !== "all") {
      setSelectedBotId("all");
    }
  }, [botPlayers, selectedBotId]);

  const pushToast = useCallback((text, color = "amber") => {
    const id = `${Date.now()}-${Math.random()}`;
    setToastLogs((prev) => [...prev, { id, text, color }]);
    const timer = setTimeout(() => {
      setToastLogs((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
    toastTimers.current.push(timer);
  }, []);

  useEffect(() => {
    const newCount = logMessages.length;
    if (newCount < prevLogLength.current) {
      prevLogLength.current = newCount;
      return;
    }

    const newEntries = logMessages.slice(prevLogLength.current);
    if (newEntries.length) {
      newEntries.forEach((entry, idx) => {
        pushToast(entry, "amber");
      });
    }

    prevLogLength.current = newCount;
  }, [logMessages, pushToast]);

  useEffect(() => {
    return () => {
      toastTimers.current.forEach((t) => clearTimeout(t));
    };
  }, []);

  useEffect(() => {
    // If user navigates directly to a game route and the game is already completed, redirect to postgame.
    if (recordCheckRef.current) return;
    if (!routeGameId) return;
    if (gameState && (gameState.game_id === routeGameId || gameState.gameId === routeGameId)) return;
    recordCheckRef.current = true;
    (async () => {
      try {
        const res = await fetch(`${apiBase}/api/results/${routeGameId}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (res.ok) {
          const data = await res.json();
          if (data?.status === "completed") {
            navigate(`/post-game/${routeGameId}`, { replace: true });
          }
        }
      } catch (err) {
        console.warn("Record check failed", err);
      }
    })();
  }, [routeGameId, gameState, apiBase, token, navigate]);

  useEffect(() => {
    // Reset selection when new simulations arrive
    const pool = filteredRuns?.length ? filteredRuns : botRuns;
    if (pool?.length) {
      setSelectedRunId(pool[0].id || 1);
    } else {
      setSelectedRunId(null);
    }
  }, [botRuns, filteredRuns, isBotLogOpen, selectedBotId]);

  useEffect(() => {
    if (!availableRounds.length) {
      setSelectedRoundFilter(undefined);
      return;
    }
    if (selectedRoundFilter === undefined) {
      setSelectedRoundFilter(availableRounds[availableRounds.length - 1]);
    }
  }, [availableRounds, selectedRoundFilter]);

  // Notify when my turn starts
  useEffect(() => {
    if (user?.id && activePlayerId === user.id && prevActivePlayer.current !== user.id) {
      pushToast("It's your turn!", "emerald");
    }
    prevActivePlayer.current = activePlayerId;
  }, [activePlayerId, user?.id, pushToast]);

  return (
    <div className="w-full h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Toast stack */}
      <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 items-center pointer-events-none">
        {toastLogs.map((log) => (
          <div
            key={log.id}
            className={`px-4 py-2 rounded-xl bg-slate-900/90 border shadow-lg min-w-[240px] max-w-[520px] text-sm pointer-events-auto ${
              log.color === "emerald"
                ? "border-emerald-400 text-emerald-50 shadow-emerald-500/20"
                : "border-amber-400 text-amber-50 shadow-amber-500/20"
            }`}
            style={{ animation: "toastFade 4s ease-in-out forwards" }}
          >
            {log.text}
          </div>
        ))}
      </div>

      <div className="px-4 py-2 border-b border-slate-800 bg-slate-900/80 flex items-center justify-between min-h-[48px]">
        <div className="flex items-center gap-3">
          <div className="text-xs uppercase tracking-[0.28em] text-slate-500">Game</div>
          <div className="text-sm text-slate-200 whitespace-nowrap">
            {bannerText(gameState)}{isMyTurn ? " • Your turn" : ""}
          </div>
        </div>
        <div className="flex items-center gap-3 text-xs text-slate-400">
          <div>
            {gameState?.game_id ? `ID: ${gameState.game_id}` : "Waiting for game to start"}
          </div>
          {!isSpectating && !gameOver && (
            <button
              type="button"
              onClick={handleSurrender}
              className="px-3 py-1 rounded-lg border border-rose-500 uppercase tracking-[0.12em] text-rose-100 hover:border-rose-300"
            >
              Surrender
            </button>
          )}
          {routeGameId && (isSpectating || gameOver) && (
            <button
              type="button"
              onClick={() => navigate(`/post-game/${routeGameId}`)}
              className="px-3 py-1 rounded-lg border border-slate-700 uppercase tracking-[0.12em] text-slate-100 hover:border-amber-400"
            >
              Postgame
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsBotLogOpen(true)}
            className="px-3 py-1 rounded-lg border border-slate-700 uppercase tracking-[0.12em] text-slate-100 hover:border-emerald-400"
          >
            Bot Log
          </button>
          <button
            type="button"
            onClick={() => setIsLogOpen(true)}
            className="px-3 py-1 rounded-lg border border-slate-700 uppercase tracking-[0.12em] text-slate-100 hover:border-amber-400"
          >
            Open Log
          </button>
        </div>
      </div>

      {!gameState ? (
        <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
          Waiting for game state...
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex">
          <div className="flex-1 min-w-0">
            <GameApp
              gameData={gameState}
              userId={user?.id}
              onFightRow={handleFightRow}
              onConvert={handleConvert}
              onBuyUpgrade={handleBuyUpgrade}
              onBuyWeapon={handleBuyWeapon}
              onExtendSlot={handleExtendSlot}
              onPickToken={handlePickToken}
              onActivateCard={handleActivateCard}
              onRealign={handleRealign}
              onLocalToast={pushToast}
              onEndTurn={handleEndTurn}
              onSurrender={handleSurrender}
            />
          </div>
        </div>
      )}

      {isLogOpen && (
        <div className="fixed inset-0 z-40 flex justify-end">
          <div
            className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm"
            onClick={() => setIsLogOpen(false)}
          />
          <div className="relative w-80 h-full bg-slate-950 border-l border-slate-800 shadow-2xl p-4 overflow-y-auto z-50">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs uppercase tracking-[0.25em] text-slate-500">Log</div>
              <button
                type="button"
                onClick={() => setIsLogOpen(false)}
                className="text-xs text-slate-300 hover:text-amber-200"
              >
                Close
              </button>
            </div>
            <div className="flex flex-col gap-2 text-[11px] text-slate-300">
              {logMessages.slice().reverse().map((entry, idx) => (
                <div key={`${entry}-${idx}`} className="p-2 rounded-lg bg-slate-900 border border-slate-800">
                  {entry}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {isBotLogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm"
            onClick={() => setIsBotLogOpen(false)}
          />
          <div className="relative w-[min(1080px,92vw)] h-[84vh] bg-slate-950 border border-slate-800 shadow-2xl rounded-xl flex flex-col z-50">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
              <div className="text-xs uppercase tracking-[0.25em] text-slate-500">Bot Log</div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 text-[10px] text-slate-400">
                  <span>Bot</span>
                  <select
                    className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-[10px] text-slate-200"
                    value={selectedBotId || ""}
                    onChange={(e) => setSelectedBotId(e.target.value || "all")}
                  >
                    <option value="all">All</option>
                    {botPlayers.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2 text-[10px] text-slate-400">
                  <span>Round</span>
                  <select
                    className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-[10px] text-slate-200"
                    value={selectedRoundFilter === null || selectedRoundFilter === undefined ? "" : selectedRoundFilter}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (val === "") {
                        setSelectedRoundFilter(null); // All
                      } else {
                        setSelectedRoundFilter(Number(val));
                      }
                    }}
                  >
                    <option value="">All</option>
                    {availableRounds.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  type="button"
                  onClick={() => setIsBotLogOpen(false)}
                  className="text-xs text-slate-300 hover:text-amber-200"
                >
                  Close
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-hidden text-[11px] text-slate-200 font-mono flex flex-col">
              {filteredRuns && filteredRuns.length > 0 ? (
                <>
                  <div className="px-4 py-3 border-b border-slate-800">
                    <div className="text-[10px] uppercase tracking-[0.18em] text-slate-500 mb-2">
                      Simulations
                    </div>
                    <div className="flex gap-3 overflow-x-auto pb-1">
                      {filteredRuns.map((run) => {
                        const isActive = selectedRunId === run.id;
                        const scoreDisplay =
                          run.score_after_lookahead ?? run.final_score ?? run.score;
                        return (
                          <button
                            key={run.id}
                            onClick={() => setSelectedRunId(isActive ? null : run.id)}
                            className={`min-w-[160px] px-3 py-2 rounded-lg border transition-all text-left ${
                              isActive
                                ? "border-emerald-400 bg-slate-900 shadow-emerald-500/10"
                                : "border-slate-700 bg-slate-900/60 hover:border-emerald-300"
                            }`}
                            >
                              <div className="flex items-center justify-between">
                                <span className="text-[10px] uppercase tracking-[0.14em] text-slate-400">
                                  Sim {run.id}
                                </span>
                              <span className="text-[10px] text-slate-400">
                                R{run.round} • {run.era}
                              </span>
                            </div>
                            <div className="text-sm text-emerald-300 font-semibold">
                              {typeof scoreDisplay === "number" ? scoreDisplay.toFixed(2) : scoreDisplay}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              Start {run.start_score !== undefined ? Number(run.start_score).toFixed(2) : "?"}
                              {run.bot_name && <span className="ml-2 text-slate-500">• {run.bot_name}</span>}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4">
                    {selectedRunId ? (
                      filteredRuns
                        .filter((run) => run.id === selectedRunId)
                        .map((run) => {
                          const scoreDisplay =
                            run.score_after_lookahead ?? run.final_score ?? run.score;
                          const targetBotId =
                            selectedBotId && selectedBotId !== "all"
                              ? selectedBotId
                              : run.bot_id || run.botId;
                          const botState =
                            (run.final_state?.players && run.final_state.players[targetBotId]) || null;
                          return (
                            <div
                              key={run.id}
                              className="transition-all duration-200 ease-in-out bg-slate-900/60 border border-slate-800 rounded-lg p-4"
                            >
                              <div className="flex items-center justify-between mb-3">
                                <div className="text-xs text-slate-400">
                                  Sim {run.id} • Round {run.round} • Era {run.era}
                                </div>
                                <div className="text-sm text-emerald-300 font-semibold">
                                  Final score{" "}
                                  {typeof scoreDisplay === "number" ? scoreDisplay.toFixed(2) : scoreDisplay}
                                </div>
                              </div>
                              <div className="text-[10px] text-slate-400 mb-2 space-y-1">
                                <div>
                                  Start score{" "}
                                  {run.start_score !== undefined ? Number(run.start_score).toFixed(2) : "?"}
                                </div>
                                <div>
                                  Lookahead turns simulated: {run.lookahead_turns ?? "?"} (bot-only turns counted)
                                </div>
                              </div>
                              <div className="space-y-2">
                                {(run.steps || []).length === 0 ? (
                                  <div className="text-slate-500 text-xs">No steps recorded.</div>
                                ) : (
                                  run.steps.map((step, idx) => (
                                    <div
                                      key={idx}
                                      className="p-3 rounded-md border border-slate-800 bg-slate-900/70"
                                    >
                                      <div className="flex items-center justify-between">
                                        <div className="text-slate-200">
                                          Step {idx + 1}: {step?.action?.type}
                                        </div>
                                        <div className="text-emerald-300">
                                          {typeof step?.score === "number" ? step.score.toFixed(2) : step?.score}
                                        </div>
                                      </div>
                                      <div className="text-[10px] text-slate-400">
                                        Round {step?.round} • Era {step?.era}
                                      </div>
                                      {step?.action?.payload && Object.keys(step.action.payload).length > 0 && (
                                        <div className="text-[10px] text-slate-500 mt-1">
                                          {JSON.stringify(step.action.payload)}
                                        </div>
                                      )}
                                    </div>
                                  ))
                                )}
                              </div>
                              {run.future_actions && run.future_actions.length > 0 && (
                                <div className="mt-3 space-y-1">
                                  <div className="text-[10px] uppercase tracking-[0.14em] text-slate-500">
                                    Greedy future actions (bot turns)
                                  </div>
                                  <div className="space-y-1">
                                    {run.future_actions.map((fa, idx) => (
                                      <div
                                        key={`${idx}-${fa.type}`}
                                        className="px-2 py-1 rounded border border-slate-800 bg-slate-900/70 flex items-center justify-between"
                                      >
                                        <div className="text-slate-200 text-xs">
                                          Turn {idx + 1}: {fa.type}
                                        </div>
                                        {fa.payload && Object.keys(fa.payload || {}).length > 0 && (
                                          <div className="text-[10px] text-slate-500 ml-2">
                                            {JSON.stringify(fa.payload)}
                                          </div>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {run.final_state && (
                                <div className="mt-3 space-y-1">
                                  <div className="text-[10px] uppercase tracking-[0.14em] text-slate-500">
                                    Predicted state after lookahead
                                  </div>
                                  {botState ? (
                                    <div className="text-[11px] text-slate-200">
                                      VP {botState.vp} • Wounds {botState.wounds} • Resources{" "}
                                      {botState.resources?.R ?? 0}R/{botState.resources?.B ?? 0}B/
                                      {botState.resources?.G ?? 0}G • Tokens{" "}
                                      {JSON.stringify(botState.tokens || {})}
                                    </div>
                                  ) : (
                                    <div className="text-[11px] text-slate-400">Snapshot available below.</div>
                                  )}
                                  <details className="bg-slate-900/60 border border-slate-800 rounded-md p-2">
                                    <summary className="cursor-pointer text-[11px] text-slate-300">
                                      Full snapshot (JSON)
                                    </summary>
                                    <pre className="text-[10px] whitespace-pre-wrap text-slate-300 overflow-x-auto mt-2 max-h-64">
                                      {JSON.stringify(run.final_state, null, 2)}
                                    </pre>
                                  </details>
                                </div>
                              )}
                            </div>
                          );
                        })
                    ) : (
                      <div className="text-slate-500 text-xs">Select a simulation to inspect steps.</div>
                    )}
                  </div>
                </>
              ) : (
                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                  {selectedBotLogs.length === 0 ? (
                    <div className="text-slate-500 text-xs">No bot simulations recorded yet.</div>
                  ) : (
                    selectedBotLogs
                      .slice()
                      .reverse()
                      .map((entry, idx) => (
                        <div
                          key={`${entry}-${idx}`}
                          className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-800 whitespace-pre-wrap"
                        >
                          {entry}
                        </div>
                      ))
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      <style>{`
        @keyframes toastFade {
          0% { opacity: 0; transform: translateY(-6px); }
          10% { opacity: 1; transform: translateY(0); }
          80% { opacity: 1; transform: translateY(0); }
          100% { opacity: 0; transform: translateY(-6px); }
        }
      `}</style>
    </div>
  );
}
