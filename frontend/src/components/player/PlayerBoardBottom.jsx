import React, { useState, useMemo } from "react";
import { Trophy, Flame, Zap, Shield } from "lucide-react";
import ResourcePip from "../ui/ResourcePip";
import StanceModal from "./StanceModal";
import { MarketData } from "../../state/market";
import { setHoverPreview } from "../hover/HoverPreviewPortal";
import { stanceColorRing } from "../../utils/stanceColorRing";
import { STANCE_CONFIG } from "../../utils/stanceConfig";
import { normalizeStance } from "../../utils/formatters";

export default function PlayerBoardBottom({
  player,
  players,
  setPlayers,
  activePlayerId,
  stanceMenuOpen,
  onToggleStance,
  onCloseStance,
  onRealign,
  onFreeStanceChange,
  cardCatalog = [],
  displayStance,
}) {
  if (!player) return null;

  const [collapsed, setCollapsed] = useState(false);
  const currentStance = displayStance || player.stance;
  const stanceInfo = STANCE_CONFIG[currentStance] || STANCE_CONFIG[normalizeStance(currentStance)];
  const cardLookup = useMemo(() => {
    const source = (cardCatalog && cardCatalog.length ? cardCatalog : [...MarketData.upgrades, ...MarketData.weapons]);
    // Also include the player's owned cards so preview works even if not in market catalog
    const owned = [...(player.upgrades || []), ...(player.weapons || [])];
    return source.reduce((map, card) => {
      if (card.name) map[card.name] = card;
      if (card.id) map[card.id] = card;
      return map;
    }, owned.reduce((map, card) => {
      if (!card) return map;
      const entry = typeof card === "string" ? { id: card, name: card } : card;
      if (entry.name) map[entry.name] = entry;
      if (entry.id) map[entry.id] = entry;
      return map;
    }, {}));
  }, [cardCatalog, player.upgrades, player.weapons]);
  const previewCard = (cardName, lock = false) => {
    const card = cardLookup[cardName];
    console.log(cardLookup)
    console.log(cardName)
    if (!card) return;
    setHoverPreview({
      type: "market",
      data: card,
      sourceId: card.id,
      lock,
    });
  };
  const clearPreview = () => setHoverPreview(null);
  const tokenLabels = {
    attack: "Attack",
    conversion: "Conversion",
    mass: "Mass",
    wild: "Wild",
  };
  const tokens = Object.entries(player.tokens || {}).filter(([, count]) => count > 0);
  const tokenStyles = {
    attack: { bg: "bg-red-900/60", border: "border-red-800", text: "text-red-200" },
    conversion: { bg: "bg-blue-900/60", border: "border-blue-800", text: "text-blue-200" },
    mass: { bg: "bg-green-900/60", border: "border-green-800", text: "text-green-200" },
    wild: { bg: "bg-amber-900/60", border: "border-amber-700", text: "text-amber-200" },
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

  const maxSlots = 4;
  const upgradeSlots = Math.min(player.upgradeSlots ?? maxSlots, maxSlots);
  const weaponSlots = Math.min(player.weaponSlots ?? maxSlots, maxSlots);
  const upgradeCards = (player.upgrades || []).map(resolveCard).filter(Boolean);
  const weaponCards = (player.weapons || []).map(resolveCard).filter(Boolean);
  const modalPlayers = displayStance
    ? players.map((p) => (p.id === activePlayerId ? { ...p, stance: displayStance } : p))
    : players;

  const renderSlots = (cards, availableSlots, type) => {
    const slots = [];
    for (let i = 0; i < maxSlots; i++) {
      const card = cards[i];
      const available = i < availableSlots;
      const isLocked = !available;
      const baseClasses = "h-12 rounded-lg border flex flex-col justify-between p-1 text-[8px] leading-tight";
      if (card) {
        slots.push(
          <div
            key={`${type}-${i}`}
            className={`${baseClasses} bg-slate-900 border-slate-700 cursor-pointer`}
            onMouseEnter={() => previewCard(card.name)}
            onMouseLeave={clearPreview}
            onClick={() => previewCard(card.name, true)}
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
        slots.push(
          <div
            key={`${type}-${i}`}
            className={`${baseClasses} bg-slate-900/40 border-dashed border-slate-800 text-slate-500 flex items-center justify-center`}
          >
            Locked
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

  return (
    <div className="flex flex-col gap-2">
      <div className="flex justify-end px-6 text-[11px] text-slate-400">
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="px-3 py-1 rounded-full border border-slate-700 text-slate-200 hover:bg-slate-800"
        >
          {collapsed ? "Expand Board" : "Collapse Board"}
        </button>
      </div>

      <div
        className={`relative bg-slate-950/90 border-t border-slate-800 backdrop-blur-xl ${
          collapsed ? "h-12 px-4 py-2" : "h-44 px-6 py-4"
        }`}
      >
        {stanceMenuOpen && (
          <StanceModal
            players={modalPlayers}
            setPlayers={setPlayers}
            activePlayerId={activePlayerId}
            onClose={onCloseStance}
            onChangeStance={onFreeStanceChange || onRealign}
            inline
          />
        )}

        {collapsed ? (
          <div className="h-full flex items-center gap-4 overflow-hidden">
            <div
              onClick={onToggleStance}
              className={`w-10 h-10 rounded-full border-2 ${stanceColorRing(currentStance)} bg-slate-900 flex items-center justify-center text-[10px] uppercase tracking-[0.2em] text-slate-200 cursor-pointer`}
            >
              {(currentStance || "?")[0]}
            </div>
            <div className="flex items-center gap-3 min-w-0">
              <span className="text-sm font-semibold text-slate-50 truncate">{player.name}</span>
              <div className="flex items-center gap-1 text-sm text-slate-300 shrink-0">
                <Trophy size={14} className="text-amber-300" />
                <span>VP: {player.vp}</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="h-full flex items-start gap-4 overflow-hidden">
            {/* Player icon */}
            <div className="flex flex-col items-center gap-2 min-w-[72px]">
              <div
                onClick={onToggleStance}
                className={`w-16 h-16 rounded-full border-4 ${stanceColorRing(currentStance)}
                            bg-slate-900 flex items-center justify-center text-xs uppercase tracking-[0.2em] text-slate-200 cursor-pointer`}
              >
                {currentStance}
              </div>
            </div>

            {/* Name/VP/discount */}
            <div className="flex flex-col justify-center min-w-[160px]">
              <div className="text-[11px] uppercase tracking-[0.3em] text-slate-500">Active Player</div>
              <div className="text-xl font-bold text-slate-50 leading-tight">{player.name}</div>
              <div className="flex items-center gap-1 text-sm text-slate-300">
                <Trophy size={14} className="text-amber-300" />
                <span>VP: {player.vp}</span>
              </div>
              {stanceInfo && (
                <div className="text-[11px] text-slate-400 mt-1">
                  Discount: <span className={stanceTextColor}>{stanceInfo.discount}</span>
                </div>
              )}
            </div>

            {/* Resources + gains */}
            <div className="flex flex-col justify-center gap-2 min-w-[160px]">
              <div className="flex items-center gap-2">
                <ResourcePip
                  label="R"
                  icon={Flame}
                  value={player.resources?.R || 0}
                  color={{
                    border: "border-red-900",
                    bg: "bg-red-950/40",
                    icon: "text-red-400",
                  }}
                />
                {stanceInfo && (
                  <span className="text-xs text-slate-300 min-w-[70px]">+{stanceInfo.production.R} / rd</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <ResourcePip
                  label="B"
                  icon={Zap}
                  value={player.resources?.B || 0}
                  color={{
                    border: "border-blue-900",
                    bg: "bg-blue-950/40",
                    icon: "text-blue-400",
                  }}
                />
                {stanceInfo && (
                  <span className="text-xs text-slate-300 min-w-[70px]">+{stanceInfo.production.B} / rd</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <ResourcePip
                  label="G"
                  icon={Shield}
                  value={player.resources?.G || 0}
                  color={{
                    border: "border-green-900",
                    bg: "bg-green-950/40",
                    icon: "text-green-400",
                  }}
                />
                {stanceInfo && (
                  <span className="text-xs text-slate-300 min-w-[70px]">+{stanceInfo.production.G} / rd</span>
                )}
              </div>
            </div>

            {/* Tokens */}
            <div className="flex flex-col justify-center gap-2 min-w-[150px]">
              {tokens.length ? (
                tokens.map(([key, count]) => {
                  const style = tokenStyles[key] || {};
                  return (
                    <div
                      key={key}
                      className={`px-2 py-1 rounded-lg border flex items-center gap-2 ${style.bg || "bg-slate-900"} ${
                        style.border || "border-slate-700"
                      }`}
                    >
                      <span className={`uppercase tracking-[0.12em] ${style.text || "text-slate-200"}`}>
                        {tokenLabels[key] || key}
                      </span>
                      <span className={`font-semibold ${style.text || "text-slate-50"}`}>{count}</span>
                    </div>
                  );
                })
              ) : (
                <div className="text-[11px] text-slate-500">No tokens</div>
              )}
            </div>

            {/* Upgrades + Weapons */}
            <div className="flex-1 flex flex-col gap-1 min-w-[320px] overflow-hidden">
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
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
