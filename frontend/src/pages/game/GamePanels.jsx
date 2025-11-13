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

  return (
    <div className="w-full h-full p-2 bg-gray-800 bg-opacity-70 rounded-lg overflow-y-auto">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
    <div className="p-2 bg-gray-800 bg-opacity-70 rounded-lg shadow-lg h-full flex flex-col gap-2">
      <h2 className="text-base font-semibold text-green-400 text-center flex-shrink-0">
        Upgrades
      </h2>
      <div className="flex-grow flex flex-col gap-2 overflow-y-auto px-1">
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
              <MarketCard
                key={card.id}
                card={card}
                cardType="UPGRADE"
                isSelectable={isSelectable}
                isDimmed={isDimmed}
                onClick={() => isSelectable && onCardSelect("UPGRADE", card.id)}
              />
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
    <div className="p-2 bg-gray-800 bg-opacity-70 rounded-lg shadow-lg h-full flex flex-col gap-2">
      <h2 className="text-base font-semibold text-red-400 text-center flex-shrink-0">
        Arsenal
      </h2>
      <div className="flex-grow flex flex-col gap-2 overflow-y-auto px-1">
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
              <MarketCard
                key={card.id}
                card={card}
                cardType="ARSENAL"
                isSelectable={isSelectable}
                isDimmed={isDimmed}
                onClick={() => isSelectable && onCardSelect("ARSENAL", card.id)}
              />
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
