import React from "react";
import { Maximize2, ArrowLeftCircle, Sword, Boxes } from "lucide-react";
import { MarketData } from "../../state/market";
import MarketCardMini from "./MarketCardMini";
import MarketCardCompact from "./MarketCardCompact";

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
}) {
  const upgrades = (Array.isArray(market?.upgrades) ? market.upgrades : MarketData.upgrades).filter(
    (c) => c.id !== selectedCardId
  );
  const weapons  = (Array.isArray(market?.weapons) ? market.weapons : MarketData.weapons).filter(
    (c) => c.id !== selectedCardId
  );
  const upgradeDeckRemaining = market?.upgrade_deck_remaining ?? 0;
  const weaponDeckRemaining = market?.weapon_deck_remaining ?? 0;
  const panelGridClasses = compact
    ? "grid grid-cols-1 xl:grid-cols-2 gap-3"
    : "grid grid-cols-1 xl:grid-cols-2 gap-5";
  const cardGridClasses = compact
    ? "grid auto-rows-min gap-1.5 grid-cols-[repeat(auto-fit,minmax(220px,1fr))]"
    : "grid auto-rows-min gap-3 md:gap-4 grid-cols-[repeat(auto-fit,minmax(240px,1fr))]";

  return (
    <div className="w-full h-full bg-slate-950/60 border border-slate-800 
                    rounded-3xl p-4 flex flex-col overflow-hidden">
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-xs uppercase tracking-[0.35em] text-slate-400">
          Market
        </h3>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 text-[11px] text-slate-300">
            <span className="px-2 py-1 rounded-full border border-slate-700 bg-slate-800/60 flex items-center gap-1">
              <Boxes size={12} className="text-emerald-300" />
              <span className="text-slate-100">{upgradeDeckRemaining}</span>
            </span>
            <span className="px-2 py-1 rounded-full border border-slate-700 bg-slate-800/60 flex items-center gap-1">
              <Sword size={12} className="text-sky-300" />
              <span className="text-slate-100">{weaponDeckRemaining}</span>
            </span>
          </div>
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
              className="p-1 rounded-full border border-slate-700 text-slate-200 hover:bg-slate-800"
            >
              <Maximize2 size={14} />
            </button>
          )}
        </div>
      </div>

      <div className={`flex-1 overflow-y-auto ${panelGridClasses}`}>

        {/* Upgrades */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-3">
          <h4 className="text-xs uppercase tracking-[0.2em] text-slate-400 mb-2">
            Upgrades
          </h4>
          <div className={cardGridClasses}>
            {upgrades.map((u) =>
              compact ? (
                <MarketCardCompact
                  key={u.id}
                  card={u}
                  onBuy={onCardBuy}
                  buttonState={
                    canBuyCard?.(u) && hasSlotForCard?.(u)
                      ? isMyTurn
                        ? "ready"
                        : "not_turn"
                      : "cannot"
                  }
                  highlight={highlightBuyables && canBuyCard?.(u) && hasSlotForCard?.(u)}
                  tooltip={!hasSlotForCard?.(u) ? "No slot available" : undefined}
                />
              ) : (
                <MarketCardMini
                  key={u.id}
                  card={u}
                  onBuy={onCardBuy}
                  buttonState={
                    canBuyCard?.(u) && hasSlotForCard?.(u)
                      ? isMyTurn
                        ? "ready"
                        : "not_turn"
                      : "cannot"
                  }
                  highlight={highlightBuyables && canBuyCard?.(u) && hasSlotForCard?.(u)}
                  tooltip={!hasSlotForCard?.(u) ? "No slot available" : undefined}
                />
              )
            )}
          </div>
        </div>

        {/* Weapons */}
        <div className="bg-slate-900/60 border border-slate-800 rounded-2xl p-3">
          <h4 className="text-xs uppercase tracking-[0.2em] text-slate-400 mb-2">
            Weapons
          </h4>
          <div className={cardGridClasses}>
            {weapons.map((w) =>
              compact ? (
                <MarketCardCompact
                  key={w.id}
                  card={w}
                  onBuy={onCardBuy}
                  buttonState={
                    canBuyCard?.(w) && hasSlotForCard?.(w)
                      ? isMyTurn
                        ? "ready"
                        : "not_turn"
                      : "cannot"
                  }
                  highlight={highlightBuyables && canBuyCard?.(w) && hasSlotForCard?.(w)}
                  tooltip={!hasSlotForCard?.(w) ? "No slot available" : undefined}
                />
              ) : (
                <MarketCardMini
                  key={w.id}
                  card={w}
                  onBuy={onCardBuy}
                  buttonState={
                    canBuyCard?.(w) && hasSlotForCard?.(w)
                      ? isMyTurn
                        ? "ready"
                        : "not_turn"
                      : "cannot"
                  }
                  highlight={highlightBuyables && canBuyCard?.(w) && hasSlotForCard?.(w)}
                  tooltip={!hasSlotForCard?.(w) ? "No slot available" : undefined}
                />
              )
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
