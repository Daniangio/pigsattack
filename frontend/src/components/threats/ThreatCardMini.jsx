import React from "react";
import { setHoverPreview } from "../hover/HoverPreviewPortal";

export default function ThreatCardMini({ threat }) {
  const handleHover = () =>
    setHoverPreview({
      type: "threat",
      data: threat,
      sourceId: threat.id,
    });
  const handleLeave = () => setHoverPreview(null);
  const handleClick = () =>
    setHoverPreview({
      type: "threat",
      data: threat,
      sourceId: threat.id,
      lock: true,
    });

  return (
    <div
      className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3
                 flex flex-col gap-2 text-xs"
      onMouseEnter={handleHover}
      onMouseLeave={handleLeave}
      onClick={handleClick}
    >
      <div className="flex justify-between items-start text-[11px] text-slate-400 leading-tight">
        <span className="uppercase tracking-[0.1em]">{threat.type}</span>
        <span className="text-amber-300 font-semibold">{threat.vp} VP</span>
      </div>
      <div className="font-bold text-slate-50 text-sm leading-tight">{threat.name}</div>
      <div className="text-slate-200 leading-snug">Cost: {threat.cost}</div>
      <div className="text-emerald-200 text-[11px] leading-snug">Reward: {threat.reward}</div>
    </div>
  );
}
