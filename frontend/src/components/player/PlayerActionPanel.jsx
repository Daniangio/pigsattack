import React from "react";
import { Target } from "lucide-react";

export default function PlayerActionPanel({
  onFight,
  onBuyUpgrade,
  onExtendSlot,
  onRealign,
}) {
  return (
    <div className="w-full bg-slate-950/70 border border-slate-800 
                    rounded-2xl p-3 flex flex-col gap-2">
      
      <div className="flex justify-between items-center mb-1">
        <div>
          <div className="text-[11px] uppercase tracking-[0.25em] text-slate-400">
            Actions
          </div>
          <div className="text-[11px] text-slate-500">
            Choose 1 action per turn.
          </div>
        </div>
        <Target size={16} className="text-amber-300" />
      </div>

      <button className="action-btn hover:border-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed" onClick={onFight} disabled={!onFight}>
        Fight a Threat
      </button>
      <button className="action-btn hover:border-sky-400 disabled:opacity-50 disabled:cursor-not-allowed" onClick={onBuyUpgrade} disabled={!onBuyUpgrade}>
        Buy Upgrade/Weapon
      </button>
      <button className="action-btn hover:border-purple-400 disabled:opacity-50 disabled:cursor-not-allowed" onClick={onExtendSlot} disabled={!onExtendSlot}>
        Extend Slot (+1 wild)
      </button>
      <button className="action-btn hover:border-amber-400 disabled:opacity-50 disabled:cursor-not-allowed" onClick={onRealign} disabled={!onRealign}>
        Tinker & Realign
      </button>

      <style>{`
        .action-btn {
          width: 100%;
          text-align: left;
        padding: 8px 12px;
          border-radius: 10px;
          background: rgba(15,15,20,0.8);
          border: 1px solid #334155;
          color: #e2e8f0;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: .16em;
          transition: all .15s;
        }
      `}</style>
    </div>
  );
}
