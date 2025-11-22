import React from "react";
import { setHoverPreview } from "../hover/HoverPreviewPortal";

export default function MarketCardCompact({ card }) {
  const handleHover = (e) =>
    setHoverPreview({
      type: "market",
      data: card,
      sourceId: card.id,
    });
  const handleLeave = () => setHoverPreview(null);
  const handleClick = () =>
    setHoverPreview({
      type: "market",
      data: card,
      sourceId: card.id,
      lock: true,
    });

  return (
    <div
      className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 
                 flex flex-col gap-1.5 text-[11px] leading-tight"
      onMouseEnter={handleHover}
      onMouseLeave={handleLeave}
      onClick={handleClick}
    >
      <div className="flex justify-between items-center text-[10px] text-slate-400">
        <span className="uppercase tracking-[0.08em]">{card.type}</span>
        {card.vp && <span className="text-amber-300 font-semibold">{card.vp} VP</span>}
      </div>

      <div className="font-semibold text-slate-50 text-[12px]">{card.name}</div>

      <div className="text-slate-300 text-[11px]">Cost: {card.cost}</div>
    </div>
  );
}
