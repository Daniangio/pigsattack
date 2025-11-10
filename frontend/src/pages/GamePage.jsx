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

// --- ACTION PANEL COMPONENTS ---
import {
  PlanningPhaseActions,
  AttractionPhaseActions,
  ActionPhaseActions,
  IntermissionPhaseActions,
} from "./game/GameActionPanels.jsx";
// --- UI COMPONENTS ---
import playerFrame from "../images/player-frame.png";
import scrapsParts from "../images/icons/scraps-parts.png";
import scrapsWiring from "../images/icons/scraps-wiring.png";
import scrapsPlates from "../images/icons/scraps-plates.png";
import playerIcon1 from "../images/player-icon-1.png";
import playerIcon2 from "../images/player-icon-2.png";
import { ConfirmationModal, DefenseSubmission } from "./game/GameModals.jsx";
import playerIcon3 from "../images/player-icon-3.png";
import playerIcon4 from "../images/player-icon-4.png";
import playerIcon5 from "../images/player-icon-5.png";

// --- DATA CONSTANTS (v1.8) ---
// --- FIX: Keys changed from PARTS/WIRING/PLATES to PARTS/WIRING/PLATES to match backend ---
// --- NOTE: This seems to be v1.7 data, the rulebook (v1.8) has different values ---
// --- I will keep your v1.7 values for now, but double-check rulebook section 4 ---
const BASE_DEFENSE_FROM_ACTION = {
  SCAVENGE: { PARTS: 0, WIRING: 2, PLATES: 0 }, // Rulebook v1.8 is 2 Blue
  FORTIFY: { PARTS: 0, WIRING: 0, PLATES: 2 }, // Rulebook v1.8 is 2 Green
  ARMORY_RUN: { PARTS: 2, WIRING: 0, PLATES: 0 }, // Rulebook v1.8 is 2 Red
  SCHEME: { PARTS: 1, WIRING: 1, PLATES: 1 }, // Rulebook v1.8 is 1 of each
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

// --- FIX: Keys changed to PARTS/WIRING/PLATES to match backend game_models.py ScrapType ---
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
  // --- FIX: Match multi-lures from backend (e.g., "Rags/Noises/Fruit") ---
  // We'll just display the first one
  const primaryLure = lure ? lure.split("/")[0].toUpperCase() : "UNKNOWN";

  const lureStyles = {
    RAGS: "bg-red-700 text-red-100 border-red-500",
    NOISES: "bg-blue-700 text-blue-100 border-blue-500",
    FRUIT: "bg-green-700 text-green-100 border-green-500",
    BLOODY_RAGS: "bg-red-700 text-red-100 border-red-500",
    STRANGE_NOISES: "bg-blue-700 text-blue-100 border-blue-500",
    FALLEN_FRUIT: "bg-green-700 text-green-100 border-green-500",
  };
  const lureText = {
    RAGS: "Rags",
    NOISES: "Noises",
    FRUIT: "Fruit",
    BLOODY_RAGS: "Bloody Rags",
    STRANGE_NOISES: "Strange Noises",
    FALLEN_FRUIT: "Fallen Fruit",
  };
  return (
    <span
      className={`px-2 py-0.5 text-xs font-semibold rounded-full border ${
        lureStyles[primaryLure] || "bg-gray-700"
      }`}
    >
      {lureText[primaryLure] || "Unknown Lure"}
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
  plan, // This is the PlayerPlans object { lure_card_id, action_card_id }
  isViewing,
  onClick,
}) => {
  if (!player) return null;
  const { scrap, injuries, username, status } = player;
  const isInactive = status !== "ACTIVE";

  // --- FIX: Show plan based on phase and plan object ---
  const phase = useStore((state) => state.gameState?.payload?.phase);
  let showLure = false;
  let showAction = false;
  const lureCardId = plan?.lure_card_id;
  const actionCardId = plan?.action_card_id;

  if (plan) {
    switch (phase) {
      case "PLANNING":
        // Only show your own submitted plan
        if (isSelf && player.plan_submitted) {
          showLure = true;
          showAction = true;
        }
        break;
      case "ATTRACTION":
      case "DEFENSE":
        // Show lure for everyone, action for self
        showLure = true;
        if (isSelf) {
          showAction = true;
        }
        break;
      case "ACTION":
      case "CLEANUP":
      case "INTERMISSION":
      case "GAME_OVER":
        // Show everything for everyone
        showLure = true;
        showAction = true;
        break;
      default:
        break;
    }
  }
  // --- END FIX ---

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
            {/* --- FIX: Use new showLure/showAction logic --- */}
            {plan && (
              <img
                src={
                  showLure
                    ? LURE_CARDS.find((c) => c.id === lureCardId)?.image
                    : unknownLureCard
                }
                alt={showLure ? lureCardId : "Hidden"}
                className="w-8 h-10 object-cover rounded-sm shadow-md"
                title={`Lure: ${showLure ? lureCardId : "Hidden"}`}
              />
            )}
            {plan && (
              <img
                src={
                  showAction
                    ? ACTION_CARDS.find((c) => c.id === actionCardId)?.image
                    : unknownCard
                }
                alt={showAction ? actionCardId : "Hidden"}
                className="w-8 h-10 object-cover rounded-sm shadow-md"
                title={`Action: ${showAction ? actionCardId : "Hidden"}`}
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
          {/* --- FIX: Use threat.lure_type from backend --- */}
          <LureIcon lure={threat.lure_type} />
        </div>
        <p className="text-xs text-gray-300 mb-2 italic">
          {/* --- FIX: Use threat.on_fail_effect and abilities_text --- */}
          {threat.abilities_text ? (
            <span className="text-yellow-400 font-semibold">
              {threat.abilities_text}
            </span>
          ) : (
            "No 'On Fail' effect."
          )}
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
          {/* --- FIX: Use backend keys ferocity, cunning, mass --- */}
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
        {/* --- FIX: Use effect_text from backend --- */}
        <p className="text-[10px] leading-tight text-gray-300 mb-1.5 italic">
          {card.effect_text}
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
      {/* --- FIX: Use effect_text from backend --- */}
      <p className="text-[10px] leading-tight text-gray-300 mb-1.5 italic">
        {card.effect_text}
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
          // --- FIX: Use correct market structure from backend ---
          upgrade_market={market.upgrade_faceup}
          myTurn={myTurn}
          phase={phase}
          choiceType={choiceType}
          onCardSelect={onCardSelect}
          playerScrap={playerScrap}
        />
      </div>
      <div className="flex-1 overflow-hidden">
        <ArsenalMarket
          // --- FIX: Use correct market structure from backend ---
          arsenal_market={market.arsenal_faceup}
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
  // --- FIX: Backend doesn't send last_round_... ---
  // --- This component is disabled for now ---
  return null;

  /*
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
  */
};

// --- *** NEW COMPONENT *** ---
const CurrentPlanDisplay = ({
  player,
  playerPlan, // This is PlayerPlans { lure_card_id, action_card_id }
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

    // --- FIX: Logic updated to handle isSelf ---
    if (isSelf && playerPlan) {
      // If it's me, I always see my plan
      lureId = playerPlan.lure_card_id;
      actionId = playerPlan.action_card_id;
      newTitle = "Your Plan";

      if (phase === "PLANNING" && !player.plan_submitted) {
        newTitle = "Planning...";
        lureId = null; // Hide cards until plan is submitted
        actionId = null;
      } else if (phase === "PLANNING" && player.plan_submitted) {
        newTitle = "Planned"; // Keep cards visible
      }
    } else {
      // Logic for viewing other players
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
            // Show action if it's their turn or their turn has passed
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
    // --- END FIX ---

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
// --- *** END NEW COMPONENT *** ---

// --- PlayerUpgrades (Unchanged) ---
const PlayerUpgrades = ({ player }) => (
  <div className="flex-shrink-0">
    <h4 className="text-sm font-bold text-gray-400 mb-2 text-center">
      Upgrades
    </h4>
    <div className="flex gap-2 p-2 rounded min-h-[140px] items-center bg-black bg-opacity-20">
      {/* --- FIX: Use player.upgrade_cards from backend --- */}
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

// --- PlayerArsenal (Crash Fix) ---
const PlayerArsenal = ({ player, isSelf }) => (
  <div className="flex-shrink-0">
    <h4 className="text-sm font-bold text-gray-400 mb-2 text-center">
      Arsenal
    </h4>
    <div className="flex gap-2 p-2 rounded min-h-[140px] items-center bg-black bg-opacity-20">
      {/* --- FIX: Use player.arsenal_cards from backend --- */}
      {isSelf ? ( // If it's me, show my cards
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
      ) : // If it's someone else, show hidden cards based on count
      (player.arsenal_cards_count || 0) > 0 ? (
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
  // Removed the conditional logic that showed the threat.
  // The panel now *always* shows the player's board.

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
        {/* 2. Last Played Cards (Disabled) */}
        {/* <LastRoundActionsDisplay player={player} /> */}

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

// --- *** REFACTORED GameHeader *** ---
const GameHeader = ({
  round,
  era,
  phase,
  onSurrender,
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
      {/* --- FIX: Show Back to Lobby if game is over OR user is a spectator/has left --- */}
      {(phase === "GAME_OVER" || isSpectator || hasLeft) && (
        <button onClick={onReturnToLobby} className="btn btn-primary btn-sm">
          Back to Lobby
        </button>
      )}
      {/* --- FIX: Removed Logout Button --- */}
    </div>
  </div>
);

// --- MAIN GAME PAGE COMPONENT ---
const GamePage = ({ onLogout }) => {
  // --- Add `token` and get `rawGameState` ---
  const { user, gameState, token } = useStore((state) => ({
    user: state.user,
    gameState: state.gameState, // <-- THE FIX: Select state.gameState and assign it to rawGameState
    token: state.token, // Get token for HTTP requests
  }));

  // --- *** REFACTOR *** ---
  // The `useMemo` hook to unwrap the game state is no longer needed.
  // The `store.js` `handleGameStateUpdate` sets `gameState` to the
  // payload object directly, so `gameState` from the store *is* the
  // correct state object.
  // --- *** END REFACTOR *** ---

  const [showSurrenderModal, setShowSurrenderModal] = useState(false);
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
  }, [gameState?.initiative_queue, gameState?.players]); // <-- FIX: Added gameState.players dependency

  const self = useMemo(() => {
    return gameState?.players ? gameState.players[user.id] : null;
  }, [gameState, user.id]);

  useEffect(() => {
    if (user?.id && !viewingPlayerId) {
      setViewingPlayerId(user.id);
    }

    if (viewingPlayerId === user.id && self) {
      // --- FIX: Use self.plan.action_card_id ---
      const myAction = self.plan ? self.plan.action_card_id : null;

      if (gameState?.phase === "ACTION" && myAction) {
        if (["FORTIFY", "ARMORY_RUN"].includes(myAction)) {
          setActivePanel("market");
        } else {
          setActivePanel("threats"); // Default to threats if not buy action
        }
      } else if (gameState?.phase === "INTERMISSION") {
        setActivePanel("market");
      } else if (
        ["PLANNING", "ATTRACTION", "DEFENSE", "WILDERNESS", "CLEANUP"].includes(
          gameState?.phase
        )
      ) {
        setActivePanel("threats");
      }
    }
  }, [user?.id, viewingPlayerId, gameState?.phase, self?.plan?.action_card_id]);

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
          // --- FIX: Reverting to sub_action/data structure ---
          // This is what the WebSocket router (game_manager's caller) expects.
          sub_action: actionName,
          data: data,
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
        // --- FIX: This should be "return_to_lobby" not "leave_room"
        // "leave_room" is for pre-game. "return_to_lobby" is for post-game/surrender.
        sendMessage({ action: "return_to_lobby" });
      } catch (error) {
        console.error("Failed to return to lobby:", error);
      }
    }
  };
  // --- *** END OF FIX *** ---
  // ---

  // --- FIX: Removed handleLogout ---
  // const handleLogout = () => onLogout();

  // Get the sendMessage function *just for the loading check*
  // We use a selector here so the component re-renders when it changes
  const sendMessageForLoadingCheck = useStore((state) => state.sendMessage);

  const threatAssignments = useMemo(() => {
    const assignments = {};
    // --- Make null-safe ---
    if (!gameState?.players || !gameState?.player_threat_assignment)
      return assignments;

    for (const [playerId, threatId] of Object.entries(
      gameState.player_threat_assignment
    )) {
      const username = gameState.players[playerId]?.username;
      if (username) {
        assignments[threatId] = username;
      }
    }
    return assignments;
    // --- Add optional chaining to dependencies ---
  }, [gameState?.players, gameState?.player_threat_assignment]);

  const selectableThreats = useMemo(() => {
    if (
      // --- Make null-safe ---
      gameState?.phase !== "ATTRACTION" ||
      !self ||
      self.user_id !== gameState?.attraction_turn_player_id
    ) {
      return [];
    }
    const myPlan = gameState.player_plans[self.user_id];
    if (!myPlan) return [];

    const available = gameState.current_threats.filter((t) =>
      gameState.available_threat_ids.includes(t.id)
    );
    if (gameState.attraction_phase_state === "FIRST_PASS") {
      const myLureCard = LURE_CARDS.find((c) => c.id === myPlan.lure_card_id);
      if (!myLureCard) return [];
      const lureNameMap = {
        BLOODY_RAGS: "Rags",
        STRANGE_NOISES: "Noises",
        FALLEN_FRUIT: "Fruit",
      };
      const myLureName = lureNameMap[myLureCard.id];

      return available.filter((t) => t.lure_type.includes(myLureName));
    } else {
      return available;
    }
    // --- Add optional chaining to dependencies ---
  }, [
    gameState?.phase,
    self,
    gameState?.attraction_turn_player_id,
    gameState?.player_plans,
    gameState?.current_threats,
    gameState?.available_threat_ids,
    gameState?.attraction_phase_state,
  ]);

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

  const threatsToShow = useMemo(() => {
    // --- Make null-safe ---
    const viewingPlayer =
      viewingPlayerId && gameState?.players[viewingPlayerId];
    if (!viewingPlayer) return gameState?.current_threats || []; // Default

    const assignedThreatId =
      gameState.player_threat_assignment[viewingPlayer.user_id];
    const assignedThreat = gameState.current_threats.find(
      (t) => t.id === assignedThreatId
    );

    if (assignedThreat) {
      return [assignedThreat];
    }
    return gameState.current_threats;
    // --- Add optional chaining to dependencies ---
  }, [
    viewingPlayerId,
    gameState?.players,
    gameState?.current_threats,
    gameState?.player_threat_assignment,
  ]);
  // --- END FIX ---

  // --- FIX: The loading check now uses the *derived* gameState. ---
  // This will correctly wait until the state is unwrapped.
  if (!gameState || !user || !sendMessageForLoadingCheck) {
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
          {/* Keep this for debugging if you want */}
          <pre className="text-xs text-left overflow-auto p-2 bg-gray-800 rounded mt-4 max-w-lg max-h-64">
            {JSON.stringify(gameState, null, 2)}
          </pre>
        </div>
      </div>
    );
  }

  const canConfirmThreat = selectedThreatId !== null;

  // This code is now safe, because the early return above caught null gameState
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
    player_threat_assignment,
  } = gameState;

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
      if (turnIndex === -1) return "PENDING"; // Turn hasn't started
      return myIndex < turnIndex ? "WAITING" : "PENDING";
    }
    if (phase === "INTERMISSION") {
      if (playerId === intermission_turn_player_id) return "ACTIVE";
      // --- FIX: Check intermission_purchases map ---
      const purchaseState = gameState.intermission_purchases[playerId];
      // 0 = pending, 1 = bought, -1 = passed
      return purchaseState !== 0 ? "WAITING" : "PENDING";
    }
    if (phase === "PLANNING") {
      return player.plan_submitted ? "WAITING" : "ACTIVE";
    }
    if (phase === "DEFENSE") {
      // --- FIX: Only active if they HAVE a threat ---
      const hasThreat = !!player_threat_assignment[playerId];
      if (!hasThreat) return "NONE"; // No action required
      return player.defense_submitted ? "WAITING" : "ACTIVE";
    }
    return "NONE";
  };

  const handleMarketCardSelect = (cardType, cardId) => {
    // ---
    // --- *** MAJOR FIX: MarketCardSelect *** ---
    // ---
    // sendGameAction handles its own errors
    if (phase === "ACTION") {
      // --- FIX: Send correct backend action and payload ---
      const actionName =
        cardType === "UPGRADE" ? "perform_fortify" : "perform_armory_run";
      sendGameAction(actionName, {
        card_id: cardId,
      });
    } else if (phase === "INTERMISSION") {
      // --- FIX: Send correct backend action and payload ---
      sendGameAction("buy_from_market", {
        card_id: cardId,
      });
    }
    // --- *** END FIX *** ---
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

  // --- FIX: Get my action from my plan ---
  const myActionChoice = self?.plan ? self.plan.action_card_id : null;

  const isMyTurnForMarket =
    (phase === "ACTION" &&
      self &&
      self.user_id === action_turn_player_id &&
      (myActionChoice === "FORTIFY" || myActionChoice === "ARMORY_RUN")) ||
    (phase === "INTERMISSION" &&
      self &&
      self.user_id === intermission_turn_player_id);

  // --- *** NEW: Get turn status for viewing player *** ---
  const viewingPlayerTurnStatus = viewingPlayerId
    ? getPlayerTurnStatus(viewingPlayerId)
    : "NONE";

  // --- FIX: Find assigned threat for Defense phase ---
  const myAssignedThreatId = player_threat_assignment[self?.user_id];
  const myAssignedThreat = current_threats.find(
    (t) => t.id === myAssignedThreatId
  );

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
      {/* --- FIX: Removed Logout Modal --- */}

      <header className="flex-shrink-0" style={{ height: "10vh" }}>
        <GameHeader
          round={round}
          era={era}
          phase={phase}
          onSurrender={() => setShowSurrenderModal(true)}
          // --- FIX: Pass spectator/left status ---
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
                // --- FIX: Pass the correct player's plan ---
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
                    // --- FIX: Pass correct action choice ---
                    choiceType={myActionChoice}
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
                {/* --- 
                --- REFACTOR: Replaced DefensePhaseActions with DefenseSubmission
                --- */}
                {phase === "DEFENSE" && (
                  <DefenseSubmission
                    player={self}
                    // --- FIX: Pass the correct assigned threat ---
                    threat={myAssignedThreat}
                    sendGameAction={sendGameAction}
                    gameState={gameState}
                    token={token}
                  />
                )}
                {/* --- END REFACTOR --- */}
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
