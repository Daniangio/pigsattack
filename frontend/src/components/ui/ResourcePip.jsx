import React from "react";

export default function ResourcePip({ label, icon: Icon, value, color }) {
  return (
    <div
      className={`flex items-center gap-2 px-3 py-2 rounded-lg border 
                  ${color.border} ${color.bg}`}
    >
      <Icon className={`w-4 h-4 ${color.icon}`} />
      <span className="text-xs font-mono text-slate-100">
        {label}: {value}
      </span>
    </div>
  );
}
