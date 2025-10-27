import React, { useState, useMemo, useEffect, useRef } from "react";
import { useStore } from "../store";
import gameBackground from "../images/game-background.png"; // Load the background image

// --- CARD IMAGES ---
import bloodyRagsCard from "../images/cards/lure-bloody-rags.png";
import strangeNoisesCard from "../images/cards/lure-strange-noises.png";
import fallenFruitCard from "../images/cards/lure-fallen-fruit.png";
import unknownLureCard from "../images/cards/lure-unknown.png";
import scavengeCard from "../images/cards/action-scavenge.png";
import fortifyCard from "../images/cards/action-fortify.png";
import armoryRunCard from "../images/cards/action-armory-run.png";
import schemeCard from "../images/cards/action-scheme.png";
import unknownCard from "../images/cards/action-unknown.png";

// --- UI COMPONENTS ---
import playerFrame from "../images/player-frame.png";
import scrapsParts from "../images/icons/scraps-parts.png";
import scrapsWiring from "../images/icons/scraps-wiring.png";
import scrapsPlates from "../images/icons/scraps-plates.png";
import hpIcon from "../images/icons/hp.icon.png";
import playerIcon1 from "../images/player-icon-1A.png";
import playerIcon2 from "../images/player-icon-2.png";
import playerIcon3 from "../images/player-icon-3.png";
import playerIcon4 from "../images/player-icon-4.png";
import playerIcon5 from "../images/player-icon-5.png";

// --- DATA CONSTANTS ---
const ACTION_CARD_DEFENSE = {
  SCAVENGE: { PARTS: 0, WIRING: 2, PLATES: 0 },
  FORTIFY: { PARTS: 0, WIRING: 0, PLATES: 2 },
  ARMORY_RUN: { PARTS: 2, WIRING: 0, PLATES: 0 },
  SCHEME: { PARTS: 1, WIRING: 1, PLATES: 1 },
};

const LURE_CARDS = [
  { id: "BLOODY_RAGS", name: "Bloody Rags", image: bloodyRagsCard },
  { id: "STRANGE_NOISES", name: "Strange Noises", image: strangeNoisesCard },
  { id: "FALLEN_FRUIT", name: "Fallen Fruit", image: fallenFruitCard },
];

const ACTION_CARDS = [
  { id: "SCAVENGE", name: "Scavenge", image: scavengeCard },
  { id: "FORTIFY", name: "Fortify", image: fortifyCard },
  { id: "ARMORY_RUN", name: "Armory Run", image: armoryRunCard },
  { id: "SCHEME", name: "Scheme", image: schemeCard },
];

const SCRAP_TYPES = {
  PARTS: { name: "Parts", color: "text-red-400", bg: "bg-red-900" },
  WIRING: { name: "Wiring", color: "text-blue-400", bg: "bg-blue-900" },
  PLATES: { name: "Plates", color: "text-green-400", bg: "bg-green-900" },
};

// --- HELPER COMPONENTS ---

const TurnStatusIcon = ({ turnStatus, size = "h-4 w-4" }) => {
  const iconStyles = {
    ACTIVE: "text-blue-300 animate-pulse",
    WAITING: "text-green-400",
    PENDING: "text-gray-500",
  };
  const title = {
    ACTIVE: "Currently Deciding",
    WAITING: "Turn Complete",
    PENDING: "Waiting for turn",
  };
  const path = {
    ACTIVE: "M15 13l-3 3m0 0l-3-3m3 3V8m0 13a9 9 0 110-18 9 9 0 010 18z",
    WAITING: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z",
    PENDING: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z",
  };
  if (!path[turnStatus]) return null;
  return (
    <span
      title={title[turnStatus]}
      className={`inline-block ${size} ${iconStyles[turnStatus]}`}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="h-full w-full"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d={path[turnStatus]}
        />
      </svg>
    </span>
  );
};

const PlayerStatusPill = ({ status }) => {
  const baseClasses = "px-2 py-0.5 text-xs font-semibold rounded-full";
  const statusStyles = {
    ACTIVE: "bg-green-600 text-white",
    SURRENDERED: "bg-yellow-500 text-black",
    ELIMINATED: "bg-red-700 text-white",
    DISCONNECTED: "bg-gray-500 text-white",
  };
  return (
    <span className={`${baseClasses} ${statusStyles[status] || "bg-gray-400"}`}>
      {status}
    </span>
  );
};

const GameLog = ({ logs }) => {
  const logEndRef = useRef(null);
  const gameLogs = logs || [];
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [gameLogs]);

  return (
    <div className="w-full h-full bg-gray-900 bg-opacity-80 rounded-lg p-3 font-mono text-xs text-white overflow-y-auto shadow-inner flex flex-col">
      {gameLogs.map((log, index) => (
        <p key={index} className="text-green-400">
          <span className="text-gray-500 mr-2">&gt;</span>
          {log}
        </p>
      ))}
      <div ref={logEndRef} />
    </div>
  );
};

const LureIcon = ({ lure }) => {
  const lureStyles = {
    BLOODY_RAGS: "bg-red-700 text-red-100 border-red-500",
    STRANGE_NOISES: "bg-blue-700 text-blue-100 border-blue-500",
    FALLEN_FRUIT: "bg-green-700 text-green-100 border-green-500",
  };
  const lureText = {
    BLOODY_RAGS: "Bloody Rags",
    STRANGE_NOISES: "Strange Noises",
    FALLEN_FRUIT: "Fallen Fruit",
  };
  return (
    <span
      className={`px-2 py-0.5 text-xs font-semibold rounded-full border ${
        lureStyles[lure] || "bg-gray-700"
      }`}
    >
      {lureText[lure] || "Unknown Lure"}
    </span>
  );
};

const PlayerTag = ({ username }) => {
  return (
    <div className="absolute -top-3 -right-3 bg-indigo-600 text-white text-xs font-bold px-2 py-1 rounded-full shadow-lg border-2 border-gray-800">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="h-1 w-1 inline-block mr-1"
        viewBox="0 0 20 20"
        fill="currentColor"
      >
        <path
          fillRule="evenodd"
          d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z"
          clipRule="evenodd"
        />
      </svg>
      {username}
    </div>
  );
};

const playerPortraits = [
  playerIcon1,
  playerIcon2,
  playerIcon3,
  playerIcon4,
  playerIcon5,
];

const PlayerCard = ({
  player,
  isSelf,
  turnStatus,
  portrait,
  turnOrder,
  plan,
  isViewing,
  onClick,
}) => {
  if (!player) return null;
  const { scrap, hp, username, status } = player;
  const isInactive = status !== "ACTIVE";
  const showPlan = plan && plan.ready;

  return (
    <div className="flex items-center gap-1 cursor-pointer" onClick={onClick}>
      <div className="flex flex-col items-center">
        <div
          className={`relative w-32 h-32 flex-shrink-0 transition-all duration-200 ${
            isInactive ? "opacity-50" : ""
          } ${
            isViewing // Updated logic
              ? "ring-4 ring-yellow-300 shadow-lg"
              : isSelf
              ? "shadow-[0_0_12px_2px_rgba(59,130,246,0.7)]"
              : ""
          }`}
        >
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

          {/* Turn Order Position */}
          <div className="absolute top-1.5 left-1.5 z-20 bg-black bg-opacity-70 rounded-full w-6 h-6 flex items-center justify-center">
            <span
              className="text-white font-bold text-sm"
              style={{ textShadow: "1px 1px 2px black" }}
            >
              {turnOrder}
            </span>
          </div>

          {/* --- Planned Cards --- */}
          <div className="absolute -top left-1/2 -translate-x-1/2 z-20 flex items-center space-x-1">
            {showPlan && plan.lure_card && (
              <img
                src={
                  isSelf || plan.is_lure_revealed
                    ? LURE_CARDS.find((c) => c.id === plan.lure_card)?.image
                    : unknownLureCard
                }
                alt={plan.lure_card}
                className="w-8 h-10 object-cover rounded-sm shadow-md"
                title={`Lure: ${
                  isSelf || plan.is_lure_revealed ? plan.lure_card : "Hidden"
                }`}
              />
            )}
            {showPlan && plan.action_card && (
              <img
                src={
                  isSelf || plan.is_action_revealed
                    ? ACTION_CARDS.find((c) => c.id === plan.action_card)?.image
                    : unknownCard
                }
                alt={plan.action_card}
                className="w-8 h-10 object-cover rounded-sm shadow-md"
                title={`Action: ${
                  isSelf || plan.is_action_revealed
                    ? plan.action_card
                    : "Hidden"
                }`}
              />
            )}
          </div>

          {/* Turn Status Icon */}
          <div className="absolute top-0.5 right-0.5 z-20">
            <TurnStatusIcon turnStatus={turnStatus} size="h-5 w-5" />
          </div>
          {/* Player Name */}
          <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-[90%] z-20">
            <div className="bg-black bg-opacity-60 rounded px-1 py-0.5 text-center">
              <span
                className={`text-xs font-bold truncate block ${
                  isSelf ? "text-blue-300" : "text-white"
                }`}
              >
                {username}
              </span>
            </div>
          </div>
        </div>
      </div>
      {/* HP and Scrap Counts */}
      <div className="flex flex-col items-center justify-center space-y-1">
        <ScrapIcon
          image={hpIcon}
          count={hp}
          textColor="text-red-500"
          size="w-7 h-7"
        />
        {[
          { type: "PARTS", img: scrapsParts, count: scrap.PARTS },
          { type: "WIRING", img: scrapsWiring, count: scrap.WIRING },
          { type: "PLATES", img: scrapsPlates, count: scrap.PLATES },
        ].map(({ img, count }) => (
          <ScrapIcon key={img} image={img} count={count} size="w-7 h-7" />
        ))}
      </div>
    </div>
  );
};

const ThreatCard = ({
  threat,
  onClick,
  isSelected,
  isSelectable,
  isAvailable,
}) => {
  if (!threat) return null;

  const baseStyle =
    "bg-gray-800 bg-opacity-90 rounded-lg shadow-lg p-3 border flex flex-col justify-between transition-all duration-200 h-full";
  let borderStyle = "border-gray-700";
  let cursorStyle = "cursor-default";
  let opacityStyle = "opacity-100";
  let positionStyle = "relative";

  if (!isAvailable) {
    borderStyle = "border-gray-900";
    opacityStyle = "opacity-40";
  } else if (isSelectable) {
    borderStyle = "border-blue-400";
    cursorStyle = "cursor-pointer hover:border-blue-300";
  }

  if (isSelected) {
    borderStyle = "border-green-500 ring-2 ring-green-500";
  }

  return (
    <div
      className={`${baseStyle} ${borderStyle} ${cursorStyle} ${opacityStyle} ${positionStyle}`}
      onClick={onClick}
    >
      <div>
        <div className="flex justify-between items-center mb-1">
          <h4 className="text-base font-bold text-red-300">{threat.name}</h4>
          <LureIcon lure={threat.lure} />
        </div>
        <p className="text-xs text-gray-300 mb-2 italic">
          &ldquo;{threat.ability || "No special ability."}&rdquo;
        </p>
      </div>
      <div className="flex justify-around text-center p-1.5 bg-black bg-opacity-20 rounded mt-auto">
        <div>
          <span className="text-red-400 font-semibold text-xs">Ferocity</span>
          <p className="text-lg font-bold">{threat.ferocity}</p>
        </div>
        <div>
          <span className="text-blue-400 font-semibold text-xs">Cunning</span>
          <p className="text-lg font-bold">{threat.cunning}</p>
        </div>
        <div>
          <span className="text-green-400 font-semibold text-xs">Mass</span>
          <p className="text-lg font-bold">{threat.mass}</p>
        </div>
      </div>
    </div>
  );
};

const ScrapIcon = ({
  image,
  count,
  textColor = "text-white",
  size = "w-8 h-8",
}) => (
  <div className={`relative ${size}`}>
    <img src={image} alt="scrap icon" className="w-full h-full" />
    <div className="absolute -top-1 -right-1 bg-black bg-opacity-70 rounded-full w-5 h-5 flex items-center justify-center">
      <span
        className={`${textColor} font-bold text-xs`}
        style={{ textShadow: "1px 1px 1px black" }}
      >
        {count}
      </span>
    </div>
  </div>
);

// --- Market Card Component ---
const MarketCard = ({ card, cardType, onClick, isSelectable, isDimmed }) => {
  if (!card) return null;

  const costItems = Object.entries(card.cost).filter(([, val]) => val > 0);
  const cardColor =
    cardType === "UPGRADE"
      ? "border-green-700 bg-green-900 bg-opacity-30"
      : "border-red-700 bg-red-900 bg-opacity-30";

  let baseStyle = `bg-gray-800 bg-opacity-90 rounded-md shadow-md p-2 border flex flex-col justify-between transition-all duration-200 h-full ${cardColor}`;
  let cursorStyle = "cursor-default";
  let opacityStyle = "opacity-100";

  if (isSelectable) {
    baseStyle += " ring-2 ring-blue-400 hover:ring-blue-300";
    cursorStyle = "cursor-pointer";
  } else if (isDimmed) {
    opacityStyle = "opacity-50";
    cursorStyle = "cursor-not-allowed";
  }

  return (
    <div
      className={`${baseStyle} ${cursorStyle} ${opacityStyle}`}
      onClick={onClick}
    >
      <div>
        <h4 className="text-xs font-bold text-white mb-1">{card.name}</h4>
        <p className="text-[10px] leading-tight text-gray-300 mb-1.5 italic">
          &ldquo;{card.effect}&rdquo;
        </p>
      </div>
      <div className="flex justify-start items-center space-x-1.5 p-1 bg-black bg-opacity-20 rounded mt-auto">
        <span className="text-gray-400 text-[10px] font-semibold">Cost:</span>
        {costItems.length > 0 ? (
          costItems.map(([type, val]) => (
            <span
              key={type}
              className={`font-bold text-xs ${SCRAP_TYPES[type].color}`}
            >
              {val} {SCRAP_TYPES[type].name.charAt(0)}
            </span>
          ))
        ) : (
          <span className="text-gray-500 text-xs">Free</span>
        )}
      </div>
    </div>
  );
};

// --- Owned Card Component ---
const OwnedCard = ({ card, cardType }) => {
  if (!card) return null;
  const cardColor =
    cardType === "UPGRADE"
      ? "border-green-700 bg-green-900 bg-opacity-30"
      : "border-red-700 bg-red-900 bg-opacity-30";
  const costItems = Object.entries(card.cost).filter(([, val]) => val > 0);

  return (
    <div
      className={`bg-gray-800 rounded-md shadow-md p-2 border ${cardColor} w-40 flex-shrink-0`}
    >
      <h4 className="text-xs font-bold text-white mb-1 truncate">
        {card.name}
      </h4>
      <p className="text-[10px] leading-tight text-gray-300 mb-1.5 italic">
        &ldquo;{card.effect}&rdquo;
      </p>
      {card.name !== "Hidden" && ( // Don't show cost for hidden cards
        <div className="flex justify-start items-center space-x-1 p-1 bg-black bg-opacity-20 rounded mt-auto">
          <span className="text-gray-400 text-[10px] font-semibold">Cost:</span>
          {costItems.length > 0 ? (
            costItems.map(([type, val]) => (
              <span
                key={type}
                className={`font-bold text-xs ${SCRAP_TYPES[type].color}`}
              >
                {val}
                {SCRAP_TYPES[type].name.charAt(0)}
              </span>
            ))
          ) : (
            <span className="text-gray-500 text-xs">Free</span>
          )}
        </div>
      )}
    </div>
  );
};

// --- Player Assets Component ---
const PlayerAssets = ({ player, isSelf, onReturn }) => {
  if (!player) return null;

  return (
    <div className="w-full h-full flex flex-col">
      <div className="flex-shrink-0 flex justify-between items-center mb-1 px-2">
        <h3 className="text-lg font-semibold text-gray-300">
          {isSelf ? "Your Assets" : `Viewing ${player.username}'s Assets`}
        </h3>
        {!isSelf && (
          <button onClick={onReturn} className="btn btn-primary btn-sm">
            &larr; Return to My Board
          </button>
        )}
      </div>
      <div className="flex-grow overflow-y-auto">
        {/* Upgrades Section */}
        <div>
          <h4 className="text-sm font-bold text-green-400 mb-1 px-2">
            Upgrades ({player.upgrades.length})
          </h4>
          <div className="flex gap-2 overflow-x-auto p-2 bg-black bg-opacity-10 rounded">
            {player.upgrades.length > 0 ? (
              player.upgrades.map((card) => (
                <OwnedCard key={card.id} card={card} cardType="UPGRADE" />
              ))
            ) : (
              <p className="text-gray-500 text-sm italic px-2">
                No upgrades built.
              </p>
            )}
          </div>
        </div>
        {/* Arsenal Section */}
        <div className="mt-2">
          <h4 className="text-sm font-bold text-red-400 mb-1 px-2">
            Arsenal ({player.arsenal_hand.length})
          </h4>
          <div className="flex gap-2 overflow-x-auto p-2 bg-black bg-opacity-10 rounded">
            {player.arsenal_hand.length > 0 ? (
              player.arsenal_hand.map((card, index) => (
                <OwnedCard
                  key={card.id || `hidden-${index}`}
                  card={card}
                  cardType="ARSENAL"
                />
              ))
            ) : (
              <p className="text-gray-500 text-sm italic px-2">
                No arsenal cards in hand.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

// --- Confirmation Modal ---
const ConfirmationModal = ({ title, message, onConfirm, onCancel }) => (
  <div className="fixed inset-0 bg-black bg-opacity-75 flex justify-center items-center z-50">
    <div className="bg-gray-800 p-6 rounded-lg shadow-xl border border-gray-600">
      <h3 className="text-xl font-semibold text-white mb-4">{title}</h3>
      <p className="text-gray-300 mb-6">{message}</p>
      <div className="flex justify-end space-x-4">
        <button onClick={onCancel} className="btn btn-secondary">
          Cancel
        </button>
        <button onClick={onConfirm} className="btn btn-danger">
          Confirm
        </button>
      </div>
    </div>
  </div>
);

// --- Market Column Components ---
const UpgradesMarket = ({
  upgrade_market,
  myTurn,
  choiceType,
  onCardSelect,
  playerScrap,
}) => {
  // Helper function to check affordability
  const canAfford = (cardCost) => {
    if (!playerScrap || !cardCost) return false;
    for (const [scrapType, cost] of Object.entries(cardCost)) {
      if ((playerScrap[scrapType] || 0) < cost) {
        return false;
      }
    }
    return true;
  };

  const isMyTurnToBuyUpgrades = myTurn && choiceType === "FORTIFY";

  return (
    <div className="p-3 bg-gray-800 bg-opacity-70 rounded-lg shadow-lg h-full overflow-y-auto">
      <h2 className="text-lg font-semibold mb-2 text-green-400 sticky top-0 bg-gray-800 py-1 z-10">
        Upgrades
      </h2>
      <div className="space-y-2">
        {upgrade_market.map((card) => {
          const isAffordable = canAfford(card.cost);
          const isSelectable = isMyTurnToBuyUpgrades && isAffordable;
          const isDimmed = isMyTurnToBuyUpgrades && !isAffordable;

          return (
            <MarketCard
              key={card.id}
              card={card}
              cardType="UPGRADE"
              isSelectable={isSelectable}
              isDimmed={isDimmed}
              onClick={() => isSelectable && onCardSelect("FORTIFY", card.id)}
            />
          );
        })}
      </div>
    </div>
  );
};

const ArsenalMarket = ({
  arsenal_market,
  myTurn,
  choiceType,
  onCardSelect,
  playerScrap,
}) => {
  // Helper function to check affordability
  const canAfford = (cardCost) => {
    if (!playerScrap || !cardCost) return false;
    for (const [scrapType, cost] of Object.entries(cardCost)) {
      if ((playerScrap[scrapType] || 0) < cost) {
        return false;
      }
    }
    return true;
  };

  const isMyTurnToBuyArsenal = myTurn && choiceType === "ARMORY_RUN";

  return (
    <div className="p-3 bg-gray-800 bg-opacity-70 rounded-lg shadow-lg h-full overflow-y-auto">
      <h2 className="text-lg font-semibold mb-2 text-red-400 sticky top-0 bg-gray-800 py-1 z-10">
        Arsenal
      </h2>
      <div className="space-y-2">
        {arsenal_market.map((card) => {
          const isAffordable = canAfford(card.cost);
          const isSelectable = isMyTurnToBuyArsenal && isAffordable;
          const isDimmed = isMyTurnToBuyArsenal && !isAffordable;

          return (
            <MarketCard
              key={card.id}
              card={card}
              cardType="ARSENAL"
              isSelectable={isSelectable}
              isDimmed={isDimmed}
              onClick={() =>
                isSelectable && onCardSelect("ARMORY_RUN", card.id)
              }
            />
          );
        })}
      </div>
    </div>
  );
};

// --- ACTION PANEL COMPONENTS ---

const PlanningPhaseActions = ({
  sendGameAction,
  player,
  playerPlans,
  currentThreats,
}) => {
  const [lure, setLure] = useState("BLOODY_RAGS");
  const [action, setAction] = useState("SCAVENGE");

  const handleSubmit = () => {
    sendGameAction("submit_plan", { lure, action });
  };

  if (!playerPlans || !player) {
    return (
      <div className="text-center p-4">
        <h3 className="text-lg text-yellow-400">Loading plan...</h3>
      </div>
    );
  }

  if (playerPlans.ready) {
    return (
      <div className="text-center p-4">
        <h3 className="text-lg text-green-400">
          Plan submitted. Waiting for other players...
        </h3>
      </div>
    );
  }

  return (
    <div className="space-y-3 p-3 bg-gray-700 bg-opacity-80 rounded-lg">
      <h3 className="text-xl font-semibold text-white">Game Events</h3>

      <div className="mb-3">
        <p className="text-gray-300 mb-2 text-sm">Wilderness Threats:</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {currentThreats.map((threat) => (
            <ThreatCard
              key={threat.id}
              threat={threat}
              isAvailable={true}
              isSelectable={false}
              isSelected={false}
              onClick={null}
            />
          ))}
        </div>
      </div>

      <div className="p-4 bg-black bg-opacity-25 rounded-lg">
        <p className="text-gray-300 pt-3 border-t border-gray-600 text-sm">
          Choose your Lure and Action cards:
        </p>
        <div className="mb-3">
          <label className="block text-gray-300 mb-2 font-semibold text-sm">
            Choose a Lure Card
          </label>
          <div className="flex justify-center space-x-2 sm:space-x-4">
            {LURE_CARDS.map((card) => (
              <div key={card.id} className="relative">
                <img
                  src={card.image}
                  alt={card.name}
                  onClick={() => {
                    if (player.last_round_lure !== card.id) {
                      setLure(card.id);
                    }
                  }}
                  className={`w-full max-w-[100px] rounded-lg transition-all duration-200 ${
                    player.last_round_lure === card.id
                      ? "cursor-not-allowed opacity-50"
                      : `cursor-pointer ${
                          lure === card.id
                            ? "ring-4 ring-blue-400 shadow-lg scale-105"
                            : "ring-2 ring-transparent hover:ring-blue-500"
                        }`
                  }`}
                />
              </div>
            ))}
          </div>
        </div>

        <div className="mb-3">
          <label className="block text-gray-300 mb-2 font-semibold text-sm">
            Choose an Action Card
          </label>
          <div className="flex justify-center space-x-2 sm:space-x-4">
            {ACTION_CARDS.map((card) => (
              <img
                key={card.id}
                src={card.image}
                alt={card.name}
                onClick={() => setAction(card.id)}
                className={`w-1/4 max-w-[100px] rounded-lg cursor-pointer transition-all duration-200 ${
                  action === card.id
                    ? "ring-4 ring-blue-400 shadow-lg scale-105"
                    : "ring-2 ring-transparent hover:ring-blue-500"
                }`}
              />
            ))}
          </div>
        </div>
      </div>

      <button
        onClick={handleSubmit}
        className="w-full btn btn-primary text-lg mt-3"
      >
        Submit Plan
      </button>
    </div>
  );
};

const AttractionPhaseActions = ({ sendGameAction, player, gameState }) => {
  const [selectedThreatId, setSelectedThreatId] = useState(null);
  const {
    attraction_phase_state,
    attraction_turn_player_id,
    current_threats,
    available_threat_ids,
    player_plans,
    players,
  } = gameState;

  const threatAssignments = useMemo(() => {
    const assignments = {};
    if (!players) return assignments;
    Object.values(players).forEach((p) => {
      if (p.assigned_threat) {
        assignments[p.assigned_threat.id] = p.username;
      }
    });
    return assignments;
  }, [players]);

  const isMyTurn = player.user_id === attraction_turn_player_id;
  const myPlan = player_plans[player.user_id];

  if (!myPlan) {
    return (
      <div className="text-center p-4">
        <h3 className="text-lg text-yellow-400">Loading attraction state...</h3>
      </div>
    );
  }
  const myLure = myPlan.lure_card;

  const { selectableThreats } = useMemo(() => {
    const available = current_threats.filter((t) =>
      available_threat_ids.includes(t.id)
    );
    const matching = available.filter((t) => t.lure === myLure);
    let selectable = [];
    if (isMyTurn) {
      if (attraction_phase_state === "FIRST_PASS") {
        selectable = matching;
      } else {
        selectable = available;
      }
    }
    return { selectableThreats: selectable };
  }, [
    current_threats,
    available_threat_ids,
    myLure,
    isMyTurn,
    attraction_phase_state,
  ]);

  const canConfirm = selectedThreatId !== null;

  const handleSelectThreat = (threatId) => {
    if (!isMyTurn) return;
    if (selectableThreats.some((t) => t.id === threatId)) {
      setSelectedThreatId(threatId);
    }
  };

  const handleSubmit = () => {
    if (canConfirm) {
      sendGameAction("select_threat", { threat_id: selectedThreatId });
      setSelectedThreatId(null);
    }
  };

  const currentPlayerName =
    players[attraction_turn_player_id]?.username || "A player";

  return (
    <div className="space-y-3 p-3 bg-gray-700 bg-opacity-80 rounded-lg">
      <h3 className="text-xl font-semibold text-white">Game Events</h3>

      <div className="text-center p-2 bg-black bg-opacity-25 rounded-lg">
        {isMyTurn ? (
          <>
            <p className="text-lg text-blue-300 animate-pulse">
              It's your turn to choose!
            </p>
            <p className="text-sm text-gray-200">
              Your Lure: <LureIcon lure={myLure} />
            </p>
            <p className="text-xs text-gray-400">
              Phase: ATTRACTION (
              {attraction_phase_state === "FIRST_PASS"
                ? "First Pass"
                : "Second Pass"}
              )
            </p>
          </>
        ) : (
          <p className="text-lg text-yellow-300">
            Waiting for {currentPlayerName} to choose a threat...
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 my-3">
        {current_threats.map((threat) => {
          const assignedTo = threatAssignments[threat.id];
          const isAvailable = !assignedTo;
          const isSelectable =
            isMyTurn && selectableThreats.some((t) => t.id === threat.id);
          const isSelected = threat.id === selectedThreatId;
          return (
            <div key={threat.id} className="relative">
              <ThreatCard
                threat={threat}
                isAvailable={isAvailable}
                isSelectable={isSelectable}
                isSelected={isSelected}
                onClick={() => handleSelectThreat(threat.id)}
              />
              {assignedTo && <PlayerTag username={assignedTo} />}
            </div>
          );
        })}
      </div>

      <div className="flex justify-end items-center pt-3 border-t border-gray-600">
        <button
          onClick={handleSubmit}
          disabled={!canConfirm || !isMyTurn}
          className={`btn ${
            canConfirm ? "btn-primary" : "btn-disabled"
          } text-lg px-6`}
        >
          Confirm
        </button>
      </div>
    </div>
  );
};

const DefensePhaseActions = ({
  sendGameAction,
  defenseState,
  player,
  playerPlans,
  threat,
}) => {
  const [parts, setParts] = useState(0);
  const [wiring, setWiring] = useState(0);
  const [plates, setPlates] = useState(0);

  const baseDefense = useMemo(() => {
    if (!player || !playerPlans) {
      return { PARTS: 0, WIRING: 0, PLATES: 0 };
    }
    const allCards = ["SCAVENGE", "FORTIFY", "ARMORY_RUN", "SCHEME"];
    const usedAction = playerPlans.action_card;
    const hasMasterSchemer = player.upgrades.some(
      (u) => u.special_effect_id === "MASTER_SCHEMER"
    );
    const cardDefenseValues = {
      ...ACTION_CARD_DEFENSE,
      SCHEME: hasMasterSchemer
        ? { PARTS: 2, WIRING: 2, PLATES: 2 }
        : { PARTS: 1, WIRING: 1, PLATES: 1 },
    };
    const unusedCards = allCards.filter((c) => c !== usedAction);
    const cardDefense = { PARTS: 0, WIRING: 0, PLATES: 0 };
    unusedCards.forEach((cardName) => {
      const defense = cardDefenseValues[cardName];
      cardDefense.PARTS += defense.PARTS;
      cardDefense.WIRING += defense.WIRING;
      cardDefense.PLATES += defense.PLATES;
    });
    const upgradeDefense = { PARTS: 0, WIRING: 0, PLATES: 0 };
    player.upgrades.forEach((upgrade) => {
      if (upgrade.permanent_defense) {
        upgradeDefense.PARTS += upgrade.permanent_defense.PARTS || 0;
        upgradeDefense.WIRING += upgrade.permanent_defense.WIRING || 0;
        upgradeDefense.PLATES += upgrade.permanent_defense.PLATES || 0;
      }
    });
    return {
      PARTS: cardDefense.PARTS + upgradeDefense.PARTS,
      WIRING: cardDefense.WIRING + upgradeDefense.WIRING,
      PLATES: cardDefense.PLATES + upgradeDefense.PLATES,
    };
  }, [player, playerPlans]);

  const handleSubmit = () => {
    sendGameAction("submit_defense", {
      scrap_spent: {
        PARTS: Number(parts) || 0,
        WIRING: Number(wiring) || 0,
        PLATES: Number(plates) || 0,
      },
      arsenal_ids: [],
    });
  };

  if (!threat) {
    return (
      <div className="space-y-3 p-3 bg-gray-700 bg-opacity-80 rounded-lg">
        <h3 className="text-xl font-semibold text-white">Phase: DEFENSE</h3>
        <div className="p-3 bg-gray-600 bg-opacity-80 rounded text-center">
          <h4 className="text-lg text-white font-semibold">
            You attracted no threat.
          </h4>
          <p className="text-gray-200">Waiting for other players...</p>
        </div>
      </div>
    );
  }

  if (!defenseState) {
    return (
      <div className="text-center p-4">
        <h3 className="text-lg text-yellow-400">Loading defense...</h3>
      </div>
    );
  }

  if (defenseState.ready) {
    return (
      <div className="text-center p-4">
        <h3 className="text-lg text-green-400">
          Defense submitted. Waiting for other players...
        </h3>
      </div>
    );
  }

  return (
    <div className="space-y-3 p-3 bg-gray-700 bg-opacity-80 rounded-lg">
      <h3 className="text-xl font-semibold text-white">Game Events</h3>

      <div className="p-2 bg-red-900 bg-opacity-60 rounded">
        <h4 className="text-lg text-red-300">Your Threat: {threat?.name}</h4>
        <p className="text-lg text-red-100 font-semibold text-center flex flex-wrap justify-center">
          <span className="mr-3">Ferocity: {threat?.ferocity}</span>
          <span className="mr-3">Cunning: {threat?.cunning}</span>
          <span>Mass: {threat?.mass}</span>
        </p>
      </div>

      <div className="p-2 bg-gray-600 bg-opacity-80 rounded text-center">
        <h4 className="text-base text-white font-semibold">Base Defense</h4>
        <p className="text-gray-200 text-xs">(from cards + upgrades)</p>
        <p className="text-lg font-bold mt-1 flex flex-wrap justify-center">
          <span className="text-red-400 mr-3">P: {baseDefense.PARTS}</span>
          <span className="text-blue-400 mr-3">W: {baseDefense.WIRING}</span>
          <span className="text-green-400">Pl: {baseDefense.PLATES}</span>
        </p>
      </div>

      <p className="text-gray-300 pt-3 border-t border-gray-600 text-sm">
        Spend Scrap to defend (1 Scrap = +2 Defense):
      </p>
      <div className="flex flex-col sm:flex-row justify-around space-y-3 sm:space-y-0 sm:space-x-2">
        <div className="flex-1 text-center sm:text-left">
          <label className="block text-red-400 text-sm">
            Parts (vs Ferocity)
          </label>
          <input
            type="number"
            min="0"
            max={player.scrap.PARTS}
            value={parts}
            onChange={(e) => setParts(e.target.value)}
            className="w-20 p-1.5 rounded bg-gray-800 text-white"
          />
          <span className="text-gray-400 text-sm"> / {player.scrap.PARTS}</span>
        </div>
        <div className="flex-1 text-center sm:text-left">
          <label className="block text-blue-400 text-sm">
            Wiring (vs Cunning)
          </label>
          <input
            type="number"
            min="0"
            max={player.scrap.WIRING}
            value={wiring}
            onChange={(e) => setWiring(e.target.value)}
            className="w-20 p-1.5 rounded bg-gray-800 text-white"
          />
          <span className="text-gray-400 text-sm">
            {" "}
            / {player.scrap.WIRING}
          </span>
        </div>
        <div className="flex-1 text-center sm:text-left">
          <label className="block text-green-400 text-sm">
            Plates (vs Mass)
          </label>
          <input
            type="number"
            min="0"
            max={player.scrap.PLATES}
            value={plates}
            onChange={(e) => setPlates(e.target.value)}
            className="w-20 p-1.5 rounded bg-gray-800 text-white"
          />
          <span className="text-gray-400 text-sm">
            {" "}
            / {player.scrap.PLATES}
          </span>
        </div>
      </div>
      <button
        onClick={handleSubmit}
        className="w-full btn btn-primary text-lg mt-3"
      >
        Submit Defense
      </button>
    </div>
  );
};

// --- Scavenge Choice Modal ---
const ScavengeChoiceModal = ({ onConfirm }) => {
  const [selection, setSelection] = useState([]);
  const canConfirm = selection.length === 2;

  const handleSelect = (scrapType) => {
    if (selection.length < 2) {
      setSelection([...selection, scrapType]);
    }
  };

  const handleUndo = () => {
    setSelection(selection.slice(0, -1));
  };

  const handleSubmit = () => {
    if (canConfirm) {
      onConfirm(selection);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex justify-center items-center z-50">
      <div className="bg-gray-800 p-6 rounded-lg shadow-xl">
        <h3 className="text-xl font-semibold text-white mb-4">
          Action: SCAVENGE
        </h3>
        <p className="text-gray-300 mb-4">Choose 2 scrap from the supply:</p>
        <div className="flex justify-center space-x-4 mb-4">
          <button
            onClick={() => handleSelect("PARTS")}
            disabled={!canConfirm && selection.length >= 2}
            className="btn btn-danger px-4 py-2"
          >
            Parts (Red)
          </button>
          <button
            onClick={() => handleSelect("WIRING")}
            disabled={!canConfirm && selection.length >= 2}
            className="btn btn-info px-4 py-2"
          >
            Wiring (Blue)
          </button>
          <button
            onClick={() => handleSelect("PLATES")}
            disabled={!canConfirm && selection.length >= 2}
            className="btn btn-success px-4 py-2"
          >
            Plates (Green)
          </button>
        </div>
        <div className="h-10 p-2 bg-gray-900 rounded mb-4 flex items-center space-x-2">
          <span className="text-gray-400 text-sm">Selected:</span>
          {selection.map((type, index) => (
            <span
              key={index}
              className={`px-2 py-0.5 rounded text-sm ${SCRAP_TYPES[type].color} ${SCRAP_TYPES[type].bg}`}
            >
              {SCRAP_TYPES[type].name}
            </span>
          ))}
        </div>
        <div className="flex justify-between">
          <button onClick={handleUndo} className="btn btn-warning">
            Undo
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canConfirm}
            className={`btn ${canConfirm ? "btn-primary" : "btn-disabled"}`}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
};

// --- Action Phase Panel ---
const ActionPhaseActions = ({ sendGameAction, player, gameState }) => {
  const { action_turn_player_id, players } = gameState;
  const isMyTurn = player.user_id === action_turn_player_id;
  const myChoice = player.action_choice_pending;

  const handleScavengeConfirm = (scraps) => {
    sendGameAction("submit_action_choice", {
      choice_type: "SCAVENGE",
      scraps: scraps,
    });
  };

  const handleFallback = (choiceType) => {
    sendGameAction("submit_action_choice", {
      choice_type: choiceType,
      card_id: null,
    });
  };

  const currentPlayerName =
    players[action_turn_player_id]?.username || "A player";

  return (
    <div className="space-y-3 p-3 bg-gray-700 bg-opacity-80 rounded-lg">
      <h3 className="text-xl font-semibold text-white">Game Events</h3>

      {myChoice === "SCAVENGE" && isMyTurn && (
        <ScavengeChoiceModal onConfirm={handleScavengeConfirm} />
      )}

      <div className="text-center p-2 bg-black bg-opacity-25 rounded-lg">
        {isMyTurn ? (
          <>
            <p className="text-lg text-blue-300 animate-pulse">
              It's your turn to act!
            </p>
            <p className="text-sm text-gray-200">Your Action: {myChoice}</p>
            <p className="text-xs text-gray-400">Phase: ACTION</p>
          </>
        ) : (
          <p className="text-lg text-yellow-300">
            Waiting for {currentPlayerName} to act...
          </p>
        )}
      </div>

      {isMyTurn && (myChoice === "FORTIFY" || myChoice === "ARMORY_RUN") && (
        <div className="pt-3 border-t border-gray-600 text-center">
          <p className="text-gray-300 mb-2">
            Select a card from the market or take the fallback.
          </p>
          <button
            onClick={() => handleFallback(myChoice)}
            className="btn btn-warning"
          >
            Fallback: Draw 2 Random Scrap
          </button>
        </div>
      )}
    </div>
  );
};

// --- MAIN GAME PAGE COMPONENT ---
const GamePage = ({ onLogout, sendMessage }) => {
  const { user, gameState } = useStore();
  const [showSurrenderModal, setShowSurrenderModal] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [viewingPlayerId, setViewingPlayerId] = useState(null); // NEW: State for viewing other players

  // NEW: Stable portrait mapping
  const playerPortraitsMap = useMemo(() => {
    if (!gameState?.players) return {};
    const playerIds = Object.keys(gameState.players);
    const portraits = {};
    playerIds.forEach((pid, index) => {
      portraits[pid] = playerPortraits[index % playerPortraits.length];
    });
    return portraits;
    // This dependency array ensures the map is created once when players are loaded.
  }, [gameState?.players && Object.keys(gameState.players).join(",")]);

  // NEW: Effect to set viewing player to self on load
  useEffect(() => {
    if (user?.id && !viewingPlayerId) {
      setViewingPlayerId(user.id);
    }
  }, [user?.id, viewingPlayerId]);

  const sendGameAction = (action, data) => {
    sendMessage({
      action: "game_action",
      payload: {
        game_action: action,
        data: data,
      },
    });
  };

  const handleSurrender = () => {
    sendMessage({ action: "surrender" });
    setShowSurrenderModal(false);
  };
  const handleReturnToLobby = () => {
    sendMessage({ action: "return_to_lobby" });
  };
  const handleViewResults = () => {
    // Request to see the post_game view for the current game
    sendMessage({ action: "request_view", payload: { view: "post_game" } });
  };
  const handleLogout = () => onLogout();

  const self = useMemo(() => {
    return gameState?.players ? gameState.players[user.id] : null;
  }, [gameState, user.id]);

  const selfPlans = useMemo(() => {
    return gameState?.player_plans ? gameState.player_plans[user.id] : null;
  }, [gameState, user.id]);

  const selfDefense = useMemo(() => {
    return gameState?.player_defenses
      ? gameState.player_defenses[user.id]
      : null;
  }, [gameState, user.id]);

  if (!gameState || !user || !self) {
    // Added !self to handle spectator case gracefully
    if (!gameState || !user) {
      return (
        <div
          className="flex justify-center items-center min-h-screen bg-gray-900 text-white bg-cover bg-top bg-fixed"
          style={{ backgroundImage: `url(${gameBackground})` }}
        >
          Loading game state...
        </div>
      );
    }
  }

  const {
    phase,
    log,
    initiative_queue,
    current_threats,
    attraction_turn_player_id,
    action_turn_player_id,
    player_plans,
    player_defenses,
    market,
  } = gameState;

  // Add flags to player_plans if cards should be revealed to others
  const augmentedPlayerPlans = useMemo(() => {
    if (!player_plans) return {};
    const newPlans = JSON.parse(JSON.stringify(player_plans)); // Deep copy

    const attractionTurnIndex = initiative_queue.indexOf(
      attraction_turn_player_id
    );
    const actionTurnIndex = initiative_queue.indexOf(action_turn_player_id);

    initiative_queue.forEach((pid, index) => {
      if (newPlans[pid]) {
        // Lure Card Reveal Logic
        const isLureRevealed =
          phase === "ATTRACTION"
            ? index <= attractionTurnIndex
            : ["DEFENSE", "ACTION", "CLEANUP"].includes(phase);
        newPlans[pid].is_lure_revealed = isLureRevealed;

        // Action Card Reveal Logic
        const isActionRevealed =
          phase === "ACTION" ? index <= actionTurnIndex : phase === "CLEANUP";
        newPlans[pid].is_action_revealed = isActionRevealed;
      }
    });
    return newPlans;
  }, [
    player_plans,
    phase,
    action_turn_player_id,
    attraction_turn_player_id,
    initiative_queue,
  ]);

  const getPlayerTurnStatus = (playerId) => {
    if (phase === "ATTRACTION") {
      if (playerId === attraction_turn_player_id) return "ACTIVE";
      const hasActed = !gameState.unassigned_player_ids.includes(playerId);
      return hasActed ? "WAITING" : "PENDING";
    }
    if (phase === "ACTION") {
      if (playerId === action_turn_player_id) return "ACTIVE";
      // Find index in queue
      const myIndex = initiative_queue.indexOf(playerId);
      const turnIndex = initiative_queue.indexOf(action_turn_player_id);
      if (turnIndex === -1) return "PENDING"; // Turn hasn't started
      return myIndex < turnIndex ? "WAITING" : "PENDING";
    }
    if (phase === "PLANNING") {
      const plan = player_plans[playerId];
      return plan?.ready ? "WAITING" : "ACTIVE";
    }
    if (phase === "DEFENSE") {
      const defense = player_defenses[playerId];
      const hasNoThreat = !gameState.players[playerId]?.assigned_threat;
      return defense?.ready || hasNoThreat ? "WAITING" : "ACTIVE";
    }
    return "NONE";
  };

  const handleMarketCardSelect = (choiceType, cardId) => {
    sendGameAction("submit_action_choice", {
      choice_type: choiceType,
      card_id: cardId,
    });
  };

  // A "pure" spectator is someone who joined to watch and isn't in the player list at all.
  // A player who has surrendered/been eliminated will still have a `self` object with a non-ACTIVE status.
  const isPureSpectator = !self;

  // A player has "left" if they were a player but are now out of the game.
  const hasLeft =
    self && (self.status === "SURRENDERED" || self.status === "ELIMINATED");

  // A user is a spectator if they are a pure spectator OR if they have left the game.
  const isSpectator = isPureSpectator || hasLeft;

  return (
    <div
      className="h-screen w-screen text-white bg-cover bg-top bg-fixed flex flex-col"
      style={{
        backgroundImage: `url(${gameBackground})`,
        onError: (e) => {
          e.target.style.backgroundImage = "none";
          e.target.style.backgroundColor = "#2D3748";
        }, // Fallback
      }}
    >
      {showSurrenderModal && (
        <ConfirmationModal
          title="Confirm Surrender"
          message="Are you sure you want to surrender? This action cannot be undone."
          onConfirm={handleSurrender}
          onCancel={() => setShowSurrenderModal(false)}
        />
      )}
      {showLogoutModal && (
        <ConfirmationModal
          title="Confirm Logout"
          message="Are you sure you want to logout and leave the game?"
          onConfirm={handleLogout}
          onCancel={() => setShowLogoutModal(false)}
        />
      )}

      {/* --- Top Bar (5% height) --- */}
      <header
        className="flex-shrink-0 flex justify-between items-center p-2 bg-black bg-opacity-40"
        style={{ height: "5vh" }}
      >
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-indigo-300 [text-shadow:_0_2px_4px_rgb(0_0_0_/_50%)]">
            Wild Pigs Will Attack!
          </h1>
        </div>
        <div className="space-x-2">
          {!isSpectator && !hasLeft && (
            <button
              onClick={() => setShowSurrenderModal(true)}
              className="btn btn-warning btn-sm"
            >
              Surrender
            </button>
          )}
          <button
            onClick={() => setShowLogoutModal(true)}
            className="btn btn-danger btn-sm"
          >
            Logout
          </button>
        </div>
      </header>

      {/* --- Players Row (25% height) --- */}
      <div
        className="flex-shrink-0 flex justify-center items-center gap-4 p-1 overflow-x-auto bg-black bg-opacity-20"
        style={{ height: "25vh" }}
      >
        {initiative_queue.map((pid, index) => {
          const isViewing = pid === viewingPlayerId;
          return (
            <React.Fragment key={pid}>
              <PlayerCard
                player={gameState.players[pid]}
                isSelf={pid === user.id}
                portrait={playerPortraitsMap[pid]}
                turnStatus={getPlayerTurnStatus(pid)}
                turnOrder={index + 1}
                plan={augmentedPlayerPlans[pid]}
                isViewing={isViewing}
                onClick={() => setViewingPlayerId(pid)}
              />
              {index < initiative_queue.length - 1 && (
                <span className="text-3xl text-indigo-300 font-light opacity-70">
                  &rarr;
                </span>
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* --- Main Content Area (flex-grow) --- */}
      <main className="flex-grow flex gap-2 p-2" style={{ height: "55vh" }}>
        {/* Left Column (15%) */}
        <div className="w-[15%] h-full">
          <UpgradesMarket
            upgrade_market={market.upgrade_market}
            myTurn={!isSpectator && self.user_id === action_turn_player_id}
            choiceType={!isSpectator ? self.action_choice_pending : null}
            onCardSelect={handleMarketCardSelect}
            playerScrap={!isSpectator ? self.scrap : {}}
          />
        </div>

        {/* Center Column (70%) */}
        <div className="w-[70%] h-full overflow-y-auto">
          {isPureSpectator ? ( // Pure spectator from lobby
            <div className="text-center p-4 bg-gray-800 bg-opacity-70 rounded-lg">
              <h3 className="text-xl text-blue-300">You are spectating.</h3>
              <p className="text-gray-400 mb-4">
                You can watch the game unfold.
              </p>
              <button
                onClick={handleReturnToLobby}
                className="btn btn-primary text-lg px-6 py-2"
              >
                Return to Lobby
              </button>
            </div>
          ) : hasLeft ? ( // Player who has surrendered/been eliminated
            <div className="text-center p-4 bg-gray-800 bg-opacity-70 rounded-lg">
              <p className="text-lg text-yellow-300 mb-4">
                You have been {self.status.toLowerCase()}. You can continue
                watching.
              </p>
              <div className="flex justify-center gap-4 mt-4">
                <button
                  onClick={handleViewResults}
                  className="btn btn-secondary text-lg px-6 py-2"
                >
                  View Results
                </button>
                <button
                  onClick={handleReturnToLobby}
                  className="btn btn-primary text-lg px-6 py-2"
                >
                  Return to Lobby
                </button>
              </div>
            </div>
          ) : (
            <>
              {phase === "PLANNING" && (
                <PlanningPhaseActions
                  sendGameAction={sendGameAction}
                  player={self}
                  playerPlans={selfPlans}
                  currentThreats={current_threats}
                />
              )}

              {phase === "ATTRACTION" && (
                <AttractionPhaseActions
                  sendGameAction={sendGameAction}
                  player={self}
                  gameState={gameState}
                />
              )}

              {phase === "DEFENSE" && (
                <DefensePhaseActions
                  sendGameAction={sendGameAction}
                  defenseState={selfDefense}
                  player={self}
                  playerPlans={selfPlans}
                  threat={self.assigned_threat}
                />
              )}

              {phase === "ACTION" && (
                <ActionPhaseActions
                  sendGameAction={sendGameAction}
                  player={self}
                  gameState={gameState}
                />
              )}

              {phase !== "PLANNING" &&
                phase !== "DEFENSE" &&
                phase !== "ATTRACTION" &&
                phase !== "ACTION" && (
                  <div className="text-center p-4 bg-gray-800 bg-opacity-70 rounded-lg">
                    <h3 className="text-xl text-gray-300">Phase: {phase}</h3>
                    <p className="text-gray-400">Waiting for server...</p>
                  </div>
                )}
            </>
          )}
        </div>

        {/* Right Column (15%) */}
        <div className="w-[15%] h-full">
          <ArsenalMarket
            arsenal_market={market.arsenal_market}
            myTurn={!isSpectator && self.user_id === action_turn_player_id}
            choiceType={!isSpectator ? self.action_choice_pending : null}
            onCardSelect={handleMarketCardSelect}
            playerScrap={!isSpectator ? self.scrap : {}}
          />
        </div>
      </main>

      {/* --- Bottom Bar (15% height) --- */}
      <footer
        className="flex-shrink-0 flex gap-2 p-1"
        style={{ height: "15vh" }}
      >
        {/* Game Log (30% width) */}
        <div className="w-[30%] h-full">
          <GameLog logs={log} />
        </div>
        {/* Player Cards/Upgrades (remaining width) */}
        <div className="w-[70%] h-full bg-black bg-opacity-20 rounded-lg p-2">
          <PlayerAssets
            player={viewingPlayerId ? gameState.players[viewingPlayerId] : null}
            isSelf={viewingPlayerId === user.id}
            onReturn={() => setViewingPlayerId(user.id)}
          />
        </div>
      </footer>
    </div>
  );
};

export default GamePage;
