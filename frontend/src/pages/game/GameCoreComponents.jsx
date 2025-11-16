import React from "react";
import { useStore } from "../../store.js";
import {
  LURE_CARDS,
  ACTION_CARDS,
  unknownLureCard,
  unknownCard,
  playerIcon1,
  playerIcon2,
  playerIcon3,
  playerIcon4,
  playerIcon5,
  playerFrame,
  scrapsParts,
  scrapsWiring,
  scrapsPlates,
  SCRAP_TYPES,
  LURE_ICON_MAP,
} from "./GameConstants.jsx";
import { TurnStatusIcon, ScrapIcon, InjuryIcon } from "./GameUIHelpers.jsx";

export const playerPortraits = [
  playerIcon1,
  playerIcon2,
  playerIcon3,
  playerIcon4,
  playerIcon5,
];

// --- HELPER FUNCTION: Get Threat Image Path (from previous request) ---
const getThreatImagePath = (threatName, lureType) => {
  if (!threatName) {
    return `https://placehold.co/200x280/1a202c/9ca3af?text=No+Threat`;
  }

  // 1. Format the threat name
  const formattedName = threatName
    .toLowerCase()
    .replace(/'/g, "") // Remove apostrophes (e.g., Tinker's)
    .replace(/:/g, "") // Remove colons
    .replace(/ /g, "-"); // Replace spaces with hyphens

  // 2. Format the lure name
  const primaryLure = lureType ? lureType.split("/")[0] : "unknown";
  const formattedLure = primaryLure.toLowerCase().replace(/ /g, "-");

  // 3. Combine them for the final path
  return `/images/threats/${formattedName}-${formattedLure}.png`;
};

// --- HELPER COMPONENT: Threat Stat Bubble (from previous request) ---
const ThreatStatIcon = ({ iconSrc, value, valueColor, alt }) => (
  <div className="relative w-10 h-10" title={alt}>
    <img
      src={iconSrc}
      alt={alt}
      className="w-full h-full object-contain drop-shadow-lg"
      onError={(e) => (e.target.style.display = "none")}
    />
    <div className="absolute -top-1 -right-1 bg-black bg-opacity-80 rounded-full w-6 h-6 flex items-center justify-center border border-gray-900">
      <span className={`font-bold text-sm ${valueColor}`}>{value}</span>
    </div>
  </div>
);

// --- HELPER COMPONENT: Lure Icon for Card (from previous request) ---
const ThreatLureIcon = ({ lure }) => {
  const primaryLure = lure ? lure.split("/")[0].toUpperCase() : "UNKNOWN";
  const iconSrc = LURE_ICON_MAP[primaryLure] || LURE_ICON_MAP.UNKNOWN;

  const lureText = {
    RAGS: "Rags",
    NOISES: "Noises",
    FRUIT: "Fruit",
  };

  return (
    <div
      className="absolute top-2 -left-3 z-10"
      title={lureText[primaryLure] || "Unknown Lure"}
    >
      <img
        src={iconSrc}
        alt={lureText[primaryLure] || "Lure"}
        className="w-10 h-10 object-contain drop-shadow-lg"
        onError={(e) => (e.target.style.display = "none")}
      />
    </div>
  );
};

// --- CORRECTED PLAYER INFO CARD (Logic unchanged) ---
export const PlayerInfoCard = ({
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
  const phase = useStore((state) => state.gameState?.phase);

  let showLure = false;
  let showAction = false;

  const lureCardKey = plan?.lure_card_key;
  const actionCardKey = plan?.action_card_key;

  if (plan) {
    switch (phase) {
      case "PLANNING":
        if (isSelf && player.plan) {
          showLure = true;
          showAction = true;
        }
        break;
      case "ATTRACTION":
      case "DEFENSE":
        showLure = true; // Lure is revealed for everyone
        if (isSelf) showAction = true; // Action is only visible to self
        break;
      case "ACTION":
      case "CLEANUP":
      case "INTERMISSION":
      case "GAME_OVER":
        showLure = true; // All cards revealed
        showAction = true;
        break;
      default:
        break;
    }
  }

  return (
    <div
      className={`w-full flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-all duration-200 ${
        isInactive ? "opacity-50" : ""
      } ${
        isViewing
          ? "bg-yellow-500 bg-opacity-20 ring-2 ring-yellow-400"
          : "bg-black bg-opacity-40 hover:bg-black hover:bg-opacity-60"
      }`}
      onClick={onClick}
    >
      {/* Left side: Portrait */}
      <div className="relative w-16 h-16 flex-shrink-0">
        <img
          src={portrait}
          alt="Player Portrait"
          className="w-full h-full rounded-full object-cover"
        />
        <div className="absolute inset-0 flex items-center justify-center">
          <TurnStatusIcon
            turnStatus={turnStatus}
            size="h-8 w-8"
            isGlowing={true}
          />
        </div>
        <div className="absolute -top-1 -left-1 bg-black bg-opacity-70 rounded-full w-6 h-6 flex items-center justify-center">
          <span className="text-white font-bold text-sm">{turnOrder}</span>
        </div>
      </div>

      {/* Right side: Info */}
      <div className="flex-grow flex flex-col gap-1 min-w-0">
        <span
          className={`text-sm font-bold truncate ${
            isSelf ? "text-blue-300" : "text-white"
          }`}
        >
          {username}
        </span>
        {/* Planned Cards */}
        <div className="flex items-center gap-1">
          <img
            src={
              showLure
                ? LURE_CARDS.find((c) => c.id === lureCardKey)?.image
                : unknownLureCard
            }
            alt={showLure ? lureCardKey : "Hidden Lure"}
            className="w-8 h-10 object-cover rounded-sm shadow-md"
            title={`Lure: ${showLure ? lureCardKey : "Hidden"}`}
          />
          <img
            src={
              showAction
                ? ACTION_CARDS.find((c) => c.id === actionCardKey)?.image
                : unknownCard
            }
            alt={showAction ? actionCardKey : "Hidden Action"}
            className="w-8 h-10 object-cover rounded-sm shadow-md"
            title={`Action: ${showAction ? actionCardKey : "Hidden"}`}
          />
        </div>
        {/* Stats */}
        <div className="flex items-center gap-2">
          <ScrapIcon
            icon={<InjuryIcon />}
            count={injuries}
            textColor="text-red-400"
            size="w-5 h-5"
          />
          <ScrapIcon
            image={scrapsParts}
            count={scrap.PARTS || 0}
            size="w-5 h-5"
          />
          <ScrapIcon
            image={scrapsWiring}
            count={scrap.WIRING || 0}
            size="w-5 h-5"
          />
          <ScrapIcon
            image={scrapsPlates}
            count={scrap.PLATES || 0}
            size="w-5 h-5"
          />
        </div>
      </div>
    </div>
  );
};

// --- EXPORTED THREAT CARD (with clickable overlay fix) ---
export const ThreatCard = ({
  threat,
  onClick,
  isSelected,
  isSelectable,
  isAvailable,
}) => {
  if (!threat) return null;

  // Base styles for the card
  const baseStyle =
    "relative w-20 h-28 flex-shrink-0 rounded-lg transition-all duration-200 overflow-visible";
  let cursorStyle = "cursor-default";
  let opacityStyle = "opacity-100";
  let ringStyle = "ring-gray-700"; // Default ring

  // Apply styles based on state
  if (!isAvailable) {
    opacityStyle = "opacity-40";
    ringStyle = "ring-gray-900";
  } else if (isSelectable) {
    cursorStyle = "cursor-pointer";
    ringStyle = "ring-blue-400 hover:ring-blue-300 ring-2";
  }

  if (isSelected) {
    opacityStyle = "opacity-100";
    ringStyle = "ring-green-500 ring-4"; // Emphasize selection
  }

  const threatImagePath = getThreatImagePath(threat.name, threat.lure_type);

  return (
    <div className={`${baseStyle} ${opacityStyle}`}>
      {/* 1. Main Threat Image (as background) */}
      <img
        src={threatImagePath}
        alt={threat.name}
        className="absolute inset-0 w-full h-full object-cover rounded-md z-0"
        // --- TWO-STAGE FALLBACK IMPLEMENTATION ---
        onError={(e) => {
          // 1. If original image fails, try the specified default-threat.png
          if (!e.target.dataset.fallbackTried) {
            e.target.src = "/images/threats/default-threat.png";
            e.target.dataset.fallbackTried = "true"; // Mark that we've tried the first fallback
          } else {
            // 2. If default-threat.png also failed, use the ultimate placeholder
            e.target.onerror = null;
            const formattedName = threat.name.replace(/ /g, "+");
            e.target.src = `https://placehold.co/200x280/1a202c/9ca3af?text=${formattedName}`;
          }
        }}
      />

      {/* 2. Lure Icon (Left, half-out) */}
      <ThreatLureIcon lure={threat.lure_type} />

      {/* 3. Stat Icons (Right, half-out) */}
      <div className="absolute top-1 -right-3 flex flex-col gap-2 z-10">
        <ThreatStatIcon
          iconSrc={SCRAP_TYPES.PARTS.statIcon}
          value={threat.ferocity}
          valueColor={SCRAP_TYPES.PARTS.color}
          alt="Ferocity"
        />
        <ThreatStatIcon
          iconSrc={SCRAP_TYPES.WIRING.statIcon}
          value={threat.cunning}
          valueColor={SCRAP_TYPES.WIRING.color}
          alt="Cunning"
        />
        <ThreatStatIcon
          iconSrc={SCRAP_TYPES.PLATES.statIcon}
          value={threat.mass}
          valueColor={SCRAP_TYPES.PLATES.color}
          alt="Mass"
        />
      </div>

      {/* 4. Clickable Overlay and Selection Ring (z-index 20 ensures clickability) */}
      <div
        className={`absolute inset-0 rounded-md transition-all ${ringStyle} ${cursorStyle} z-20`}
        onClick={() => isSelectable && onClick()}
      ></div>
    </div>
  );
};

export const MarketCard = ({
  // ... (MarketCard logic remains unchanged)
  card,
  cardType,
  onClick,
  isSelectable,
  isDimmed,
}) => {
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

export const OwnedCard = ({ card, cardType, onClick, isSelectable }) => {
  if (!card) return null;
  const cardColor =
    cardType === "UPGRADE"
      ? "border-green-700 bg-green-900 bg-opacity-30"
      : "border-red-700 bg-red-900 bg-opacity-30";
  const costItems = Object.entries(card.cost).filter(([, val]) => val > 0);

  const baseStyle = `bg-gray-800 rounded-md shadow-md p-2 border ${cardColor} w-40 flex-shrink-0 transition-all h-full`;
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
        {card.effect_text}
      </p>
      {card.name !== "Hidden Arsenal" && (
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
