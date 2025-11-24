import React from 'react';
import { formatCost, formatCostParts } from '../../utils/formatters';

export default function ThreatCardDetail({ threat, actionLabel, actionDisabled, onAction }) {
  if (!threat) return null;

  return (
    <div className="w-72 bg-slate-900 border-2 border-amber-500 rounded-2xl p-4 shadow-2xl">
      <div className="flex justify-between text-xs">
        <span className="text-slate-400">{threat.type}</span>
        <span className="text-amber-300">{threat.vp} VP</span>
      </div>

      <div className="text-lg font-bold text-slate-50 mt-1">
        {threat.name}
      </div>

      <div className="text-sm text-slate-200 mt-2 flex gap-2 items-center">
        <span>Cost:</span>
        <span className="flex gap-2">
          {formatCostParts(threat.cost).map((p) => (
            <span key={p.key} className={p.className}>{`${p.val}${p.key}`}</span>
          ))}
          {!formatCostParts(threat.cost).length && <span>0</span>}
        </span>
      </div>

      <div className="text-xs text-emerald-300 mt-3">
        Reward: {threat.reward}
      </div>

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
    </div>
  );
}
