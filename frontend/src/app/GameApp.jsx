import React, { useEffect, useMemo, useState } from 'react';
import { VIEW_MODES } from '../state/uiState';
import { INITIAL_PLAYERS } from '../state/players';
import InitiativeRail from '../components/navigation/InitiativeRail';
import TopNavigation from '../components/navigation/TopNavigation';
import ThreatsPanel from '../components/threats/ThreatsPanel';
import MarketPanel from '../components/market/MarketPanel';
import PlayerBoardBottom from '../components/player/PlayerBoardBottom';
import PlayerActionPanel from '../components/player/PlayerActionPanel';
import PlayerMiniBoard from '../components/player/PlayerMiniBoard';
import HoverPreviewPortal from '../components/hover/HoverPreviewPortal';
import { normalizeStance } from '../utils/formatters';
import { setHoverPreview } from '../components/hover/HoverPreviewPortal';
import MarketCardDetail from '../components/market/MarketCardDetail';

function ActionFlowPanel({ actionFlow, submitExtendFlow, cancelFlow, submitTinkerFlow, setActionFlow }) {
  if (!actionFlow) return null;

  if (actionFlow.type === "extend") {
    return (
      <div className="bg-slate-900 border border-slate-700 rounded-xl p-3 text-sm">
        <div className="text-xs uppercase tracking-[0.2em] text-slate-500 mb-2">Extend Slot</div>
        <div className="flex gap-2 mb-3">
          <button
            type="button"
            disabled={actionFlow.upgradeFull}
            onClick={() => setActionFlow((prev) => ({ ...prev, slotChoice: "upgrade" }))}
            className={`flex-1 px-3 py-2 rounded-lg border text-sm ${
              actionFlow.slotChoice === "upgrade"
                ? "border-amber-400 text-amber-200 bg-amber-400/10"
                : "border-slate-700 text-slate-200"
            } ${actionFlow.upgradeFull ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            Upgrade Slot
          </button>
          <button
            type="button"
            disabled={actionFlow.weaponFull}
            onClick={() => setActionFlow((prev) => ({ ...prev, slotChoice: "weapon" }))}
            className={`flex-1 px-3 py-2 rounded-lg border text-sm ${
              actionFlow.slotChoice === "weapon"
                ? "border-amber-400 text-amber-200 bg-amber-400/10"
                : "border-slate-700 text-slate-200"
            } ${actionFlow.weaponFull ? "opacity-50 cursor-not-allowed" : ""}`}
          >
            Weapon Slot
          </button>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={submitExtendFlow}
            className="flex-1 px-3 py-2 rounded-lg border border-emerald-400 text-emerald-200 hover:bg-emerald-400/10 text-sm"
          >
            Submit
          </button>
          <button
            type="button"
            onClick={cancelFlow}
            className="flex-1 px-3 py-2 rounded-lg border border-slate-700 text-slate-200 hover:bg-slate-800 text-sm"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (actionFlow.type === "tinker") {
    return (
      <div className="bg-slate-900 border border-slate-700 rounded-xl p-3 text-sm">
        <div className="text-xs uppercase tracking-[0.2em] text-slate-500 mb-2">Tinker & Realign</div>
        <div className="text-sm text-slate-200 mb-3">Choose any stance, then submit or cancel.</div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={submitTinkerFlow}
            className="flex-1 px-3 py-2 rounded-lg border border-emerald-400 text-emerald-200 hover:bg-emerald-400/10 text-sm"
          >
            Submit
          </button>
          <button
            type="button"
            onClick={cancelFlow}
            className="flex-1 px-3 py-2 rounded-lg border border-slate-700 text-slate-200 hover:bg-slate-800 text-sm"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return null;
}

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
  onBuyUpgrade,
  onBuyWeapon,
  onExtendSlot,
  onRealign,
  onStanceStep,
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
      resources: p.resources || { R: 0, B: 0, G: 0 },
      tokens: p.tokens || {},
      vp: p.vp ?? 0,
      upgrades: p.upgrades || [],
      weapons: p.weapons || [],
      upgradeSlots: p.upgrade_slots ?? p.upgradeSlots ?? 1,
      weaponSlots: p.weapon_slots ?? p.weaponSlots ?? 1,
      status: p.status,
    }));
  }, [gameData]);

  const remotePlayers = mappedPlayers;
  const [localPlayers, setLocalPlayers] = useState(INITIAL_PLAYERS);
  const players = remotePlayers.length ? remotePlayers : localPlayers;
  const [activePlayerId, setActivePlayerId] = useState(players[0]?.id || null);
  const [viewMode, setViewMode] = useState(VIEW_MODES.GLOBAL);
  const [stanceMenuOpen, setStanceMenuOpen] = useState(false);
  const [isFollowingTurn, setIsFollowingTurn] = useState(true);
  const [actionFlow, setActionFlow] = useState(null); // {type:'tinker'|'extend', selectedStance?, originalStance?, slotChoice?}
  const [selectedCard, setSelectedCard] = useState(null); // selected card for confirmation
  const [freeStanceUsed, setFreeStanceUsed] = useState(false);
  const [highlightBuyables, setHighlightBuyables] = useState(false);
  const [suppressPreview, setSuppressPreview] = useState(false);
  const [hasTurnRedirected, setHasTurnRedirected] = useState(false);
  const currentTurnPlayerId = gameData?.active_player_id || gameData?.activePlayerId;
  const isMyTurn = userId && currentTurnPlayerId === userId;
  const isAdjacentStance = (current, target) => {
    if (!current || !target) return false;
    const cur = current.toUpperCase();
    const tgt = target.toUpperCase();
    if (cur === tgt) return true;
    if (cur === "BALANCED" || tgt === "BALANCED") return true;
    return false;
  };

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
    // Reset staged flows when switching viewed player
    setActionFlow(null);
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
    setFreeStanceUsed(false);
  }, [currentTurnPlayerId]);

  useEffect(() => {
    if (isFollowingTurn && currentTurnPlayerId) {
      setActivePlayerId(currentTurnPlayerId);
    }
  }, [currentTurnPlayerId, isFollowingTurn]);

  useEffect(() => {
    if (
      isMyTurn &&
      activePlayerId &&
      activePlayerId !== userId &&
      !hasTurnRedirected
    ) {
      setActivePlayerId(userId);
      setIsFollowingTurn(false);
      setHasTurnRedirected(true);
      onLocalToast?.("It's your turn!", "emerald");
    }
    if (!isMyTurn) {
      setHasTurnRedirected(false);
    }
  }, [isMyTurn, activePlayerId, userId, onLocalToast, hasTurnRedirected]);

  const activePlayer = players.find(p => p.id === activePlayerId);
  const me = players.find((p) => p.id === userId);
  const threatRows = gameData?.threat_rows || gameData?.threatRows;
  const boss = gameData?.boss;
  const market = gameData?.market;
  const firstFrontRow = useMemo(() => {
    if (!threatRows || !threatRows.length) return 0;
    const idx = threatRows.findIndex((row) => row && row.length);
    return idx >= 0 ? idx : 0;
  }, [threatRows]);
  const cardCatalog = useMemo(
    () => [
      ...(market?.upgrades || []),
      ...(market?.weapons || []),
    ],
    [market]
  );

  const clearBuySelection = () => {
    if (selectedCard) {
      setSelectedCard(null);
      setViewMode(VIEW_MODES.MARKET);
      setHoverPreview(null);
    }
  };

  const handleSelectPlayer = (id) => {
    setActivePlayerId(id);
    setIsFollowingTurn(id === currentTurnPlayerId);
  };

  const handleFreeStanceChange = (stance) => {
    if (actionFlow?.type === "tinker") {
      setActionFlow((prev) => ({ ...prev, selectedStance: stance }));
      return;
    }
    if (freeStanceUsed) {
      onLocalToast?.("You already shifted stance this turn.", "amber");
      return;
    }
    const current = me?.stance;
    if (!current || !isAdjacentStance(current, stance)) {
      onLocalToast?.("Illegal stance change. Use Tinker for large shifts.", "amber");
      return;
    }
    if (onStanceStep) {
      onStanceStep(stance.toUpperCase());
      setStanceMenuOpen(false);
      setFreeStanceUsed(true);
    }
  };

  const startTinkerFlow = () => {
    clearBuySelection();
    if (!activePlayer) return;
    setActionFlow({
      type: "tinker",
      originalStance: activePlayer.stance,
      selectedStance: activePlayer.stance,
    });
    setStanceMenuOpen(true);
  };

  const submitTinkerFlow = () => {
    if (actionFlow?.type !== "tinker" || !actionFlow.selectedStance) return;
    onRealign?.(actionFlow.selectedStance);
    setActionFlow(null);
    setStanceMenuOpen(false);
  };

  const startExtendFlow = () => {
    clearBuySelection();
    if (!activePlayer) return;
    const upgradeFull = (activePlayer.upgradeSlots ?? 1) >= 4;
    const weaponFull = (activePlayer.weaponSlots ?? 1) >= 4;
    const defaultChoice = !upgradeFull ? "upgrade" : !weaponFull ? "weapon" : null;
    setActionFlow({
      type: "extend",
      slotChoice: defaultChoice,
      upgradeFull,
      weaponFull,
    });
  };
  const startExtendFlowWithChoice = (slotType) => {
    startExtendFlow();
    setActionFlow((prev) => (prev ? { ...prev, slotChoice: slotType } : prev));
  };

  const submitExtendFlow = () => {
    if (actionFlow?.type !== "extend") return;
    if (actionFlow.slotChoice) {
      onExtendSlot?.(actionFlow.slotChoice);
    } else {
      onExtendSlot?.(null);
    }
    setActionFlow(null);
  };

  const cancelFlow = () => {
    if (actionFlow?.type === "tinker") {
      setActionFlow(null);
      setStanceMenuOpen(false);
    } else if (actionFlow?.type === "extend") {
      setActionFlow(null);
    }
  };

  const displayStance = actionFlow?.type === "tinker" ? actionFlow.selectedStance : undefined;

  const startBuyUpgrade = () => {
    setViewMode(VIEW_MODES.MARKET);
    setSelectedCard(null);
    setHighlightBuyables(true);
    setTimeout(() => setHighlightBuyables(false), 1200);
  };

  const handleCardBuyClick = (card) => {
    if (!card) return;
    const actionType = card.type === "Weapon" ? "buy_weapon" : "buy_upgrade";
    setActionFlow(null);
    setStanceMenuOpen(false);
    setSelectedCard({ type: actionType, card });
    setViewMode(VIEW_MODES.MARKET);
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

        <TopNavigation viewMode={viewMode} onChange={setViewMode} />

        {/* Main content area */}
        <div className="flex-1 min-h-0 px-6 py-4 overflow-hidden">
         {viewMode === VIEW_MODES.GLOBAL && (
           <div className="w-full h-full flex flex-col gap-3 overflow-hidden">
             <div className="flex-1 min-h-0 grid grid-cols-2 gap-3 overflow-hidden">
               <ThreatsPanel compact playersCount={players.length} rows={threatRows} boss={boss} onFightRow={onFightRow} />
                <MarketPanel
                  compact
                  market={market}
                  onCardBuy={handleCardBuyClick}
                  selectedCardId={selectedCard?.card?.id}
                  canBuyCard={canBuyCard}
                  hasSlotForCard={hasSlotForCard}
                  isMyTurn={isMyTurn}
                  highlightBuyables={highlightBuyables}
                />
              </div>

              <div className="h-28 bg-slate-950/70 border border-slate-800 rounded-2xl p-2 flex gap-2 overflow-x-auto">
                {players.map(p => (
                  <PlayerMiniBoard
                    key={p.id}
                    player={p}
                    isActive={p.id === activePlayerId}
                    isTurn={p.id === currentTurnPlayerId}
                    onSelect={handleSelectPlayer}
                  />
                ))}
              </div>
            </div>
          )}

          {viewMode === VIEW_MODES.THREATS && (
            <div className="w-full h-full grid grid-cols-12 gap-4">
              <div className="col-span-4">
                <div className="flex flex-col gap-3">
                  <PlayerActionPanel
                    onFight={
                      onFightRow
                        ? () => {
                            clearBuySelection();
                            onFightRow(firstFrontRow);
                          }
                        : undefined
                    }
                    onBuyUpgrade={startBuyUpgrade}
                    onExtendSlot={startExtendFlow}
                    onRealign={startTinkerFlow}
                  />
                  <ActionFlowPanel
                    actionFlow={actionFlow}
                    submitExtendFlow={submitExtendFlow}
                    cancelFlow={cancelFlow}
                    submitTinkerFlow={submitTinkerFlow}
                    setActionFlow={setActionFlow}
                  />
                </div>
              </div>
              <div className="col-span-8">
                <ThreatsPanel rows={threatRows} boss={boss} onFightRow={onFightRow} />
              </div>
            </div>
          )}

          {viewMode === VIEW_MODES.MARKET && (
            <div className="w-full h-full grid grid-cols-12 gap-4">
              <div className="col-span-4">
                <div className="flex flex-col gap-3">
                  <PlayerActionPanel
                    onFight={
                      onFightRow
                        ? () => {
                            clearBuySelection();
                            onFightRow(firstFrontRow);
                          }
                        : undefined
                    }
                    onBuyUpgrade={startBuyUpgrade}
                    onExtendSlot={startExtendFlow}
                    onRealign={startTinkerFlow}
                  />
                  <ActionFlowPanel
                    actionFlow={actionFlow}
                    submitExtendFlow={submitExtendFlow}
                    cancelFlow={cancelFlow}
                    submitTinkerFlow={submitTinkerFlow}
                    setActionFlow={setActionFlow}
                  />
                </div>
              </div>
              <div className="col-span-8">
                <MarketPanel
                  market={market}
                  onCardBuy={handleCardBuyClick}
                  selectedCardId={selectedCard?.card?.id}
                  canBuyCard={canBuyCard}
                  hasSlotForCard={hasSlotForCard}
                  isMyTurn={isMyTurn}
                  highlightBuyables={highlightBuyables}
                />
              </div>
            </div>
          )}
        </div>

        {viewMode !== VIEW_MODES.GLOBAL && (
          <PlayerBoardBottom
            player={activePlayer}
            players={players}
            setPlayers={remotePlayers.length ? undefined : setLocalPlayers}
            cardCatalog={cardCatalog}
            activePlayerId={activePlayerId}
            stanceMenuOpen={stanceMenuOpen}
            onToggleStance={() => setStanceMenuOpen((v) => !v)}
            onCloseStance={() => setStanceMenuOpen(false)}
            onRealign={submitTinkerFlow}
            onFreeStanceChange={handleFreeStanceChange}
            displayStance={displayStance}
            onInitiateExtendSlot={startExtendFlowWithChoice}
            actionFlow={actionFlow}
          />
        )}
      </div>

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
