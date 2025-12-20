import React, { useState } from "react";
import { formatCostParts } from "../../utils/formatters";
import { setHoverPreview } from "../hover/HoverPreviewPortal";
import { ResourceCost } from "../resources/ResourceCost";

export default function BossCard({ boss, compact, enablePreview }) {
  const [hovered, setHovered] = useState(false);
  const handleClick = () => {
    if (!enablePreview) return;
    setHoverPreview({ type: "boss", data: boss, sourceId: boss.id, lock: true });
  };
  const containerClass = compact
    ? "relative w-56 bg-slate-900 border-2 border-amber-500 rounded-2xl p-3 shadow-xl transition hover:border-amber-300 cursor-pointer overflow-hidden"
    : "relative w-72 bg-slate-900 border-2 border-amber-500 rounded-2xl p-4 shadow-xl transition hover:border-amber-300 cursor-pointer overflow-hidden";

  return (
    <div
      className={containerClass}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={handleClick}
    >
      <div className="flex justify-between text-xs text-slate-400">
        <span>Boss</span>
        <span className="text-amber-300">{boss.vp} VP</span>
      </div>

      <div className={`${compact ? "text-base" : "text-lg"} font-bold text-slate-50 mt-1`}>
        {boss.name}
      </div>

      {!compact && (
        <div className="mt-3 flex flex-col gap-2">
          <div className="text-[11px] uppercase tracking-[0.2em] text-slate-500">Thresholds</div>
          <div className="flex flex-wrap gap-2">
            {boss.thresholds.map((t) => (
              <div
                key={t.label}
                className="p-2 bg-slate-900/40 border border-slate-700 rounded-lg text-xs min-w-[120px]"
              >
                <div className="font-bold text-slate-300">{t.label}</div>
                <div className="text-slate-200 flex items-center gap-2">
                  <span>Cost:</span>
                  <ResourceCost parts={formatCostParts(t.cost)} iconSize={12} />
                </div>
                <div className="text-emerald-300">Reward: {t.reward}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {enablePreview && (
        <>
          <div
            className={`mt-3 text-[10px] uppercase tracking-[0.18em] text-slate-400 transition-opacity ${
              hovered ? "opacity-100" : "opacity-70"
            }`}
          >
            Click for details
          </div>
          <div
            className={`pointer-events-none absolute bottom-1 left-1 right-1 text-center text-[10px] uppercase tracking-[0.16em] text-slate-200 bg-black/40 rounded-md py-1 transition-opacity ${
              hovered ? "opacity-100" : "opacity-0"
            }`}
          >
            Click for details
          </div>
        </>
      )}
    </div>
  );
}
