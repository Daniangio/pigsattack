import React from "react";
import { Maximize2, ArrowLeftCircle, Sword, Boxes } from "lucide-react";
import { MarketData } from "../../state/market";
import MarketCardMini from "./MarketCardMini";
import MarketCardCompact from "./MarketCardCompact";
import { fortifyCard, armoryRunCard } from "../../pages/game/GameConstants";

export default function MarketPanel({
  compact,
  market,
  onCardBuy,
  selectedCardId,
  canBuyCard,
  isMyTurn,
  highlightBuyables,
  hasSlotForCard,
  onZoom,
  onGoToThreats,
  showThreatsTransition = false,
  optionalBuyUsed = false,
}) {
  const upgradesTop = (Array.isArray(market?.upgrades_top) ? market.upgrades_top : MarketData.upgrades_top).filter(
    (c) => c.id !== selectedCardId
  );
  const upgradesBottom = (Array.isArray(market?.upgrades_bottom) ? market.upgrades_bottom : MarketData.upgrades_bottom).filter(
    (c) => c.id !== selectedCardId
  );
  const weaponsTop = (Array.isArray(market?.weapons_top) ? market.weapons_top : MarketData.weapons_top).filter(
    (c) => c.id !== selectedCardId
  );
  const weaponsBottom = (Array.isArray(market?.weapons_bottom) ? market.weapons_bottom : MarketData.weapons_bottom).filter(
    (c) => c.id !== selectedCardId
  );
  const upgradeDeckRemaining = market?.upgrade_deck_remaining ?? 0;
  const weaponDeckRemaining = market?.weapon_deck_remaining ?? 0;

  const panelGridClasses = compact
    ? "grid grid-cols-2 gap-1"
    : "grid grid-cols-2 gap-1";

  const cardGridClasses = compact
    ? "grid auto-rows-min gap-1 grid-cols-[repeat(auto-fill,minmax(120px,auto))] justify-start items-start"
    : "grid auto-rows-min gap-1 md:gap-2 grid-cols-[repeat(auto-fill,minmax(150px,auto))] justify-start items-start";

  const optionalBorderClasses = optionalBuyUsed
    ? "grayscale opacity-60"
    : "";

  const getButtonState = (card) => {
    if (!(canBuyCard?.(card) && hasSlotForCard?.(card))) return "cannot";
    if (!isMyTurn) return "not_turn";
    return "ready";
  };

  const getTooltip = (card) =>
    !hasSlotForCard?.(card) ? "No slot available" : undefined;

  const shouldHighlight = (card) =>
    highlightBuyables && canBuyCard?.(card) && hasSlotForCard?.(card);

  return (
    <div
      className="w-full h-full bg-slate-950/5 border border-slate-800
                 rounded-3xl p-1 flex flex-col relative overflow-hidden min-h-0"
    >
      {/* top right controls */}
      <div className="flex justify-end items-center mb-2 relative z-10 pointer-events-auto">
        <h3 className="text-xs uppercase tracking-[0.35em] text-slate-400">Market</h3>
        {onGoToThreats && showThreatsTransition && (
          <button
            onClick={onGoToThreats}
            className="px-2 py-1 rounded-full border border-slate-700 text-slate-200 hover:bg-slate-800 text-[11px] flex items-center gap-1"
            title="Slide to threats view"
          >
            <ArrowLeftCircle size={14} /> Threats
          </button>
        )}
        {onZoom && (
          <button
            onClick={onZoom}
            className="ml-2 p-1 rounded-full border border-slate-700 text-slate-200 hover:bg-slate-800"
          >
            <Maximize2 size={14} />
          </button>
        )}
      </div>

      {/* main content grid (no overflow here, to avoid clipping the header images) */}
      <div className={`flex-1 min-h-0 pr-1 ${panelGridClasses}`}>
        {/* Upgrades panel */}
        <div className="relative flex flex-col h-full min-h-0 bg-slate-900/60 border border-slate-800 rounded-2xl p-3">
          {/* header row: image + deck count */}
          <div className="flex items-end gap-3 mb-3 -mt-10">
            <div className={`w-32 h-24 rounded-xl overflow-hidden ${optionalBorderClasses}`}>
              <img
                src={fortifyCard}
                alt="Optional Buy Upgrades"
                className="w-full h-full object-contain"
              />
            </div>

            <span className="px-2 py-1 rounded-full border border-slate-700 bg-slate-800/60 flex items-center gap-1 text-[11px]">
              <Boxes size={12} className="text-emerald-300" />
              <span className="text-slate-100">{upgradeDeckRemaining}</span>
            </span>
          </div>

          <div className="flex-1 min-h-0 flex flex-col gap-2">
            <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.24em] text-slate-400">
              <span>New Stock</span>
              <span className="text-slate-500">Top Lane</span>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto pr-1">
              <div className={cardGridClasses}>
                {upgradesTop.map((u, idx) =>
                  compact ? (
                    <MarketCardCompact
                      key={`${u.id}-${idx}`}
                      card={u}
                      onBuy={onCardBuy}
                      buttonState={getButtonState(u)}
                      highlight={shouldHighlight(u)}
                      tooltip={getTooltip(u)}
                    />
                  ) : (
                    <MarketCardMini
                      key={`${u.id}-${idx}`}
                      card={u}
                      onBuy={onCardBuy}
                      buttonState={getButtonState(u)}
                      highlight={shouldHighlight(u)}
                      tooltip={getTooltip(u)}
                    />
                  )
                )}
              </div>
            </div>
            <div className="h-px bg-slate-800" />
            <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.24em] text-slate-400">
              <span>Carryover</span>
              <span className="text-slate-500">Bottom Lane</span>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto pr-1">
              <div className={cardGridClasses}>
                {upgradesBottom.map((u, idx) =>
                  compact ? (
                    <MarketCardCompact
                      key={`${u.id}-${idx}`}
                      card={u}
                      onBuy={onCardBuy}
                      buttonState={getButtonState(u)}
                      highlight={shouldHighlight(u)}
                      tooltip={getTooltip(u)}
                    />
                  ) : (
                    <MarketCardMini
                      key={`${u.id}-${idx}`}
                      card={u}
                      onBuy={onCardBuy}
                      buttonState={getButtonState(u)}
                      highlight={shouldHighlight(u)}
                      tooltip={getTooltip(u)}
                    />
                  )
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Weapons panel */}
        <div className="relative flex flex-col h-full min-h-0 bg-slate-900/60 border border-slate-800 rounded-2xl p-3 ">
          {/* header row: image + deck count */}
          <div className="flex items-end gap-3 mb-3 -mt-10">
            <div className={`w-32 h-24 rounded-xl overflow-hidden ${optionalBorderClasses}`}>
              <img
                src={armoryRunCard}
                alt="Optional Buy Weapons"
                className="w-full h-full object-contain"
              />
            </div>

            <span className="px-2 py-1 rounded-full border border-slate-700 bg-slate-800/60 flex items-center gap-1 text-[11px]">
              <Sword size={12} className="text-sky-300" />
              <span className="text-slate-100">{weaponDeckRemaining}</span>
            </span>
          </div>

          <div className="flex-1 min-h-0 flex flex-col gap-2">
            <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.24em] text-slate-400">
              <span>New Stock</span>
              <span className="text-slate-500">Top Lane</span>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto pr-1">
              <div className={cardGridClasses}>
                {weaponsTop.map((w, idx) =>
                  compact ? (
                    <MarketCardCompact
                      key={`${w.id}-${idx}`}
                      card={w}
                      onBuy={onCardBuy}
                      buttonState={getButtonState(w)}
                      highlight={shouldHighlight(w)}
                      tooltip={getTooltip(w)}
                    />
                  ) : (
                    <MarketCardMini
                      key={`${w.id}-${idx}`}
                      card={w}
                      onBuy={onCardBuy}
                      buttonState={getButtonState(w)}
                      highlight={shouldHighlight(w)}
                      tooltip={getTooltip(w)}
                    />
                  )
                )}
              </div>
            </div>
            <div className="h-px bg-slate-800" />
            <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.24em] text-slate-400">
              <span>Carryover</span>
              <span className="text-slate-500">Bottom Lane</span>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto pr-1">
              <div className={cardGridClasses}>
                {weaponsBottom.map((w, idx) =>
                  compact ? (
                    <MarketCardCompact
                      key={`${w.id}-${idx}`}
                      card={w}
                      onBuy={onCardBuy}
                      buttonState={getButtonState(w)}
                      highlight={shouldHighlight(w)}
                      tooltip={getTooltip(w)}
                    />
                  ) : (
                    <MarketCardMini
                      key={`${w.id}-${idx}`}
                      card={w}
                      onBuy={onCardBuy}
                      buttonState={getButtonState(w)}
                      highlight={shouldHighlight(w)}
                      tooltip={getTooltip(w)}
                    />
                  )
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
