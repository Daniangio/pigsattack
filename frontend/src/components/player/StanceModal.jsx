import React from "react";
import { X } from "lucide-react";
import { STANCE_CONFIG } from "../../utils/stanceConfig";

const STANCE_POINTS = [
  { key: "Aggressive", label: "RED", color: "border-red-500 text-red-400", position: "top-1 left-1/2 -translate-x-1/2" },
  { key: "Tactical", label: "BLUE", color: "border-blue-500 text-blue-400", position: "bottom-1 left-[12%]" },
  { key: "Hunkered", label: "GREEN", color: "border-green-500 text-green-400", position: "bottom-1 right-[12%]" },
  { key: "Balanced", label: "BAL", color: "border-amber-300 text-amber-200", position: "top-[55%] left-1/2 -translate-x-1/2 -translate-y-1/2" },
];

function StanceNode({ active, color, position, onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      className={`
        absolute w-9 h-9 rounded-full border-2 flex items-center justify-center
        transition-all duration-200 z-10
        ${active ? "scale-110 shadow-[0_0_15px_rgba(255,255,255,0.5)] bg-white" : "bg-slate-900 hover:scale-105"}
        ${color} ${position}
        ${disabled ? "opacity-50 cursor-not-allowed pointer-events-none" : ""}
      `}
    >
      <div className={`w-3.5 h-3.5 rounded-full ${active ? "bg-slate-900" : "bg-current"}`} />
    </button>
  );
}

export default function StanceModal({ players = [], setPlayers, activePlayerId, onClose, inline = false, onChangeStance, disabled = false }) {
  const applyStance = (stance) => {
    if (disabled) return;
    if (onChangeStance) {
      onChangeStance(stance);
      return;
    }
    if (setPlayers) {
      setPlayers(players.map((p) => (p.id === activePlayerId ? { ...p, stance } : p)));
    }
  };

  const activeStance = players.find((p) => p.id === activePlayerId)?.stance;
  const activeConfig = STANCE_CONFIG[activeStance];

  const wrapperClass = inline
    ? "absolute left-0 bottom-full mb-2 flex justify-start pointer-events-none z-30"
    : "fixed inset-0 bg-black/60 flex items-center justify-center z-50";

  return (
    <div className={wrapperClass}>
      <div
        className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-[360px] shadow-2xl relative pointer-events-auto"
        style={inline ? { marginLeft: 0 } : {}}
      >
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-slate-200 text-sm uppercase tracking-[0.35em]">Stance System</h3>
            <p className="text-[11px] text-slate-400 mt-1">Choose a position on the triangle.</p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-500 hover:text-slate-200">
            <X size={16} />
          </button>
        </div>

        <div className="relative w-full h-48 mt-5">
          <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-30">
            <line x1="50%" y1="8%" x2="10%" y2="92%" stroke="white" strokeWidth="2" />
            <line x1="50%" y1="8%" x2="90%" y2="92%" stroke="white" strokeWidth="2" />
            <line x1="10%" y1="92%" x2="90%" y2="92%" stroke="white" strokeWidth="2" />
            <line x1="50%" y1="8%" x2="50%" y2="56%" stroke="gray" strokeWidth="1" strokeDasharray="4" />
            <line x1="10%" y1="92%" x2="50%" y2="56%" stroke="gray" strokeWidth="1" strokeDasharray="4" />
            <line x1="90%" y1="92%" x2="50%" y2="56%" stroke="gray" strokeWidth="1" strokeDasharray="4" />
          </svg>

          {STANCE_POINTS.map((stance) => (
            <React.Fragment key={stance.key}>
              <StanceNode
                active={activeStance === stance.key}
                color={stance.color}
                position={stance.position}
                onClick={() => applyStance(stance.key)}
                disabled={disabled}
              />
              <div
                className={`
                  absolute text-[10px] font-bold
                  ${stance.key === "Aggressive" ? "top-[-14px] left-1/2 -translate-x-1/2" : ""}
                  ${stance.key === "Tactical" ? "bottom-[-18px] left-[8%]" : ""}
                  ${stance.key === "Hunkered" ? "bottom-[-18px] right-[8%]" : ""}
                  ${stance.key === "Balanced" ? "top-[45%] left-1/2 -translate-x-1/2 -translate-y-1/2" : ""}
                  ${stance.color.split(" ")[1] || stance.color}
                `}
              >
                {stance.label}
              </div>
            </React.Fragment>
          ))}
        </div>

        {activeConfig && (
          <div className="mt-4 p-3 rounded-xl bg-slate-800/70 border border-slate-700 text-xs text-slate-200">
            <div className="flex items-center justify-between mb-1">
              <span className="uppercase tracking-[0.25em] text-slate-400">Current</span>
              <span className="font-semibold text-slate-50">{activeStance}</span>
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-300">
                Production: {activeConfig.production.R}R / {activeConfig.production.B}B / {activeConfig.production.G}G
              </span>
              <span className="text-emerald-300">Discount: {activeConfig.discount}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
