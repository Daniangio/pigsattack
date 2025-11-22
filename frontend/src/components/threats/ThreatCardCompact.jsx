import React from "react";
import { setHoverPreview } from "../hover/HoverPreviewPortal";

export default function ThreatCardCompact({ threat }) {
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
      className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2
                 flex flex-col gap-2 text-[11px] leading-tight"
      onMouseEnter={handleHover}
      onMouseLeave={handleLeave}
      onClick={handleClick}
    >
      <div className="flex justify-between items-center text-[10px] text-slate-400">
        <span className="uppercase tracking-[0.08em]">{threat.type}</span>
        <span className="text-amber-300 font-semibold">{threat.vp} VP</span>
      </div>

      <div className="font-semibold text-slate-50 text-[12px]">
        {threat.name}
      </div>

      <div className="text-slate-300 text-[11px]">Cost: {threat.cost}</div>
    </div>
  );
}
