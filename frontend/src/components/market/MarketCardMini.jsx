import React from "react";
import { setHoverPreview } from "../hover/HoverPreviewPortal";
import { formatCost, formatCostParts } from "../../utils/formatters";

export default function MarketCardMini({ card, onBuy, buttonState = "ready", highlight = false, tooltip }) {
  const handleHover = () =>
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
      actionLabel: buttonState === "not_turn" ? "Wait Turn" : "Buy",
      actionDisabled: buttonState !== "ready",
      onAction: buttonState === "ready" && onBuy ? () => onBuy(card) : undefined,
    });

  return (
    <div
      className={`w-full bg-slate-900 border border-slate-700 rounded-xl 
                 p-3 flex flex-col gap-2 text-xs transition hover:border-amber-400 cursor-pointer ${
                   highlight ? "animate-border-pulse border-emerald-400" : ""
                 }`}
      onMouseEnter={handleHover}
      onMouseLeave={handleLeave}
      onClick={handleClick}
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
      <div className="text-slate-200 leading-snug flex gap-2 items-center">
        <span>Cost:</span>
        <span className="flex gap-2 items-center text-[11px]">
          {formatCostParts(card.cost).map((p) => (
            <span key={p.key} className={p.className}>{`${p.val}${p.key}`}</span>
          ))}
          {!formatCostParts(card.cost).length && <span>0</span>}
        </span>
      </div>
      {card.effect && (
        <div className="text-emerald-200 text-[11px] leading-snug">
          Effect: {card.effect}
        </div>
      )}
      {onBuy && (
        <button
          type="button"
          disabled={buttonState !== "ready"}
          className={`mt-1 text-[11px] uppercase tracking-[0.14em] rounded-lg px-2 py-1 border ${
            buttonState === "ready"
              ? "border-sky-400 text-sky-100 hover:bg-sky-400/10"
            : buttonState === "not_turn"
              ? "border-amber-400 text-amber-200 cursor-not-allowed"
              : "border-slate-700 text-slate-500 cursor-not-allowed"
          }`}
          title={tooltip || ""}
          onClick={(e) => {
            e.stopPropagation();
            if (buttonState !== "ready") return;
            onBuy(card);
          }}
        >
          {buttonState === "not_turn" ? "Wait Turn" : "Buy"}
        </button>
      )}
    </div>
  );
}

// Custom border pulse that does not change opacity of content
// Tailwind-like utility via scoped style
<style jsx>{`
  @keyframes borderPulse {
    0% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.4); }
    70% { box-shadow: 0 0 0 6px rgba(16, 185, 129, 0); }
    100% { box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
  }
  .animate-border-pulse {
    animation: borderPulse 1.4s ease-out infinite;
  }
`}</style>
