import React from "react";

export default function MarketCardDetail({ card }) {
  if (!card) return null;

  return (
    <div className="w-72 bg-slate-900 border-2 border-blue-500 
                    rounded-2xl p-4 shadow-2xl">
      <div className="flex justify-between text-xs">
        <span className="text-slate-400">{card.type}</span>
        {card.vp && <span className="text-amber-300">{card.vp} VP</span>}
      </div>

      <div className="text-lg font-bold text-slate-50 mt-1">
        {card.name}
      </div>

      <div className="text-sm text-slate-200 mt-2">
        Cost: {card.cost}
      </div>

      {card.effect && (
        <div className="text-xs text-emerald-300 mt-3">
          Effect: {card.effect}
        </div>
      )}
    </div>
  );
}
