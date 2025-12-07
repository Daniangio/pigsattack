import React from "react";
import { setHoverPreview } from "../hover/HoverPreviewPortal";
import { formatCostParts } from "../../utils/formatters";
import { getThreatImage } from "../../utils/threatImages";

export default function ThreatCardCompact({ threat, onFight, rowIndex, isFront, canFight, isAttacking, weight = 0, position }) {
  const fightAllowed = typeof canFight === "boolean" ? canFight : isFront;
  const enrageTokens = threat?.enrage_tokens ?? threat?.enrageTokens ?? 0;
  const typeColor = {
    feral: "text-red-300 border-red-400/50 bg-red-900/40",
    cunning: "text-blue-300 border-blue-400/50 bg-blue-900/40",
    massive: "text-emerald-300 border-emerald-400/50 bg-emerald-900/40",
    hybrid: "text-zinc-200 border-zinc-400/50 bg-zinc-900/40",
  }[String(threat?.type || "").toLowerCase()] || "text-slate-300 border-slate-500/50 bg-slate-800/40";
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
      className={`relative w-[130px] min-w-[130px] max-w-[130px] overflow-hidden rounded-xl text-[11px] leading-tight cursor-pointer
        ${isAttacking || enrageTokens > 0 ? "shadow-[0_0_0_2px_rgba(251,191,36,0.4)]" : ""}`}
      onMouseEnter={handleHover}
      onMouseLeave={handleLeave}
      onClick={handleClick}
      style={{ aspectRatio: "1 / 1" }}
    >
      {imageSrc && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            className="w-[100%] h-[100%] rounded-xl bg-center bg-no-repeat bg-cover"
            style={{ backgroundImage: `url(${imageSrc})` }}
          />
        </div>
      )}
      <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/35 to-black/65" />
      <div className="absolute top-1 right-2 flex justify-between items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="inline-block px-2 py-1 rounded-md border border-slate-200/30 bg-black/70 font-semibold text-slate-50 text-[8px] leading-tight drop-shadow line-clamp-2 max-w-full">
            {threat.name}
          </div>
        </div>
        <span className="px-1 py-1 rounded-full border border-amber-400/80 bg-amber-500/15 text-amber-200 text-[6px] whitespace-nowrap">
          {threat.vp} VP
        </span>
      </div>

      <div className="absolute top-6 left-1">
        <div className={`flex flex-col items-center justify-center px-1 py-1 rounded-md border ${typeColor} text-[10px] leading-none`}>
          {String(threat?.type || "").toUpperCase()
            .split("")
            .map((ch, idx) => (
              <span key={`${ch}-${idx}`} className="block leading-none">
                {ch}
              </span>
            ))}
        </div>
      </div>

      <div className="absolute bottom-1 left-0 right-0 px-1 space-y-1">
        <div className="flex gap-1 text-[9px] text-slate-200 uppercase tracking-[0.08em] flex-wrap">
          {weight > 0 && (
            <span className="px-2 py-1 rounded-full border border-green-700 bg-green-900/40 text-green-200">
              Weight +{weight}
            </span>
          )}
          {enrageTokens > 0 && (
            <span className="px-2 py-1 rounded-full border border-amber-500 bg-amber-500/15 text-amber-200">
              Enraged +{2 * enrageTokens}R
            </span>
          )}
          {isAttacking && (
            <span className="px-2 py-1 rounded-full border border-rose-500 bg-rose-500/15 text-rose-200">
              Attacking
            </span>
          )}
        </div>

        <div className="w-fit ml-auto bg-black/55 border border-slate-800 rounded-lg px-1 py-1 flex justify-end items-center gap-1 backdrop-blur-sm">
          {costParts.map((p) => (
            <span key={p.key} className={p.className}>{`${p.val}${p.key}`}</span>
          ))}
          {!costParts.length && <span className="text-slate-300">0</span>}
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
            className={`w-full text-[10px] uppercase tracking-[0.12em] rounded-md px-2 py-1 border ${
              fightAllowed
                ? "border-amber-400 text-amber-200 hover:bg-amber-400/10"
                : "border-slate-800 text-slate-600 cursor-not-allowed"
            }`}
          >
            Fight {rowIndex + 1}
          </button>
        )}
      </div>
    </div>
  );
}
