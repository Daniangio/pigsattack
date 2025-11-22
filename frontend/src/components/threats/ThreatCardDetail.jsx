import React from 'react';

export default function ThreatCardDetail({ threat }) {
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

      <div className="text-sm text-slate-200 mt-2">
        Cost: {threat.cost}
      </div>

      <div className="text-xs text-emerald-300 mt-3">
        Reward: {threat.reward}
      </div>
    </div>
  );
}
