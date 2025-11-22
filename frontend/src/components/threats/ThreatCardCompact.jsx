import React from 'react';

export default function ThreatCardCompact({ threat, onHover }) {
  return (
    <div
      className="w-36 h-48 bg-slate-900 border border-slate-700 rounded-xl p-2
                 flex flex-col justify-between text-[11px]"
      onMouseEnter={() => onHover(threat, 'threat')}
      onMouseLeave={() => onHover(null)}
    >
      <div className="flex justify-between">
        <span className="text-xs text-slate-400">{threat.type}</span>
        <span className="text-amber-300">{threat.vp} VP</span>
      </div>

      <div className="font-bold text-slate-50 text-sm">
        {threat.name}
      </div>

      <div className="text-slate-300 text-xs">
        Cost: {threat.cost}
      </div>
    </div>
  );
}
