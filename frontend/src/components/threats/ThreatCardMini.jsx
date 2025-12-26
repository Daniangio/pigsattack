import React from "react";
import { setHoverPreview } from "../hover/HoverPreviewPortal";
import { formatCostParts } from "../../utils/formatters";
import { ResourceCost, ResourceIcon } from "../resources/ResourceCost";
import { getThreatImage } from "../../utils/threatImages";

export default function ThreatCardMini({ threat, onFight, rowIndex, isFront, canFight, isAttacking, weight = 0, position }) {
  const fightAllowed = typeof canFight === "boolean" ? canFight : isFront;
  const enrageTokens = threat?.enrage_tokens ?? threat?.enrageTokens ?? 0;
  const bonusVp = enrageTokens > 0 ? 1 : 0;
  const displayVp = (threat?.vp ?? 0) + bonusVp;
  const typeColor = {
    feral: "text-red-300",
    cunning: "text-blue-300",
    massive: "text-green-300",
  }[String(threat?.type || "").toLowerCase()] || "text-slate-300";
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

  const imageSrc = getThreatImage(threat?.image);

  return (
    <div
      className={`relative w-[120px] min-w-[120px] max-w-[120px] overflow-hidden rounded-xl text-xs transition cursor-pointer ${
        isAttacking || enrageTokens > 0 ? "shadow-[0_0_0_2px_rgba(251,191,36,0.35)]" : ""
      }`}
      onMouseEnter={handleHover}
      onMouseLeave={handleLeave}
      onClick={handleClick}
      style={{ aspectRatio: "256 / 354" }}
    >
      {imageSrc && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            className="w-[70%] h-[70%] rounded-xl bg-center bg-no-repeat bg-cover"
            style={{ backgroundImage: `url(${imageSrc})` }}
          />
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/35 to-black/70" />
      <div className="relative z-10 h-full flex flex-col p-3 gap-2">
        <div className="flex justify-center">
          <div className="w-[70%] text-center space-y-1">
            <div className="inline-block px-2 py-1 rounded-md border border-slate-200/30 bg-black/70 font-bold text-slate-50 text-[12px] leading-tight drop-shadow line-clamp-2">
              {threat.name}
            </div>
            <span
              className={`inline-block px-2 py-1 rounded-full border border-white/10 bg-black/60 uppercase tracking-[0.1em] text-[10px] ${typeColor}`}
            >
              {threat.type}
            </span>
          </div>
        </div>
        <div className="flex gap-2 text-[10px] text-slate-200 uppercase tracking-[0.08em] flex-wrap">
          {position && <span className="px-2 py-1 rounded-full border border-slate-700 bg-black/60">{position}</span>}
          {weight > 0 && (
            <span className="px-2 py-1 rounded-full border border-green-700 bg-green-900/40 text-green-200">
              Weight +{weight}
            </span>
          )}
          {enrageTokens > 0 && (
            <span className="px-2 py-1 rounded-full border border-amber-500 bg-amber-500/15 text-amber-200 flex items-center gap-1">
              Enraged +{2 * enrageTokens}
              <ResourceIcon resource="R" size={12} />
            </span>
          )}
          {isAttacking && (
            <span className="px-2 py-1 rounded-full border border-rose-500 bg-rose-500/15 text-rose-200">
              Attacking
            </span>
          )}
        </div>
        <div className="mt-auto">
          <div className="bg-black/55 border border-slate-800 rounded-lg p-2 flex justify-between items-center backdrop-blur-sm">
            <span className="text-slate-200 text-[10px] uppercase tracking-[0.1em]">Cost</span>
            <span className="flex gap-1 text-[11px] items-center">
              <ResourceCost parts={costParts} iconSize={12} />
              <span
                className={`px-2 py-1 rounded-full border text-[10px] ml-1 ${
                  bonusVp ? "border-orange-400/80 bg-orange-500/20 text-orange-200" : "border-amber-400/80 bg-amber-500/15 text-amber-200"
                }`}
              >
                {displayVp} VP
              </span>
            </span>
          </div>
          <div className="text-emerald-200 text-[11px] leading-snug mt-1">Reward: {threat.reward}</div>
          {onFight && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setHoverPreview(null);
                onFight(rowIndex, threat);
              }}
              disabled={!fightAllowed}
              className={`mt-2 w-full text-[11px] uppercase tracking-[0.14em] rounded-lg px-2 py-1 border ${
                fightAllowed
                  ? "border-amber-400 text-amber-200 hover:bg-amber-400/10"
                  : "border-slate-800 text-slate-500 cursor-not-allowed"
              }`}
            >
              Fight {rowIndex + 1}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
