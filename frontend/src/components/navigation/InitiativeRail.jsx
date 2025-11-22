import React from "react";
import { stanceColorRing } from "../../utils/stanceColorRing";

export default function InitiativeRail({ players, activePlayerId, onSelect }) {
  return (
    <div className="w-32 bg-slate-950/90 border-r border-slate-800 
                    flex flex-col gap-4 py-8 px-3 z-20">
      
      <h4 className="text-[10px] uppercase tracking-[0.3em] text-slate-500">
        Initiative
      </h4>
      
      <div className="flex-1 flex flex-col gap-3 overflow-y-auto">
        {players.map((player) => (
          <button
            key={player.id}
            onClick={() => onSelect(player.id)}
            className={`
              flex flex-col items-center gap-1 p-2 rounded-xl border transition
              ${
                player.id === activePlayerId
                  ? "border-amber-400 bg-amber-400/10 text-slate-50"
                  : "border-slate-800 text-slate-400 hover:border-slate-600"
              }
            `}
          >
            <div
              className={`w-10 h-10 rounded-full border-2 
                          ${stanceColorRing(player.stance)} 
                          bg-slate-900 flex items-center justify-center
                          text-[10px] uppercase`}
            >
              {player.stance[0]}
            </div>

            <span className="text-[10px]">{player.name}</span>
            <span className="text-[9px] text-slate-400">
              VP {player.vp}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
