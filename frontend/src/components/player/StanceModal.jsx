import React from "react";
import { STANCE_CONFIG } from "../../utils/stanceConfig";

export default function StanceModal({ players, setPlayers, activePlayerId, onClose }) {
  const applyStance = (stance) => {
    setPlayers(players.map((p) =>
      p.id === activePlayerId ? { ...p, stance } : p
    ));
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-80">
        <h3 className="text-slate-200 text-sm mb-3 uppercase tracking-widest">
          Select Stance
        </h3>

        <div className="flex flex-col gap-2">
          {Object.keys(STANCE_CONFIG).map((stance) => (
            <button
              key={stance}
              onClick={() => applyStance(stance)}
              className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200"
            >
              {stance}
            </button>
          ))}
        </div>

        <button
          onClick={onClose}
          className="mt-4 text-slate-400 text-xs underline"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
