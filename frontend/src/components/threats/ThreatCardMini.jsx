import React from "react";
import { setHoverPreview } from "../hover/HoverPreviewPortal";
import { formatCostParts } from "../../utils/formatters";

export default function ThreatCardMini({ threat, onFight, rowIndex, isFront, canFight, isAttacking, weight = 0, position }) {
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
      className={`w-full bg-slate-900 border rounded-xl p-3
                 flex flex-col gap-2 text-xs transition cursor-pointer
                 ${isAttacking ? "border-red-500 shadow-[0_0_0_2px_rgba(248,113,113,0.3)]" : "border-slate-700 hover:border-amber-400"}`}
      onMouseEnter={handleHover}
      onMouseLeave={handleLeave}
      onClick={handleClick}
    >
      <div className="flex justify-between items-start text-[11px] text-slate-400 leading-tight">
        <span className="uppercase tracking-[0.1em]">{threat.type}</span>
        <span className="text-amber-300 font-semibold">{threat.vp} VP</span>
      </div>
      <div className="font-bold text-slate-50 text-sm leading-tight">{threat.name}</div>
      <div className="flex gap-2 text-[10px] text-slate-400 uppercase tracking-[0.08em]">
        {position && <span className="px-2 py-1 rounded-full border border-slate-700 bg-slate-800/60">{position}</span>}
        {weight > 0 && (
          <span className="px-2 py-1 rounded-full border border-green-700 bg-green-900/30 text-green-200">
            Weight +{weight} (cost)
          </span>
        )}
        {isAttacking && (
          <span className="px-2 py-1 rounded-full border border-red-500 bg-red-500/10 text-red-200">
            Attacking
          </span>
        )}
      </div>
      <div className="text-slate-200 leading-snug flex gap-1 items-center mt-1">
        <span>Cost (+weight):</span>
        <span className="flex gap-1">
          {costParts.map((p) => (
            <span key={p.key} className={p.className}>{`${p.val}${p.key}`}</span>
          ))}
          {!costParts.length && <span>0</span>}
        </span>
      </div>
      <div className="text-emerald-200 text-[11px] leading-snug">Reward: {threat.reward}</div>
      {onFight && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setHoverPreview(null);
            onFight(rowIndex, threat);
          }}
          disabled={!fightAllowed}
          className={`mt-1 text-[11px] uppercase tracking-[0.14em] rounded-lg px-2 py-1 border ${
            fightAllowed
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
