import React from "react";
import { setHoverPreview } from "../hover/HoverPreviewPortal";
import { formatCost, formatCostParts } from "../../utils/formatters";

export default function ThreatCardCompact({ threat, onFight, rowIndex, isFront }) {
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
      actionLabel: "Fight",
      actionDisabled: !isFront || !onFight,
      onAction: onFight ? () => onFight(rowIndex) : undefined,
    });

  return (
    <div
      className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2
                 flex flex-col gap-2 text-[11px] leading-tight transition hover:border-amber-400 cursor-pointer"
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

      <div className="text-slate-300 text-[11px] flex gap-1 items-center">
        <span>Cost:</span>
        <span className="flex gap-1">
          {formatCostParts(threat.cost).map((p) => (
            <span key={p.key} className={p.className}>{`${p.val}${p.key}`}</span>
          ))}
          {!formatCostParts(threat.cost).length && <span>0</span>}
        </span>
      </div>
      {onFight && (
        <button
          type="button"
          onClick={() => onFight(rowIndex)}
          disabled={!isFront}
          className={`text-[10px] uppercase tracking-[0.12em] rounded-md px-2 py-1 border ${
            isFront
              ? "border-amber-400 text-amber-200 hover:bg-amber-400/10"
              : "border-slate-800 text-slate-600 cursor-not-allowed"
          }`}
        >
          Fight {rowIndex + 1}
        </button>
      )}
    </div>
  );
}
