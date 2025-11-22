import React from "react";
import { ThreatData } from "../../state/threats";
import ThreatCardMini from "./ThreatCardMini";
import ThreatCardCompact from "./ThreatCardCompact";
import BossCard from "./BossCard";

export default function ThreatsPanel({ compact }) {
  const { boss, rows } = ThreatData;

  return (
    <div className="w-full h-full bg-slate-950/60 border border-slate-800 
                    rounded-3xl p-4 flex flex-col overflow-hidden">
      
      <h3 className="text-xs uppercase tracking-[0.35em] text-slate-400 mb-3">
        Threats
      </h3>

      {/* Boss */}
      <div className="flex justify-center mb-4">
        <BossCard boss={boss} />
      </div>

      {/* Threat Rows */}
      <div className="flex-1 flex flex-col gap-3 overflow-y-auto">
        {rows.map((row, i) => (
          <div key={i} className="flex gap-2">
            {row.map((threat) =>
              compact ? (
                <ThreatCardCompact key={threat.id} threat={threat} />
              ) : (
                <ThreatCardMini key={threat.id} threat={threat} />
              )
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
