import React, { useState, useEffect } from "react";
import {
  LURE_CARDS,
  ACTION_CARDS,
  unknownLureCard,
  unknownCard,
  playerFrame,
  scrapsParts,
  scrapsWiring,
  scrapsPlates,
} from "./GameConstants.js";
import { OwnedCard } from "./GameCoreComponents.jsx";
import { ScrapIcon } from "./GameUIHelpers.jsx";

const LastRoundActionsDisplay = ({ player }) => {
  // This component is currently disabled as per your file logic
  return null;
};

const CurrentPlanDisplay = ({
  player,
  playerPlan,
  phase,
  turnStatus,
  isSelf,
}) => {
  const [lureCard, setLureCard] = useState(null);
  const [actionCard, setActionCard] = useState(null);
  const [title, setTitle] = useState("Current Plan");

  useEffect(() => {
    let lureId = null;
    let actionId = null;
    let newTitle = "Current Plan";

    if (isSelf && playerPlan) {
      lureId = playerPlan.lure_card_id;
      actionId = playerPlan.action_card_id;
      newTitle = "Your Plan";

      if (phase === "PLANNING" && !player.plan_submitted) {
        newTitle = "Planning...";
        lureId = null;
        actionId = null;
      } else if (phase === "PLANNING" && player.plan_submitted) {
        newTitle = "Planned";
      }
    } else {
      switch (phase) {
        case "WILDERNESS":
          newTitle = "Planning...";
          break;
        case "PLANNING":
          if (player.plan_submitted) {
            lureId = "UNKNOWN_LURE";
            actionId = "UNKNOWN_ACTION";
            newTitle = "Planned";
          } else {
            newTitle = "Planning...";
          }
          break;
        case "ATTRACTION":
        case "DEFENSE":
          if (playerPlan) {
            lureId = playerPlan.lure_card_id;
          }
          actionId = "UNKNOWN_ACTION";
          newTitle = "Current Plan";
          break;
        case "ACTION":
          if (playerPlan) {
            lureId = playerPlan.lure_card_id;
            if (turnStatus === "ACTIVE" || turnStatus === "WAITING") {
              actionId = playerPlan.action_card_id;
            } else {
              actionId = "UNKNOWN_ACTION";
            }
          }
          newTitle = "Current Action";
          break;
        case "CLEANUP":
        case "INTERMISSION":
        case "GAME_OVER":
          if (playerPlan) {
            lureId = playerPlan.lure_card_id;
            actionId = playerPlan.action_card_id;
          }
          newTitle = "Revealed Plan";
          break;
        default:
          newTitle = "Current Plan";
      }
    }

    setLureCard(
      lureId
        ? LURE_CARDS.find((c) => c.id === lureId) || {
            id: "UNKNOWN_LURE",
            name: "Hidden Lure",
            image: unknownLureCard,
          }
        : null
    );
    setActionCard(
      actionId
        ? ACTION_CARDS.find((c) => c.id === actionId) || {
            id: "UNKNOWN_ACTION",
            name: "Hidden Action",
            image: unknownCard,
          }
        : null
    );
    setTitle(newTitle);
  }, [player.plan_submitted, playerPlan, phase, turnStatus, isSelf]);

  if (!lureCard && !actionCard) {
    return (
      <div className="flex-shrink-0">
        <h4 className="text-sm font-bold text-gray-400 mb-2 text-center">
          {title}
        </h4>
        <div className="flex gap-2 p-2 rounded min-h-[140px] w-48 items-center justify-center bg-black bg-opacity-20">
          <p className="text-gray-500 text-sm italic px-2">Choosing...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-shrink-0">
      <h4 className="text-sm font-bold text-gray-400 mb-2 text-center">
        {title}
      </h4>
      <div className="flex gap-2 p-2 rounded min-h-[140px] items-center bg-black bg-opacity-20">
        {lureCard && (
          <img
            src={lureCard.image}
            alt={lureCard.name}
            className="w-20 h-28 object-cover rounded-md shadow-md"
            title={`Lure: ${lureCard.name}`}
          />
        )}
        {actionCard && (
          <img
            src={actionCard.image}
            alt={actionCard.name}
            className="w-20 h-28 object-cover rounded-md shadow-md"
            title={`Action: ${actionCard.name}`}
          />
        )}
      </div>
    </div>
  );
};

const PlayerUpgrades = ({ player }) => (
  <div className="flex-shrink-0">
    <h4 className="text-sm font-bold text-gray-400 mb-2 text-center">
      Upgrades
    </h4>
    <div className="flex gap-2 p-2 rounded min-h-[140px] items-center bg-black bg-opacity-20">
      {(player.upgrade_cards || []).length > 0 ? (
        (player.upgrade_cards || []).map((card) => (
          <OwnedCard key={card.id} card={card} cardType="UPGRADE" />
        ))
      ) : (
        <p className="text-gray-500 text-sm italic px-2">None</p>
      )}
    </div>
  </div>
);

const PlayerArsenal = ({ player, isSelf }) => (
  <div className="flex-shrink-0">
    <h4 className="text-sm font-bold text-gray-400 mb-2 text-center">
      Arsenal
    </h4>
    <div className="flex gap-2 p-2 rounded min-h-[140px] items-center bg-black bg-opacity-20">
      {isSelf ? (
        (player.arsenal_cards || []).length > 0 ? (
          (player.arsenal_cards || []).map((card, index) => (
            <OwnedCard
              key={card.id || `hidden-${index}`}
              card={card}
              cardType="ARSENAL"
            />
          ))
        ) : (
          <p className="text-gray-500 text-sm italic px-2">Empty</p>
        )
      ) : (player.arsenal_cards_count || 0) > 0 ? (
        [...Array(player.arsenal_cards_count || 0)].map((_, index) => (
          <OwnedCard
            key={`hidden-${index}`}
            card={{
              name: "Hidden Arsenal",
              effect_text: "This card is hidden from view.",
              cost: {},
            }}
            cardType="ARSENAL"
          />
        ))
      ) : (
        <p className="text-gray-500 text-sm italic px-2">Empty</p>
      )}
    </div>
  </div>
);

const PlayerTrophies = ({ player }) => {
  return (
    <div className="flex-shrink-0">
      <h4 className="text-sm font-bold text-gray-400 mb-2 text-center">
        Trophies ({player.trophies.length})
      </h4>
      <div className="flex flex-col gap-1 p-3 rounded min-h-[140px] max-w-xs items-start bg-black bg-opacity-20 overflow-y-auto">
        {player.trophies.length > 0 ? (
          player.trophies.map((trophyName, index) => (
            <span
              key={index}
              className="text-yellow-300 text-sm px-2 py-0.5 bg-yellow-900 bg-opacity-50 rounded"
            >
              {trophyName}
            </span>
          ))
        ) : (
          <p className="text-gray-500 text-sm italic px-2">None</p>
        )}
      </div>
    </div>
  );
};

export const PlayerAssets = ({
  player,
  isSelf,
  onReturn,
  phase,
  playerPlan,
  portrait,
  turnStatus,
}) => {
  if (!player) return null;

  return (
    <div className="w-full h-full flex items-center gap-6 overflow-x-auto px-4">
      <div className="flex-shrink-0 flex flex-col items-center gap-2">
        <h3 className="text-lg font-semibold text-gray-300 whitespace-nowrap">
          {isSelf ? "Your Board" : `${player.username}'s Board`}
        </h3>
        <div className="relative w-24 h-24">
          <img
            src={portrait}
            alt="Player Portrait"
            className="absolute top-1/2 left-1/2 h-[80%] w-[80%] -translate-x-1/2 -translate-y-1/2 rounded-md object-cover"
          />
          <img
            src={playerFrame}
            alt="Player Frame"
            className="absolute inset-0 w-full h-full z-10"
          />
        </div>
        {!isSelf && (
          <button onClick={onReturn} className="btn btn-primary btn-sm">
            &larr; Return to My Board
          </button>
        )}
      </div>

      <>
        <CurrentPlanDisplay
          player={player}
          playerPlan={playerPlan}
          phase={phase}
          turnStatus={turnStatus}
          isSelf={isSelf}
        />
        <div className="flex-shrink-0 flex flex-col items-center p-2 rounded-lg bg-black bg-opacity-20">
          <h4 className="text-sm font-bold text-gray-400 mb-2">Scrap</h4>
          <div className="flex items-center space-x-3">
            <ScrapIcon
              image={scrapsParts}
              count={player.scrap.PARTS || 0}
              size="w-10 h-10"
            />
            <ScrapIcon
              image={scrapsWiring}
              count={player.scrap.WIRING || 0}
              size="w-10 h-10"
            />
            <ScrapIcon
              image={scrapsPlates}
              count={player.scrap.PLATES || 0}
              size="w-10 h-10"
            />
          </div>
        </div>
        <PlayerArsenal player={player} isSelf={isSelf} />
        <PlayerUpgrades player={player} />
        <PlayerTrophies player={player} />
      </>
    </div>
  );
};