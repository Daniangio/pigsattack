import React from "react";
import { ThreatData } from "../../state/threats";
import ThreatCardMini from "./ThreatCardMini";
import ThreatCardCompact from "./ThreatCardCompact";
import BossCard from "./BossCard";

const chunkBy = (items, size) => {
  if (!size || size <= 0) return [items];
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

const transposeRowsToColumns = (rows) => {
  if (!rows.length) return [];
  const maxLen = Math.max(...rows.map((r) => r.length));
  return Array.from({ length: maxLen }, (_, col) =>
    rows.map((row) => row[col]).filter(Boolean)
  );
};

export default function ThreatsPanel({ compact, playersCount = 0 }) {
  const { boss, rows } = ThreatData;
  const allThreats = rows.flat();
  const columnLayout = transposeRowsToColumns(rows);
  const compactRows = chunkBy(allThreats, playersCount || allThreats.length);

  return (
    <div className="w-full h-full bg-slate-950/60 border border-slate-800 
                    rounded-3xl p-4 flex flex-col overflow-hidden">
      
      <h3 className="text-xs uppercase tracking-[0.35em] text-slate-400 mb-3">
        Threats
      </h3>

      {compact ? (
        <>
          <div className="flex justify-center mb-3">
            <BossCard boss={boss} compact />
          </div>
          <div className="flex-1 flex flex-col gap-2 overflow-y-auto">
            {compactRows.map((row, i) => (
              <div key={i} className="flex gap-2">
                {row.map((threat) => (
                  <ThreatCardCompact key={threat.id} threat={threat} />
                ))}
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="flex-1 flex gap-4 overflow-hidden">
          <div className="flex-1 overflow-y-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              {columnLayout.map((column, idx) => (
                <div key={idx} className="flex flex-col gap-3">
                  {column.map((threat) => (
                    <ThreatCardMini key={threat.id} threat={threat} />
                  ))}
                </div>
              ))}
            </div>
          </div>
          <div className="w-80 shrink-0 h-full flex items-start justify-end">
            <BossCard boss={boss} />
          </div>
        </div>
      )}
    </div>
  );
}
