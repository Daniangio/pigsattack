import React from "react";

export default function PlayerMiniBoard({ player, isActive, onSelect }) {
  return (
    <button
      onClick={() => onSelect(player.id)}
      className={`
        min-w-[220px] bg-slate-950/60 border rounded-xl px-3 py-3 text-left
        flex flex-col gap-1 transition
        ${
          isActive
            ? "border-amber-400 shadow shadow-amber-400/20"
            : "border-slate-700 hover:border-slate-500"
        }
      `}
    >
      <div className="flex justify-between items-baseline">
        <span className="text-sm font-semibold text-slate-50">{player.name}</span>
        <span className="text-[10px] text-slate-400 uppercase tracking-[0.2em]">
          {player.stance}
        </span>
      </div>

      <div className="flex justify-between text-[10px] text-slate-300">
        <span>
          R/B/G: {player.resources.R}/{player.resources.B}/{player.resources.G}
        </span>
        <span>VP: {player.vp}</span>
      </div>

      <div className="text-[10px] text-slate-500">
        Upg: {player.upgrades.length || 0} · Wpn: {player.weapons.length || 0}
      </div>
    </button>
  );
}
