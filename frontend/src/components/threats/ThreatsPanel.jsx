import React from "react";
import { Maximize2, ArrowRightCircle, Boxes } from "lucide-react";
import { ThreatData } from "../../state/threats";
import ThreatCardMini from "./ThreatCardMini";
import ThreatCardCompact from "./ThreatCardCompact";
import BossCard from "./BossCard";
import { getThreatImage } from "../../utils/threatImages";

export default function ThreatsPanel({
  compact,
  rows,
  boss,
  bossMode = false,
  bossThresholds = [],
  bossStage = "day",
  canFightAny = false,
  onFightRow,
  onZoom,
  onGoToMarket,
  showMarketTransition = false,
  activeStance,
  deckCount = 0,
}) {
  const bossCard = boss || ThreatData.boss;
  const threatRows = rows && rows.length ? rows : ThreatData.rows;
  const laneOrder = ["back", "mid", "front"];
  const frontPriority = ["front", "mid", "back"];
  const bossImage = bossCard?.image ? getThreatImage(bossCard.image) : null;

  const stanceWeakness = (threatType = "", stance = "") => {
    const type = threatType.toLowerCase();
    const s = stance.toUpperCase();
    if (!type || !s) return false;
    if (type === "hybrid") return s !== "BALANCED";
    const weakMap = {
      AGGRESSIVE: new Set(["feral"]),
      TACTICAL: new Set(["cunning"]),
      HUNKERED: new Set(["massive"]),
      BALANCED: new Set(["feral", "cunning", "massive"]),
    };
    return weakMap[s]?.has(type);
  };

  if (bossMode) {
    return (
      <div className="w-full h-full bg-slate-950/60 border border-slate-800 rounded-3xl p-3 flex flex-col relative overflow-hidden">
        <div className="flex justify-end items-center mb-2">
          <h3 className="text-xs uppercase tracking-[0.35em] text-slate-400">
            Boss • {String(bossStage || "day").toUpperCase()}
          </h3>
          <div className="flex items-center gap-2">
            {onZoom && (
              <button
                onClick={onZoom}
                className="p-1 rounded-full border border-slate-700 text-slate-200 hover:bg-slate-800"
              >
                <Maximize2 size={14} />
              </button>
            )}
          </div>
        </div>
        <div className="flex-1 flex flex-col gap-1 overflow-y-auto">
          <BossCard boss={bossCard} enablePreview compact />
          <div className="grid gap-2 sm:grid-cols-2">
            {(bossThresholds || []).map((th, idx) => {
              const cost = th.cost || {};
              const defeated = th.defeated;
              return (
                <button
                  key={th.index ?? idx}
                  disabled={defeated}
                  onClick={() =>
                    onFightRow?.(0, {
                      id: `boss-${th.index ?? idx}`,
                      name: `${bossCard?.name || "Boss"} • ${th.label}`,
                      cost,
                      reward: th.reward,
                      type: "Boss",
                      boss_threshold: th.index ?? idx,
                    })
                  }
                  className={`w-full text-left p-3 rounded-lg border transition ${
                    defeated
                      ? "border-slate-800 bg-slate-900/40 text-slate-500 cursor-not-allowed"
                      : "border-amber-400/60 bg-amber-400/5 hover:border-amber-300"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="text-xs text-slate-200">{th.label || `Threshold ${idx + 1}`}</div>
                    {defeated ? (
                      <span className="text-[10px] text-emerald-300 uppercase">Cleared</span>
                    ) : (
                      <ArrowRightCircle size={14} className="text-amber-300" />
                    )}
                  </div>
                  <div className="text-[11px] text-amber-200 mt-1">
                    Cost: {["R", "B", "G"].map((k) => (cost?.[k] ? `${k}${cost[k]} ` : ""))}
                  </div>
                  {th.reward && <div className="text-[11px] text-slate-300">Reward: {th.reward}</div>}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-slate-950/5 border border-slate-800 rounded-3xl p-3 flex flex-col overflow-hidden">
      <div className="flex items-center justify-end mb-3 gap-2">
        <h3 className="text-xs uppercase tracking-[0.35em] text-slate-400">Threats</h3>
        <div className="flex items-center gap-2">
          {onGoToMarket && showMarketTransition && (
            <button
              onClick={onGoToMarket}
              className="px-2 py-1 rounded-full border border-slate-700 text-slate-200 hover:bg-slate-800 text-[11px] flex items-center gap-1"
              title="Slide to market view"
            >
              Market <ArrowRightCircle size={14} />
            </button>
          )}
          {onZoom && (
            <button
              onClick={onZoom}
              className="p-1 rounded-full border border-slate-700 text-slate-200 hover:bg-slate-800"
            >
              <Maximize2 size={14} />
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 flex flex-col">
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-3 gap-3 relative">
          {["back", "mid", "front"].map((pos, idx) => (
            <div
              key={pos}
              className="relative flex flex-col h-full bg-slate-900/60 border border-slate-800 rounded-2xl p-3 pt-10"
            >
              {pos === "back" && (
                <div className="absolute -top-10 left-3 flex items-end gap-3 pointer-events-none">
                  {bossImage && (
                    <div className="w-32 h-24 rounded-xl overflow-hidden border border-amber-400 shadow-lg shadow-amber-400/30 bg-slate-900/70">
                      <img src={bossImage} alt={bossCard?.name || "Boss"} className="w-full h-full object-cover" />
                    </div>
                  )}
                  <span className="px-2 py-1 rounded-full border border-slate-700 bg-slate-800/80 flex items-center gap-1 text-[11px]">
                    <Boxes size={12} className="text-emerald-300" />
                    <span className="text-slate-100">{deckCount ?? 0}</span>
                  </span>
                </div>
              )}
              <div className="text-[11px] uppercase tracking-[0.16em] text-slate-400 mb-2 flex items-center gap-2">
                {pos.charAt(0).toUpperCase() + pos.slice(1)}
              </div>
              <div className="flex-1 overflow-y-auto pr-1">
                <div className="flex flex-col gap-2">
                  {threatRows.map((row, rowIdx) => {
                    const slots = { front: null, mid: null, back: null };
                    row.forEach((t) => {
                      const p = String(t.position || "").toLowerCase();
                      if (p === "front" || p === "mid" || p === "back") {
                        slots[p] = t;
                      } else {
                        if (!slots.front) slots.front = t;
                        else if (!slots.mid) slots.mid = t;
                        else slots.back = t;
                      }
                    });
                    const firstVisible = frontPriority.find((p) => slots[p]);
                    const threat = slots[pos];
                    const enrageTokens = threat?.enrage_tokens ?? threat?.enrageTokens ?? 0;
                    const isVisible = pos === firstVisible;
                    const isAttacking =
                      threat && ((pos === "front" && stanceWeakness(threat.type, activeStance)) || enrageTokens > 0);
                    const sharedProps = {
                      rowIndex: rowIdx,
                      isFront: isVisible,
                      canFight: isVisible || bossMode || canFightAny,
                      isAttacking,
                      weight: threat?.weight || 0,
                      position: pos,
                    };
                    return threat ? (
                      compact ? (
                        <ThreatCardCompact key={`${rowIdx}-${pos}`} threat={threat} onFight={onFightRow} {...sharedProps} />
                      ) : (
                        <ThreatCardMini key={`${rowIdx}-${pos}`} threat={threat} onFight={onFightRow} {...sharedProps} />
                      )
                    ) : (
                      <div
                        key={`${rowIdx}-${pos}`}
                        className="h-full min-h-[120px] rounded-xl border border-dashed border-slate-700 bg-slate-900/30 flex items-center justify-center text-[10px] text-slate-600"
                      >
                        Empty
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
