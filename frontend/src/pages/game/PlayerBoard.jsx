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
} from "./GameConstants.jsx";
import { OwnedCard } from "./GameCoreComponents.jsx";
import { ScrapIcon, InjuryIcon } from "./GameUIHelpers.jsx"; // Import InjuryIcon

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
      lureId = playerPlan.lure_card_key;
      actionId = playerPlan.action_card_key;
      newTitle = "Your Plan";

      if (phase === "PLANNING" && !player.plan) {
        newTitle = "Planning...";
        lureId = null;
        actionId = null;
      } else if (phase === "PLANNING" && player.plan) {
        newTitle = "Planned";
      }
    } else {
      switch (phase) {
        case "WILDERNESS":
          newTitle = "Planning...";
          break;
        case "PLANNING":
          if (player.plan) {
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
            lureId = playerPlan.lure_card_key;
          }
          actionId = "UNKNOWN_ACTION";
          newTitle = "Current Plan";
          break;
        case "ACTION":
          if (playerPlan) {
            lureId = playerPlan.lure_card_key;
            if (turnStatus === "ACTIVE" || turnStatus === "WAITING") {
              actionId = playerPlan.action_card_key;
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
            lureId = playerPlan.lure_card_key;
            actionId = playerPlan.action_card_key;
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
  }, [player.plan, playerPlan, phase, turnStatus, isSelf]);

  if (!lureCard && !actionCard) {
    return (
      <div className="flex-shrink-0 h-full flex flex-col">
        <h4 className="text-sm font-bold text-gray-400 mb-2 text-center">
          {title}
        </h4>
        <div className="flex-grow flex gap-2 p-2 rounded w-48 items-center justify-center bg-black bg-opacity-20">
          <p className="text-gray-500 text-sm italic px-2">Choosing...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-shrink-0 h-full flex flex-col">
      <h4 className="text-sm font-bold text-gray-400 mb-2 text-center">
        {title}
      </h4>
      <div className="flex-grow flex gap-2 p-2 rounded items-center bg-black bg-opacity-20">
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
  <div className="flex-shrink-0 h-full flex flex-col">
    <h4 className="text-sm font-bold text-gray-400 mb-2 text-center">
      Upgrades
    </h4>
    <div className="flex-grow flex gap-2 p-2 rounded min-w-[12rem] items-center bg-black bg-opacity-20 overflow-x-auto">
      {(player.upgrade_cards || []).length > 0 ? (
        (player.upgrade_cards || []).map((card) => (
          <OwnedCard key={card.id} card={card} cardType="UPGRADE" />
        ))
      ) : (
        <p className="text-gray-500 text-sm italic px-2 m-auto">None</p>
      )}
    </div>
  </div>
);

const PlayerArsenal = ({ player, isSelf }) => (
  <div className="flex-shrink-0 h-full flex flex-col">
    <h4 className="text-sm font-bold text-gray-400 mb-2 text-center">
      Arsenal
    </h4>
    <div className="flex-grow flex gap-2 p-2 rounded min-w-[12rem] items-center bg-black bg-opacity-20 overflow-x-auto">
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
          <p className="text-gray-500 text-sm italic px-2 m-auto">Empty</p>
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
        <p className="text-gray-500 text-sm italic px-2 m-auto">Empty</p>
      )}
    </div>
  </div>
);

const PlayerTrophies = ({ player }) => {
  return (
    <div className="flex-shrink-0 h-full flex flex-col">
      <h4 className="text-sm font-bold text-gray-400 mb-2 text-center">
        Trophies ({player.trophies.length})
      </h4>
      <div className="flex-grow flex flex-col gap-1 p-3 rounded w-48 items-start bg-black bg-opacity-20 overflow-y-auto">
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
          <p className="text-gray-500 text-sm italic px-2 m-auto">None</p>
        )}
      </div>
    </div>
  );
};

// PlayerAssets is now simplified, used only inside CollapsiblePlayerAssets
export const PlayerAssets = ({
  player,
  isSelf,
  phase,
  playerPlan,
  turnStatus,
}) => {
  if (!player) return null;

  return (
    // Full-detail view of the player board
    <div className="w-full h-full flex items-center gap-6 overflow-x-auto px-4">
      {/* Removed: Player Portrait, "Your Board" title, and "Return" button
       */}

      {/* Main Asset Display (Scrollable) */}
      <div className="flex-grow flex items-start gap-4 h-full py-2">
        <CurrentPlanDisplay
          player={player}
          playerPlan={playerPlan}
          phase={phase}
          turnStatus={turnStatus}
          isSelf={isSelf}
        />
        <div className="flex-shrink-0 flex flex-col items-center p-2 rounded-lg bg-black bg-opacity-20 h-full justify-center">
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
      </div>
    </div>
  );
};

// --- NEW WRAPPER COMPONENT FOR COLLAPSIBLE ASSETS ---
export const CollapsiblePlayerAssets = ({
  player,
  isAssetsOpen,
  toggleAssets,
  portrait,
  ...props
}) => {
  if (!player) return null;

  const isSelf = player.user_id === props.user.id;
  const isViewingSelf = player.user_id === props.viewingPlayerId;

  const handleToggle = () => {
    // If viewing another player, clicking the button returns to self's board
    if (!isViewingSelf) {
      props.onReturn();
    }
    toggleAssets();
  };

  return (
    <div
      className={`fixed bottom-0 left-0 w-full bg-black bg-opacity-80 shadow-2xl z-40 transition-transform duration-300 ${
        isAssetsOpen ? "h-[50vh] translate-y-0" : "h-20 translate-y-0"
      }`}
      style={{
        transform: isAssetsOpen
          ? "translateY(0)"
          : "translateY(calc(100% - 5rem))", // 5rem is h-20
      }}
    >
      {/* Toggle Bar / Collapsed View (Always visible) */}
      <div
        className="h-20 flex items-center justify-between p-3 cursor-pointer bg-gray-900 bg-opacity-80 border-t border-gray-700"
        onClick={handleToggle}
      >
        <div className="flex items-center space-x-4">
          <div className="relative w-12 h-12 flex-shrink-0">
            <img
              src={portrait}
              alt="Player Portrait"
              className={`w-full h-full rounded-full object-cover ring-2 ${
                isViewingSelf ? "ring-blue-500" : "ring-yellow-500"
              }`}
            />
          </div>
          <span className="text-lg font-bold text-white hidden sm:block">
            {isViewingSelf ? "Your Assets" : `${player.username}'s Assets`}
          </span>
          <ScrapIcon
            icon={<InjuryIcon />}
            count={player.injuries}
            textColor="text-red-400"
            size="w-6 h-6"
          />
        </div>

        {/* Scrap Icons (The "popping out" effect) */}
        <div className="flex items-center space-x-3">
          <ScrapIcon
            image={scrapsParts}
            count={player.scrap.PARTS || 0}
            size="w-8 h-8"
          />
          <ScrapIcon
            image={scrapsWiring}
            count={player.scrap.WIRING || 0}
            size="w-8 h-8"
          />
          <ScrapIcon
            image={scrapsPlates}
            count={player.scrap.PLATES || 0}
            size="w-8 h-8"
          />
        </div>

        {/* Arrow/Toggle Icon */}
        <button className="btn btn-ghost p-1">
          {/* Change icon based on state AND if viewing self or another player */}
          {isAssetsOpen ? (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className={`h-6 w-6 transform transition-transform rotate-180`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          ) : isViewingSelf ? (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className={`h-6 w-6 transform transition-transform rotate-0`}
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          ) : (
            <span className="text-xs font-bold text-yellow-300">
              Viewing {player.username}
            </span>
          )}
        </button>
      </div>

      {/* Full Content (Visible only when open) */}
      <div
        className={`h-[calc(100%-5rem)] overflow-y-auto ${
          isAssetsOpen ? "block" : "hidden"
        }`}
      >
        <PlayerAssets
          player={player}
          isSelf={isSelf}
          phase={props.phase}
          playerPlan={props.playerPlan}
          turnStatus={props.turnStatus}
        />
      </div>
    </div>
  );
};
