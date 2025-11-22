import React from "react";
import { Target } from "lucide-react";

export default function PlayerActionPanel() {
  return (
    <div className="w-full h-full bg-slate-950/70 border border-slate-800 
                    rounded-3xl p-4 flex flex-col gap-3">
      
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

      <button className="action-btn hover:border-emerald-400">
        Fight a Threat
      </button>
      <button className="action-btn hover:border-sky-400">
        Buy Upgrade
      </button>
      <button className="action-btn hover:border-purple-400">
        Extend Slot (+1 wild)
      </button>
      <button className="action-btn hover:border-amber-400">
        Tinker & Realign (stance + wild)
      </button>

      <style>{`
        .action-btn {
          width: 100%;
          text-align: left;
          padding: 8px 12px;
          border-radius: 12px;
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
