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
import playerIcon1 from "../images/player-icon-1.png";
import playerIcon2 from "../images/player-icon-2.png";
import playerIcon3 from "../images/player-icon-3.png";
import playerIcon4 from "../images/player-icon-4.png";
import playerIcon5 from "../images/player-icon-5.png";

// --- DATA CONSTANTS (v1.8) ---
// Base defense from 3 cards *left in hand*, based on the 1 card *chosen*
const BASE_DEFENSE_FROM_ACTION = {
  SCAVENGE: { PARTS: 3, WIRING: 1, PLATES: 3 },
  FORTIFY: { PARTS: 3, WIRING: 3, PLATES: 1 },
  ARMORY_RUN: { PARTS: 1, WIRING: 3, PLATES: 3 },
  SCHEME: { PARTS: 2, WIRING: 2, PLATES: 2 },
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
  PARTS: {
    name: "Parts",
    color: "text-red-400",
    bg: "bg-red-900",
    img: scrapsParts,
  },
  WIRING: {
    name: "Wiring",
    color: "text-blue-400",
    bg: "bg-blue-900",
    img: scrapsWiring,
  },
  PLATES: {
    name: "Plates",
    color: "text-green-400",
    bg: "bg-green-900",
    img: scrapsPlates,
  },
};

// --- HELPER COMPONENTS ---

const InjuryIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    className="h-full w-full"
    viewBox="0 0 20 20"
    fill="currentColor"
  >
    <path
      fillRule="evenodd"
      d="M10 18a8 8 0 100-16 8 8 0 000 16zM7 9a1 1 0 000 2h6a1 1 0 100-2H7z"
      clipRule="evenodd"
    />
  </svg>
);

const TurnStatusIcon = ({ turnStatus, size = "h-4 w-4" }) => {
  const iconStyles = {
    ACTIVE: "text-blue-300 animate-pulse",
    WAITING: "text-green-400",
    PENDING: "text-gray-500",
    NONE: "text-gray-700",
  };
  const title = {
    ACTIVE: "Currently Deciding",
    WAITING: "Turn Complete",
    PENDING: "Waiting for turn",
    NONE: "N/A",
  };
  const path = {
    ACTIVE: "M15 13l-3 3m0 0l-3-3m3 3V8m0 13a9 9 0 110-18 9 9 0 010 18z",
    WAITING: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z",
    PENDING: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z",
    NONE: "M18 12H6",
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
    // ELIMINATED is not a status in v1.8
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
    <div className="absolute -top-3 -right-3 bg-indigo-600 text-white text-xs font-bold px-2 py-1 rounded-full shadow-lg border-2 border-gray-800 z-10">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="h-4 w-4 inline-block mr-1"
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
  const { scrap, injuries, username, status } = player;
  const isInactive = status !== "ACTIVE";
  const showPlan = !!plan; // Plan is redacted, just check existence

  return (
    <div className="flex items-center gap-1 cursor-pointer" onClick={onClick}>
      <div className="flex flex-col items-center">
        <div
          className={`relative w-32 h-32 flex-shrink-0 transition-all duration-200 ${
            isInactive ? "opacity-50" : ""
          } ${
            isViewing
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

          <div className="absolute top-1.5 left-1.5 z-20 bg-black bg-opacity-70 rounded-full w-6 h-6 flex items-center justify-center">
            <span
              className="text-white font-bold text-sm"
              style={{ textShadow: "1px 1px 2px black" }}
            >
              {turnOrder}
            </span>
          </div>

          <div className="absolute -top left-1/2 -translate-x-1/2 z-20 flex items-center space-x-1">
            {showPlan && (
              <img
                src={
                  plan.lure
                    ? LURE_CARDS.find((c) => c.id === plan.lure)?.image
                    : unknownLureCard
                }
                alt={plan.lure || "Hidden"}
                className="w-8 h-10 object-cover rounded-sm shadow-md"
                title={`Lure: ${plan.lure || "Hidden"}`}
              />
            )}
            {showPlan && (
              <img
                src={
                  plan.action
                    ? ACTION_CARDS.find((c) => c.id === plan.action)?.image
                    : unknownCard
                }
                alt={plan.action || "Hidden"}
                className="w-8 h-10 object-cover rounded-sm shadow-md"
                title={`Action: ${plan.action || "Hidden"}`}
              />
            )}
          </div>

          <div className="absolute top-0.5 right-0.5 z-20">
            <TurnStatusIcon turnStatus={turnStatus} size="h-5 w-5" />
          </div>
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
      <div className="flex flex-col items-center justify-center space-y-1">
        <ScrapIcon
          icon={<InjuryIcon />}
          count={injuries}
          textColor="text-red-500"
          size="w-7 h-7"
        />
        {[
          { type: "PARTS", img: scrapsParts, count: scrap.PARTS || 0 },
          { type: "WIRING", img: scrapsWiring, count: scrap.WIRING || 0 },
          { type: "PLATES", img: scrapsPlates, count: scrap.PLATES || 0 },
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
    opacityStyle = "opacity-100";
  }

  const resistantText = threat.resistant?.join(", ");
  const immuneText = threat.immune?.join(", ");

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
          {threat.on_fail === "PREVENT_ACTION" && (
            <span className="text-yellow-400 font-semibold">
              On Fail: PREVENT action.
            </span>
          )}
          {threat.on_fail === "DISCARD_SCRAP" && (
            <span className="text-yellow-400 font-semibold">
              On Fail: Discard scrap.
            </span>
          )}
          {/* v1.8 - Added more fail conditions */}
          {threat.on_fail === "GAIN_INJURY" && (
            <span className="text-red-400 font-semibold">
              On Fail: Gain 1 additional Injury.
            </span>
          )}
          {threat.on_fail === "GIVE_SCRAP" && (
            <span className="text-yellow-400 font-semibold">
              On Fail: Give 1 scrap to each other player.
            </span>
          )}
          {!threat.on_fail && "No 'On Fail' effect."}
        </p>
        <div className="text-xs space-y-1 mb-2">
          {resistantText && (
            <p>
              <span className="font-semibold text-yellow-400">Resistant: </span>
              <span className="text-gray-300">{resistantText}</span>
            </p>
          )}
          {immuneText && (
            <p>
              <span className="font-semibold text-red-500">Immune: </span>
              <span className="text-gray-300">{immuneText}</span>
            </p>
          )}
        </div>
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

// --- REFACTORED: Prefers image, falls back to icon ---
const ScrapIcon = ({
  image,
  icon,
  count,
  textColor = "text-white",
  size = "w-8 h-8",
  onClick,
}) => (
  <div
    className={`relative ${size} ${onClick ? "cursor-pointer" : ""}`}
    onClick={onClick}
  >
    {image && (
      <img
        src={image}
        alt="scrap icon"
        className="w-full h-full object-contain"
      />
    )}
    {!image && icon && <div className="w-full h-full p-0.5">{icon}</div>}
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
          {card.effect}
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

// --- REFACTORED: Added onClick and isSelectable ---
const OwnedCard = ({ card, cardType, onClick, isSelectable }) => {
  if (!card) return null;
  const cardColor =
    cardType === "UPGRADE"
      ? "border-green-700 bg-green-900 bg-opacity-30"
      : "border-red-700 bg-red-900 bg-opacity-30";
  const costItems = Object.entries(card.cost).filter(([, val]) => val > 0);

  const baseStyle = `bg-gray-800 rounded-md shadow-md p-2 border ${cardColor} w-40 flex-shrink-0 transition-all`;
  const selectableStyle = isSelectable
    ? "cursor-pointer ring-2 ring-blue-400 hover:ring-blue-300"
    : "cursor-default";

  return (
    <div className={`${baseStyle} ${selectableStyle}`} onClick={onClick}>
      <h4 className="text-xs font-bold text-white mb-1 truncate">
        {card.name}
        {card.charges ? (
          <span className="text-yellow-300"> ({card.charges}x)</span>
        ) : null}
      </h4>
      <p className="text-[10px] leading-tight text-gray-300 mb-1.5 italic">
        {card.effect}
      </p>
      {card.name !== "Hidden Arsenal" && ( // <-- FIX: Don't show cost for hidden
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

const ThreatsPanel = ({
  threats,
  threatAssignments,
  onThreatSelect,
  selectableThreats,
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
          const assignedTo = threatAssignments[threat.id];
          const isAvailable = !assignedTo;
          const isSelectable = selectableThreats.some(
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

const MarketPanel = ({
  market,
  myTurn,
  phase,
  choiceType,
  onCardSelect,
  playerScrap,
}) => {
  return (
    <div className="w-full h-full flex flex-col gap-2 p-2 bg-gray-800 bg-opacity-70 rounded-lg">
      <div className="flex-1 overflow-hidden">
        <UpgradesMarket
          upgrade_market={market.upgrade_market}
          myTurn={myTurn}
          phase={phase}
          choiceType={choiceType}
          onCardSelect={onCardSelect}
          playerScrap={playerScrap}
        />
      </div>
      <div className="flex-1 overflow-hidden">
        <ArsenalMarket
          arsenal_market={market.arsenal_market}
          myTurn={myTurn}
          phase={phase}
          choiceType={choiceType}
          onCardSelect={onCardSelect}
          playerScrap={playerScrap}
        />
      </div>
    </div>
  );
};

// --- *** NEW/REFACTORED PlayerAssets *** ---

// --- PlayerActionsDisplay (New Component) ---
// Shows last round's cards, or current planned cards
const LastRoundActionsDisplay = ({ player }) => {
  const lureCard = LURE_CARDS.find((c) => c.id === player.last_round_lure);
  const actionCard = ACTION_CARDS.find(
    (c) => c.id === player.last_round_action
  );

  if (!lureCard && !actionCard) {
    return null; // Don't show anything if no cards from last round (e.g., Round 1)
  }

  return (
    <div className="flex-shrink-0">
      <h4 className="text-sm font-bold text-gray-400 mb-2 text-center">
        Last Round
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

// --- *** NEW COMPONENT *** ---
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
          lureId = playerPlan.lure;
          actionId = isSelf ? playerPlan.action : "UNKNOWN_ACTION"; // <-- FIX
        } else {
          // Handle case where player might not have a plan (e.g., joined late? Or plan not received yet)
          actionId = "UNKNOWN_ACTION";
        }
        newTitle = "Current Plan";
        break;
      case "ACTION":
        if (playerPlan) {
          lureId = playerPlan.lure;
          // Show action if it's their turn, their turn has passed, OR it's their own board
          if (isSelf || turnStatus === "ACTIVE" || turnStatus === "WAITING") {
            // <-- FIX
            actionId = playerPlan.action;
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
          lureId = playerPlan.lure;
          actionId = playerPlan.action;
        }
        newTitle = "Revealed Plan";
        break;
      default:
        newTitle = "Current Plan";
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
  }, [player.plan_submitted, playerPlan, phase, turnStatus, isSelf]); // <-- FIX: Add isSelf

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
// --- *** END NEW COMPONENT *** ---

// --- PlayerUpgrades (Unchanged) ---
const PlayerUpgrades = ({ player }) => (
  <div className="flex-shrink-0">
    <h4 className="text-sm font-bold text-gray-400 mb-2 text-center">
      Upgrades
    </h4>
    <div className="flex gap-2 p-2 rounded min-h-[140px] items-center bg-black bg-opacity-20">
      {player.upgrades.length > 0 ? (
        player.upgrades.map((card) => (
          <OwnedCard key={card.id} card={card} cardType="UPGRADE" />
        ))
      ) : (
        <p className="text-gray-500 text-sm italic px-2">None</p>
      )}
    </div>
  </div>
);

// --- PlayerArsenal (Crash Fix) ---
const PlayerArsenal = ({ player, isSelf }) => (
  <div className="flex-shrink-0">
    <h4 className="text-sm font-bold text-gray-400 mb-2 text-center">
      Arsenal
    </h4>
    <div className="flex gap-2 p-2 rounded min-h-[140px] items-center bg-black bg-opacity-20">
      {isSelf ? ( // If it's me, show my cards
        player.arsenal_hand.length > 0 ? (
          player.arsenal_hand.map((card, index) => (
            <OwnedCard
              key={card.id || `hidden-${index}`}
              card={card}
              cardType="ARSENAL"
            />
          ))
        ) : (
          <p className="text-gray-500 text-sm italic px-2">Empty</p>
        )
      ) : // If it's someone else, show hidden cards based on count
      player.arsenal_hand_count > 0 ? (
        [...Array(player.arsenal_hand_count)].map((_, index) => (
          <OwnedCard
            key={`hidden-${index}`}
            card={{
              name: "Hidden Arsenal",
              effect: "This card is hidden from view.",
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

// --- PlayerTrophies (Unchanged) ---
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

// --- PlayerAssets (Refactored Layout) ---
const PlayerAssets = ({
  player,
  isSelf,
  onReturn,
  phase,
  playerPlan,
  portrait,
  turnStatus, // <-- *** NEW PROP ***
}) => {
  if (!player) return null;

  // --- *** FIX *** ---
  // Remove the logic that shows the threat instead of the board
  // const attractedThreat = player.attracted_threat;
  // const showThreatInsteadOfBoard =
  //   !isSelf &&
  //   attractedThreat &&
  //   (phase === "DEFENSE" ||
  //     phase === "ACTION" ||
  //     phase === "CLEANUP" ||
  //     phase === "INTERMISSION" ||
  //     phase === "GAME_OVER");

  return (
    <div className="w-full h-full flex items-center gap-6 overflow-x-auto px-4">
      {/* 1. Frame with player icon */}
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

      {/* --- *** FIX *** --- */}
      {/* Always show the player's board content */}
      <>
        {/* 2. Last Played Cards */}
        <LastRoundActionsDisplay player={player} />

        {/* 3. Current Plan */}
        <CurrentPlanDisplay
          player={player}
          playerPlan={playerPlan}
          phase={phase}
          turnStatus={turnStatus}
          isSelf={isSelf} // <-- *** PASS PROP ***
        />

        {/* 4. Scraps */}
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

        {/* 5. Arsenal */}
        <PlayerArsenal player={player} isSelf={isSelf} />

        {/* 6. Upgrades (Powerups) */}
        <PlayerUpgrades player={player} />

        {/* 7. Trophies can go at the end */}
        <PlayerTrophies player={player} />
      </>
      {/* --- *** END FIX *** --- */}
    </div>
  );
};

// --- *** END PlayerAssets REFACTOR *** ---

const ConfirmationModal = ({
  title,
  message,
  onConfirm,
  onCancel,
  confirmText = "Confirm",
}) => (
  <div className="fixed inset-0 bg-black bg-opacity-75 flex justify-center items-center z-50">
    <div className="bg-gray-800 p-6 rounded-lg shadow-xl border border-gray-600">
      <h3 className="text-xl font-semibold text-white mb-4">{title}</h3>
      <p className="text-gray-300 mb-6">{message}</p>
      <div className="flex justify-end space-x-4">
        <button onClick={onCancel} className="btn btn-secondary">
          Cancel
        </button>
        <button onClick={onConfirm} className="btn btn-danger">
          {confirmText}
        </button>
      </div>
    </div>
  </div>
);

const canAfford = (playerScrap, cardCost, discount = 0) => {
  if (!playerScrap || !cardCost) return false;

  // v1.8: Backend rules removed the discount.
  // The rulebook (Sec 5) also doesn't mention it.
  // I will assume no discount.
  const effectiveCost = cardCost;

  for (const [scrapType, cost] of Object.entries(effectiveCost)) {
    if ((playerScrap[scrapType] || 0) < cost) {
      return false;
    }
  }
  return true;
};

const UpgradesMarket = ({
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
    <div className="p-3 bg-gray-800 bg-opacity-70 rounded-lg shadow-lg h-full flex items-center gap-4">
      <h2 className="text-lg font-semibold text-green-400 flex-shrink-0">
        Upgrades
      </h2>
      <div className="flex-1 flex gap-2 overflow-x-auto pb-2">
        {upgrade_market.map((card) => {
          const isAffordable = canAfford(playerScrap, card.cost, 0);
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
        })}
      </div>
    </div>
  );
};

const ArsenalMarket = ({
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
    <div className="p-3 bg-gray-800 bg-opacity-70 rounded-lg shadow-lg h-full flex items-center gap-4">
      <h2 className="text-lg font-semibold text-red-400 flex-shrink-0">
        Arsenal
      </h2>
      <div className="flex-1 flex gap-2 overflow-x-auto pb-2">
        {arsenal_market.map((card) => {
          const isAffordable = canAfford(playerScrap, card.cost, 0);
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
        })}
      </div>
    </div>
  );
};

// --- ACTION PANEL COMPONENTS ---

// --- REFACTORED: Planning Phase with loading state ---
const PlanningPhaseActions = ({ sendGameAction, player }) => {
  const [lure, setLure] = useState(null);
  const [action, setAction] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const failSafeTimeoutRef = useRef(null); // <-- FIX: Add ref for timeout

  // Auto-select first available cards
  useEffect(() => {
    if (!lure && player.lure_hand.length > 0) {
      const firstAvailableLure = player.lure_hand.find(
        (lureId) => lureId !== player.last_round_lure
      );
      // <-- FIX: Only set if firstAvailableLure is found
      if (firstAvailableLure) {
        setLure(firstAvailableLure);
      }
      // If no valid lure is found, `lure` remains null,
      // and the submit button will be correctly disabled.
    }
    if (!action && player.action_hand.length > 0) {
      setAction(player.action_hand[0]);
    }
  }, [
    player.lure_hand,
    player.action_hand,
    player.last_round_lure,
    // <-- FIX: Removed lure and action from dependencies
  ]);

  // <-- FIX: Add useEffect to clear timeout on success or unmount
  useEffect(() => {
    // If the component re-renders and plan is submitted, we succeeded.
    if (player.plan_submitted && failSafeTimeoutRef.current) {
      clearTimeout(failSafeTimeoutRef.current);
      failSafeTimeoutRef.current = null;
      setIsLoading(false); // Also ensure loading is false
    }
  }, [player.plan_submitted]);

  useEffect(() => {
    // Clear timeout on unmount
    return () => {
      if (failSafeTimeoutRef.current) {
        clearTimeout(failSafeTimeoutRef.current);
      }
    };
  }, []);
  // -- END FIX --

  if (player.plan_submitted) {
    return (
      <div className="text-center p-4">
        <h3 className="text-lg text-green-400">
          Plan submitted. Waiting for other players...
        </h3>
      </div>
    );
  }

  const handleSubmit = () => {
    if (!lure || !action) {
      // TODO: Show an error to the user
      console.error("Lure or action not selected");
      return;
    }
    setIsLoading(true);
    // --- FIX: Wrap sendGameAction in try...catch and add timeout ---
    // Clear any existing timeout
    if (failSafeTimeoutRef.current) {
      clearTimeout(failSafeTimeoutRef.current);
    }

    // Set a timeout to handle backend validation failures
    failSafeTimeoutRef.current = setTimeout(() => {
      setIsLoading(false);
      // TODO: Show a user-facing error toast, e.g., "Submission failed. Please try again."
      console.error("Plan submission timed out or failed. Resetting UI.");
    }, 5000); // 5-second timeout

    try {
      sendGameAction("submit_plan", { lure_card: lure, action_card: action });
      // On success, we wait for the state update to set player.plan_submitted
      // which will show the "Waiting..." message and trigger the useEffect cleanup.
    } catch (error) {
      console.error("Failed to submit plan:", error);
      setIsLoading(false); // Stop loading on *send* error
      clearTimeout(failSafeTimeoutRef.current); // Clear timeout
      failSafeTimeoutRef.current = null;
    }
    // --- END FIX ---
  };

  const actionCardsInHand =
    player.action_hand.map((id) => ACTION_CARDS.find((c) => c.id === id)) || [];
  const lureCardsInHand =
    player.lure_hand.map((id) => LURE_CARDS.find((c) => c.id === id)) || [];

  return (
    <div className="space-y-3 p-3 bg-gray-700 bg-opacity-80 rounded-lg">
      <div className="p-4 bg-black bg-opacity-25 rounded-lg">
        <p className="text-gray-300 pt-3 border-t border-gray-600 text-sm">
          Choose your Lure and Action cards:
        </p>
        <div className="mb-3">
          <label className="block text-gray-300 mb-2 font-semibold text-sm">
            Choose a Lure Card
          </label>
          <div className="flex justify-center space-x-2 sm:space-x-4">
            {lureCardsInHand.map((card) => (
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
                      ? "cursor-not-allowed opacity-50 pointer-events-none" // <-- FIX: Added pointer-events-none
                      : `cursor-pointer ${
                          lure === card.id
                            ? "ring-4 ring-blue-400 shadow-lg scale-105"
                            : "ring-2 ring-transparent hover:ring-blue-500"
                        }`
                  }`}
                />
                {player.last_round_lure === card.id && (
                  <div className="absolute inset-0 flex items-center justify-center text-red-500 bg-black bg-opacity-50 rounded-lg">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      className="h-12 w-12"
                      viewBox="0 0 20 20"
                      fill="currentColor"
                    >
                      <path
                        fillRule="evenodd"
                        d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <span className="absolute bottom-2 text-xs font-bold text-white">
                      Used Last Round
                    </span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="mb-3">
          <label className="block text-gray-300 mb-2 font-semibold text-sm">
            Choose an Action Card
          </label>
          <div className="flex justify-center space-x-2 sm:space-x-4">
            {actionCardsInHand.map((card) => (
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
        disabled={isLoading || !lure || !action}
      >
        {isLoading ? (
          <span className="loading loading-spinner"></span>
        ) : (
          "Submit Plan"
        )}
      </button>
    </div>
  );
};

const AttractionPhaseActions = ({
  sendGameAction,
  player,
  gameState,
  selectedThreatId,
  canConfirm,
}) => {
  const {
    attraction_phase_state,
    attraction_turn_player_id,
    player_plans,
    players,
  } = gameState;

  const isMyTurn = player.user_id === attraction_turn_player_id;
  const myPlan = player_plans[player.user_id];

  if (!player_plans || !player_plans[player.user_id]) {
    return (
      <div className="text-center p-4">
        <h3 className="text-lg text-yellow-400">Waiting for plans...</h3>
      </div>
    );
  }
  const myLure = myPlan.lure;

  const handleSubmit = () => {
    if (canConfirm) {
      // --- FIX: Wrap sendGameAction in try...catch ---
      try {
        sendGameAction("attract_threat", { threat_id: selectedThreatId });
      } catch (error) {
        console.error("Failed to attract threat:", error);
        // No loading spinner here, but good practice
      }
      // --- END FIX ---
    }
  };

  const currentPlayerName =
    players[attraction_turn_player_id]?.username || "A player";

  return (
    <div className="space-y-3 p-3 bg-gray-700 bg-opacity-80 rounded-lg">
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

      <div className="flex justify-center items-center pt-3 border-t border-gray-600">
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

// --- *** NEW: DefensePhaseActions *** ---
// This is the new, interactive Defense Board
const DefensePhaseActions = ({
  sendGameAction,
  player,
  playerPlans, // This is the *full* plans map
  threat,
}) => {
  const [spentScrap, setSpentScrap] = useState({
    PARTS: 0,
    WIRING: 0,
    PLATES: 0,
  });
  const [spentArsenalIds, setSpentArsenalIds] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  // Memoize available resources
  const availableScrap = useMemo(() => {
    return {
      PARTS: (player.scrap.PARTS || 0) - spentScrap.PARTS,
      WIRING: (player.scrap.WIRING || 0) - spentScrap.WIRING,
      PLATES: (player.scrap.PLATES || 0) - spentScrap.PLATES,
    };
  }, [player.scrap, spentScrap]);

  const availableArsenal = useMemo(() => {
    return player.arsenal_hand.filter((c) => !spentArsenalIds.includes(c.id));
  }, [player.arsenal_hand, spentArsenalIds]);

  const spentArsenal = useMemo(() => {
    return spentArsenalIds
      .map((id) => player.arsenal_hand.find((c) => c.id === id))
      .filter(Boolean);
  }, [player.arsenal_hand, spentArsenalIds]);

  // --- Handlers for moving resources ---
  const handleSpendScrap = (type) => {
    if (availableScrap[type] > 0) {
      setSpentScrap((prev) => ({ ...prev, [type]: prev[type] + 1 }));
    }
  };

  const handleReturnScrap = (type) => {
    if (spentScrap[type] > 0) {
      setSpentScrap((prev) => ({ ...prev, [type]: prev[type] - 1 }));
    }
  };

  const handleSpendArsenal = (cardId) => {
    setSpentArsenalIds((prev) => [...prev, cardId]);
  };

  const handleReturnArsenal = (cardId) => {
    setSpentArsenalIds((prev) => prev.filter((id) => id !== cardId));
  };

  // --- Live Defense Calculation (Replicates backend logic) ---
  const calculatedDefense = useMemo(() => {
    const total = { PARTS: 0, WIRING: 0, PLATES: 0 };
    const myPlan = playerPlans[player.user_id];
    if (!myPlan || !threat) return total;

    // 1. Base Defense (from Action)
    const baseDefense = BASE_DEFENSE_FROM_ACTION[myPlan.action] || {};
    total.PARTS += baseDefense.PARTS || 0;
    total.WIRING += baseDefense.WIRING || 0;
    total.PLATES += baseDefense.PLATES || 0;

    // 2. Passive Defense (from Upgrades)
    player.upgrades.forEach((up) => {
      total.PARTS += up.defense_boost.PARTS || 0;
      total.WIRING += up.defense_boost.WIRING || 0;
      total.PLATES += up.defense_boost.PLATES || 0;
    });

    // 3. Arsenal Cards
    spentArsenal.forEach((card) => {
      total.PARTS += card.defense_boost.PARTS || 0;
      total.WIRING += card.defense_boost.WIRING || 0;
      total.PLATES += card.defense_boost.PLATES || 0;
    });

    // 4. Spent Scrap (The complex part)
    const up_ids = new Set(player.upgrades.map((u) => u.special_effect_id));
    const has_piercing_jaws = up_ids.has("PIERCING_JAWS");
    const has_serrated_parts = up_ids.has("SERRATED_PARTS");
    const has_focused_wiring = up_ids.has("FOCUSED_WIRING");
    const has_high_voltage = up_ids.has("HIGH_VOLTAGE_WIRE");
    const has_reinf_plating = up_ids.has("REINFORCED_PLATING");
    const has_layered_plating = up_ids.has("LAYERED_PLATING");

    for (const [type, count] of Object.entries(spentScrap)) {
      if (count === 0) continue;

      // Rulebook Sec 4: Base value
      let scrap_value = 2;

      // Check Immunity
      if (threat.immune.includes(type)) {
        scrap_value = 0;
      }

      // Check Resistance
      const is_resistant = threat.resistant.includes(type);
      if (is_resistant) {
        scrap_value -= 1; // Rulebook Sec 4
      }

      // Check Upgrades
      if (type === "PARTS") {
        if (has_serrated_parts) scrap_value += 1;
        if (has_piercing_jaws && is_resistant) scrap_value += 1; // Negates -1
      } else if (type === "WIRING") {
        if (has_high_voltage) scrap_value += 1;
        if (has_focused_wiring && is_resistant) scrap_value += 1;
      } else if (type === "PLATES") {
        if (has_layered_plating) scrap_value += 1;
        if (has_reinf_plating && is_resistant) scrap_value += 1;
      }

      // TODO: Handle 'Corrosive Sludge' and 'Makeshift Amp'
      // This requires a more complex UI and payload.
      // For now, we calculate based on scrap and basic upgrades.

      total[type] += count * Math.max(0, scrap_value);
    }

    return total;
  }, [
    spentScrap,
    spentArsenal,
    player.upgrades,
    playerPlans,
    player.user_id,
    threat,
  ]);
  // --- End Live Defense Calculation ---

  const handleSubmit = () => {
    setIsLoading(true);
    // --- FIX: Wrap sendGameAction in try...catch ---
    try {
      sendGameAction("submit_defense", {
        scrap_spent: spentScrap,
        arsenal_ids: spentArsenalIds,
      });
    } catch (error) {
      console.error("Failed to submit defense:", error);
      setIsLoading(false);
    }
    // --- END FIX ---
  };

  if (player.defense_submitted) {
    return (
      <div className="text-center p-4">
        <h3 className="text-lg text-green-400">
          Defense submitted. Waiting for other players...
        </h3>
      </div>
    );
  }

  if (!threat) {
    return (
      <div className="text-center p-4">
        <h3 className="text-lg text-gray-400">
          No threat attracted. Waiting for other players...
        </h3>
      </div>
    );
  }

  // --- NEW 3-COLUMN LAYOUT ---
  return (
    <div className="p-2 bg-gray-700 bg-opacity-80 rounded-lg h-full flex flex-col">
      <div className="text-center p-2 bg-black bg-opacity-25 rounded-lg mb-2">
        <p className="text-lg text-blue-300 animate-pulse">Defend your camp!</p>
        <p className="text-xs text-gray-400">
          Click resources to add them to your defense. Click items on the board
          to return them.
        </p>
      </div>

      <div className="flex-grow grid grid-cols-3 gap-2 overflow-hidden">
        {/* --- COLUMN 1: YOUR RESOURCES --- */}
        <div className="flex flex-col gap-2 p-2 bg-black bg-opacity-20 rounded-lg overflow-y-auto">
          <h4 className="text-sm font-bold text-gray-400 mb-1 text-center">
            Your Resources
          </h4>
          {/* Available Scrap */}
          <div className="flex justify-around items-center p-2 bg-gray-900 bg-opacity-50 rounded">
            <ScrapIcon
              image={scrapsParts}
              count={availableScrap.PARTS}
              size="w-10 h-10"
              onClick={() => handleSpendScrap("PARTS")}
            />
            <ScrapIcon
              image={scrapsWiring}
              count={availableScrap.WIRING}
              size="w-10 h-10"
              onClick={() => handleSpendScrap("WIRING")}
            />
            <ScrapIcon
              image={scrapsPlates}
              count={availableScrap.PLATES}
              size="w-10 h-10"
              onClick={() => handleSpendScrap("PLATES")}
            />
          </div>
          {/* Available Arsenal */}
          <div className="flex flex-col gap-2 items-center">
            {availableArsenal.length > 0 ? (
              availableArsenal.map((card) => (
                <OwnedCard
                  key={card.id}
                  card={card}
                  cardType="ARSENAL"
                  isSelectable={true}
                  onClick={() => handleSpendArsenal(card.id)}
                />
              ))
            ) : (
              <p className="text-gray-500 text-xs italic p-2">
                No arsenal cards in hand
              </p>
            )}
          </div>
        </div>

        {/* --- COLUMN 2: DEFENSE BOARD --- */}
        <div className="flex flex-col gap-2 p-2 bg-blue-900 bg-opacity-20 rounded-lg overflow-y-auto border-2 border-blue-500">
          <h4 className="text-sm font-bold text-blue-300 mb-1 text-center">
            Defense Board
          </h4>
          {/* Spent Scrap */}
          <div className="flex justify-around items-center p-2 bg-gray-900 bg-opacity-50 rounded">
            <ScrapIcon
              image={scrapsParts}
              count={spentScrap.PARTS}
              size="w-10 h-10"
              onClick={() => handleReturnScrap("PARTS")}
            />
            <ScrapIcon
              image={scrapsWiring}
              count={spentScrap.WIRING}
              size="w-10 h-10"
              onClick={() => handleReturnScrap("WIRING")}
            />
            <ScrapIcon
              image={scrapsPlates}
              count={spentScrap.PLATES}
              size="w-10 h-10"
              onClick={() => handleReturnScrap("PLATES")}
            />
          </div>
          {/* Spent Arsenal */}
          <div className="flex flex-col gap-2 items-center">
            {spentArsenal.length > 0 ? (
              spentArsenal.map((card) => (
                <OwnedCard
                  key={card.id}
                  card={card}
                  cardType="ARSENAL"
                  isSelectable={true}
                  onClick={() => handleReturnArsenal(card.id)}
                />
              ))
            ) : (
              <p className="text-gray-500 text-xs italic p-2">
                No arsenal committed
              </p>
            )}
          </div>
        </div>

        {/* --- COLUMN 3: THREAT & TOTALS --- */}
        <div className="flex flex-col gap-2 p-2 bg-black bg-opacity-20 rounded-lg overflow-y-auto">
          <h4 className="text-sm font-bold text-red-400 mb-1 text-center">
            Threat & Totals
          </h4>
          <ThreatCard threat={threat} isAvailable={false} />
          <div className="p-3 bg-black bg-opacity-30 rounded-lg border border-gray-600 mt-2">
            <h5 className="text-sm font-semibold text-gray-300 mb-2 text-center">
              Projected Defense
            </h5>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div>
                <p className="text-red-400 font-semibold text-xs">Ferocity</p>
                <p className="text-2xl font-bold">{calculatedDefense.PARTS}</p>
                <p className="text-sm text-gray-400">vs {threat.ferocity}</p>
              </div>
              <div>
                <p className="text-blue-400 font-semibold text-xs">Cunning</p>
                <p className="text-2xl font-bold">{calculatedDefense.WIRING}</p>
                <p className="text-sm text-gray-400">vs {threat.cunning}</p>
              </div>
              <div>
                <p className="text-green-400 font-semibold text-xs">Mass</p>
                <p className="text-2xl font-bold">{calculatedDefense.PLATES}</p>
                <p className="text-sm text-gray-400">vs {threat.mass}</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      <button
        onClick={handleSubmit}
        className="w-full btn btn-primary text-lg mt-2"
        disabled={isLoading}
      >
        {isLoading ? (
          <span className="loading loading-spinner"></span>
        ) : (
          "Submit Defense"
        )}
      </button>
    </div>
  );
};
// --- *** END NEW DefensePhaseActions *** ---

const ScavengeChoiceModal = ({ onConfirm, onCancel, player }) => {
  // v1.8: Check for Scavenger's Eye
  const hasScavengersEye = player.upgrades.some(
    (u) => u.special_effect_id === "SCAVENGERS_EYE"
  );
  const numToChoose = hasScavengersEye ? 3 : 2;

  const [selection, setSelection] = useState([]);
  const canConfirm = selection.length === numToChoose;

  const handleSelect = (scrapType) => {
    if (selection.length < numToChoose) {
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
        <p className="text-gray-300 mb-4">
          Choose {numToChoose} scrap from the supply:
          {hasScavengersEye && (
            <span className="text-green-400 block text-xs">
              (Scavenger's Eye lets you choose 3!)
            </span>
          )}
        </p>
        <div className="flex justify-center space-x-4 mb-4">
          <button
            onClick={() => handleSelect("PARTS")}
            disabled={selection.length >= numToChoose}
            className="btn btn-danger px-4 py-2"
          >
            Parts (Red)
          </button>
          <button
            onClick={() => handleSelect("WIRING")}
            disabled={selection.length >= numToChoose}
            className="btn btn-info px-4 py-2"
          >
            Wiring (Blue)
          </button>
          <button
            onClick={() => handleSelect("PLATES")}
            disabled={selection.length >= numToChoose}
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
            onClick={onCancel}
            className="btn btn-secondary"
            title="Return to action panel"
          >
            Cancel
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

const ActionPhaseActions = ({ sendGameAction, player, gameState }) => {
  const { action_turn_player_id, players } = gameState;
  const isMyTurn = player.user_id === action_turn_player_id;
  const myChoice = player.action_choice_pending;
  const [showScavengeModal, setShowScavengeModal] = useState(false);

  // Open modal automatically
  useEffect(() => {
    if (isMyTurn && myChoice === "SCAVENGE") {
      setShowScavengeModal(true);
    } else {
      setShowScavengeModal(false);
    }
  }, [isMyTurn, myChoice]);

  const handleScavengeConfirm = (scraps) => {
    // --- FIX: Wrap sendGameAction in try...catch ---
    try {
      sendGameAction("submit_action_choice", {
        choice_type: "scavenge",
        scraps: scraps,
      });
      setShowScavengeModal(false);
    } catch (error) {
      console.error("Failed to submit scavenge choice:", error);
      // If this fails, we leave the modal open for them to retry
    }
    // --- END FIX ---
  };

  const handlePass = (action) => {
    // --- FIX: Wrap sendGameAction in try...catch ---
    try {
      // v1.8: Send the correct payload for a "pass" on F/AR
      // This allows the backend to give the fallback scrap.
      sendGameAction("submit_action_choice", {
        choice_type: action.toLowerCase(), // "fortify" or "armory_run"
        card_id: "pass", // Special ID to signal a pass
      });
    } catch (error) {
      console.error("Failed to pass action:", error);
    }
    // --- END FIX ---
  };

  const currentPlayerName =
    players[action_turn_player_id]?.username || "A player";

  return (
    <div className="space-y-3 p-3 bg-gray-700 bg-opacity-80 rounded-lg">
      {showScavengeModal && (
        <ScavengeChoiceModal
          onConfirm={handleScavengeConfirm}
          onCancel={() => setShowScavengeModal(false)}
          player={player}
        />
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
            Select a card from the market to buy, or Pass to gain 2 random
            scrap.
          </p>
          <button
            onClick={() => handlePass(myChoice)}
            className="btn btn-warning"
          >
            Pass Action (Gain 2 Scrap)
          </button>
        </div>
      )}

      {isMyTurn && myChoice === "SCAVENGE" && (
        <div className="pt-3 border-t border-gray-600 text-center">
          <button
            onClick={() => setShowScavengeModal(true)}
            className="btn btn-primary"
          >
            Choose Scrap
          </button>
        </div>
      )}
    </div>
  );
};

const IntermissionPhaseActions = ({ sendGameAction, player, gameState }) => {
  const { intermission_turn_player_id, players } = gameState;
  const isMyTurn = player.user_id === intermission_turn_player_id;

  const handlePass = () => {
    // --- FIX: Wrap sendGameAction in try...catch ---
    try {
      sendGameAction("pass_intermission_turn", {});
    } catch (error) {
      console.error("Failed to pass intermission turn:", error);
    }
    // --- END FIX ---
  };

  const currentPlayerName =
    players[intermission_turn_player_id]?.username || "A player";

  return (
    <div className="space-y-3 p-3 bg-gray-700 bg-opacity-80 rounded-lg">
      <div className="text-center p-2 bg-black bg-opacity-25 rounded-lg">
        {isMyTurn ? (
          <>
            <p className="text-lg text-blue-300 animate-pulse">
              It's your turn to buy!
            </p>
            <p className="text-sm text-gray-200">
              You may buy one card from the Market at full price.
            </p>
            <p className="text-xs text-gray-400">Phase: INTERMISSION</p>
          </>
        ) : (
          <p className="text-lg text-yellow-300">
            Waiting for {currentPlayerName} to buy...
          </p>
        )}
      </div>

      {isMyTurn && (
        <div className="pt-3 border-t border-gray-600 text-center">
          <p className="text-gray-300 mb-2">
            Select a card from the market or Pass.
          </p>
          <button onClick={handlePass} className="btn btn-primary">
            Pass Turn
          </button>
        </div>
      )}
    </div>
  );
};

const GameHeader = ({
  round,
  era,
  phase,
  onSurrender,
  onLogout,
  isSpectator,
  hasLeft,
  onReturnToLobby,
}) => (
  <div className="flex-shrink-0 flex justify-between items-center p-2 bg-black bg-opacity-40 w-full">
    <div>
      <h1 className="text-2xl sm:text-3xl font-bold text-indigo-300 [text-shadow:_0_2px_4px_rgb(0_0_0_/_50%)]">
        Wild Pigs Will Attack!
      </h1>
    </div>
    <div className="flex items-center space-x-4">
      <div className="p-2 bg-gray-900 bg-opacity-70 rounded-lg text-center">
        <span className="text-xs text-gray-400 block">ROUND</span>
        <span className="text-2xl font-bold text-white">
          {round} / {15}
        </span>
      </div>
      <div className="p-2 bg-gray-900 bg-opacity-70 rounded-lg text-center">
        <span className="text-xs text-gray-400 block">ERA</span>
        <span className="text-2xl font-bold text-white">{era} / 3</span>
      </div>
      <div className="p-2 bg-blue-900 bg-opacity-70 rounded-lg text-center min-w-[120px]">
        <span className="text-xs text-blue-200 block">PHASE</span>
        <span className="text-2xl font-bold text-white">{phase}</span>
      </div>
    </div>
    <div className="space-x-2">
      {!isSpectator && !hasLeft && phase !== "GAME_OVER" && (
        <button onClick={onSurrender} className="btn btn-warning btn-sm">
          Surrender
        </button>
      )}
      {phase === "GAME_OVER" && (
        <button onClick={onReturnToLobby} className="btn btn-primary btn-sm">
          Back to Lobby
        </button>
      )}
      <button onClick={onLogout} className="btn btn-danger btn-sm">
        Logout
      </button>
    </div>
  </div>
);

// --- MAIN GAME PAGE COMPONENT ---
const GamePage = ({ onLogout }) => {
  // --- FIX: `sendMessage` is no longer a prop
  const { user, gameState } = useStore();
  const [showSurrenderModal, setShowSurrenderModal] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [viewingPlayerId, setViewingPlayerId] = useState(null);
  const [activePanel, setActivePanel] = useState("threats");
  const [selectedThreatId, setSelectedThreatId] = useState(null);
  const [isLogCollapsed, setIsLogCollapsed] = useState(false);

  const playerPortraitsMap = useMemo(() => {
    if (!gameState?.players) return {};
    const playerIds =
      gameState.initiative_queue || Object.keys(gameState.players);
    const portraits = {};
    playerIds.forEach((pid, index) => {
      portraits[pid] = playerPortraits[index % playerPortraits.length];
    });
    return portraits;
  }, [gameState?.initiative_queue]);

  const self = useMemo(() => {
    return gameState?.players ? gameState.players[user.id] : null;
  }, [gameState, user.id]);

  useEffect(() => {
    if (user?.id && !viewingPlayerId) {
      setViewingPlayerId(user.id);
    }

    if (viewingPlayerId === user.id) {
      if (gameState?.phase === "ACTION" && self?.action_choice_pending) {
        if (["FORTIFY", "ARMORY_RUN"].includes(self.action_choice_pending)) {
          setActivePanel("market");
        }
      } else if (gameState?.phase === "INTERMISSION") {
        setActivePanel("market");
      } else if (
        ["PLANNING", "ATTRACTION", "DEFENSE", "WILDERNESS"].includes(
          gameState?.phase
        )
      ) {
        setActivePanel("threats");
      }
    }
  }, [
    user?.id,
    viewingPlayerId,
    gameState?.phase,
    self?.action_choice_pending,
  ]);

  // ---
  // --- *** THE FIX *** ---
  // ---
  const sendGameAction = (actionName, data) => {
    // Get the *current* sendMessage function from the store *at call time*
    const sendMessage = useStore.getState().sendMessage;

    if (!sendMessage) {
      console.error(
        "sendMessage is not available from the store! Connection may be down."
      );
      return;
    }

    try {
      sendMessage({
        action: "game_action",
        payload: {
          action: actionName,
          ...data,
        },
      });
    } catch (error) {
      // This will catch the error thrown by useGameSocket if the WS is not open
      console.error(`Failed to send game action '${actionName}':`, error);
      // Optionally show a toast/modal to the user
      // alert(`Failed to send action: ${error.message}`);
    }
  };

  const handleSurrender = () => {
    // No try/catch needed here, sendGameAction handles it
    sendGameAction("surrender", {});
    setShowSurrenderModal(false);
  };

  const handleReturnToLobby = () => {
    // This is not a "game_action", so we get sendMessage manually
    const sendMessage = useStore.getState().sendMessage;
    if (sendMessage) {
      try {
        sendMessage({ action: "return_to_lobby" });
      } catch (error) {
        console.error("Failed to return to lobby:", error);
      }
    }
  };
  // --- *** END OF FIX *** ---
  // ---

  const handleLogout = () => onLogout();

  // Get the sendMessage function *just for the loading check*
  // We use a selector here so the component re-renders when it changes
  const sendMessageForLoadingCheck = useStore((state) => state.sendMessage);

  if (!gameState || !user || !self || !sendMessageForLoadingCheck) {
    // Show a robust loading state
    return (
      <div
        className="flex justify-center items-center min-h-screen bg-gray-900 text-white bg-cover bg-top bg-fixed"
        style={{ backgroundImage: `url(${gameBackground})` }}
      >
        <div className="text-center p-6 bg-black bg-opacity-70 rounded-lg">
          <span className="loading loading-spinner loading-lg text-blue-400"></span>
          <p className="text-xl mt-4">Loading game state...</p>
          {!sendMessageForLoadingCheck && (
            <p className="text-red-400 mt-2">Connecting to server...</p>
          )}
        </div>
      </div>
    );
  }

  const {
    phase,
    round,
    era,
    log,
    initiative_queue,
    current_threats,
    attraction_turn_player_id,
    action_turn_player_id,
    intermission_turn_player_id,
    player_plans,
    market,
    available_threat_ids,
    unassigned_player_ids,
  } = gameState;

  const canConfirmThreat = selectedThreatId !== null;

  const threatAssignments = useMemo(() => {
    const assignments = {};
    if (!gameState.players) return assignments;
    Object.values(gameState.players).forEach((p) => {
      if (p.attracted_threat) {
        assignments[p.attracted_threat.id] = p.username;
      }
    });
    return assignments;
  }, [gameState.players]);

  const selectableThreats = useMemo(() => {
    if (
      phase !== "ATTRACTION" ||
      !self ||
      self.user_id !== attraction_turn_player_id
    ) {
      return [];
    }
    const myPlan = player_plans[self.user_id];
    if (!myPlan) return [];

    const available = current_threats.filter((t) =>
      available_threat_ids.includes(t.id)
    );
    if (gameState.attraction_phase_state === "FIRST_PASS") {
      return available.filter((t) => t.lure === myPlan.lure);
    } else {
      return available;
    }
  }, [
    phase,
    self,
    attraction_turn_player_id,
    player_plans,
    current_threats,
    available_threat_ids,
    gameState.attraction_phase_state,
  ]);

  const threatsToShow = useMemo(() => {
    const viewingPlayer = viewingPlayerId && gameState.players[viewingPlayerId];
    if (viewingPlayer && viewingPlayer.attracted_threat) {
      // Always show your own threat if you have one
      if (viewingPlayer.user_id === self.user_id) {
        return [viewingPlayer.attracted_threat];
      }
      // Only show other's threats if phase is past attraction
      if (!["WILDERNESS", "PLANNING", "ATTRACTION"].includes(phase)) {
        return [viewingPlayer.attracted_threat];
      }
    }
    // Default to all current threats
    return current_threats;
  }, [
    viewingPlayerId,
    gameState.players,
    current_threats,
    phase,
    self.user_id,
  ]);

  const getPlayerTurnStatus = (playerId) => {
    const player = gameState.players[playerId];
    if (!player) return "NONE";

    if (phase === "ATTRACTION") {
      if (playerId === attraction_turn_player_id) return "ACTIVE";
      const hasActed = !unassigned_player_ids.includes(playerId);
      return hasActed ? "WAITING" : "PENDING";
    }
    if (phase === "ACTION") {
      if (playerId === action_turn_player_id) return "ACTIVE";
      const myIndex = initiative_queue.indexOf(playerId);
      const turnIndex = initiative_queue.indexOf(action_turn_player_id);
      if (turnIndex === -1) return "PENDING";
      return myIndex < turnIndex ? "WAITING" : "PENDING";
    }
    if (phase === "INTERMISSION") {
      if (playerId === intermission_turn_player_id) return "ACTIVE";
      const hasActed = gameState.intermission_players_acted.includes(playerId);
      return hasActed ? "WAITING" : "PENDING";
    }
    if (phase === "PLANNING") {
      return player.plan_submitted ? "WAITING" : "ACTIVE";
    }
    if (phase === "DEFENSE") {
      return player.defense_submitted ? "WAITING" : "ACTIVE";
    }
    return "NONE";
  };

  const handleMarketCardSelect = (cardType, cardId) => {
    // sendGameAction handles its own errors
    if (phase === "ACTION") {
      const choiceType = cardType === "UPGRADE" ? "fortify" : "armory_run";
      sendGameAction("submit_action_choice", {
        choice_type: choiceType,
        card_id: cardId,
      });
    } else if (phase === "INTERMISSION") {
      sendGameAction("buy_market_card", {
        card_type: cardType,
        card_id: cardId,
      });
    }
  };

  const handleThreatSelect = (threatId) => {
    if (phase === "ATTRACTION" && self?.user_id === attraction_turn_player_id) {
      setSelectedThreatId((prev) => (prev === threatId ? null : threatId));
    }
  };

  const isPureSpectator = !self; // This should not happen if loading state is correct
  const hasLeft =
    self && (self.status === "SURRENDERED" || self.status === "DISCONNECTED");
  const isSpectator = isPureSpectator || hasLeft;

  const isMyTurnForMarket =
    (phase === "ACTION" &&
      self &&
      self.user_id === action_turn_player_id &&
      (self.action_choice_pending === "FORTIFY" ||
        self.action_choice_pending === "ARMORY_RUN")) ||
    (phase === "INTERMISSION" &&
      self &&
      self.user_id === intermission_turn_player_id);

  // --- *** NEW: Get turn status for viewing player *** ---
  const viewingPlayerTurnStatus = viewingPlayerId
    ? getPlayerTurnStatus(viewingPlayerId)
    : "NONE";

  return (
    <div
      className="h-screen w-screen text-white bg-cover bg-center bg-fixed flex flex-col"
      style={{
        backgroundImage: `url(${gameBackground})`,
        onError: (e) => {
          e.target.style.backgroundImage = "none";
          e.target.style.backgroundColor = "#1a202c"; // Dark gray fallback
        },
      }}
    >
      {showSurrenderModal && (
        <ConfirmationModal
          title="Confirm Surrender"
          message="Are you sure you want to surrender? This action cannot be undone."
          onConfirm={handleSurrender}
          onCancel={() => setShowSurrenderModal(false)}
          confirmText="Surrender"
        />
      )}
      {showLogoutModal && (
        <ConfirmationModal
          title="Confirm Logout"
          message="Are you sure you want to logout and leave the game?"
          onConfirm={handleLogout}
          onCancel={() => setShowLogoutModal(false)}
          confirmText="Logout"
        />
      )}

      <header className="flex-shrink-0" style={{ height: "10vh" }}>
        <GameHeader
          round={round}
          era={era}
          phase={phase}
          onSurrender={() => setShowSurrenderModal(true)}
          onLogout={() => setShowLogoutModal(true)}
          isSpectator={isPureSpectator} // Only true if never a player
          hasLeft={hasLeft} // True if was a player but left
          onReturnToLobby={handleReturnToLobby}
        />
      </header>

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
                plan={player_plans[pid]}
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

      <main
        className="flex-grow flex gap-2 p-2 overflow-hidden"
        style={{ height: "45vh" }}
      >
        <div className="flex-shrink-0 flex flex-col items-center gap-2 p-2 bg-black bg-opacity-20 rounded-lg">
          <button
            onClick={() => setActivePanel("threats")}
            className={`btn btn-sm w-full ${
              activePanel === "threats" ? "btn-primary" : "btn-ghost"
            }`}
          >
            Threats
          </button>
          <button
            onClick={() => setActivePanel("market")}
            className={`btn btn-sm w-full ${
              activePanel === "market" ? "btn-primary" : "btn-ghost"
            }`}
          >
            Market
          </button>
        </div>

        <div className="flex-grow h-full overflow-y-auto">
          {isSpectator ? (
            <div className="text-center p-4 bg-gray-800 bg-opacity-70 rounded-lg h-full flex flex-col justify-center items-center">
              <p className="text-lg text-yellow-300 mb-4">
                {isPureSpectator
                  ? "You are spectating."
                  : `You have ${self.status.toLowerCase()}. You can continue watching.`}
              </p>
              <button
                onClick={handleReturnToLobby}
                className="btn btn-primary text-lg px-6 py-2"
              >
                Return to Lobby
              </button>
            </div>
          ) : (
            <div className="flex h-full gap-2">
              <div className="w-1/2 h-full overflow-y-auto">
                {activePanel === "threats" && (
                  <ThreatsPanel
                    threats={threatsToShow}
                    threatAssignments={threatAssignments}
                    onThreatSelect={handleThreatSelect}
                    selectableThreats={selectableThreats}
                    gameState={gameState}
                    selectedThreatId={selectedThreatId}
                  />
                )}
                {activePanel === "market" && (
                  <MarketPanel
                    market={market}
                    myTurn={isMyTurnForMarket}
                    phase={phase}
                    choiceType={self.action_choice_pending}
                    onCardSelect={handleMarketCardSelect}
                    playerScrap={self.scrap}
                  />
                )}
              </div>
              <div className="w-1/2 h-full overflow-y-auto">
                {phase === "PLANNING" && (
                  <PlanningPhaseActions
                    sendGameAction={sendGameAction}
                    player={self}
                  />
                )}
                {phase === "ATTRACTION" && (
                  <AttractionPhaseActions
                    sendGameAction={sendGameAction}
                    player={self}
                    gameState={gameState}
                    selectedThreatId={selectedThreatId}
                    canConfirm={canConfirmThreat}
                  />
                )}
                {phase === "DEFENSE" && (
                  <DefensePhaseActions
                    sendGameAction={sendGameAction}
                    player={self}
                    playerPlans={player_plans}
                    threat={self.attracted_threat}
                  />
                )}
                {phase === "ACTION" && (
                  <ActionPhaseActions
                    sendGameAction={sendGameAction}
                    player={self}
                    gameState={gameState}
                  />
                )}
                {phase === "INTERMISSION" && (
                  <IntermissionPhaseActions
                    sendGameAction={sendGameAction}
                    player={self}
                    gameState={gameState}
                  />
                )}
                {["CLEANUP", "WILDERNESS"].includes(phase) && (
                  <div className="text-center p-4 bg-gray-800 bg-opacity-70 rounded-lg h-full flex flex-col justify-center items-center">
                    <h3 className="text-xl text-gray-300">Phase: {phase}</h3>
                    <span className="loading loading-spinner loading-lg text-blue-400 mt-4"></span>
                    <p className="text-gray-400 mt-4">
                      Resolving game state...
                    </p>
                  </div>
                )}
                {phase === "GAME_OVER" && (
                  <div className="text-center p-4 bg-gray-800 bg-opacity-70 rounded-lg h-full flex flex-col justify-center items-center">
                    <h3 className="text-xl text-yellow-300">GAME OVER</h3>
                    <p className="text-gray-200 text-lg">
                      Winner: {gameState.winner?.username || "N/A"}
                    </p>
                    <button
                      onClick={handleReturnToLobby}
                      className="btn btn-primary mt-4"
                    >
                      Back to Lobby
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div
          className={`flex-shrink-0 transition-all duration-300 ease-in-out ${
            isLogCollapsed ? "w-10" : "w-[25%]"
          }`}
        >
          <div className="w-full h-full relative">
            <button
              onClick={() => setIsLogCollapsed(!isLogCollapsed)}
              className="absolute top-1 -left-3 z-20 bg-gray-700 hover:bg-gray-600 text-white p-1 rounded-full"
              title={isLogCollapsed ? "Expand Log" : "Collapse Log"}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d={
                    isLogCollapsed
                      ? "M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z"
                      : "M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
                  }
                  clipRule="evenodd"
                />
              </svg>
            </button>
            {!isLogCollapsed && <GameLog logs={log} />}
          </div>
        </div>
      </main>

      <footer
        className="flex-shrink-0 p-1 bg-black bg-opacity-20"
        style={{ height: "20vh" }}
      >
        <div className="w-full h-full bg-black bg-opacity-20 rounded-lg p-2">
          {/* --- REFACTORED CALL to PlayerAssets --- */}
          <PlayerAssets
            player={viewingPlayerId ? gameState.players[viewingPlayerId] : null}
            isSelf={viewingPlayerId === user.id}
            onReturn={() => setViewingPlayerId(user.id)}
            phase={phase}
            // Pass in the specific player's plan and portrait
            playerPlan={viewingPlayerId ? player_plans[viewingPlayerId] : null}
            portrait={
              viewingPlayerId ? playerPortraitsMap[viewingPlayerId] : null
            }
            turnStatus={viewingPlayerTurnStatus} // <-- *** PASS PROP ***
          />
        </div>
      </footer>
    </div>
  );
};

export default GamePage;
