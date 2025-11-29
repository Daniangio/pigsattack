import React from "react";
import { Skull } from "lucide-react";
import { stanceColorRing } from "../../utils/stanceColorRing";

export default function InitiativeRail({ players, activePlayerId, currentTurnPlayerId, onSelect }) {
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
                          text-[10px] uppercase relative`}
            >
              {player.stance[0]}
              {currentTurnPlayerId === player.id && (
                <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_0_4px_rgba(16,185,129,0.25)]" />
              )}
            </div>

            <span className="text-[10px]">{player.name}</span>
            <span className="text-[9px] text-slate-400">
              VP {player.vp}
            </span>
            <div className="text-[9px] text-rose-200 flex items-center gap-1">
              <Skull size={10} />
              <span>{player.wounds ?? 0}</span>
            </div>
            <div className="text-[9px] text-center leading-tight">
              <div className="flex justify-center gap-1">
                <span className="text-red-300">R{player.resources?.R ?? 0}</span>
                <span className="text-blue-300">B{player.resources?.B ?? 0}</span>
                <span className="text-green-300">G{player.resources?.G ?? 0}</span>
              </div>
              {player.tokens && Object.values(player.tokens).some((v) => v > 0) && (
                <div className="flex justify-center gap-1 text-[8px] text-amber-200">
                  {Object.entries(player.tokens)
                    .filter(([, v]) => v > 0)
                    .map(([k, v]) => (
                      <span key={k} className="px-1 rounded bg-slate-900/60 border border-slate-700">
                        {k[0].toUpperCase()}{v}
                      </span>
                    ))}
                </div>
              )}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
