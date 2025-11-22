import React from "react";

export default function BossCard({ boss }) {
  return (
    <div className="w-72 bg-slate-900 border-2 border-amber-500 rounded-2xl p-4 shadow-xl">
      <div className="flex justify-between text-xs text-slate-400">
        <span>Boss</span>
        <span className="text-amber-300">{boss.vp} VP</span>
      </div>

      <div className="text-lg font-bold text-slate-50 mt-1">
        {boss.name}
      </div>

      {boss.thresholds.map((t) => (
        <div
          key={t.label}
          className="mt-2 p-2 bg-slate-900/40 border border-slate-700 rounded-lg text-xs"
        >
          <div className="font-bold text-slate-300">{t.label}</div>
          <div className="text-slate-200">Cost: {t.cost}</div>
          <div className="text-emerald-300">Reward: {t.reward}</div>
        </div>
      ))}
    </div>
  );
}
