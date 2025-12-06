import React from 'react';
import { formatCostParts } from '../../utils/formatters';
import { getThreatImage } from '../../utils/threatImages';

export default function ThreatCardDetail({ threat, actionLabel, actionDisabled, onAction }) {
  if (!threat) return null;

  const spoils = threat.spoils || [];
  const imageSrc = getThreatImage(threat.image);
  const costParts = formatCostParts(threat.cost || {});
  const typeColor =
    {
      feral: "text-red-300",
      cunning: "text-blue-300",
      massive: "text-green-300",
      hybrid: "text-emerald-200",
    }[String(threat.type || "").toLowerCase()] || "text-slate-200";

  return (
    <div className="bg-slate-950/90 border border-slate-800 rounded-2xl p-4 shadow-2xl flex gap-4">
      <div className="flex flex-col gap-3">
        <div className="relative w-64 overflow-hidden rounded-xl self-start">
          {imageSrc && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div
                className="w-[85%] h-[85%] rounded-xl bg-center bg-no-repeat bg-cover"
                style={{ backgroundImage: `url(${imageSrc})` }}
              />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-black/15 via-black/35 to-black/70" />
          <div className="relative z-10 h-full flex flex-col p-1 gap-1">
            <div className="flex justify-center">
              <div className="w-[70%] text-center space-y-2">
                <div className="inline-block px-2 py-1 rounded-md border border-slate-200/30 bg-black/70 text-lg font-bold text-slate-50 leading-tight drop-shadow line-clamp-2">
                  {threat.name}
                </div>
                <span
                  className={`px-2 py-1 rounded-full border border-white/10 bg-black/60 uppercase tracking-[0.12em] text-xs ${typeColor}`}
                >
                  {threat.type}
                </span>
              </div>
            </div>
            <div className="mt-auto">
              <div className="bg-black/55 border border-slate-800 rounded-lg p-2 flex justify-between items-center backdrop-blur-sm">
                <span className="flex gap-2 text-sm items-center">
                  {costParts.map((p) => (
                    <span key={p.key} className={p.className}>{`${p.val}${p.key}`}</span>
                  ))}
                  {!costParts.length && <span className="text-slate-300">0</span>}
                </span>
                <span className="px-2 py-1 rounded-full border border-amber-400/80 bg-amber-500/10 text-amber-200 text-[11px] ml-1">
                  {threat.vp} VP
                </span>
              </div>
              <div className="text-emerald-200 text-[12px] leading-snug mt-2">Reward: {threat.reward}</div>
            </div>
          </div>
        </div>
        {actionLabel && (
          <button
            type="button"
            disabled={actionDisabled}
            onClick={onAction}
            className={`w-full py-2 rounded-lg text-xs uppercase tracking-[0.2em] border ${
              actionDisabled
                ? "border-slate-700 text-slate-500 cursor-not-allowed"
                : "border-amber-400 text-amber-200 hover:bg-amber-400/10"
            }`}
          >
            {actionLabel}
          </button>
        )}
      </div>
      <div className="flex-1 flex flex-col gap-3">
        <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-3">
          <div className="uppercase text-[11px] tracking-[0.18em] text-slate-400 mb-2">Spoils / Rewards</div>
          {spoils.length > 0 ? (
            <ul className="space-y-2 text-[12px] text-slate-100">
              {spoils.map((r, idx) => (
                <li key={`${r.label}-${idx}`} className="flex justify-between items-center bg-slate-800/60 border border-slate-700 rounded-lg px-2 py-1">
                  <span>{r.label}</span>
                  <span className="text-slate-400 text-[11px]">{r.token || r.slot_type || r.kind}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-slate-300 text-sm">Reward: {threat.reward}</div>
          )}
        </div>
      </div>
    </div>
  );
}
