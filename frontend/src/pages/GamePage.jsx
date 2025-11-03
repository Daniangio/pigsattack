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
// 'hpIcon' is no longer used, we will use an SVG for injuries
import playerIcon1 from "../images/player-icon-1A.png";
import playerIcon2 from "../images/player-icon-2.png";
import playerIcon3 from "../images/player-icon-3.png";
import playerIcon4 from "../images/player-icon-4.png";
import playerIcon5 from "../images/player-icon-5.png";

// --- v1.8 DATA CONSTANTS ---
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
    border: "border-red-500",
  },
  WIRING: {
    name: "Wiring",
    color: "text-blue-400",
    bg: "bg-blue-900",
    border: "border-blue-500",
  },
  PLATES: {
    name: "Plates",
    color: "text-green-400",
    bg: "bg-green-900",
    border: "border-green-500",
  },
};

// --- HELPER COMPONENTS ---

// New v1.8 Injury Icon
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
    ELIMINATED: "bg-red-700 text-white", // Kept for history, though not used in v1.8
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
  // v1.8: Use 'injuries' instead of 'hp'
  const { scrap, injuries, username, status } = player;
  const isInactive = status !== "ACTIVE";
  const showPlan = plan && plan.ready;

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
      {/* v1.8: Injuries and Scrap Counts */}
      <div className="flex flex-col items-center justify-center space-y-1">
        <ScrapIcon
          icon={<InjuryIcon />} // Use new SVG icon
          count={injuries}
          textColor="text-yellow-400"
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

// v1.8: ThreatCard updated to show resistance/immunity
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
    // An assigned threat is unavailable. Make it semi-transparent.
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

  const KeywordPill = ({ type, scrapType }) => {
    const isImmune = type === "Immune";
    const text = isImmune
      ? `Immune: ${SCRAP_TYPES[scrapType].name}`
      : `Resist: ${SCRAP_TYPES[scrapType].name}`;
    const colors = isImmune
      ? "bg-purple-800 text-purple-100 border-purple-600"
      : `bg-opacity-50 ${SCRAP_TYPES[scrapType].bg} ${SCRAP_TYPES[scrapType].color} ${SCRAP_TYPES[scrapType].border}`;

    return (
      <span
        className={`px-1.5 py-0.5 text-[10px] font-semibold rounded-full border ${colors}`}
      >
        {text}
      </span>
    );
  };

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
        {/* v1.8: Resistance/Immunity Display */}
        <div className="flex flex-wrap gap-1 mb-2">
          {threat.immune.map((scrapType) => (
            <KeywordPill key={scrapType} type="Immune" scrapType={scrapType} />
          ))}
          {threat.resistant.map((scrapType) => (
            <KeywordPill
              key={scrapType}
              type="Resistant"
              scrapType={scrapType}
            />
          ))}
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

const ScrapIcon = ({
  image,
  icon, // Pass SVG icon here
  count,
  textColor = "text-white",
  size = "w-8 h-8",
}) => (
  <div className={`relative ${size}`}>
    {image && <img src={image} alt="scrap icon" className="w-full h-full" />}
    {icon && <div className={`w-full h-full ${textColor}`}>{icon}</div>}
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
        {/* v1.8: Show charges */}
        {card.charges && (
          <p className="text-xs font-bold text-yellow-300">
            Charges: {card.charges}
          </p>
        )}
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
// v1.8: Updated to show charges
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
      {/* v1.8: Show charges */}
      {card.charges != null && (
        <p className="text-xs font-bold text-yellow-300">
          Charges: {card.charges}
        </p>
      )}
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

const ThreatsPanel = ({
  threats,
  threatAssignments,
  onThreatSelect,
  selectableThreats,
  selectedThreatId,
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
              />
              {assignedTo && <PlayerTag username={assignedTo} />}
            </div>
          );
        })}
      </div>
    </div>
  );
};

// --- Market Panel ---
// v1.8: Updated to handle INTERMISSION phase
const MarketPanel = ({
  market,
  myTurn,
  choiceType, // "FORTIFY", "ARMORY_RUN", or "INTERMISSION"
  onCardSelect,
  playerScrap,
}) => {
  return (
    <div className="w-full h-full flex flex-col gap-2 p-2 bg-gray-800 bg-opacity-70 rounded-lg">
      <div className="flex-1 overflow-hidden">
        <UpgradesMarket
          upgrade_market={market.upgrade_market}
          myTurn={myTurn}
          choiceType={choiceType}
          onCardSelect={onCardSelect}
          playerScrap={playerScrap}
        />
      </div>
      <div className="flex-1 overflow-hidden">
        <ArsenalMarket
          arsenal_market={market.arsenal_market}
          myTurn={myTurn}
          choiceType={choiceType}
          onCardSelect={onCardSelect}
          playerScrap={playerScrap}
        />
      </div>
    </div>
  );
};

// --- Player Assets Component ---
const PlayerAssets = ({ player, isSelf, onReturn, phase }) => {
  if (!player) return null;

  const attractedThreat = player.assigned_threat;

  // Show the threat on another player's board ONLY during the DEFENSE phase.
  // During the ACTION phase, we want to see their assets, not the threat they already dealt with.
  const shouldShowThreat =
    !isSelf && attractedThreat && phase === "DEFENSE" && !player.defense_result;

  const mainContent = (
    <>
      <PlayerUpgrades player={player} />
      <PlayerArsenal player={player} />
      <PlayerTrophies player={player} />
      <LastRoundActions player={player} />
    </>
  );

  // New layout: Horizontal flex row
  return (
    <div className="w-full h-full flex items-center gap-6 overflow-x-auto px-4">
      {/* Section 1: Title and Return Button */}
      <div className="flex-shrink-0 flex flex-col items-center gap-2">
        <h3 className="text-lg font-semibold text-gray-300 whitespace-nowrap">
          {isSelf ? "Your Board" : `${player.username}'s Board`}
        </h3>
        {!isSelf && (
          <button onClick={onReturn} className="btn btn-primary btn-sm">
            &larr; Return to My Board
          </button>
        )}
      </div>

      {/* Section 2: Scraps */}
      <div className="flex-shrink-0 flex flex-col items-center p-2 rounded-lg bg-black bg-opacity-20">
        <h4 className="text-sm font-bold text-gray-400 mb-2">Scrap</h4>
        <div className="flex items-center space-x-3">
          <ScrapIcon image={scrapsParts} count={player.scrap.PARTS} />
          <ScrapIcon image={scrapsWiring} count={player.scrap.WIRING} />
          <ScrapIcon image={scrapsPlates} count={player.scrap.PLATES} />
        </div>
      </div>

      {shouldShowThreat ? (
        <div className="flex-shrink-0 flex flex-col items-center p-2 rounded-lg bg-black bg-opacity-20">
          <h4 className="text-sm font-bold text-red-400 mb-2">
            Attracted Threat
          </h4>
          <div className="w-64">
            <ThreatCard threat={attractedThreat} isAvailable={false} />
          </div>
        </div>
      ) : (
        mainContent
      )}
    </div>
  );
};

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

const PlayerArsenal = ({ player }) => (
  <div className="flex-shrink-0">
    <h4 className="text-sm font-bold text-gray-400 mb-2 text-center">
      Arsenal
    </h4>
    <div className="flex gap-2 p-2 rounded min-h-[140px] items-center bg-black bg-opacity-20">
      {player.arsenal_hand.length > 0 ? (
        player.arsenal_hand.map((card, index) => (
          <OwnedCard
            key={card.id || `hidden-${index}`}
            card={card}
            cardType="ARSENAL"
          />
        ))
      ) : (
        <p className="text-gray-500 text-sm italic px-2">Empty</p>
      )}
    </div>
  </div>
);

// v1.8: Trophies are now a list of strings (threat names). Just show a count.
const PlayerTrophies = ({ player }) => {
  const trophyCount = player.trophies.length;

  return (
    <div className="flex-shrink-0">
      <h4 className="text-sm font-bold text-gray-400 mb-2 text-center">
        Trophies
      </h4>
      <div className="flex gap-4 p-3 rounded min-h-[140px] items-center justify-center bg-black bg-opacity-20">
        {trophyCount > 0 ? (
          <div className="flex flex-col items-center text-yellow-300">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-12 w-12"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path d="M11 3a1 1 0 100 2h2.586l-6.293 6.293a1 1 0 00-1.414 1.414L10 10.414v2.586a1 1 0 102 0v-2.586l6.293-6.293a1 1 0 00-1.414-1.414L13 7.586V5a1 1 0 00-2 0v2.586l-1.293-1.293A1 1 0 008 6.586V5a1 1 0 00-2 0v1.586l-1.293-1.293A1 1 0 003.293 6.707L6 9.414V11a1 1 0 102 0V9.414l-1.293-1.293A1 1 0 005 7.414V5a1 1 0 10-2 0v2.414l-2.707 2.707A1 1 0 001 11.536V12a1 1 0 102 0v-.464l2.293-2.293A1 1 0 006 8.536V11a1 1 0 102 0V8.536l2.293-2.293A1 1 0 0011 5.536V3z" />
            </svg>
            <span className="mt-1 text-2xl font-bold">x{trophyCount}</span>
          </div>
        ) : (
          <p className="text-gray-500 text-sm italic px-2">None</p>
        )}
      </div>
    </div>
  );
};

const LastRoundActions = ({ player }) => {
  if (!player.last_round_lure && !player.last_round_action) {
    return null; // Don't show on the first round
  }

  const lureCard = LURE_CARDS.find((c) => c.id === player.last_round_lure);
  const actionCard = ACTION_CARDS.find(
    (c) => c.id === player.last_round_action
  );

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
// v1.8: Updated logic to handle INTERMISSION
const UpgradesMarket = ({
  upgrade_market,
  myTurn,
  choiceType,
  onCardSelect,
  playerScrap,
}) => {
  const canAfford = (cardCost) => {
    if (!playerScrap || !cardCost) return false;
    for (const [scrapType, cost] of Object.entries(cardCost)) {
      if ((playerScrap[scrapType] || 0) < cost) {
        return false;
      }
    }
    return true;
  };

  const isMyTurnToBuyUpgrades =
    myTurn && (choiceType === "FORTIFY" || choiceType === "INTERMISSION");
  const isMyTurnToBuy =
    myTurn &&
    (choiceType === "FORTIFY" ||
      choiceType === "ARMORY_RUN" ||
      choiceType === "INTERMISSION");

  return (
    <div className="p-3 bg-gray-800 bg-opacity-70 rounded-lg shadow-lg h-full flex items-center gap-4">
      <h2 className="text-lg font-semibold text-green-400 flex-shrink-0">
        Upgrades
      </h2>
      <div className="flex-1 flex gap-2 overflow-x-auto pb-2">
        {upgrade_market.map((card) => {
          const isAffordable = canAfford(card.cost);
          const isSelectable = isMyTurnToBuyUpgrades && isAffordable;
          const isDimmed = isMyTurnToBuy && !isSelectable;
          const clickAction =
            choiceType === "INTERMISSION"
              ? () => onCardSelect("INTERMISSION", "UPGRADE", card.id)
              : () => onCardSelect("FORTIFY", null, card.id);

          return (
            <MarketCard
              key={card.id}
              card={card}
              cardType="UPGRADE"
              isSelectable={isSelectable}
              isDimmed={isDimmed}
              onClick={() => isSelectable && clickAction()}
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
  const canAfford = (cardCost) => {
    if (!playerScrap || !cardCost) return false;
    for (const [scrapType, cost] of Object.entries(cardCost)) {
      if ((playerScrap[scrapType] || 0) < cost) {
        return false;
      }
    }
    return true;
  };

  const isMyTurnToBuyArsenal =
    myTurn && (choiceType === "ARMORY_RUN" || choiceType === "INTERMISSION");
  const isMyTurnToBuy =
    myTurn &&
    (choiceType === "FORTIFY" ||
      choiceType === "ARMORY_RUN" ||
      choiceType === "INTERMISSION");

  return (
    <div className="p-3 bg-gray-800 bg-opacity-70 rounded-lg shadow-lg h-full flex items-center gap-4">
      <h2 className="text-lg font-semibold text-red-400 flex-shrink-0">
        Arsenal
      </h2>
      <div className="flex-1 flex gap-2 overflow-x-auto pb-2">
        {arsenal_market.map((card) => {
          const isAffordable = canAfford(card.cost);
          const isSelectable = isMyTurnToBuyArsenal && isAffordable;
          const isDimmed = isMyTurnToBuy && !isSelectable;
          const clickAction =
            choiceType === "INTERMISSION"
              ? () => onCardSelect("INTERMISSION", "ARSENAL", card.id)
              : () => onCardSelect("ARMORY_RUN", null, card.id);

          return (
            <MarketCard
              key={card.id}
              card={card}
              cardType="ARSENAL"
              isSelectable={isSelectable}
              isDimmed={isDimmed}
              onClick={() => isSelectable && clickAction()}
            />
          );
        })}
      </div>
    </div>
  );
};

// --- ACTION PANEL COMPONENTS ---

const PlanningPhaseActions = ({ sendGameAction, player, playerPlans }) => {
  const [lure, setLure] = useState(null);
  const [action, setAction] = useState(null);
  const handleSubmit = () => {
    if (lure && action) {
      sendGameAction("submit_plan", { lure, action });
    }
  };

  // Auto-select first available if none selected
  useEffect(() => {
    if (!lure) {
      const firstAvailableLure = LURE_CARDS.find(
        (c) => c.id !== player.last_round_lure
      );
      if (firstAvailableLure) setLure(firstAvailableLure.id);
    }
    if (!action) {
      setAction(ACTION_CARDS[0].id);
    }
  }, [player.last_round_lure, lure, action]);

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
      <div className="p-4 bg-black bg-opacity-25 rounded-lg">
        <p className="text-gray-300 pt-3 border-t border-gray-600 text-sm">
          Choose your Lure and Action cards:
        </p>
        <div className="mb-3">
          <label className="block text-gray-300 mb-2 font-semibold text-sm">
            Choose a Lure Card (Cannot repeat last round's)
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
        disabled={!lure || !action}
        className="w-full btn btn-primary text-lg mt-3"
      >
        Submit Plan
      </button>
    </div>
  );
};

// v1.8: AttractionPhaseActions base defense calculation updated
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

  if (!myPlan) {
    return (
      <div className="text-center p-4">
        <h3 className="text-lg text-yellow-400">Loading attraction state...</h3>
      </div>
    );
  }
  const myLure = myPlan.lure_card;

  // v1.8: Base defense is from CHOSEN action card
  const baseDefense = useMemo(() => {
    if (!player || !myPlan || !myPlan.action_card) {
      return { PARTS: 0, WIRING: 0, PLATES: 0 };
    }
    const chosenAction = myPlan.action_card;
    const cardDefense = BASE_DEFENSE_FROM_ACTION[chosenAction] || {
      PARTS: 0,
      WIRING: 0,
      PLATES: 0,
    };

    const upgradeDefense = { PARTS: 0, WIRING: 0, PLATES: 0 };
    player.upgrades.forEach((upgrade) => {
      if (upgrade.permanent_defense) {
        upgradeDefense.PARTS += upgrade.permanent_defense.PARTS || 0;
        upgradeDefense.WIRING += upgrade.permanent_defense.WIRING || 0;
        upgradeDefense.PLATES += upgrade.permanent_defense.PLATES || 0;
      }
      // TODO: Handle Scrap Repeater
    });
    return {
      PARTS: cardDefense.PARTS + upgradeDefense.PARTS,
      WIRING: cardDefense.WIRING + upgradeDefense.WIRING,
      PLATES: cardDefense.PLATES + upgradeDefense.PLATES,
    };
  }, [player, myPlan]);

  const handleSubmit = () => {
    if (canConfirm) {
      sendGameAction("select_threat", { threat_id: selectedThreatId });
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
      <div className="p-2 bg-gray-600 bg-opacity-80 rounded text-center">
        <h4 className="text-base text-white font-semibold">
          Current Base Defense
        </h4>
        <p className="text-gray-200 text-xs">(from chosen action + upgrades)</p>
        <p className="text-lg font-semibold flex justify-center space-x-4">
          <span className="text-red-400">Fe: {baseDefense.PARTS}</span>
          <span className="text-blue-400">Cu: {baseDefense.WIRING}</span>
          <span className="text-green-400">Ma: {baseDefense.PLATES}</span>
        </p>
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

// v1.8: DefensePhaseActions completely rewritten
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

  // 1. Get Base Defense (from chosen action + permanent upgrades)
  const baseDefense = useMemo(() => {
    if (!player || !playerPlans || !playerPlans.action_card) {
      return { PARTS: 0, WIRING: 0, PLATES: 0 };
    }
    const chosenAction = playerPlans.action_card;
    const cardDefense = BASE_DEFENSE_FROM_ACTION[chosenAction] || {
      PARTS: 0,
      WIRING: 0,
      PLATES: 0,
    };

    const upgradeDefense = { PARTS: 0, WIRING: 0, PLATES: 0 };
    player.upgrades.forEach((upgrade) => {
      if (upgrade.permanent_defense) {
        upgradeDefense.PARTS += upgrade.permanent_defense.PARTS || 0;
        upgradeDefense.WIRING += upgrade.permanent_defense.WIRING || 0;
        upgradeDefense.PLATES += upgrade.permanent_defense.PLATES || 0;
      }
      // TODO: Handle Scrap Repeater
    });
    return {
      PARTS: cardDefense.PARTS + upgradeDefense.PARTS,
      WIRING: cardDefense.WIRING + upgradeDefense.WIRING,
      PLATES: cardDefense.PLATES + upgradeDefense.PLATES,
    };
  }, [player, playerPlans]);

  // 2. Calculate Scrap Value (factoring in threat and upgrades)
  const getScrapValue = (scrapType, threat, upgrades) => {
    if (!threat) return 2; // Default if no threat
    if (threat.immune.includes(scrapType)) return 0;

    let value = threat.resistant.includes(scrapType) ? 1 : 2;

    // Check for upgrades
    if (scrapType === "PARTS") {
      if (
        value === 1 &&
        upgrades.some((u) => u.special_effect_id === "PIERCING_JAWS")
      ) {
        value = 2; // Ignores resistance
      }
      if (upgrades.some((u) => u.special_effect_id === "SERRATED_PARTS")) {
        value += 1;
      }
    } else if (scrapType === "WIRING") {
      if (
        value === 1 &&
        upgrades.some((u) => u.special_effect_id === "FOCUSED_WIRING")
      ) {
        value = 2;
      }
      if (upgrades.some((u) => u.special_effect_id === "HIGH_VOLTAGE_WIRE")) {
        value += 1;
      }
    } else if (scrapType === "PLATES") {
      if (
        value === 1 &&
        upgrades.some((u) => u.special_effect_id === "REINFORCED_PLATING")
      ) {
        value = 2;
      }
      if (upgrades.some((u) => u.special_effect_id === "LAYERED_PLATING")) {
        value += 1;
      }
    }
    return value;
  };

  const scrapValues = useMemo(() => {
    return {
      PARTS: getScrapValue("PARTS", threat, player.upgrades),
      WIRING: getScrapValue("WIRING", threat, player.upgrades),
      PLATES: getScrapValue("PLATES", threat, player.upgrades),
    };
  }, [threat, player.upgrades]);

  // 3. Calculate Total Defense
  const totalDefense = useMemo(() => {
    const spentParts = Number(parts) || 0;
    const spentWiring = Number(wiring) || 0;
    const spentPlates = Number(plates) || 0;

    // TODO: Add Arsenal Card logic
    return {
      PARTS: baseDefense.PARTS + spentParts * scrapValues.PARTS,
      WIRING: baseDefense.WIRING + spentWiring * scrapValues.WIRING,
      PLATES: baseDefense.PLATES + spentPlates * scrapValues.PLATES,
    };
  }, [baseDefense, parts, wiring, plates, scrapValues]);

  // 4. Determine Outcome (v1.8 rules)
  const defenseOutcome = useMemo(() => {
    if (!threat) return { text: "N/A", style: "bg-gray-700" };

    const meetsFerocity = totalDefense.PARTS >= threat.ferocity;
    const meetsCunning = totalDefense.WIRING >= threat.cunning;
    const meetsMass = totalDefense.PLATES >= threat.mass;

    const highestStat = Math.max(threat.ferocity, threat.cunning, threat.mass);
    // TODO: Handle "Lure to Weakness" Arsenal card
    let meetsHighest = false;
    if (meetsFerocity && threat.ferocity === highestStat) meetsHighest = true;
    if (meetsCunning && threat.cunning === highestStat) meetsHighest = true;
    if (meetsMass && threat.mass === highestStat) meetsHighest = true;

    if (meetsHighest) {
      return {
        text: "KILL",
        style: "bg-green-700 text-green-100",
      };
    }
    if (meetsFerocity || meetsCunning || meetsMass) {
      return {
        text: "DEFEND",
        style: "bg-blue-700 text-blue-100",
      };
    }
    return {
      text: "FAIL",
      style: "bg-red-800 text-red-100",
    };
  }, [totalDefense, threat]);

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
      <div className="text-center p-2 bg-black bg-opacity-25 rounded-lg">
        <p className="text-lg text-blue-300 animate-pulse">Defend your camp!</p>
        <p className="text-sm text-gray-200">
          Spend scrap to bolster your defenses.
        </p>
        <p className="text-xs text-gray-400">
          Meet one stat to DEFEND. Meet the highest stat to KILL.
        </p>
      </div>

      {/* --- Total Defense & Outcome --- */}
      <div className="p-3 bg-black bg-opacity-30 rounded-lg border border-gray-600">
        <div className="grid grid-cols-3 gap-2 text-center mb-3">
          {/* Ferocity */}
          <div>
            <p className="text-red-400 font-semibold">Ferocity</p>
            <p className="text-2xl font-bold">{totalDefense.PARTS}</p>
            <p className="text-sm text-gray-400">vs {threat.ferocity}</p>
          </div>
          {/* Cunning */}
          <div>
            <p className="text-blue-400 font-semibold">Cunning</p>
            <p className="text-2xl font-bold">{totalDefense.WIRING}</p>
            <p className="text-sm text-gray-400">vs {threat.cunning}</p>
          </div>
          {/* Mass */}
          <div>
            <p className="text-green-400 font-semibold">Mass</p>
            <p className="text-2xl font-bold">{totalDefense.PLATES}</p>
            <p className="text-sm text-gray-400">vs {threat.mass}</p>
          </div>
        </div>
        <div
          className={`p-2 rounded-md text-center font-bold text-lg ${defenseOutcome.style}`}
        >
          Projected Outcome: {defenseOutcome.text}
        </div>
      </div>

      <p className="text-gray-300 pt-3 border-t border-gray-600 text-sm">
        Spend Scrap to defend:
      </p>
      <div className="flex flex-col sm:flex-row justify-around space-y-3 sm:space-y-0 sm:space-x-2">
        <div className="flex-1 text-center sm:text-left">
          <label className="block text-red-400 text-sm">
            Parts (+{scrapValues.PARTS} / scrap)
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
            Wiring (+{scrapValues.WIRING} / scrap)
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
            Plates (+{scrapValues.PLATES} / scrap)
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
// v1.8: Updated to check for Scavenger's Eye
const ScavengeChoiceModal = ({ onConfirm, player }) => {
  const hasScavEye = player.upgrades.some(
    (u) => u.special_effect_id === "SCAVENGERS_EYE"
  );
  const scrapToChoose = hasScavEye ? 3 : 2;

  const [selection, setSelection] = useState([]);
  const canConfirm = selection.length === scrapToChoose;

  const handleSelect = (scrapType) => {
    if (selection.length < scrapToChoose) {
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
          Choose {scrapToChoose} scrap from the supply
          {hasScavEye && " (Scavenger's Eye)"}:
        </p>
        <div className="flex justify-center space-x-4 mb-4">
          <button
            onClick={() => handleSelect("PARTS")}
            disabled={!canConfirm && selection.length >= scrapToChoose}
            className="btn btn-danger px-4 py-2"
          >
            Parts (Red)
          </button>
          <button
            onClick={() => handleSelect("WIRING")}
            disabled={!canConfirm && selection.length >= scrapToChoose}
            className="btn btn-info px-4 py-2"
          >
            Wiring (Blue)
          </button>
          <button
            onClick={() => handleSelect("PLATES")}
            disabled={!canConfirm && selection.length >= scrapToChoose}
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

  // v1.8: Check for "action_prevented" flag
  if (isMyTurn && player.action_prevented) {
    return (
      <div className="space-y-3 p-3 bg-gray-700 bg-opacity-80 rounded-lg">
        <div className="text-center p-2 bg-black bg-opacity-25 rounded-lg">
          <p className="text-lg text-red-500">Your Action was Prevented!</p>
          <p className="text-sm text-gray-200">
            A threat's "On Fail" ability prevented you from taking your (
            {myChoice}) action this round.
          </p>
        </div>
      </div>
    );
  }

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
      {myChoice === "SCAVENGE" && isMyTurn && (
        <ScavengeChoiceModal
          onConfirm={handleScavengeConfirm}
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
            Select a card from the market (panel on left) or take the fallback.
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

// --- v1.8: New Intermission Phase Panel ---
const IntermissionPhaseActions = ({ sendGameAction, player, gameState }) => {
  const { intermission_turn_player_id, players } = gameState;
  const isMyTurn = player.user_id === intermission_turn_player_id;
  const myChoice = player.action_choice_pending;

  const handleSkip = () => {
    sendGameAction("submit_action_choice", {
      choice_type: "INTERMISSION",
      card_id: null,
    });
  };

  const currentPlayerName =
    players[intermission_turn_player_id]?.username || "A player";

  return (
    <div className="space-y-3 p-3 bg-gray-700 bg-opacity-80 rounded-lg">
      <div className="text-center p-2 bg-black bg-opacity-25 rounded-lg">
        {isMyTurn ? (
          <>
            <p className="text-lg text-blue-300 animate-pulse">
              It's your Intermission turn!
            </p>
            <p className="text-sm text-gray-200">
              You may buy one card from the market.
            </p>
            <p className="text-xs text-gray-400">Phase: INTERMISSION</p>
          </>
        ) : (
          <p className="text-lg text-yellow-300">
            Waiting for {currentPlayerName} to take their intermission action...
          </p>
        )}
      </div>

      {isMyTurn && (
        <div className="pt-3 border-t border-gray-600 text-center">
          <p className="text-gray-300 mb-2">
            Select a card from the market (panel on left) or skip.
          </p>
          <button onClick={handleSkip} className="btn btn-secondary">
            Skip Action
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
  const [viewingPlayerId, setViewingPlayerId] = useState(null);
  const [activePanel, setActivePanel] = useState("threats"); // "threats" or "market"
  const [selectedThreatId, setSelectedThreatId] = useState(null);
  const [isLogCollapsed, setIsLogCollapsed] = useState(false);

  // --- *** FIX *** ---
  // DERIVED STATE (self, plans, defense)
  // MUST be declared before any useEffects or handlers that use them.
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
  // --- *** END FIX *** ---

  // NEW: Stable portrait mapping
  const playerPortraitsMap = useMemo(() => {
    if (!gameState?.players) return {};

    // Get player IDs and sort them alphabetically.
    // This ensures that each player ID is *always* mapped to the same icon
    // index, regardless of turn order (initiative_queue).
    const playerIds = Object.keys(gameState.players).sort();

    const portraits = {};
    playerIds.forEach((pid, index) => {
      portraits[pid] = playerPortraits[index % playerPortraits.length];
    });
    return portraits;
  }, [gameState?.players]); // Re-calculate only if the players object itself changes (e.g., on load)

  // NEW: Effect to set viewing player to self on load
  useEffect(() => {
    if (user?.id && !viewingPlayerId) {
      setViewingPlayerId(user.id);
    }

    // Automatically switch panel view based on game state
    if (gameState?.phase === "ACTION" && self?.action_choice_pending) {
      if (["FORTIFY", "ARMORY_RUN"].includes(self.action_choice_pending)) {
        setActivePanel("market");
      }
    } else if (
      gameState?.phase === "INTERMISSION" &&
      self?.action_choice_pending === "INTERMISSION"
    ) {
      setActivePanel("market");
    } else if (
      gameState?.phase === "PLANNING" ||
      gameState?.phase === "ATTRACTION"
    ) {
      setActivePanel("threats");
    }
  }, [
    user?.id,
    viewingPlayerId,
    gameState?.phase,
    self?.action_choice_pending,
  ]);

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

  // Spectator / eliminated logic
  const isPureSpectator = !self;
  const hasLeft = self && self.status !== "ACTIVE";
  const isSpectator = isPureSpectator || hasLeft;

  if (!self && !isSpectator) {
    // Gracefully handle case where user is not a player but not yet marked as spectator
    return (
      <div
        className="flex justify-center items-center min-h-screen bg-gray-900 text-white bg-cover bg-top bg-fixed"
        style={{ backgroundImage: `url(${gameBackground})` }}
      >
        Loading player data...
      </div>
    );
  }

  const {
    phase,
    log,
    initiative_queue,
    current_threats,
    attraction_turn_player_id,
    action_turn_player_id,
    intermission_turn_player_id, // v1.8
    player_plans,
    player_defenses,
    market,
    era, // v1.8
    round, // v1.8
  } = gameState;
  const canConfirmThreat = selectedThreatId !== null;

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
            : ["DEFENSE", "ACTION", "CLEANUP", "INTERMISSION"].includes(phase);
        newPlans[pid].is_lure_revealed = isLureRevealed;

        // Action Card Reveal Logic
        const isActionRevealed =
          phase === "ACTION"
            ? index <= actionTurnIndex
            : ["CLEANUP", "INTERMISSION"].includes(phase);
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

  const threatAssignments = useMemo(() => {
    const assignments = {};
    if (!gameState.players) return assignments;
    Object.values(gameState.players).forEach((p) => {
      if (p.assigned_threat && p.defense_result !== "KILL") {
        // Don't show assignment if killed
        assignments[p.assigned_threat.id] = p.username;
      }
    });
    return assignments;
  }, [gameState.players]);

  const selectableThreats = useMemo(() => {
    if (phase !== "ATTRACTION" || self?.user_id !== attraction_turn_player_id) {
      return [];
    }
    const myPlan = player_plans[self.user_id];
    if (!myPlan) return [];

    const available = current_threats.filter((t) =>
      gameState.available_threat_ids.includes(t.id)
    );
    const matching = available.filter((t) => t.lure === myPlan.lure_card);

    if (gameState.attraction_phase_state === "FIRST_PASS") {
      return matching;
    } else {
      // Second pass: can take any, but must take one if available
      return available;
    }
  }, [
    phase,
    self,
    attraction_turn_player_id,
    player_plans,
    current_threats,
    gameState.available_threat_ids,
    gameState.attraction_phase_state,
  ]);

  // v1.8: Logic for what threats to show.
  const threatsToShow = useMemo(() => {
    const viewingPlayer = viewingPlayerId && gameState.players[viewingPlayerId];

    // If we are viewing a player (including self) who has an assigned threat
    // AND it's the defense phase, only show their threat.
    if (
      viewingPlayer &&
      viewingPlayer.assigned_threat &&
      phase === "DEFENSE" &&
      !viewingPlayer.defense_result
    ) {
      return [viewingPlayer.assigned_threat];
    }
    // Otherwise, show all *unassigned* threats
    return current_threats.filter((t) => !threatAssignments[t.id]);
  }, [
    viewingPlayerId,
    gameState.players,
    current_threats,
    phase,
    threatAssignments,
  ]);

  const getPlayerTurnStatus = (playerId) => {
    if (phase === "ATTRACTION") {
      if (playerId === attraction_turn_player_id) return "ACTIVE";
      const hasActed = !gameState.unassigned_player_ids.includes(playerId);
      return hasActed ? "WAITING" : "PENDING";
    }
    if (phase === "ACTION") {
      if (playerId === action_turn_player_id) return "ACTIVE";
      const myIndex = initiative_queue.indexOf(playerId);
      const turnIndex = initiative_queue.indexOf(action_turn_player_id);
      if (turnIndex === -1) return "PENDING";
      return myIndex < turnIndex ? "WAITING" : "PENDING";
    }
    // v1.8: Intermission
    if (phase === "INTERMISSION") {
      if (playerId === intermission_turn_player_id) return "ACTIVE";
      const hasActed = gameState.intermission_players_acted.includes(playerId);
      return hasActed ? "WAITING" : "PENDING";
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

  const handleMarketCardSelect = (choiceType, marketType, cardId) => {
    // v1.8: Handle Intermission
    if (choiceType === "INTERMISSION") {
      sendGameAction("submit_action_choice", {
        choice_type: "INTERMISSION",
        market_type: marketType, // "UPGRADE" or "ARSENAL"
        card_id: cardId,
      });
    } else {
      // Handle Fortify/Armory Run
      sendGameAction("submit_action_choice", {
        choice_type: choiceType,
        card_id: cardId,
      });
    }
  };

  const handleThreatSelect = (threatId) => {
    if (phase === "ATTRACTION" && self?.user_id === attraction_turn_player_id) {
      setSelectedThreatId(threatId);
    }
  };

  const eraNames = { 1: "Day", 2: "Twilight", 3: "Night" };

  return (
    <div
      className="h-screen w-screen text-white bg-cover bg-center bg-fixed flex flex-col"
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
          message="Are you sure you want to surrender? You will be able to spectate, but cannot win."
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
        {/* v1.8: Era/Round Display */}
        <div className="flex-grow text-center">
          <span className="text-xl font-bold text-yellow-300 bg-black bg-opacity-50 px-4 py-1 rounded">
            Era: {eraNames[era]} | Round: {round} / 5
          </span>
        </div>
        <div className="space-x-2">
          {!isSpectator && (
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
          const player = gameState.players[pid];
          if (!player) return null; // Handle player leaving
          const isViewing = pid === viewingPlayerId;
          return (
            <React.Fragment key={pid}>
              <PlayerCard
                player={player}
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
      <main
        className="flex-grow flex gap-2 p-2 overflow-hidden"
        style={{ height: "55vh" }}
      >
        {/* Left Column (Panel Selection) */}
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

        {/* Center Column (flex-grow) */}
        <div className="flex-grow h-full overflow-y-auto">
          {isPureSpectator ? (
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
          ) : hasLeft ? (
            <div className="text-center p-4 bg-gray-800 bg-opacity-70 rounded-lg">
              <p className="text-lg text-yellow-300 mb-4">
                You have {self.status.toLowerCase()}. You can continue watching.
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
            <div className="flex h-full gap-2">
              {/* Threats/Market Panel */}
              <div className="w-1/2 h-full overflow-y-auto">
                {activePanel === "threats" && (
                  <ThreatsPanel
                    threats={threatsToShow}
                    threatAssignments={threatAssignments}
                    onThreatSelect={handleThreatSelect}
                    selectableThreats={selectableThreats}
                    selectedThreatId={selectedThreatId}
                  />
                )}
                {activePanel === "market" && (
                  <MarketPanel
                    market={market}
                    myTurn={
                      self.user_id === action_turn_player_id ||
                      self.user_id === intermission_turn_player_id
                    }
                    choiceType={self.action_choice_pending}
                    onCardSelect={handleMarketCardSelect}
                    playerScrap={self.scrap}
                  />
                )}
              </div>
              {/* Action/Instruction Panel */}
              <div className="w-1/2 h-full overflow-y-auto">
                {phase === "PLANNING" && (
                  <PlanningPhaseActions
                    sendGameAction={sendGameAction}
                    player={self}
                    playerPlans={selfPlans}
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
                {/* v1.8: Intermission */}
                {phase === "INTERMISSION" && (
                  <IntermissionPhaseActions
                    sendGameAction={sendGameAction}
                    player={self}
                    gameState={gameState}
                  />
                )}
                {["CLEANUP", "WILDERNESS", "GAME_OVER"].includes(phase) && (
                  <div className="text-center p-4 bg-gray-800 bg-opacity-70 rounded-lg">
                    <h3 className="text-xl text-gray-300">Phase: {phase}</h3>
                    <p className="text-gray-400">Resolving game state...</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right Column (Game Log) */}
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

      {/* --- Bottom Bar (15% height) --- */}
      <footer
        className="flex-shrink-0 p-1 bg-black bg-opacity-20"
        style={{ height: "20vh" }}
      >
        <div className="w-full h-full bg-black bg-opacity-20 rounded-lg p-2">
          <PlayerAssets
            player={viewingPlayerId ? gameState.players[viewingPlayerId] : null}
            isSelf={viewingPlayerId === user.id}
            onReturn={() => setViewingPlayerId(user.id)}
            phase={phase}
          />
        </div>
      </footer>
    </div>
  );
};

export default GamePage;
