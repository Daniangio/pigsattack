import React from "react";
import { Flame, Weight } from "lucide-react";
import { formatCostParts } from "../../utils/formatters";
import { ResourceCost, ResourceIcon } from "../resources/ResourceCost";
import { getThreatImage } from "../../utils/threatImages";

export default function ThreatCardDetail({ threat, actionLabel, actionDisabled, onAction }) {
  if (!threat) return null;

  const spoils = threat.spoils || [];
  const imageSrc = getThreatImage(threat.image);
  const costParts = formatCostParts(threat.cost || {});
  const type = String(threat.type || "").toUpperCase();
  const typeColor =
    {
      feral: "text-red-300 border-red-400/50 bg-red-900/40",
      cunning: "text-blue-300 border-blue-400/50 bg-blue-900/40",
      massive: "text-emerald-300 border-emerald-400/50 bg-emerald-900/40",
      hybrid: "text-zinc-200 border-zinc-400/50 bg-zinc-900/40",
    }[String(threat.type || "").toLowerCase()] || "text-slate-200 border-slate-500/60 bg-slate-800/40";
  const enrageTokens = threat?.enrage_tokens ?? threat?.enrageTokens ?? 0;
  const bonusVp = enrageTokens > 0 ? 1 : 0;
  const displayVp = (threat?.vp ?? 0) + bonusVp;
  const weightTokens = threat?.weight ?? threat?.weight ?? 0;
  const eraLabel = threat?.era ? `Era ${threat.era}` : null;
  const laneLabel = threat?.position || threat?.lane || threat?.slot || null;

  return (
    <div className="bg-slate-950/95 border border-slate-800 rounded-2xl p-5 shadow-2xl flex flex-col md:flex-row gap-6 w-full max-w-5xl">
      <div className="w-full md:w-[360px] flex flex-col gap-3 items-center">
        <div className="relative w-[360px] h-[270px] rounded-2xl overflow-hidden border border-slate-800/70 shadow-xl bg-slate-900">
          {imageSrc ? (
            <img src={imageSrc} alt={threat.name} className="absolute inset-0 w-full h-full object-cover" />
          ) : (
            <div className="absolute inset-0 bg-slate-800" />
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-black/15 via-black/35 to-black/70" />
          <div
            className={`absolute top-3 right-3 px-3 py-1 rounded-full border text-sm font-semibold ${
              bonusVp ? "border-orange-400/80 bg-orange-500/20 text-orange-200" : "border-amber-400/70 bg-amber-500/15 text-amber-200"
            }`}
          >
            {displayVp} VP
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

      <div className="flex-1 flex flex-col gap-2">
        <div className="flex flex-col gap-2">
          <div className="text-2xl font-bold text-slate-50 leading-tight break-words">{threat.name}</div>
          <div className="flex items-center gap-2 text-sm text-slate-300 flex-wrap">
            <div className={`px-2 py-1 rounded-md border ${typeColor} text-xs uppercase tracking-[0.18em]`}>{type}</div>
            {eraLabel && <span className="px-2 py-1 rounded-md bg-slate-900/70 border border-slate-800 text-slate-200">{eraLabel}</span>}
            {laneLabel && <span className="px-2 py-1 rounded-md bg-slate-900/70 border border-slate-800 text-slate-200">Lane: {laneLabel}</span>}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-1">
          <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-3">
            <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400 mb-2">Attributes</div>
            <div className="space-y-1 text-sm text-slate-100">
              <div className="flex items-center justify-between">
                <span>Enrage</span>
                <span className="flex items-center gap-1 text-amber-200">
                  <Flame size={14} className="text-red-300" />
                  {enrageTokens > 0 ? (
                    <>
                      +{2 * enrageTokens}
                      <ResourceIcon resource="R" size={12} />
                    </>
                  ) : (
                    "None"
                  )}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span>Weight</span>
                <span className="flex items-center gap-1 text-green-200">
                  <Weight size={14} className="text-green-300" />
                  {weightTokens > 0 ? (
                    <>
                      +{weightTokens}
                      <ResourceIcon resource="G" size={12} />
                    </>
                  ) : (
                    "None"
                  )}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-3">
            <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400 mb-2">Cost</div>
            <div className="flex items-center gap-2 flex-wrap text-[12px] uppercase tracking-[0.12em] text-slate-100">
              <ResourceCost parts={costParts} iconSize={12} />
              {enrageTokens > 0 && (
                <span className="flex items-center gap-1 px-2 py-1 rounded border border-amber-500/70 bg-amber-500/15 text-amber-200 whitespace-nowrap">
                  <Flame size={14} className="text-amber-300" />
                  +{2 * enrageTokens}
                  <ResourceIcon resource="R" size={12} />
                </span>
              )}
              {weightTokens > 0 && (
                <span className="flex items-center gap-1 px-2 py-1 rounded border border-green-700 bg-green-900/40 text-green-200 whitespace-nowrap">
                  W+{weightTokens}
                  <ResourceIcon resource="G" size={12} />
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-3">
          <div className="uppercase text-[11px] tracking-[0.18em] text-slate-400 mb-2">Spoils / Rewards</div>
          {spoils.length > 0 ? (
            <ul className="space-y-2 text-[12px] text-slate-100">
              {spoils.map((r, idx) => (
                <li key={`${r.label || r.kind || "spoil"}-${idx}`} className="flex justify-between items-center bg-slate-800/60 border border-slate-700 rounded-lg px-2 py-1">
                  <span>{r.label || r.kind || "Reward"}</span>
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
