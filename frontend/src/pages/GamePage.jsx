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
    (fromRes, toRes) => {
      if (!fromRes || !toRes) return;
      handleGameAction("convert", { from: fromRes, to: toRes });
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

  const handleExtendSlot = useCallback(
    (slotType = "upgrade") => handleGameAction("extend_slot", { slot_type: slotType }),
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

  const logMessages = useMemo(() => gameState?.log || [], [gameState?.log]);

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

      <div className="px-4 py-3 border-b border-slate-800 bg-slate-900/80 flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.3em] text-slate-500">Game</div>
          <div className="text-sm text-slate-200">
            {bannerText(gameState)}
            {isMyTurn ? " • Your turn" : ""}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-xs text-slate-400">
            {gameState?.game_id ? `Game ID: ${gameState.game_id}` : "Waiting for game to start"}
          </div>
          <button
            type="button"
            onClick={() => setIsLogOpen(true)}
            className="px-3 py-1 rounded-lg border border-slate-700 text-xs uppercase tracking-[0.12em] text-slate-100 hover:border-amber-400"
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
              onRealign={handleRealign}
              onLocalToast={pushToast}
              onEndTurn={handleEndTurn}
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
