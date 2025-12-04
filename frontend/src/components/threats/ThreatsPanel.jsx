import React from "react";
import { Maximize2, Layers, ArrowRightCircle } from "lucide-react";
import { ThreatData } from "../../state/threats";
import ThreatCardMini from "./ThreatCardMini";
import ThreatCardCompact from "./ThreatCardCompact";
import BossCard from "./BossCard";

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
      <div className="w-full h-full bg-slate-950/60 border border-slate-800 rounded-3xl p-4 flex flex-col overflow-hidden">
        <div className="flex items-center justify-between mb-3">
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
        <div className="flex-1 flex flex-col gap-3 overflow-auto">
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
    <div className="w-full h-full bg-slate-950/60 border border-slate-800 rounded-3xl p-4 flex flex-col overflow-hidden">
      <div className="flex items-center justify-between mb-3">
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

      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex items-start gap-3 mb-3">
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-700 bg-slate-900/50 text-xs text-slate-200">
            <Layers size={14} className="text-amber-300" />
            <span>Deck</span>
            <span className="text-amber-300 font-semibold">{deckCount ?? 0}</span>
          </div>
          <BossCard boss={bossCard} enablePreview compact />
        </div>
        <div className="flex-1 overflow-auto">
          <div
            className="grid gap-3 min-w-[520px]"
            style={{ gridTemplateColumns: `auto repeat(${threatRows.length || 1}, minmax(0, 1fr))` }}
          >
            <div className="grid grid-rows-3 gap-2 text-[10px] uppercase tracking-[0.16em] text-slate-500 pr-2">
              {laneOrder.map((lane) => (
                <div key={lane} className="flex items-center pl-1">
                  {lane.charAt(0).toUpperCase() + lane.slice(1)}
                </div>
              ))}
            </div>
            {threatRows.map((row, rowIdx) => {
              const slots = { front: null, mid: null, back: null };
              row.forEach((t) => {
                const pos = String(t.position || "").toLowerCase();
                if (pos === "front" || pos === "mid" || pos === "back") {
                  slots[pos] = t;
                } else {
                  if (!slots.front) slots.front = t;
                  else if (!slots.mid) slots.mid = t;
                  else slots.back = t;
                }
              });
              const firstVisible = frontPriority.find((p) => slots[p]);
              return (
                <div key={`row-${rowIdx}`} className="grid grid-rows-3 gap-2">
                  {laneOrder.map((pos) => {
                    const threat = slots[pos];
                    const enrageTokens = threat?.enrage_tokens ?? threat?.enrageTokens ?? 0;
                    const isVisible = pos === firstVisible;
                    const isAttacking = threat && ((pos === "front" && stanceWeakness(threat.type, activeStance)) || enrageTokens > 0);
                    const componentKey = `${rowIdx}-${pos}`;
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
                        <ThreatCardCompact key={componentKey} threat={threat} onFight={onFightRow} {...sharedProps} />
                      ) : (
                        <ThreatCardMini key={componentKey} threat={threat} onFight={onFightRow} {...sharedProps} />
                      )
                    ) : (
                      <div
                        key={componentKey}
                        className="h-full min-h-[120px] rounded-xl border border-dashed border-slate-700 bg-slate-900/30 flex items-center justify-center text-[10px] text-slate-600"
                      >
                        Empty
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
