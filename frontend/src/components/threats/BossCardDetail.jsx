import React from "react";
import { getThreatImage } from "../../utils/threatImages";
import { formatCostParts } from "../../utils/formatters";

export default function BossCardDetail({ boss }) {
  if (!boss) return null;

  const imageSrc = getThreatImage(boss.image);
  const renderCostChips = (cost) => {
    const parts = formatCostParts(cost || {});
    if (!parts.length) return <span className="text-slate-300 text-[11px]">0</span>;
    return parts.map((p) => (
      <span
        key={p.key}
        className={`${p.className} px-2 py-0.5 rounded-full border text-[11px]`}
      >{`${p.val}${p.key}`}</span>
    ));
  };

  return (
    <div className="bg-slate-950/95 border border-slate-800 rounded-2xl p-5 shadow-2xl flex flex-col gap-4 w-full max-w-5xl">
      <div className="relative w-full h-[220px] rounded-2xl overflow-hidden border border-slate-800/70 shadow-xl bg-slate-900">
        {imageSrc ? (
          <img src={imageSrc} alt={boss.name} className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 bg-slate-800" />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-black/15 via-black/35 to-black/70" />
        <div className="absolute top-3 left-3 px-3 py-1 rounded-full border border-purple-400/70 bg-purple-500/10 text-purple-100 text-[11px] uppercase tracking-[0.18em]">
          Boss
        </div>
        <div className="absolute top-3 right-3 px-3 py-1 rounded-full border border-amber-400/70 bg-amber-500/15 text-amber-200 text-sm font-semibold">
          {boss.vp} VP
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="text-2xl font-bold text-slate-50 leading-tight break-words">{boss.name}</div>
        {boss.subtitle && <div className="text-sm text-slate-300">{boss.subtitle}</div>}
        {boss.era && (
          <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">
            Era: {String(boss.era).toUpperCase()}
          </div>
        )}
      </div>

      <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-1">
        <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400 mb-2">Thresholds</div>
        <div className="flex gap-1">
          {boss.thresholds?.map((t, idx) => (
            <div
              key={t.label || idx}
              className="min-w-[200px] flex-1 p-1 rounded-lg border border-slate-800 bg-gradient-to-br from-slate-900/70 via-slate-900/40 to-slate-900/70 flex flex-col gap-1 text-slate-100 shadow-inner"
            >
              <div className="flex gap-1">
                <div>
                  <div className="font-semibold text-slate-50">{t.label}</div>
                  <div className="flex gap-1">{renderCostChips(t.cost)}</div>
                </div>
                <div className="flex items-center gap-2">
                  {t.vp !== undefined && (
                    <span className="px-2 py-0.5 rounded border border-amber-400/60 bg-amber-500/10 text-amber-200 text-[11px]">
                      {t.vp} VP
                    </span>
                  )}
                </div>
              </div>

              {Array.isArray(t.spoils) && t.spoils.length > 0 && (
                <div className="bg-slate-900/70 border border-slate-800 rounded-lg p-2 text-[12px]">
                  <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500 mb-1">Spoils</div>
                  <ul className="text-slate-200 space-y-1">
                    {t.spoils.map((s, sidx) => (
                      <li key={`${t.label || "thr"}-${sidx}`} className="flex items-center justify-between gap-2">
                        <span>{s.label || s.kind || "Reward"}</span>
                        <span className="text-slate-400">{s.token || s.slot_type || s.kind}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
