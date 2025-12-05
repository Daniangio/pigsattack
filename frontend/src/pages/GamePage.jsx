import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import GameApp from "../app/GameApp.jsx";
import { useStore } from "../store.js";

const bannerText = (gameState) => {
  if (!gameState) return "Connecting to game...";
  const phase = gameState.phase || "SETUP";
  const round = gameState.round || 0;
  return `Round ${round} • Phase ${phase}`;
};

export default function GamePage() {
  const { gameState, user } = useStore((state) => ({
    gameState: state.gameState,
    user: state.user,
  }));
  const sendMessage = useStore((state) => state.sendMessage);

  const activePlayerId = gameState?.active_player_id || gameState?.activePlayerId;
  const isMyTurn = activePlayerId === user?.id;
  const [toastLogs, setToastLogs] = useState([]);
  const [isLogOpen, setIsLogOpen] = useState(false);
  const [isBotLogOpen, setIsBotLogOpen] = useState(false);
  const prevLogLength = useRef(0);
  const toastTimers = useRef([]);
  const prevActivePlayer = useRef(activePlayerId);

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
  const botLogMessages = useMemo(
    () => gameState?.bot_logs || gameState?.botLogs || [],
    [gameState?.bot_logs, gameState?.botLogs]
  );
  const botRuns = useMemo(
    () => gameState?.bot_runs || gameState?.botRuns || [],
    [gameState?.bot_runs, gameState?.botRuns]
  );
  const [selectedRunId, setSelectedRunId] = useState(null);
  const [selectedRoundFilter, setSelectedRoundFilter] = useState(undefined);

  const availableRounds = useMemo(() => {
    const set = new Set();
    botRuns.forEach((run) => {
      if (run?.round !== undefined && run?.round !== null) set.add(run.round);
    });
    return Array.from(set).sort((a, b) => a - b);
  }, [botRuns]);

  const filteredRuns = useMemo(() => {
    if (selectedRoundFilter === null || selectedRoundFilter === undefined) return botRuns;
    return botRuns.filter((run) => run?.round === selectedRoundFilter);
  }, [botRuns, selectedRoundFilter]);

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
    // Reset selection when new simulations arrive
    const pool = filteredRuns?.length ? filteredRuns : botRuns;
    if (pool?.length) {
      setSelectedRunId(pool[0].id || 1);
    } else {
      setSelectedRunId(null);
    }
  }, [botRuns, filteredRuns, isBotLogOpen]);

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
          <button
            type="button"
            onClick={handleSurrender}
            className="px-3 py-1 rounded-lg border border-rose-500 uppercase tracking-[0.12em] text-rose-100 hover:border-rose-300"
          >
            Surrender
          </button>
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
                              {typeof run.score === "number" ? run.score.toFixed(2) : run.score}
                            </div>
                            <div className="text-[10px] text-slate-400">
                              Start {run.start_score !== undefined ? Number(run.start_score).toFixed(2) : "?"}
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
                        .map((run) => (
                          <div
                            key={run.id}
                            className="transition-all duration-200 ease-in-out bg-slate-900/60 border border-slate-800 rounded-lg p-4"
                          >
                            <div className="flex items-center justify-between mb-3">
                              <div className="text-xs text-slate-400">
                                Sim {run.id} • Round {run.round} • Era {run.era}
                              </div>
                              <div className="text-sm text-emerald-300 font-semibold">
                                Final score {typeof run.score === "number" ? run.score.toFixed(2) : run.score}
                              </div>
                            </div>
                            <div className="text-[10px] text-slate-400 mb-2">
                              Start score {run.start_score !== undefined ? Number(run.start_score).toFixed(2) : "?"}
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
                          </div>
                        ))
                    ) : (
                      <div className="text-slate-500 text-xs">Select a simulation to inspect steps.</div>
                    )}
                  </div>
                </>
              ) : (
                <div className="flex-1 overflow-y-auto p-4 space-y-2">
                  {botLogMessages.length === 0 ? (
                    <div className="text-slate-500 text-xs">No bot simulations recorded yet.</div>
                  ) : (
                    botLogMessages
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
