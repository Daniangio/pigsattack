import React from "react";
import { setHoverPreview } from "../hover/HoverPreviewPortal";
import { formatCost, formatCostParts } from "../../utils/formatters";

export default function MarketCardCompact({ card, onBuy, buttonState = "ready", highlight = false, tooltip }) {
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
      actionLabel: buttonState === "not_turn" ? "Wait Turn" : "Buy",
      actionDisabled: buttonState !== "ready",
      onAction: buttonState === "ready" && onBuy ? () => onBuy(card) : undefined,
    });

  return (
    <div
      className={`bg-slate-900 border border-slate-700 rounded-lg p-1 max-w-[100px] w-full
                 flex flex-col gap-0.5 text-[11px] leading-tight transition hover:border-amber-400 cursor-pointer ${
                   highlight ? "animate-border-pulse border-emerald-400" : ""
                 }`}
      onMouseEnter={handleHover}
      onMouseLeave={handleLeave}
      onClick={handleClick}
    >
      <div className="flex justify-between items-center text-[10px] text-slate-400">
        <span className="uppercase tracking-[0.08em]">{card.type}</span>
        {card.vp && <span className="text-amber-300 font-semibold">{card.vp} VP</span>}
      </div>

      <div className="font-semibold text-slate-50 text-[12px]">{card.name}</div>

      <div className="text-slate-300 text-[11px] flex gap-1 items-center">
        <span>Cost:</span>
        <span className="flex gap-2 items-center">
          {formatCostParts(card.cost).map((p) => (
            <span key={p.key} className={p.className}>{`${p.val}${p.key}`}</span>
          ))}
          {!formatCostParts(card.cost).length && <span>0</span>}
        </span>
      </div>
      {onBuy && (
        <button
          type="button"
          disabled={buttonState !== "ready"}
          className={`text-[10px] uppercase tracking-[0.12em] rounded-md px-2 py-1 border ${
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
