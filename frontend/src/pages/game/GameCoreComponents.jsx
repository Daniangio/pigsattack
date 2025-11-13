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
} from "./GameConstants.jsx";
import {
  TurnStatusIcon,
  ScrapIcon,
  InjuryIcon,
  LureIcon,
} from "./GameUIHelpers.jsx";

export const playerPortraits = [
  playerIcon1,
  playerIcon2,
  playerIcon3,
  playerIcon4,
  playerIcon5,
];

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
          // For self, plan is an object
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
          : "bg-black bg-opacity-30"
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
      <div className="flex-grow flex flex-col gap-1">
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

export const ThreatCard = ({
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
          <LureIcon lure={threat.lure_type} />
        </div>
        <p className="text-xs text-gray-300 mb-2 italic">
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

export const MarketCard = ({
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
