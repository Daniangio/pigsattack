import React from "react";
import { MarketCard, ThreatCard } from "./GameCoreComponents.jsx";
import { PlayerTag } from "./GameUIHelpers.jsx";
import { SCRAP_TYPES } from "./GameConstants.jsx";

export const ThreatsPanel = ({
  threats,
  threatAssignments,
  onThreatSelect,
  selectedThreatId,
  gameState,
}) => {
  if (!threats || threats.length === 0) {
    return (
      <div className="w-full h-full flex justify-center items-center p-4 bg-gray-800 bg-opacity-70 rounded-lg">
        <p className="text-gray-400 text-lg">
          No threats are currently visible.
        </p>
      </div>
    );
  }

  // Use a responsive grid that can handle 1 or more items gracefully
  return (
    <div className="w-full h-full p-2 bg-gray-800 bg-opacity-70 rounded-lg overflow-y-auto">
      <div className="flex flex-row flex-wrap gap-x-6 gap-y-8 p-4 justify-center">
        {threats.map((threat) => {
          const selectableThreats = gameState?.selectableThreats || [];
          const assignedTo = threatAssignments[threat.id];
          const isAvailable = !assignedTo;
          const isSelectable = selectableThreats?.some(
            (t) => t.id === threat.id
          );
          const isSelected = threat.id === selectedThreatId;
          return (
            <div key={threat.id} className="relative">
              <ThreatCard
                threat={threat}
                isAvailable={isAvailable}
                isSelectable={isSelectable}
                isSelected={isSelected}
                onClick={() => isSelectable && onThreatSelect(threat.id)}
                key={threat.id}
              />
              {assignedTo && <PlayerTag username={assignedTo} />}
            </div>
          );
        })}
      </div>
    </div>
  );
};

const canAfford = (playerScrap, cardCost, isFree = false) => {
  if (isFree) return true;
  if (!playerScrap || !cardCost) return false;

  for (const [scrapType, cost] of Object.entries(cardCost)) {
    if ((playerScrap[scrapType] || 0) < cost) {
      return false;
    }
  }
  return true;
};

// --- REFACTORED MARKET COMPONENTS ---
// They now use flex-row and overflow-x-auto to scroll horizontally
// The h-full prop from the parent sets their height.

export const UpgradesMarket = ({
  upgrade_market,
  myTurn,
  phase,
  choiceType,
  onCardSelect,
  playerScrap,
}) => {
  const isActionBuy = myTurn && phase === "ACTION" && choiceType === "FORTIFY";
  const isIntermissionBuy = myTurn && phase === "INTERMISSION";
  const isMyTurnToBuyUpgrades = isActionBuy || isIntermissionBuy;

  return (
    <div className="p-2 bg-gray-800 bg-opacity-70 rounded-lg shadow-lg h-full flex flex-col gap-1">
      <h2 className="text-base font-semibold text-green-400 text-center flex-shrink-0">
        Upgrades
      </h2>
      <div className="flex-grow flex flex-row gap-2 overflow-x-auto overflow-y-hidden p-1">
        {(upgrade_market || []).length > 0 ? (
          (upgrade_market || []).map((card) => {
            const isAffordable = canAfford(
              playerScrap,
              card.cost,
              isIntermissionBuy
            );
            const isSelectable = isMyTurnToBuyUpgrades && isAffordable;
            const isDimmed =
              myTurn &&
              (phase === "ACTION" || phase === "INTERMISSION") &&
              choiceType !== "ARMORY_RUN" &&
              !isSelectable;

            return (
              // Add a fixed width to market cards so they flow horizontally
              <div key={card.id} className="w-36 flex-shrink-0 h-full">
                <MarketCard
                  card={card}
                  cardType="UPGRADE"
                  isSelectable={isSelectable}
                  isDimmed={isDimmed}
                  onClick={() =>
                    isSelectable && onCardSelect("UPGRADE", card.id)
                  }
                />
              </div>
            );
          })
        ) : (
          <p className="text-gray-500 text-sm italic text-center m-auto">
            Empty
          </p>
        )}
      </div>
    </div>
  );
};

export const ArsenalMarket = ({
  arsenal_market,
  myTurn,
  phase,
  choiceType,
  onCardSelect,
  playerScrap,
}) => {
  const isActionBuy =
    myTurn && phase === "ACTION" && choiceType === "ARMORY_RUN";
  const isIntermissionBuy = myTurn && phase === "INTERMISSION";
  const isMyTurnToBuyArsenal = isActionBuy || isIntermissionBuy;

  return (
    <div className="p-2 bg-gray-800 bg-opacity-70 rounded-lg shadow-lg h-full flex flex-col gap-1">
      <h2 className="text-base font-semibold text-red-400 text-center flex-shrink-0">
        Arsenal
      </h2>
      <div className="flex-grow flex flex-row gap-2 overflow-x-auto overflow-y-hidden p-1">
        {(arsenal_market || []).length > 0 ? (
          (arsenal_market || []).map((card) => {
            const isAffordable = canAfford(
              playerScrap,
              card.cost,
              isIntermissionBuy
            );
            const isSelectable = isMyTurnToBuyArsenal && isAffordable;
            const isDimmed =
              myTurn &&
              (phase === "ACTION" || phase === "INTERMISSION") &&
              choiceType !== "FORTIFY" &&
              !isSelectable;

            return (
              // Add a fixed width to market cards so they flow horizontally
              <div key={card.id} className="w-36 flex-shrink-0 h-full">
                <MarketCard
                  card={card}
                  cardType="ARSENAL"
                  isSelectable={isSelectable}
                  isDimmed={isDimmed}
                  onClick={() =>
                    isSelectable && onCardSelect("ARSENAL", card.id)
                  }
                />
              </div>
            );
          })
        ) : (
          <p className="text-gray-500 text-sm italic text-center m-auto">
            Empty
          </p>
        )}
      </div>
    </div>
  );
};
