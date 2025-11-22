import React from "react";
import { MarketData } from "../../state/market";
import MarketCardMini from "./MarketCardMini";
import MarketCardCompact from "./MarketCardCompact";

export default function MarketPanel({ compact }) {
  const upgrades = MarketData.upgrades;
  const weapons  = MarketData.weapons;
  const panelGridClasses = compact
    ? "grid grid-cols-1 xl:grid-cols-2 gap-3"
    : "grid grid-cols-1 xl:grid-cols-2 gap-5";
  const cardGridClasses = compact
    ? "grid grid-cols-2 gap-1.5 auto-rows-min"
    : "grid grid-cols-2 gap-3 md:gap-4 auto-rows-min";

  return (
    <div className="w-full h-full bg-slate-950/60 border border-slate-800 
                    rounded-3xl p-4 flex flex-col overflow-hidden">
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-xs uppercase tracking-[0.35em] text-slate-400">
          Market
        </h3>
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
                <MarketCardCompact key={u.id} card={u} />
              ) : (
                <MarketCardMini key={u.id} card={u} />
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
                <MarketCardCompact key={w.id} card={w} />
              ) : (
                <MarketCardMini key={w.id} card={w} />
              )
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
