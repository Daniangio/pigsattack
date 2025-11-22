import React from 'react';

export default function ThreatCardMini({ threat, onHover }) {
  return (
    <div
      className="w-20 h-28 bg-slate-900 border border-slate-700 rounded-lg p-1
                 flex flex-col justify-between text-[9px]"
      onMouseEnter={() => onHover(threat, 'threat')}
      onMouseLeave={() => onHover(null)}
    >
      <div className="text-slate-400">{threat.type}</div>
      <div className="font-bold text-slate-50 text-xs">{threat.name}</div>
      <div className="text-slate-300">VP {threat.vp}</div>
    </div>
  );
}
