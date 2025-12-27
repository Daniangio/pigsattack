import React, { useState, useMemo } from "react";
import { Trophy, Flame, Zap, Shield, Skull } from "lucide-react";
import ResourcePip from "../ui/ResourcePip";
import StanceModal from "./StanceModal";
import { MarketData } from "../../state/market";
import { setHoverPreview } from "../hover/HoverPreviewPortal";
import { stanceColorRing } from "../../utils/stanceColorRing";
import { STANCE_CONFIG } from "../../utils/stanceConfig";
import { ResourceIcon } from "../resources/ResourceCost";
import { normalizeStance } from "../../utils/formatters";
import {
  playerIcon1,
  playerIcon2,
  playerIcon3,
  playerIcon4,
  playerIcon5,
  scavengeCard,
  schemeCard,
} from "../../pages/game/GameConstants";
import ferocityToken from "../../images/icons/ferocity-token.png";
import conversionToken from "../../images/icons/conversion-token.png";
import massToken from "../../images/icons/mass-token.png";
import wildToken from "../../images/icons/wild-token.png";

const resolveDefaultIcon = (id, idx = 0, pool = []) => {
  if (!pool?.length) return null;
  if (id) {
    const str = String(id);
    let sum = 0;
    for (let i = 0; i < str.length; i += 1) {
      sum += str.charCodeAt(i);
    }
    return pool[sum % pool.length];
  }
  return pool[idx % pool.length];
};

export default function PlayerBoardBottom({
  player,
  era,
  players,
  setPlayers,
  activePlayerId,
  stanceMenuOpen,
  onToggleStance,
  onCloseStance,
  onAttemptStanceChange,
  cardCatalog = [],
  onExtendSlot,
  canChangeStance = true,
  resourceOverride = null,
  onCardToggleForFight,
  onTokenToggleForFight,
  onConvertToken,
  onActivateCard,
  onPickToken,
  canPickToken = false,
  mainActionUsed = false,
  buyUsed = false,
  extendUsed = false,
  onEndTurn,
  onSurrender,
  isMyBoard = false,
  isMyTurnGlobal = false,
  isFollowingActive = false,
  onFollowActivePlayer,
  onViewMyBoard,
  activeUsedMap = {},
  stagedFightCards,
  stagedFightTokens,
}) {
  if (!player) return null;

  const [collapsed, setCollapsed] = useState(false);
  const [conversionOpen, setConversionOpen] = useState(false);
  const currentStance = player.stance;
  const stanceInfo = STANCE_CONFIG[currentStance] || STANCE_CONFIG[normalizeStance(currentStance)];
  const wildTokens = player?.tokens?.wild ?? player?.tokens?.WILD ?? 0;
  const freeStanceChanges = player?.freeStanceChanges ?? player?.free_stance_changes ?? 0;
  const canUseFreeStanceChange = freeStanceChanges > 0;
  const isActiveTurn = activePlayerId === player.id;
  const canExtendThisTurn = isMyBoard && isActiveTurn && !extendUsed && wildTokens > 0;
  const playerIndex = useMemo(
    () => (players || []).findIndex((p) => p.id === player.id),
    [players, player.id]
  );
  const playerIcons = [playerIcon1, playerIcon2, playerIcon3, playerIcon4, playerIcon5];
  const playerIconImg =
    player.icon || resolveDefaultIcon(player.id, playerIndex >= 0 ? playerIndex : 0, playerIcons);
  const cardLookup = useMemo(() => {
    const source = (cardCatalog && cardCatalog.length ? cardCatalog : [...MarketData.upgrades, ...MarketData.weapons]);
    // Also include the player's owned cards so preview works even if not in market catalog
    const owned = [...(player.upgrades || []), ...(player.weapons || [])];
    const baseMap = source.reduce((map, card) => {
      if (card.name) map[card.name] = card;
      if (card.id) map[card.id] = card;
      return map;
    }, {});
    return owned.reduce((map, card) => {
      if (!card) return map;
      const entry = typeof card === "string" ? { id: card, name: card } : card;
      if (entry.name) map[entry.name] = entry;
      if (entry.id) map[entry.id] = entry;
      return map;
    }, baseMap);
  }, [cardCatalog, player.upgrades, player.weapons]);
  const previewCard = (cardName, lock = false) => {
    const card = cardLookup[cardName];
    if (!card) return;
    const hasActive =
      Array.isArray(card.tags) &&
      card.tags.some((t) => t.startsWith("active:mass_token") || t.startsWith("active:convert_split"));
    const alreadyUsed = activeUsedMap?.[card.id] || false;
    const canUseActive = hasActive && isMyBoard && !alreadyUsed;
    setHoverPreview({
      type: "market",
      data: card,
      sourceId: card.id,
      lock,
      secondaryAction: canUseActive
        ? {
            label: "Activate",
            disabled: false,
            onClick: () => {
              setHoverPreview(null);
              setActiveCard(card);
              setSelectedActiveToken(null);
              setSelectedActiveResource(null);
            },
          }
        : undefined,
    });
  };
  const clearPreview = () => setHoverPreview(null);
  const tokenLabels = {
    attack: "Attack",
    conversion: "Conversion",
    mass: "Mass",
    wild: "Wild",
  };
  const tokenStyles = {
    attack: { bg: "bg-red-900/60", border: "border-red-800", text: "text-red-200", img: ferocityToken },
    conversion: { bg: "bg-blue-900/60", border: "border-blue-800", text: "text-blue-200", img: conversionToken },
    mass: { bg: "bg-green-900/60", border: "border-green-800", text: "text-green-200", img: massToken },
    wild: { bg: "bg-amber-900/60", border: "border-amber-700", text: "text-amber-200", img: wildToken },
  };
  const resolveCard = (entry) => {
    if (!entry) return null;
    if (typeof entry === "string") return cardLookup[entry] || { id: entry, name: entry };
    if (entry.name) return entry;
    return { id: entry.id || "unknown", name: "Unknown Card" };
  };
  const ownedCards = [...(player.upgrades || []), ...(player.weapons || [])]
    .map(resolveCard)
    .filter(Boolean);
  const stanceTextColor = {
    Aggressive: "text-red-400",
    AGGRESSIVE: "text-red-400",
    Tactical: "text-blue-400",
    TACTICAL: "text-blue-400",
    Hunkered: "text-green-400",
    HUNKERED: "text-green-400",
    Balanced: "text-amber-300",
    BALANCED: "text-amber-300",
  }[currentStance] || "text-slate-200";
  const showReturnToMyBoard = !!onViewMyBoard && !isMyBoard;
  const showFollowActive = !!onFollowActivePlayer && !isFollowingActive && !(isMyBoard && isMyTurnGlobal);

  const maxSlots = 5;
  const upgradeSlots = Math.min(player.upgradeSlots ?? maxSlots, maxSlots);
  const weaponSlots = Math.min(player.weaponSlots ?? maxSlots, maxSlots);
  const upgradeCards = (player.upgrades || []).map(resolveCard).filter(Boolean);
  const weaponCards = (player.weapons || []).map(resolveCard).filter(Boolean);
  const stanceProduction = stanceInfo?.production || { R: 0, B: 0, G: 0 };

  const upgradeProduction = useMemo(() => {
    const prod = { R: 0, B: 0, G: 0 };
    const resMap = { R: "R", B: "B", G: "G" };
    const stanceRes = {
      Aggressive: "R",
      AGGRESSIVE: "R",
      Tactical: "B",
      TACTICAL: "B",
      Hunkered: "G",
      HUNKERED: "G",
      Balanced: null,
      BALANCED: null,
    }[currentStance];

    const resources = player.resources || {};
    const lowestRes = (() => {
      const entries = Object.entries(resMap).map(([k, v]) => ({ key: v, val: resources[v] || 0 }));
      const minVal = Math.min(...entries.map((e) => e.val));
      const lowest = entries.filter((e) => e.val === minVal).map((e) => e.key);
      if (lowest.includes("B")) return "B";
      return lowest[0] || "R";
    })();

    upgradeCards.forEach((card) => {
      const tags = card.tags || [];
      tags.forEach((tag) => {
        if (typeof tag !== "string") return;
        if (tag.startsWith("production:")) {
          const payload = tag.replace("production:", "");
          const parts = payload.split(":");
          if (parts[0] === "stance") {
            const amt = parseInt(parts[1], 10);
            if (!isNaN(amt)) {
              const target = stanceRes || "B"; // Balanced defaults to Blue
              prod[target] = (prod[target] || 0) + amt;
            }
          } else if (parts[0] === "lowest") {
            const amt = parseInt(parts[1], 10);
            if (!isNaN(amt)) {
              prod[lowestRes] = (prod[lowestRes] || 0) + amt;
            }
          } else {
            const tagEra = parts[1]?.toLowerCase();
            const resKey = parts[0]?.[0]?.toUpperCase?.();
            const amt = parseInt(parts[0]?.slice(1), 10);
            if (resKey && !isNaN(amt) && resMap[resKey]) {
              const activeEra = (era || player?.era || "").toLowerCase();
              if (!tagEra || activeEra === tagEra) {
                prod[resKey] = (prod[resKey] || 0) + amt;
              }
            }
          }
        }
      });
    });
    return prod;
  }, [currentStance, player?.resources, player?.era, era, upgradeCards]);

  const totalProduction = {
    R: (stanceProduction.R || 0) + (upgradeProduction.R || 0),
    B: (stanceProduction.B || 0) + (upgradeProduction.B || 0),
    G: (stanceProduction.G || 0) + (upgradeProduction.G || 0),
  };
  const modalPlayers = players;
  const stagedUpgrades = stagedFightCards?.upgrades || new Set();
  const stagedWeapons = stagedFightCards?.weapons || new Set();
  const stagedAttackTokens = stagedFightTokens?.attack || 0;
  const stagedWildAllocation = stagedFightTokens?.wild || { R: 0, B: 0, G: 0 };
  const stagedWildTotal = Object.values(stagedWildAllocation || {}).reduce((a, b) => a + (b || 0), 0);
  const stagedMass = stagedFightTokens?.massUsed || 0;
  const effectiveResources = resourceOverride || player.resources || {};
  const [conversionAmounts, setConversionAmounts] = useState({});
  const [activeCard, setActiveCard] = useState(null);
  const [selectedActiveToken, setSelectedActiveToken] = useState(null);
  const [selectedActiveResource, setSelectedActiveResource] = useState(null);
  const conversionOptions = useMemo(() => {
    const keys = [
      { key: "R", icon: <Flame size={14} className="text-red-400" /> },
      { key: "B", icon: <Zap size={14} className="text-blue-400" /> },
      { key: "G", icon: <Shield size={14} className="text-green-400" /> },
    ];
    const res = effectiveResources;
    const opts = [];
    keys.forEach((from) => {
      keys.forEach((to) => {
        if (from.key === to.key) return;
        const maxAmount = Math.min(3, res[from.key] || 0);
        if (maxAmount <= 0) return;
        opts.push({ from: from.key, to: to.key, maxAmount, fromIcon: from.icon, toIcon: to.icon });
      });
    });
    return opts;
  }, [effectiveResources]);

  const renderSlots = (cards, availableSlots, type) => {
    const slots = [];
    for (let i = 0; i < maxSlots; i++) {
      const card = cards[i];
      const available = i < availableSlots;
      const isLocked = !available;
      const isNextLocked = i === availableSlots && onExtendSlot;
      const baseClasses = "h-12 rounded-lg border flex flex-col justify-between p-1 text-[8px] leading-tight";
      if (card) {
        const isStaged =
          type === "upgrade"
            ? stagedUpgrades.has(card.id) || stagedUpgrades.has(card.name)
            : stagedWeapons.has(card.id) || stagedWeapons.has(card.name);
        const handleCardClick = () => {
          if (onCardToggleForFight) {
            onCardToggleForFight({ ...card, type: type === "upgrade" ? "Upgrade" : "Weapon" });
          } else {
            previewCard(card.id || card.name, true);
          }
        };
        slots.push(
          <div
            key={`${type}-${i}`}
            className={`${baseClasses} bg-slate-900 border-slate-700 cursor-pointer ${isStaged ? "border-emerald-400" : ""}`}
            onMouseEnter={() => previewCard(card.id || card.name)}
            onMouseLeave={clearPreview}
            onClick={handleCardClick}
          >
            <div className="flex justify-between items-center text-[10px] text-slate-400 gap-1">
              <span className="uppercase tracking-[0.08em] truncate max-w-[70%]">{card.name}</span>
              {card.vp && (
                <span className="text-amber-300 font-semibold whitespace-nowrap">{card.vp} VP</span>
              )}
            </div>
            <div className="text-emerald-300 text-[10px] leading-tight truncate">Effect: {card.effect}</div>
            {card.uses && <div className="text-[10px] text-slate-400">Uses: {card.uses}</div>}
          </div>
        );
      } else if (isLocked) {
        const canExtendSlot = isNextLocked && onExtendSlot && canExtendThisTurn;
        const extendHint = isNextLocked
          ? !isMyBoard
            ? "Only the active player can extend slots."
            : extendUsed
              ? "Extend slot already used this turn."
              : wildTokens <= 0
                ? "Need a Wild token to extend."
                : `Spend 1 Wild to unlock this ${type} slot.`
          : "";
        const chipBase = "px-2 py-1 text-[10px] rounded-md border uppercase tracking-[0.16em]";
        const chipTint = canExtendSlot
          ? "border-amber-400 text-amber-200 bg-amber-400/10 hover:border-amber-300"
          : "border-slate-700 text-slate-500 bg-slate-900/60 cursor-not-allowed";
        slots.push(
          <div
            key={`${type}-${i}`}
            className={`${baseClasses} bg-slate-900/40 border-dashed border-slate-800 text-slate-500 flex flex-col items-center justify-center gap-1 ${
              canExtendSlot ? "cursor-pointer hover:border-amber-400" : isNextLocked ? "opacity-60" : ""
            }`}
            onClick={() => {
              if (canExtendSlot) {
                onExtendSlot?.(type);
              }
            }}
            title={extendHint}
          >
            <span>Locked</span>
            {isNextLocked && (
              <button
                type="button"
                className={`${chipBase} ${chipTint} tracking-[0.1em]`}
                onClick={(e) => {
                  e.stopPropagation();
                  if (canExtendSlot) {
                    onExtendSlot?.(type);
                  }
                }}
                disabled={!canExtendSlot}
                title={extendHint || "Spend 1 Wild token"}
              >
                Wild (1)
              </button>
            )}
          </div>
        );
      } else {
        slots.push(
          <div
            key={`${type}-${i}`}
            className={`${baseClasses} bg-slate-900/60 border-slate-700 text-slate-500 flex items-center justify-center`}
          >
            Empty
          </div>
        );
      }
    }
    return slots;
  };

  const tokenChipClass = "px-2 py-1 text-[11px] rounded-md border cursor-pointer";
  const tokenOptions = [
    { key: "attack", label: "Attack", color: "border-red-400 text-red-200 bg-red-400/10", img: ferocityToken },
    { key: "conversion", label: "Conversion", color: "border-blue-400 text-blue-200 bg-blue-400/10", img: conversionToken },
    { key: "wild", label: "Wild", color: "border-amber-400 text-amber-200 bg-amber-400/10", img: wildToken },
    { key: "mass", label: "Mass", color: "border-green-400 text-green-200 bg-green-400/10", img: massToken },
  ];

  const tokenCount = (key) => player.tokens?.[key] ?? player.tokens?.[key?.toUpperCase?.()] ?? 0;
  const ActiveAbilityPanel = ({ card }) => {
    const massCount = player.tokens?.mass ?? player.tokens?.MASS ?? 0;
    const gAvailable = player.resources?.G ?? 0;
    const hasMassActive = Array.isArray(card.tags) && card.tags.some((t) => t.startsWith("active:mass_token"));
    const hasSplitActive = Array.isArray(card.tags) && card.tags.some((t) => t.startsWith("active:convert_split"));
    const canConfirm =
      (hasMassActive &&
        !!selectedActiveToken &&
        tokenCount(selectedActiveToken) > 0 &&
        gAvailable >= 2 &&
        massCount < 3 &&
        !activeUsedMap?.[card.id]) ||
      (hasSplitActive &&
        !!selectedActiveResource &&
        (player.resources?.[selectedActiveResource] ?? 0) > 0 &&
        !activeUsedMap?.[card.id]);

    return (
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-3 flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.16em] text-slate-400">Activate</div>
            <div className="text-sm text-slate-100">{card.name}</div>
          </div>
          <button
            type="button"
            onClick={() => { setActiveCard(null); setSelectedActiveToken(null); setSelectedActiveResource(null); }}
            className="text-slate-400 hover:text-amber-200 text-sm px-2"
          >
            Close
          </button>
        </div>
        <div className="flex flex-col md:flex-row gap-3 items-start">
          <div className="flex flex-col gap-2 min-w-[80px]">
            <div className="px-2 py-1 rounded-md border border-green-700 bg-green-900/30 text-green-200 text-xs flex items-center gap-2">
              <Shield size={14} className="text-green-300" /> Cost: 2
              <ResourceIcon resource="G" size={12} />
            </div>
            <div className="px-2 py-1 rounded-md border border-slate-700 bg-slate-800/50 text-slate-200 text-xs">
              G Available: {gAvailable}
            </div>
                      <div className="text-[11px] text-slate-400">
                        {hasMassActive
                          ? "Spend any 1 token + 2G to forge 1 Mass token (once per turn)."
                          : "Convert 1 cube into 1 of each other color (once per turn)."}
                      </div>
                      {hasMassActive && (
                        <div className="text-[11px] text-slate-300">
                          Mass tokens: {massCount} / 3 {activeUsedMap?.[card.id] ? "(used)" : ""}
                        </div>
                      )}
                    </div>
          <div className="flex-1 min-w-[200px]">
            {hasMassActive && (
              <div className="grid grid-cols-2 sm:grid-cols-2 gap-1">
                {tokenOptions.map((opt) => {
                  const count = tokenCount(opt.key);
                  const isSelected = selectedActiveToken === opt.key;
                  const disabled = count <= 0;
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      disabled={disabled}
                      onClick={() => {
                        if (disabled) return;
                        setSelectedActiveToken((prev) => (prev === opt.key ? null : opt.key));
                      }}
                      className={`flex items-center justify-between px-2 py-2 rounded-lg border text-[11px] transition ${
                        disabled
                          ? "border-slate-800 text-slate-600 cursor-not-allowed"
                          : `${opt.color} hover:border-amber-400`
                      } ${isSelected ? "ring-2 ring-amber-400" : ""}`}
                    >
                      <span>{opt.label}</span>
                      <span className="text-slate-200">{count}</span>
                    </button>
                  );
                })}
              </div>
            )}
            {hasSplitActive && (
              <div className="grid grid-cols-3 gap-1">
                {[
                  { key: "R", label: "Red", icon: <Flame size={14} className="text-red-400" /> },
                  { key: "B", label: "Blue", icon: <Zap size={14} className="text-blue-400" /> },
                  { key: "G", label: "Green", icon: <Shield size={14} className="text-green-400" /> },
                ].map((opt) => {
                  const count = player.resources?.[opt.key] || 0;
                  const isSelected = selectedActiveResource === opt.key;
                  const disabled = count <= 0;
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      disabled={disabled}
                      onClick={() => {
                        if (disabled) return;
                        setSelectedActiveResource((prev) => (prev === opt.key ? null : opt.key));
                      }}
                      className={`flex flex-col items-center gap-1 px-2 py-2 rounded-lg border text-[11px] transition ${
                        disabled
                          ? "border-slate-800 text-slate-600 cursor-not-allowed"
                          : "border-slate-700 text-slate-200 hover:border-amber-400"
                      } ${isSelected ? "ring-2 ring-amber-400" : ""}`}
                    >
                      <span className="text-slate-200 flex items-center gap-1">{opt.icon}{opt.label}</span>
                      <span className="text-slate-300">Have: {count}</span>
                    </button>
                  );
                })}
              </div>
            )}
            <div className="flex justify-end gap-2 mt-3">
              <button
                type="button"
                onClick={() => { setActiveCard(null); setSelectedActiveToken(null); setSelectedActiveResource(null); }}
                className="px-3 py-1 rounded-full border border-slate-700 text-slate-300 hover:bg-slate-800 text-[11px]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!canConfirm}
                onClick={() => {
                  onActivateCard?.(card.id, selectedActiveToken, selectedActiveResource);
                  setActiveCard(null);
                  setSelectedActiveToken(null);
                  setSelectedActiveResource(null);
                }}
                className="px-3 py-1 rounded-full border border-emerald-500 text-emerald-200 hover:bg-emerald-500/10 text-[11px] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-2">
      <div
        className={`relative z-40 bg-slate-950/90 border-t border-slate-800 backdrop-blur-xl ${
          collapsed ? "h-12 px-4 py-2" : "px-6 py-4"
        }`}
      >
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="absolute top-2 right-2 p-1 rounded-full border border-slate-700 text-slate-200 hover:bg-slate-800"
          title={collapsed ? "Expand board" : "Collapse board"}
        >
          {collapsed ? "▼" : "▲"}
        </button>
        {collapsed ? (
          <div className="h-full flex items-center gap-4 overflow-visible">
            <div
              className={`w-10 h-10 rounded-full border-2 ${stanceColorRing(currentStance)} bg-slate-900 flex items-center justify-center `}
              style={{ backgroundImage: `url(${playerIconImg})`, backgroundSize: "cover", backgroundPosition: "center" }}
            />
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-sm font-semibold text-slate-50 truncate">{player.name}</span>
              <div className="flex items-center gap-3 text-sm text-slate-300 shrink-0">
                <div className="flex items-center gap-1">
                  <Trophy size={14} className="text-amber-300" />
                  <span>VP: {player.vp}</span>
                </div>
                <div className="flex items-center gap-1 text-xs text-rose-200">
                  <Skull size={12} />
                  <span>Wounds: {player.wounds ?? 0}</span>
                </div>
              </div>
              {(showReturnToMyBoard || showFollowActive) && (
                <div className="flex items-center gap-2">
                  {showReturnToMyBoard && (
                    <button
                      type="button"
                      onClick={onViewMyBoard}
                      className="px-2 py-1 text-[10px] uppercase tracking-[0.14em] rounded-md border border-slate-700 text-slate-200 hover:border-amber-400"
                    >
                      My Board
                    </button>
                  )}
                  {showFollowActive && (
                    <button
                      type="button"
                      onClick={onFollowActivePlayer}
                      className="px-2 py-1 text-[10px] uppercase tracking-[0.14em] rounded-md border border-slate-700 text-slate-200 hover:border-emerald-400"
                    >
                      Follow Active
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
        ) : (
            <div className="flex flex-col gap-3 overflow-visible">
              <div className="flex items-start gap-4">
                {/* Player icon */}
              <div className="flex flex-col items-center gap-2 min-w-[72px]">
                  <div
                    className={`w-16 h-16 rounded-full border-4 ${stanceColorRing(currentStance)}  bg-slate-900`}
                    style={{ backgroundImage: `url(${playerIconImg})`, backgroundSize: "cover", backgroundPosition: "center" }}
                  />
                  {(showReturnToMyBoard || showFollowActive) && (
                    <div className="flex flex-col gap-2 w-full">
                      {showReturnToMyBoard && (
                        <button
                          type="button"
                          onClick={onViewMyBoard}
                          className="px-2 py-1 text-[10px] uppercase tracking-[0.14em] rounded-md border border-slate-700 text-slate-200 hover:border-amber-400 w-full"
                        >
                          My Board
                        </button>
                      )}
                      {showFollowActive && (
                        <button
                          type="button"
                          onClick={onFollowActivePlayer}
                          className="px-2 py-1 text-[10px] uppercase tracking-[0.14em] rounded-md border border-slate-700 text-slate-200 hover:border-emerald-400 w-full"
                        >
                          Follow Active
                        </button>
                      )}
                    </div>
                  )}
              </div>

              {/* Name/VP */}
              <div className="flex flex-col justify-center min-w-[160px] max-w-[160px] h-full">
                <div className="text-[11px] uppercase tracking-[0.3em] text-slate-500">Active Player</div>
                <div className="text-xl font-bold text-slate-50 leading-tight">{player.name}</div>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1 text-sm text-slate-300">
                  <Trophy size={14} className="text-amber-300" />
                  <span>VP: {player.vp}</span>
                </div>
                <div className="flex items-center gap-1 text-xs text-rose-200">
                  <Skull size={13} />
                  <span>
                    Wounds: {player.wounds ?? 0}
                    {player.wounds >= 10 ? " (-20 VP)" : player.wounds >= 5 ? " (-10 VP)" : ""}
                  </span>
                </div>
              </div>
                {isMyBoard && (
                  <div className="flex justify-start pt-3">
                    <button
                      type="button"
                      onClick={onEndTurn}
                      disabled={!onEndTurn || !isMyTurnGlobal}
                      className="px-2 py-1 rounded-md border border-amber-400 text-amber-200 hover:bg-amber-400/10 text-[10px] uppercase tracking-[0.12em] disabled:opacity-50 disabled:cursor-not-allowed w-full"
                    >
                      End Turn
                    </button>
                  </div>
                )}
              </div>

              {/* Resources + gains */}
              <div className="flex flex-col justify-center gap-1 min-w-[100px]">
                <div className="flex items-center gap-2">
                  <ResourcePip
                    icon={Flame}
                    value={effectiveResources?.R || 0}
                    color={{
                      border: "border-red-900",
                      bg: "bg-red-950/40",
                      icon: "text-red-400",
                    }}
                  />
                  <span className="text-xs text-slate-300 min-w-[50px]">+{totalProduction.R} / rd</span>
                </div>
                <div className="flex items-center gap-2">
                  <ResourcePip
                    icon={Zap}
                    value={effectiveResources?.B || 0}
                    color={{
                      border: "border-blue-900",
                      bg: "bg-blue-950/40",
                      icon: "text-blue-400",
                    }}
                  />
                  <span className="text-xs text-slate-300 min-w-[50px]">+{totalProduction.B} / rd</span>
                </div>
                <div className="flex items-center gap-2">
                  <ResourcePip
                    icon={Shield}
                    value={effectiveResources?.G || 0}
                    color={{
                      border: "border-green-900",
                      bg: "bg-green-950/40",
                      icon: "text-green-400",
                    }}
                  />
                  <span className="text-xs text-slate-300 min-w-[50px]">+{totalProduction.G} / rd</span>
                </div>
              </div>

              {/* Tokens */}
              {/* Tokens and Actions */}
              <div className="flex flex-col gap-2 min-w-[280px]">
                <div className="relative flex items-center gap-2">
                  {stanceMenuOpen && (
                    <StanceModal
                      players={modalPlayers}
                      setPlayers={setPlayers}
                      activePlayerId={activePlayerId}
                      onClose={onCloseStance}
                      onChangeStance={onAttemptStanceChange}
                      inline
                      disabled={!canChangeStance}
                    />
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      if (!isMyBoard || !isActiveTurn || (mainActionUsed && !canUseFreeStanceChange) || !canChangeStance) return;
                      onToggleStance?.();
                    }}
                    disabled={!isMyBoard || !isActiveTurn || (mainActionUsed && !canUseFreeStanceChange) || !canChangeStance}
                    className={`relative rounded-xl ${
                      !isMyBoard || !isActiveTurn || (mainActionUsed && !canUseFreeStanceChange)
                        ? "grayscale opacity-60 cursor-not-allowed"
                        : "hover:ring-2 hover:ring-emerald-300"
                    } ${canUseFreeStanceChange ? "ring-2 ring-amber-300 shadow-[0_0_18px_rgba(251,191,36,0.35)] animate-pulse" : ""}`}
                    style={{ width: 100, height: 90 }}
                  >
                    <img src={schemeCard} alt="Scheme" className="w-full h-full object-contain" />
                    {canUseFreeStanceChange ? (
                      <div className="absolute -top-2 -right-2 px-2 py-0.5 rounded-full bg-amber-400 text-slate-900 text-[9px] uppercase tracking-[0.2em]">
                        Free{freeStanceChanges > 1 ? ` x${freeStanceChanges}` : ""}
                      </div>
                    ) : null}
                    {!isMyBoard || !isActiveTurn || (mainActionUsed && !canUseFreeStanceChange) || !canChangeStance ? (
                      <div className="absolute inset-0 bg-slate-900/40 rounded-xl" />
                    ) : null}
                  </button>
                  {onPickToken && (
                    <button
                      type="button"
                      onClick={() => onPickToken?.()}
                      disabled={!canPickToken}
                      className={`relative rounded-xl ${
                        isMyBoard && isActiveTurn && canPickToken
                          ? "hover:ring-2 hover:ring-emerald-300"
                          : "grayscale opacity-70 cursor-not-allowed"
                      }`}
                      style={{ width: 100, height: 90 }}
                    >
                      <img src={scavengeCard} alt="Pick Token" className="w-full h-full object-contain" />
                      {!isMyBoard || !isActiveTurn || !canPickToken ? (
                        <div className="absolute inset-0 bg-slate-900/40 rounded-xl" />
                      ) : null}
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-0.5">
                  {["attack", "wild", "mass", "conversion"].some((k) => (player.tokens?.[k] ?? player.tokens?.[k?.toUpperCase?.()] ?? 0) > 0) ? (
                    ["attack", "wild", "mass", "conversion"].map((key) => {
                      const total =
                        player.tokens?.[key] ??
                        player.tokens?.[key?.toUpperCase?.()] ??
                        0;
                      if (total <= 0) return null;
                      const style = tokenStyles[key] || {};
                      const remaining =
                        key === "attack"
                          ? Math.max(0, total - stagedAttackTokens)
                          : key === "wild"
                            ? Math.max(0, total - stagedWildTotal)
                            : total;
                      const displayTotal = total;
                      const isDisabled = remaining <= 0 && key !== "conversion";

                      const isConversion = key === "conversion";
                      const isConversionActive = isConversion && displayTotal > 0;

                      const content = (
                        <>
                          {style.img ? (
                            <img
                              src={style.img}
                              alt={`${tokenLabels[key] || key} token`}
                              title={`${tokenLabels[key] || key} token`}
                              className="w-12 h-12 rounded-full"
                            />
                          ) : (
                            tokenLabels[key] || key
                          )}
                          <span className={`${style.text || "text-slate-200"} text-sm font-semibold`}>×{displayTotal}</span>
                          {isConversionActive && conversionOpen && (
                            <div
                              className="absolute z-50 bottom-full right-0 mb-2"
                              onClick={(e) => e.stopPropagation()}
                            >
                              <div className="relative bg-slate-900 border border-slate-700 rounded-xl p-3 shadow-xl w-64">
                                <div className="absolute -bottom-2 right-4 w-4 h-4 bg-slate-900 border-b border-l border-slate-700 transform rotate-45 z-0"></div>
                                <div className="relative z-10">
                                  <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.16em] text-slate-400 mb-2">
                                    <span>Use Conversion Token</span>
                                    <div
                                      role="button"
                                      tabIndex={0}
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setConversionOpen(false);
                                      }}
                                      onKeyDown={(e) => {
                                        if (e.key === "Enter" || e.key === " ") {
                                          e.preventDefault();
                                          e.stopPropagation();
                                          setConversionOpen(false);
                                        }
                                      }}
                                      className="text-slate-300 hover:text-amber-200 text-xs cursor-pointer px-1"
                                      aria-label="Close conversion panel"
                                    >
                                      ×
                                    </div>
                                  </div>
                                  <div className="flex flex-col gap-2">
                                    {conversionOptions.length === 0 && (
                                      <div className="text-[11px] text-slate-500">Not enough resources to convert.</div>
                                    )}
                                    {conversionOptions.map((opt) => {
                                      const keyConv = `${opt.from}-${opt.to}`;
                                      const current = conversionAmounts[keyConv] || 1;
                                      const amount = Math.max(1, Math.min(opt.maxAmount, current));
                                      const cycleAmount = () => {
                                        const next = amount >= opt.maxAmount ? 1 : amount + 1;
                                        setConversionAmounts((prev) => ({ ...prev, [keyConv]: next }));
                                      };
                                      return (
                                        <div
                                          key={keyConv}
                                          className="w-full px-2 py-2 rounded-lg border border-slate-700 bg-slate-800/60 text-slate-100 text-sm flex items-center justify-between gap-2"
                                        >
                                          <button
                                            type="button"
                                            onClick={cycleAmount}
                                            className="relative w-10 h-10 flex items-center justify-center rounded-full border border-slate-700 bg-slate-900/70 hover:border-amber-300"
                                            title={`Increase amount from ${opt.from}`}
                                          >
                                            {opt.fromIcon}
                                            <span className="absolute right-[-15px] top-1/2 -translate-y-1/2 text-[10px] text-slate-300 font-semibold">
                                              ×{amount}
                                            </span>
                                          </button>
                                          <span className="text-slate-400 uppercase tracking-[0.12em] text-xs">→</span>
                                          <button
                                            type="button"
                                            className="w-10 h-10 flex items-center justify-center rounded-full border border-emerald-400 text-emerald-200 bg-slate-900/70 hover:bg-emerald-400/10"
                                            onClick={() => onConvertToken?.(opt.from, opt.to, amount)}
                                            title={`Convert to ${opt.to}`}
                                          >
                                            {opt.toIcon}
                                          </button>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              </div>
                            </div>
                          )}
                        </>
                      );

                      if (isConversionActive) {
                        return (
                          <div
                            key={key}
                            role="button"
                            tabIndex={0}
                            className={`relative flex items-center gap-0.5 px-0.5 py-0.5 rounded transition ${
                              isDisabled ? "opacity-50 cursor-not-allowed" : "hover:bg-slate-800/80"
                            } ${isConversionActive ? "relative" : ""}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setConversionOpen((prev) => !prev);
                            }}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                e.stopPropagation();
                                setConversionOpen((prev) => !prev);
                              }
                            }}
                            title="Click to convert resources"
                          >
                            {content}
                          </div>
                        );
                      }

                      return (
                        <button
                          key={key}
                          type="button"
                          className={`relative flex items-center gap-0.5 px-0.5 py-0.5 rounded transition ${
                            isDisabled ? "opacity-50 cursor-not-allowed" : "hover:bg-slate-800/80"
                          } ${isConversionActive ? "relative" : ""}`}
                          onClick={() => {
                            if (!isDisabled) {
                              onTokenToggleForFight?.(key);
                            }
                          }}
                          disabled={isDisabled && !isConversionActive}
                          draggable={Boolean(onTokenToggleForFight) && !isConversion}
                          onDragStart={(e) => {
                            if (onTokenToggleForFight && !isConversion) {
                              e.dataTransfer.setData("token_type", key);
                            }
                          }}
                          title={isDisabled ? "No tokens remaining" : `${remaining} available`}
                        >
                          {content}
                        </button>
                      );
                    })
                  ) : (
                    <div className="text-[11px] text-slate-500">No tokens</div>
                  )}
                </div>
              </div>

              {/* Upgrades + Weapons OR Active Panel */}
              <div className="flex-1 flex flex-col gap-1 min-w-[320px]  relative">
                {!activeCard ? (
                  <>
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 mb-1">Upgrades</div>
                      <div className="grid grid-cols-4 gap-2">
                        {renderSlots(upgradeCards, upgradeSlots, "upgrade")}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 mb-1">Weapons</div>
                      <div className="grid grid-cols-4 gap-2">
                        {renderSlots(weaponCards, weaponSlots, "weapon")}
                      </div>
                    </div>
                  </>
                ) : (
                  <ActiveAbilityPanel card={activeCard} />
                )}
              </div>
            </div>
        </div>
      )}

      </div>
    </div>
  );
}
