import React from "react";
import { setHoverPreview } from "../hover/HoverPreviewPortal";
import { formatCost, formatCostParts } from "../../utils/formatters";

export default function ThreatCardMini({ threat, onFight, rowIndex, isFront }) {
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
      className="w-full bg-slate-900 border border-slate-700 rounded-xl p-3
                 flex flex-col gap-2 text-xs transition hover:border-amber-400 cursor-pointer"
      onMouseEnter={handleHover}
      onMouseLeave={handleLeave}
      onClick={handleClick}
    >
      <div className="flex justify-between items-start text-[11px] text-slate-400 leading-tight">
        <span className="uppercase tracking-[0.1em]">{threat.type}</span>
        <span className="text-amber-300 font-semibold">{threat.vp} VP</span>
      </div>
      <div className="font-bold text-slate-50 text-sm leading-tight">{threat.name}</div>
      <div className="text-slate-200 leading-snug flex gap-1 items-center">
        <span>Cost:</span>
        <span className="flex gap-1">
          {formatCostParts(threat.cost).map((p) => (
            <span key={p.key} className={p.className}>{`${p.val}${p.key}`}</span>
          ))}
          {!formatCostParts(threat.cost).length && <span>0</span>}
        </span>
      </div>
      <div className="text-emerald-200 text-[11px] leading-snug">Reward: {threat.reward}</div>
      {onFight && (
        <button
          type="button"
          onClick={() => onFight(rowIndex)}
          disabled={!isFront}
          className={`mt-1 text-[11px] uppercase tracking-[0.14em] rounded-lg px-2 py-1 border ${
            isFront
              ? "border-amber-400 text-amber-200 hover:bg-amber-400/10"
              : "border-slate-800 text-slate-500 cursor-not-allowed"
          }`}
        >
          Fight {rowIndex + 1}
        </button>
      )}
    </div>
  );
}
