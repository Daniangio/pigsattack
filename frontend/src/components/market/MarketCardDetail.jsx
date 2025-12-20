import React from "react";
import { formatCostParts } from "../../utils/formatters";
import { ResourceCost } from "../resources/ResourceCost";

export default function MarketCardDetail({ card, actionLabel, actionDisabled, onAction, secondaryAction, onSecondaryAction }) {
  if (!card) return null;

  return (
    <div className="w-72 bg-slate-900 border-2 border-blue-500 
                    rounded-2xl p-4 shadow-2xl">
      <div className="flex justify-between text-xs">
        <span className="text-slate-400">{card.type}</span>
        {card.vp && <span className="text-amber-300">{card.vp} VP</span>}
      </div>

      <div className="text-lg font-bold text-slate-50 mt-1">
        {card.name}
      </div>

      <div className="text-sm text-slate-200 mt-2">
        Cost:
        <span className="ml-2">
          <ResourceCost parts={formatCostParts(card.cost)} iconSize={14} />
        </span>
      </div>

      {card.uses && (
        <div className="text-xs text-slate-300 mt-2">
          Uses: {card.uses}
        </div>
      )}

      {card.effect && (
        <div className="text-xs text-emerald-300 mt-3">
          Effect: {card.effect}
        </div>
      )}
      {actionLabel && (
        <button
          type="button"
          disabled={actionDisabled}
          onClick={onAction}
          className={`mt-4 w-full py-2 rounded-lg text-xs uppercase tracking-[0.2em] border ${
            actionDisabled
              ? "border-slate-700 text-slate-500 cursor-not-allowed"
              : "border-amber-400 text-amber-200 hover:bg-amber-400/10"
          }`}
        >
          {actionLabel}
        </button>
      )}
      {secondaryAction && (
        <button
          type="button"
          disabled={secondaryAction.disabled}
          onClick={onSecondaryAction || secondaryAction.onClick}
          className={`mt-2 w-full py-2 rounded-lg text-xs uppercase tracking-[0.2em] border ${
            secondaryAction.disabled
              ? "border-slate-700 text-slate-500 cursor-not-allowed"
              : "border-emerald-400 text-emerald-200 hover:bg-emerald-400/10"
          }`}
        >
          {secondaryAction.label}
        </button>
      )}
    </div>
  );
}
