import React from "react";
import { VIEW_MODES } from "../../state/uiState";

export default function TopNavigation({ viewMode, onChange }) {
  const options = [
    { id: VIEW_MODES.THREATS, label: "Threats" },
    { id: VIEW_MODES.MARKET, label: "Market" },
    { id: VIEW_MODES.GLOBAL, label: "Global" },
  ];

  return (
    <div className="h-14 px-8 flex items-center gap-3 
                    border-b border-slate-900 bg-slate-950/80">
      {options.map((opt) => (
        <button
          key={opt.id}
          onClick={() => onChange(opt.id)}
          className={`
            px-4 py-1.5 rounded-full border text-[11px] uppercase tracking-[0.2em] 
            transition
            ${
              viewMode === opt.id
                ? "border-amber-400 text-amber-200 bg-amber-500/10"
                : "border-slate-700 text-slate-400 hover:text-slate-100"
            }
          `}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
