import React, { useEffect, useMemo, useRef, useState } from 'react';
import { INITIAL_PLAYERS } from '../state/players';
import InitiativeRail from '../components/navigation/InitiativeRail';
import ThreatsPanel from '../components/threats/ThreatsPanel';
import MarketPanel from '../components/market/MarketPanel';
import PlayerBoardBottom from '../components/player/PlayerBoardBottom';
import HoverPreviewPortal from '../components/hover/HoverPreviewPortal';
import { normalizeStance } from '../utils/formatters';
import { setHoverPreview } from '../components/hover/HoverPreviewPortal';
import MarketCardDetail from '../components/market/MarketCardDetail';
import FightPanel from '../components/fight/FightPanel';
import { X } from 'lucide-react';

const STEAL_AMOUNT = 2;

function ConfirmModal({ card, onConfirm, onCancel }) {
  if (!card) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl p-5 w-[360px] shadow-2xl">
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs uppercase tracking-[0.2em] text-slate-400">Confirm Purchase</div>
          <button
            type="button"
            onClick={onCancel}
            className="text-slate-400 hover:text-slate-200 text-sm"
          >
            ✕
          </button>
        </div>
        <MarketCardDetail card={card} />
        <div className="flex gap-2 mt-4">
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 px-3 py-2 rounded-lg border border-emerald-400 text-emerald-200 hover:bg-emerald-400/10 text-sm uppercase tracking-[0.16em]"
          >
            Confirm
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 px-3 py-2 rounded-lg border border-slate-700 text-slate-200 hover:bg-slate-800 text-sm uppercase tracking-[0.16em]"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

export default function App({
  gameData,
  userId,
  onFightRow,
  onConvert,
  onBuyUpgrade,
  onBuyWeapon,
  onExtendSlot,
  onPickToken,
  onRealign,
  onLocalToast,
  onEndTurn,
}) {
  const mappedPlayers = useMemo(() => {
    if (!gameData?.players) return [];
    const baseList = Array.isArray(gameData.players)
      ? gameData.players
      : Object.values(gameData.players);

    const orderedIds = gameData.turn_order || gameData.turnOrder || [];
    const orderedPlayers = orderedIds.length
      ? orderedIds
          .map((pid) =>
            baseList.find(
              (p) => p.id === pid || p.user_id === pid || p.userId === pid
            )
          )
          .filter(Boolean)
      : baseList;

    return orderedPlayers.map((p) => ({
      id: p.user_id || p.id,
      name: p.username || p.name || p.user_id || p.id,
      stance: normalizeStance(p.stance),
      turnInitialStance: normalizeStance(p.turn_initial_stance || p.stance),
      resources: p.resources || { R: 0, B: 0, G: 0 },
      tokens: p.tokens || {},
      vp: p.vp ?? 0,
      wounds: p.wounds ?? p.wound ?? 0,
      actionUsed: p.action_used ?? p.actionUsed ?? false,
      buyUsed: p.buy_used ?? p.buyUsed ?? false,
      upgrades: p.upgrades || [],
      weapons: p.weapons || [],
      upgradeSlots: p.upgrade_slots ?? p.upgradeSlots ?? 1,
      weaponSlots: p.weapon_slots ?? p.weaponSlots ?? 1,
      status: p.status,
    }));
  }, [gameData]);

  const remotePlayers = mappedPlayers;
  const [localPlayers, setLocalPlayers] = useState(INITIAL_PLAYERS);
  const [stanceOverrides, setStanceOverrides] = useState({});
  const basePlayers = remotePlayers.length ? remotePlayers : localPlayers;
  const [activePlayerId, setActivePlayerId] = useState(basePlayers[0]?.id || null);
  const players = useMemo(
    () =>
      basePlayers.map((p) =>
        stanceOverrides[p.id] ? { ...p, stance: stanceOverrides[p.id] } : p
      ),
    [basePlayers, stanceOverrides]
  );
  const backendActivePlayer = useMemo(
    () => basePlayers.find((p) => p.id === activePlayerId),
    [basePlayers, activePlayerId]
  );
  const [zoomedPanel, setZoomedPanel] = useState(null); // 'threats' | 'market' | null
  const [prompt, setPrompt] = useState(null);
  const [stanceMenuOpen, setStanceMenuOpen] = useState(false);
  const [activeFight, setActiveFight] = useState(null);
  const [fightAttackUsed, setFightAttackUsed] = useState(0);
  const [fightWildAllocation, setFightWildAllocation] = useState({ R: 0, B: 0, G: 0 });
  const [fightPlayedUpgrades, setFightPlayedUpgrades] = useState(new Set());
  const [fightPlayedWeapons, setFightPlayedWeapons] = useState(new Set());
  const [fightDiscountResource, setFightDiscountResource] = useState("R");
  const [fightResourceSpend, setFightResourceSpend] = useState({ R: 0, B: 0, G: 0 });
  const [fightMissingCost, setFightMissingCost] = useState({ R: 0, B: 0, G: 0 });
  const [stealAllocation, setStealAllocation] = useState({ R: 0, B: 0, G: 0 });
  const [stealRequired, setStealRequired] = useState(STEAL_AMOUNT);
  const [stealPromptOpen, setStealPromptOpen] = useState(false);
  const [pickTokenOpen, setPickTokenOpen] = useState(false);
  const [pickTokenChoice, setPickTokenChoice] = useState(null);
  const [isFollowingTurn, setIsFollowingTurn] = useState(true);
  const [selectedCard, setSelectedCard] = useState(null); // selected card for confirmation
  const [highlightBuyables, setHighlightBuyables] = useState(false);
  const [suppressPreview, setSuppressPreview] = useState(false);
  const [hasTurnRedirected, setHasTurnRedirected] = useState(false);
  const stanceBaselineRef = useRef(null);
  const lastLegalStanceRef = useRef(null);
  const currentTurnPlayerId = gameData?.active_player_id || gameData?.activePlayerId;
  const isMyTurn = userId && currentTurnPlayerId === userId;
  const backendBaseline = useMemo(
    () => backendActivePlayer?.turnInitialStance || backendActivePlayer?.stance,
    [backendActivePlayer?.turnInitialStance, backendActivePlayer?.stance]
  );
  const activePlayer = players.find(p => p.id === activePlayerId);
  const me = players.find((p) => p.id === userId);
  const mainActionUsed = !!me?.actionUsed;
  const buyUsed = !!me?.buyUsed;
  const threatRows = gameData?.threat_rows || gameData?.threatRows;
  const boss = gameData?.boss;
  const market = gameData?.market;
  const gameId = gameData?.game_id || gameData?.gameId;

  const bestDiscountResource = (cost = {}) => {
    const vals = {
      R: cost.R ?? cost.r ?? 0,
      B: cost.B ?? cost.b ?? 0,
      G: cost.G ?? cost.g ?? 0,
    };
    return Object.keys(vals).sort((a, b) => (vals[b] || 0) - (vals[a] || 0))[0] || "R";
  };
  const threatTargetsStance = (threat, stance) => {
    const type = String(threat?.type || "").toLowerCase();
    const s = String(stance || "").toUpperCase();
    if (!type || !s) return false;
    if (type === "hybrid") return s !== "BALANCED";
    const weakMap = {
      AGGRESSIVE: new Set(["feral"]),
      TACTICAL: new Set(["cunning"]),
      HUNKERED: new Set(["massive"]),
      BALANCED: new Set(["feral", "cunning", "massive"]),
    };
    return weakMap[s]?.has(type);
  };
  const resolveAttackType = (threat, stance) => {
    const type = String(threat?.type || "").toLowerCase();
    const s = String(stance || "").toUpperCase();
    if (type === "hybrid") {
      if (s === "AGGRESSIVE") return "feral";
      if (s === "TACTICAL") return "cunning";
      if (s === "HUNKERED") return "massive";
      return "none";
    }
    return type;
  };
  const cardCatalog = useMemo(
    () => [
      ...(market?.upgrades || []),
      ...(market?.weapons || []),
    ],
    [market]
  );
  const resourceAfterFight = useMemo(() => {
    if (!activeFight || !activePlayer) return null;
    return {
      R: Math.max(0, (activePlayer.resources?.R || 0) - (fightResourceSpend.R || 0)),
      B: Math.max(0, (activePlayer.resources?.B || 0) - (fightResourceSpend.B || 0)),
      G: Math.max(0, (activePlayer.resources?.G || 0) - (fightResourceSpend.G || 0)),
    };
  }, [activeFight, fightResourceSpend.B, fightResourceSpend.G, fightResourceSpend.R, activePlayer]);
  useEffect(() => {
    if (!activePlayerId && players.length) {
      setActivePlayerId(players[0].id);
    }
  }, [players, activePlayerId]);

  useEffect(() => {
    if (activePlayerId && !players.find((p) => p.id === activePlayerId) && players.length) {
      setActivePlayerId(players[0].id);
    }
  }, [players, activePlayerId]);

  useEffect(() => {
    setStanceMenuOpen(false);
    setSelectedCard(null);
  }, [activePlayerId]);

  useEffect(() => {
    if (selectedCard) {
      setSuppressPreview(true);
      setHoverPreview(null);
    } else {
      setSuppressPreview(false);
    }
  }, [selectedCard]);

  useEffect(() => {
    if (isFollowingTurn && currentTurnPlayerId) {
      setActivePlayerId(currentTurnPlayerId);
    }
  }, [currentTurnPlayerId, isFollowingTurn]);

  const firstTurnRedirectDone = useRef(false);
  useEffect(() => {
    if (
      isMyTurn &&
      activePlayerId &&
      activePlayerId !== userId &&
      !hasTurnRedirected &&
      firstTurnRedirectDone.current
    ) {
      setActivePlayerId(userId);
      setIsFollowingTurn(false);
      setHasTurnRedirected(true);
      onLocalToast?.("It's your turn!", "emerald");
    }
    if (isMyTurn && !firstTurnRedirectDone.current) {
      firstTurnRedirectDone.current = true;
    }
    if (!isMyTurn) {
      setHasTurnRedirected(false);
    }
  }, [isMyTurn, activePlayerId, userId, onLocalToast, hasTurnRedirected]);

  useEffect(() => {
    if (stanceMenuOpen && backendBaseline) {
      stanceBaselineRef.current = backendBaseline;
      lastLegalStanceRef.current = backendBaseline;
      setStanceOverrides((prev) => {
        if (prev[activePlayerId] === backendBaseline) return prev;
        return { ...prev, [activePlayerId]: backendBaseline };
      });
    }
    if (!stanceMenuOpen) {
      stanceBaselineRef.current = null;
      lastLegalStanceRef.current = null;
    }
  }, [stanceMenuOpen, backendBaseline, activePlayerId]);

  useEffect(() => {
    if (!activeFight) return;
    if (!isMyTurn || activePlayerId !== userId) {
      setActiveFight(null);
      return;
    }
    const row = threatRows?.[activeFight.rowIndex] || [];
    const front = row[0];
    if (!front || front.id !== activeFight.threat?.id) {
      setActiveFight(null);
    }
  }, [activeFight, activePlayerId, isMyTurn, threatRows, userId]);

  const updatePlayerStance = (stance) => {
    setStanceOverrides((prev) => ({ ...prev, [activePlayerId]: stance }));
    if (!remotePlayers.length) {
      setLocalPlayers((prev) =>
        prev.map((p) => (p.id === activePlayerId ? { ...p, stance } : p))
      );
    }
  };

  const revertToLastLegal = () => {
    const fallback = lastLegalStanceRef.current || backendBaseline || backendActivePlayer?.stance;
    setStanceOverrides((prev) => {
      const next = { ...prev };
      if (fallback) {
        next[activePlayerId] = fallback;
      } else {
        delete next[activePlayerId];
      }
      return next;
    });
  };

  const setPromptSafe = (payload) => {
    if (prompt?.type === "stance" && payload?.type !== "stance") {
      revertToLastLegal();
    }
    setPrompt(payload);
  };

  const clearBuySelection = () => {
    if (selectedCard) {
      setSelectedCard(null);
      setHoverPreview(null);
    }
  };

  const resetFightState = () => {
    setFightAttackUsed(0);
    setFightWildAllocation({ R: 0, B: 0, G: 0 });
    setFightPlayedUpgrades(new Set());
    setFightPlayedWeapons(new Set());
    setFightDiscountResource("R");
    setFightResourceSpend({ R: 0, B: 0, G: 0 });
  };

  const clearFightPanel = () => {
    setActiveFight(null);
    resetFightState();
  };

  const handleStartFight = (rowIndex, threat) => {
    if (!threat) return;
    if (!threatRows?.[rowIndex]?.length) return;
    if (!isMyTurn || activePlayerId !== userId) {
      onLocalToast?.("You can only fight during your turn with your board selected.", "amber");
      return;
    }
    if (me?.actionUsed) {
      onLocalToast?.("Main action already used this turn.", "amber");
      return;
    }
    const row = threatRows?.[rowIndex] || [];
    const frontId = row[0]?.id;
    const positionFront = (threat.position || "").toLowerCase() === "front";
    const isFront = positionFront || (!threat.position && threat.id === frontId);
    if (!isFront) {
      onLocalToast?.("Only front threats can be fought right now.", "amber");
      return;
    }
    clearBuySelection();
    setPromptSafe(null);
    setStanceMenuOpen(false);
    setZoomedPanel(null);
    setHoverPreview(null);
    // Close any locked threat preview
    setHoverPreview(null);
    resetFightState();
    setHoverPreview(null);
    const stanceUpper = String(activePlayer?.stance || "").toUpperCase();
    const stanceDiscountMap = { AGGRESSIVE: "R", TACTICAL: "B", HUNKERED: "G" };
    const fallbackDiscount =
      stanceUpper === "BALANCED"
        ? bestDiscountResource(threat.cost || {})
        : stanceDiscountMap[stanceUpper] || "R";
    setFightDiscountResource(fallbackDiscount);
    setActiveFight({
      threat,
      rowIndex,
      discountResource: fallbackDiscount,
    });
  };

  const handleSubmitFight = (payload) => {
    if (!payload || !onFightRow) return;
    onFightRow(payload);
    setActiveFight(null);
    resetFightState();
  };

  const handleFightResourcePreview = (spent) => {
    if (!spent) {
      setFightResourceSpend({ R: 0, B: 0, G: 0 });
      return;
    }
    setFightResourceSpend({
      R: spent.R || 0,
      B: spent.B || 0,
      G: spent.G || 0,
    });
  };

  const handleFightMissingPreview = (missing) => {
    if (!missing) return;
    setFightMissingCost({
      R: missing.R || 0,
      B: missing.B || 0,
      G: missing.G || 0,
    });
  };

  const handleEndTurnClick = () => {
    if (!isMyTurn) {
      onLocalToast?.("Not your turn.", "amber");
      return;
    }
    if (activePlayerId !== userId) {
      onLocalToast?.("Select your board to end your turn.", "amber");
      return;
    }
    const stanceUpper = String(me?.stance || "").toUpperCase();
    const totalResources =
      (me?.resources?.R || 0) + (me?.resources?.B || 0) + (me?.resources?.G || 0);
    const frontThreats = (threatRows || [])
      .map((row = []) => {
        if (!row.length) return null;
        const explicitFront = row.find((t) => (t.position || "").toLowerCase() === "front");
        if (explicitFront) return explicitFront;
        const first = row[0];
        if (first && !first.position) return first;
        return null;
      })
      .filter(Boolean);
    const cunningFronts = frontThreats.filter(
      (t) =>
        threatTargetsStance(t, stanceUpper) &&
        resolveAttackType(t, stanceUpper) === "cunning"
    );
    const stealBudget = STEAL_AMOUNT * (cunningFronts.length || 0);
    if (stealBudget > 0 && totalResources > stealBudget) {
      const available = me?.resources || {};
      let remaining = stealBudget;
      const allocation = { R: 0, B: 0, G: 0 };
      ["R", "B", "G"]
        .sort((a, b) => (available[b] || 0) - (available[a] || 0))
        .forEach((key) => {
          if (remaining <= 0) return;
          const take = Math.min(available[key] || 0, remaining);
          allocation[key] = take;
          remaining -= take;
        });
      setStealRequired(stealBudget);
      setStealAllocation(allocation);
      setStealPromptOpen(true);
      return;
    }
    onEndTurn?.({});
    clearFightPanel();
    setSelectedCard(null);
    setStanceMenuOpen(false);
  };

  const totalStealSelected =
    (stealAllocation.R || 0) + (stealAllocation.B || 0) + (stealAllocation.G || 0);

  const adjustSteal = (key, delta) => {
    if (!me?.resources) return;
    setStealAllocation((prev) => {
      const cap = me.resources?.[key] || 0;
      const current = prev?.[key] || 0;
      const nextVal = Math.min(Math.max(0, current + delta), cap);
      const prevTotal = (prev.R || 0) + (prev.B || 0) + (prev.G || 0);
      const newTotal = prevTotal - current + nextVal;
      if (newTotal > stealRequired) return prev;
      return { ...prev, [key]: nextVal };
    });
  };

  const confirmStealChoice = () => {
    setStealPromptOpen(false);
    onEndTurn?.({ steal_allocation: stealAllocation });
    clearFightPanel();
    setSelectedCard(null);
    setStanceMenuOpen(false);
  };

  const cancelStealChoice = () => {
    setStealPromptOpen(false);
  };

  const handleOpenPickToken = () => {
    if (!isMyTurn || activePlayerId !== userId) {
      onLocalToast?.("You can pick a token only on your turn.", "amber");
      return;
    }
    if (mainActionUsed) {
      onLocalToast?.("Main action already used this turn.", "amber");
      return;
    }
    setPickTokenChoice(null);
    setPickTokenOpen(true);
  };

  const confirmPickToken = () => {
    if (!pickTokenChoice) return;
    onPickToken?.(pickTokenChoice);
    setPickTokenOpen(false);
  };

  const handleCardToggleForFight = (card) => {
    if (!card) return;
    const id = card.id || card.name;
    if (!id) return;
    if (card.type === "Upgrade") {
      setFightPlayedUpgrades((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    } else if (card.type === "Weapon") {
      setFightPlayedWeapons((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
    }
  };

  const handleTokenClickForFight = (type) => {
    const normalized = String(type || "").toLowerCase();
    if (normalized === "attack") {
      setFightAttackUsed((prev) => {
        const available = activePlayer?.tokens?.attack ?? activePlayer?.tokens?.ATTACK ?? 0;
        if (!available) return 0;
        if (prev >= available) return 0;
        return prev + 1;
      });
    } else if (normalized === "wild") {
      const target = ["R", "B", "G"]
        .sort((a, b) => (fightMissingCost[b] || 0) - (fightMissingCost[a] || 0))[0] || "R";
      setFightWildAllocation((prev) => {
        const available = activePlayer?.tokens?.wild ?? activePlayer?.tokens?.WILD ?? 0;
        const total = (prev.R || 0) + (prev.B || 0) + (prev.G || 0);
        if (!available) return prev;
        if (total >= available) return prev;
        return { ...prev, [target]: (prev[target] || 0) + 1 };
      });
    }
  };

  const handleSelectPlayer = (id) => {
    setActivePlayerId(id);
    setIsFollowingTurn(id === currentTurnPlayerId);
  };

  const handleFreeStanceChange = (stance) => {
    if (!isMyTurn) return;
    if (!activePlayer) return;
    if (activePlayerId !== userId) {
      onLocalToast?.("Select your board to change stance.", "amber");
      return;
    }
    if (me?.actionUsed) {
      onLocalToast?.("Main action already used this turn.", "amber");
      return;
    }

    const baseline = backendActivePlayer?.stance || activePlayer.stance;
    lastLegalStanceRef.current = baseline;
    const target = normalizeStance(stance);

    updatePlayerStance(target);
    setPromptSafe({
      type: "stance",
      message: `Spend your action to change stance to ${target}?`,
      onConfirm: () => {
        onRealign?.(target.toUpperCase());
        setStanceMenuOpen(false);
      },
      onCancel: () => {
        if (baseline) {
          updatePlayerStance(baseline);
        }
        setStanceMenuOpen(false);
      },
    });
  };

  const startExtendFlowWithChoice = (slotType) => {
    clearBuySelection();
    if (!activePlayer) return;
    if (!isMyTurn || activePlayerId !== userId) {
      onLocalToast?.("You can extend slots only on your turn.", "amber");
      return;
    }
    if (me?.actionUsed) {
      onLocalToast?.("Main action already used this turn.", "amber");
      return;
    }
    const key = slotType === "weapon" ? "weaponSlots" : "upgradeSlots";
    const current = activePlayer[key] ?? 1;
    if (current >= 4) {
      onLocalToast?.("All slots are already extended.", "amber");
      return;
    }
    setPromptSafe({
      type: "extend",
      message: `Extend ${slotType} slot for ${activePlayer.name}?`,
      onConfirm: () => {
        if (onExtendSlot) {
          onExtendSlot(slotType);
        } else {
          setLocalPlayers((prev) =>
            prev.map((p) => {
              if (p.id !== activePlayerId) return p;
              const key = slotType === "weapon" ? "weaponSlots" : "upgradeSlots";
              const current = p[key] ?? 1;
              return { ...p, [key]: Math.min(4, current + 1) };
            })
          );
        }
      },
    });
  };

  const handleCardBuyClick = (card) => {
    if (!card) return;
    if (!isMyTurn || activePlayerId !== userId) {
      onLocalToast?.("Wait for your turn to buy.", "amber");
      return;
    }
    if (me?.buyUsed) {
      onLocalToast?.("Optional buy already used this turn.", "amber");
      return;
    }
    setPromptSafe(null);
    const actionType = card.type === "Weapon" ? "buy_weapon" : "buy_upgrade";
    setStanceMenuOpen(false);
    setSelectedCard({ type: actionType, card });
  };

  const canAfford = (card) => {
    if (!card || !me) return false;
    const cost = card.cost || {};
    const r = cost.R ?? cost.r ?? 0;
    const b = cost.B ?? cost.b ?? 0;
    const g = cost.G ?? cost.g ?? 0;
    const resources = me.resources || {};
    return (
      (resources.R ?? 0) >= r &&
      (resources.B ?? 0) >= b &&
      (resources.G ?? 0) >= g
    );
  };

  const hasSlotForCard = (card) => {
    if (!card || !me) return false;
    if (card.type === "Upgrade") {
      return (me.upgrades?.length || 0) < (me.upgradeSlots || 1);
    }
    if (card.type === "Weapon") {
      return (me.weapons?.length || 0) < (me.weaponSlots || 1);
    }
    return true;
  };

  const submitSelectedAction = () => {
    if (!selectedCard?.card) return;
    if (!isMyTurn) return;
    if (me?.buyUsed) {
      onLocalToast?.("Optional buy already used this turn.", "amber");
      return;
    }
    if (!canAfford(selectedCard.card)) return;
    if (!hasSlotForCard(selectedCard.card)) return;
    if (selectedCard.type === "buy_upgrade") {
      onBuyUpgrade?.(selectedCard.card);
    } else if (selectedCard.type === "buy_weapon") {
      onBuyWeapon?.(selectedCard.card);
    }
    setSelectedCard(null);
  };

  const canBuyCard = (card) => {
    if (!card) return false;
    if (me?.buyUsed) return false;
    return canAfford(card) && hasSlotForCard(card);
  };

  return (
    <div className="w-full h-screen bg-slate-950 text-slate-100 flex overflow-hidden">
      
      <InitiativeRail
        players={players}
        activePlayerId={activePlayerId}
        currentTurnPlayerId={currentTurnPlayerId}
        onSelect={handleSelectPlayer}
      />

      <div className="flex-1 flex flex-col min-w-0">

        {/* Main content area */}
        <div className="flex-1 min-h-0 px-6 py-4 overflow-hidden">
          <div className="relative w-full h-full overflow-hidden rounded-3xl">
            <div className="absolute top-3 right-3 z-20 flex flex-wrap gap-2 justify-end">
              <div
                className={`px-3 py-2 rounded-lg border text-[11px] uppercase tracking-[0.12em] ${
                  mainActionUsed ? "border-slate-700 text-slate-500" : "border-emerald-400 text-emerald-200"
                }`}
              >
                Main Action: {mainActionUsed ? "Used" : "Ready"}
              </div>
              <div
                className={`px-3 py-2 rounded-lg border text-[11px] uppercase tracking-[0.12em] ${
                  buyUsed ? "border-slate-700 text-slate-500" : "border-sky-400 text-sky-200"
                }`}
              >
                Optional Buy: {buyUsed ? "Used" : "Ready"}
              </div>
              <button
                onClick={handleEndTurnClick}
                className="px-3 py-2 rounded-lg border border-amber-400 text-amber-200 hover:bg-amber-400/10 text-[11px] uppercase tracking-[0.14em] disabled:opacity-50"
                disabled={!isMyTurn}
              >
                End Turn
              </button>
            </div>
            {activeFight ? (
              <div className="h-full">
                <FightPanel
                  threat={activeFight.threat}
                  rowIndex={activeFight.rowIndex}
                  player={me}
                  gameId={gameId}
                  defaultDiscount={activeFight.discountResource}
                  onClose={clearFightPanel}
                  onSubmit={handleSubmitFight}
                  attackUsed={fightAttackUsed}
                  setAttackUsed={setFightAttackUsed}
                  wildAllocation={fightWildAllocation}
                  setWildAllocation={setFightWildAllocation}
                  playedUpgrades={fightPlayedUpgrades}
                  setPlayedUpgrades={setFightPlayedUpgrades}
                  playedWeapons={fightPlayedWeapons}
                  setPlayedWeapons={setFightPlayedWeapons}
                  discountResource={fightDiscountResource}
                  setDiscountResource={setFightDiscountResource}
                  onResourcePreview={handleFightResourcePreview}
                  onMissingPreview={handleFightMissingPreview}
                />
              </div>
            ) : (
              <>
                <div className={`h-full grid grid-cols-2 gap-3 transition-all duration-500 ${zoomedPanel ? "scale-95 opacity-0 pointer-events-none" : "opacity-100"}`}>
                  <ThreatsPanel
                    compact
                    playersCount={players.length}
                    rows={threatRows}
                    boss={boss}
                    onFightRow={handleStartFight}
                    activeStance={activePlayer?.stance}
                    onZoom={() => setZoomedPanel('threats')}
                  />
                  <MarketPanel
                    compact
                    market={market}
                    onCardBuy={handleCardBuyClick}
                    selectedCardId={selectedCard?.card?.id}
                    canBuyCard={canBuyCard}
                    hasSlotForCard={hasSlotForCard}
                    isMyTurn={isMyTurn}
                    highlightBuyables={highlightBuyables}
                    onZoom={() => setZoomedPanel('market')}
                  />
                </div>

                {zoomedPanel && (
                  <div className="absolute inset-0 flex transition-transform duration-500" style={{ transform: zoomedPanel === 'market' ? 'translateX(-100%)' : 'translateX(0%)' }}>
                    {['threats', 'market'].map((panel) => (
                      <div key={panel} className="w-full flex-shrink-0 px-1">
                        <div className="h-full bg-slate-950/70 border border-slate-800 rounded-3xl p-3 relative">
                          <div className="absolute top-3 right-3 flex gap-2">
                            <button
                              onClick={() => setZoomedPanel(panel === 'threats' ? 'market' : 'threats')}
                              className="px-2 py-1 text-[11px] rounded-full border border-slate-700 text-slate-200 hover:bg-slate-800"
                            >
                              Switch
                            </button>
                            <button
                              onClick={() => setZoomedPanel(null)}
                              className="p-1 rounded-full border border-slate-700 text-slate-200 hover:bg-slate-800"
                            >
                              <X size={14} />
                            </button>
                          </div>
                          {panel === 'threats' ? (
                            <ThreatsPanel
                              rows={threatRows}
                              boss={boss}
                              onFightRow={handleStartFight}
                              activeStance={activePlayer?.stance}
                            />
                          ) : (
                            <MarketPanel
                              market={market}
                              onCardBuy={handleCardBuyClick}
                              selectedCardId={selectedCard?.card?.id}
                              canBuyCard={canBuyCard}
                              hasSlotForCard={hasSlotForCard}
                              isMyTurn={isMyTurn}
                              highlightBuyables={highlightBuyables}
                            />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <PlayerBoardBottom
          player={activePlayer}
          players={players}
          setPlayers={remotePlayers.length ? undefined : setLocalPlayers}
          cardCatalog={cardCatalog}
          activePlayerId={activePlayerId}
          stanceMenuOpen={stanceMenuOpen}
          onToggleStance={() => setStanceMenuOpen((v) => !v)}
          onCloseStance={() => setStanceMenuOpen(false)}
          onAttemptStanceChange={handleFreeStanceChange}
          onExtendSlot={startExtendFlowWithChoice}
          canChangeStance={isMyTurn}
          resourceOverride={activeFight ? resourceAfterFight : null}
          onCardToggleForFight={activeFight ? handleCardToggleForFight : undefined}
          onTokenToggleForFight={activeFight ? handleTokenClickForFight : undefined}
          onConvertToken={onConvert}
          onPickToken={handleOpenPickToken}
          canPickToken={isMyTurn && activePlayerId === userId && !mainActionUsed}
          stagedFightCards={
            activeFight
              ? { upgrades: fightPlayedUpgrades, weapons: fightPlayedWeapons }
              : undefined
          }
          stagedFightTokens={
            activeFight
              ? {
                  attack: fightAttackUsed,
                  wild: fightWildAllocation,
                  massUsed:
                    (activePlayer?.tokens?.mass ??
                      activePlayer?.tokens?.MASS ??
                      0),
                }
              : undefined
          }
        />
      </div>

      {prompt && (
        <div className="fixed bottom-4 right-6 z-40">
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-3 shadow-xl min-w-[260px]">
            <div className="text-sm text-slate-100 mb-3">{prompt.message}</div>
            <div className="flex justify-end gap-2 text-[11px]">
              <button
                onClick={() => {
                  prompt.onCancel?.();
                  setPrompt(null);
                }}
                className="px-3 py-1 rounded-full border border-slate-700 text-slate-300 hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={() => { prompt.onConfirm?.(); setPrompt(null); }}
                className="px-3 py-1 rounded-full border border-emerald-500 text-emerald-200 hover:bg-emerald-500/10"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {stealPromptOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-4 w-[340px] shadow-2xl">
            <div className="text-sm text-slate-100 mb-2">
              Cunning threats will steal {stealRequired} resources. Choose what to lose.
            </div>
            <div className="flex gap-2 mb-3">
              {["R", "B", "G"].map((key) => (
                <div key={key} className="flex-1 bg-slate-800/60 border border-slate-700 rounded-lg p-2 text-center">
                  <div className="text-[11px] uppercase text-slate-400"> {key} </div>
                  <div className="text-lg font-semibold text-slate-100">{stealAllocation[key] || 0}</div>
                  <div className="text-[10px] text-slate-500">Avail: {me?.resources?.[key] || 0}</div>
                  <div className="flex justify-center gap-2 mt-2">
                    <button
                      className="px-2 py-1 rounded border border-slate-700 text-slate-200 hover:bg-slate-700/60"
                      onClick={() => adjustSteal(key, -1)}
                    >
                      −
                    </button>
                    <button
                      className="px-2 py-1 rounded border border-slate-700 text-slate-200 hover:bg-slate-700/60 disabled:opacity-50"
                      disabled={(stealAllocation[key] || 0) >= (me?.resources?.[key] || 0) || totalStealSelected >= stealRequired}
                      onClick={() => adjustSteal(key, 1)}
                    >
                      +
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2 text-[11px]">
              <button
                className="px-3 py-1 rounded-full border border-slate-700 text-slate-300 hover:bg-slate-800"
                onClick={cancelStealChoice}
              >
                Cancel
              </button>
              <button
                className="px-3 py-1 rounded-full border border-emerald-500 text-emerald-200 hover:bg-emerald-500/10 disabled:opacity-50"
                onClick={confirmStealChoice}
                disabled={totalStealSelected !== stealRequired}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      {pickTokenOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-4 w-[340px] shadow-2xl">
            <div className="text-sm text-slate-100 mb-2">Pick a token (costs your main action).</div>
            <div className="grid grid-cols-3 gap-2 mb-3">
              {[
                { key: "attack", label: "Ferocity", color: "border-red-500 text-red-200", count: me?.tokens?.attack ?? me?.tokens?.ATTACK ?? 0 },
                { key: "conversion", label: "Conversion", color: "border-blue-500 text-blue-200", count: me?.tokens?.conversion ?? me?.tokens?.CONVERSION ?? 0 },
                { key: "wild", label: "Wild", color: "border-amber-500 text-amber-200", count: me?.tokens?.wild ?? me?.tokens?.WILD ?? 0 },
              ].map((opt) => {
                const capped = opt.count >= 3;
                const selected = pickTokenChoice === opt.key;
                return (
                  <button
                    key={opt.key}
                    disabled={capped}
                    onClick={() => setPickTokenChoice(opt.key)}
                    className={`px-2 py-3 rounded-lg border text-sm transition ${
                      capped
                        ? "border-slate-700 text-slate-500 cursor-not-allowed"
                        : selected
                          ? `${opt.color} bg-slate-800`
                          : "border-slate-700 text-slate-200 hover:border-emerald-400"
                    }`}
                  >
                    <div className="uppercase text-[10px] tracking-[0.18em]">{opt.label}</div>
                    <div className="text-xs text-slate-400">Have: {opt.count}</div>
                  </button>
                );
              })}
            </div>
            <div className="flex justify-end gap-2 text-[11px]">
              <button
                className="px-3 py-1 rounded-full border border-slate-700 text-slate-300 hover:bg-slate-800"
                onClick={() => setPickTokenOpen(false)}
              >
                Cancel
              </button>
              <button
                className="px-3 py-1 rounded-full border border-emerald-500 text-emerald-200 hover:bg-emerald-500/10 disabled:opacity-50"
                onClick={confirmPickToken}
                disabled={!pickTokenChoice}
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}

      <HoverPreviewPortal disabled={suppressPreview} />

      {selectedCard && (
        <ConfirmModal
          card={selectedCard.card}
          onConfirm={submitSelectedAction}
          onCancel={() => setSelectedCard(null)}
        />
      )}
    </div>
  );
}
