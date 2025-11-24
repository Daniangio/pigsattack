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

export default function ThreatsPanel({ compact, playersCount = 0, rows, boss, onFightRow }) {
  const bossCard = boss || ThreatData.boss;
  const threatRows = rows && rows.length ? rows : ThreatData.rows;
  const allThreats = threatRows.flat();
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
            <BossCard boss={bossCard} compact enablePreview />
          </div>
          <div className="flex-1 flex flex-col gap-2 overflow-y-auto">
            {compactRows.map((row, i) => (
              <div key={i} className="flex gap-2">
                {row.map((threat) => (
                  <ThreatCardCompact
                    key={threat.id}
                    threat={threat}
                    onFight={onFightRow}
                    rowIndex={
                      threatRows.findIndex((r) => r.some((t) => t.id === threat.id)) >= 0
                        ? threatRows.findIndex((r) => r.some((t) => t.id === threat.id))
                        : i
                    }
                    isFront={
                      threatRows.find((r) => r.some((t) => t.id === threat.id))?.[0]?.id === threat.id
                    }
                  />
                ))}
              </div>
            ))}
          </div>
        </>
      ) : (
        <div className="flex-1 flex gap-4 overflow-hidden">
          <div className="flex-1 overflow-y-auto">
            <div className="flex flex-col gap-3">
              {threatRows.map((row, rowIdx) => (
                <div key={`row-${rowIdx}`} className="flex gap-3">
                  {row.map((threat) => {
                    const isFront = row[0]?.id === threat.id;
                    return (
                      <ThreatCardMini
                        key={threat.id}
                        threat={threat}
                        rowIndex={rowIdx}
                        isFront={isFront}
                        onFight={onFightRow}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
          <div className="w-80 shrink-0 h-full flex items-start justify-end">
            <BossCard boss={bossCard} enablePreview />
          </div>
        </div>
      )}
    </div>
  );
}
