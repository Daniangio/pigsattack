import React from "react";
import { setHoverPreview } from "../hover/HoverPreviewPortal";
import { formatCostParts } from "../../utils/formatters";

export default function ThreatCardCompact({ threat, onFight, rowIndex, isFront, canFight, isAttacking, weight = 0, position }) {
  const fightAllowed = typeof canFight === "boolean" ? canFight : isFront;
  const effectiveCost = {
    R: threat?.cost?.R ?? threat?.cost?.r ?? threat?.cost?.RED ?? 0,
    B: threat?.cost?.B ?? threat?.cost?.b ?? threat?.cost?.BLUE ?? 0,
    G: (threat?.cost?.G ?? threat?.cost?.g ?? threat?.cost?.GREEN ?? 0) + (weight || 0),
  };
  const costParts = formatCostParts(effectiveCost);
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
      actionDisabled: !fightAllowed || !onFight,
      onAction: onFight ? () => onFight(rowIndex, threat) : undefined,
    });

  return (
    <div
      className={`w-full bg-slate-900 border rounded-lg p-2
                 flex flex-col gap-2 text-[11px] leading-tight transition cursor-pointer
                 ${isAttacking ? "border-red-500 shadow-[0_0_0_2px_rgba(248,113,113,0.25)]" : "border-slate-700 hover:border-amber-400"}`}
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

      <div className="flex gap-1 text-[9px] text-slate-400 uppercase tracking-[0.08em]">
        {position && <span className="px-2 py-1 rounded-full border border-slate-700 bg-slate-800/60">{position}</span>}
        {weight > 0 && (
          <span className="px-2 py-1 rounded-full border border-green-700 bg-green-900/30 text-green-200">
            Weight +{weight}
          </span>
        )}
        {isAttacking && (
          <span className="px-2 py-1 rounded-full border border-red-500 bg-red-500/10 text-red-200">
            Attacking
          </span>
        )}
      </div>

      <div className="text-slate-300 text-[11px] flex gap-1 items-center">
        <span>Cost (+weight):</span>
        <span className="flex gap-1">
          {costParts.map((p) => (
            <span key={p.key} className={p.className}>{`${p.val}${p.key}`}</span>
          ))}
          {!costParts.length && <span>0</span>}
        </span>
      </div>
      {onFight && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setHoverPreview(null);
            onFight(rowIndex, threat);
          }}
          disabled={!fightAllowed}
          className={`text-[10px] uppercase tracking-[0.12em] rounded-md px-2 py-1 border ${
            fightAllowed
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
