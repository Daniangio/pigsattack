import React from "react";
import { setHoverPreview } from "../hover/HoverPreviewPortal";

export default function MarketCardMini({ card, onHover }) {
  return (
    <div
      className="w-full bg-slate-900 border border-slate-700 rounded-xl 
                 p-3 flex flex-col gap-2 text-xs"
      onMouseEnter={(e) =>
        setHoverPreview({
          x: e.clientX,
          y: e.clientY,
          type: "market",
          data: card,
        })
      }
      onMouseLeave={() => setHoverPreview(null)}
    >
      <div className="flex justify-between items-start text-[11px] text-slate-400 leading-tight">
        <span className="uppercase tracking-[0.1em]">{card.type}</span>
        <div className="flex items-center gap-2 text-right">
          {card.uses && (
            <span className="px-2 py-0.5 rounded-full bg-slate-800 text-[10px] text-slate-200">
              Uses {card.uses}
            </span>
          )}
          {card.vp ? <span className="text-amber-300 font-semibold">{card.vp} VP</span> : null}
        </div>
      </div>
      <div className="font-bold text-slate-50 text-sm leading-tight">
        {card.name}
      </div>
      <div className="text-slate-200 leading-snug">Cost: {card.cost}</div>
      {card.effect && (
        <div className="text-emerald-200 text-[11px] leading-snug">
          Effect: {card.effect}
        </div>
      )}
    </div>
  );
}
