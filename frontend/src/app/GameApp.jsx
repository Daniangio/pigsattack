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
import { X } from 'lucide-react';

const stanceDistance = (a, b) => {
  if (!a || !b) return 2;
  if (a === b) return 0;
  const lowerA = String(a).toLowerCase();
  const lowerB = String(b).toLowerCase();
  if (lowerA === "balanced" || lowerB === "balanced") return 1;
  return 2;
};

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
  const [isFollowingTurn, setIsFollowingTurn] = useState(true);
  const [selectedCard, setSelectedCard] = useState(null); // selected card for confirmation
  const [highlightBuyables, setHighlightBuyables] = useState(false);
  const [suppressPreview, setSuppressPreview] = useState(false);
  const [hasTurnRedirected, setHasTurnRedirected] = useState(false);
  const stanceBaselineRef = useRef(null);
  const lastLegalStanceRef = useRef(null);
  const currentTurnPlayerId = gameData?.active_player_id || gameData?.activePlayerId;
  const backendTurnInitialStances = gameData?.turn_initial_stance || {};
  const isMyTurn = userId && currentTurnPlayerId === userId;
  const backendBaseline = useMemo(
    () => backendTurnInitialStances?.[activePlayerId] || backendActivePlayer?.stance,
    [backendTurnInitialStances, activePlayerId, backendActivePlayer?.stance]
  );

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

  const updatePlayerStance = (stance) => {
    setStanceOverrides((prev) => ({ ...prev, [activePlayerId]: stance }));
    if (!remotePlayers.length) {
      setLocalPlayers((prev) =>
        prev.map((p) => (p.id === activePlayerId ? { ...p, stance } : p))
      );
    }
  };

  const revertToLastLegal = () => {
    const fallback = lastLegalStanceRef.current || backendActivePlayer?.stance;
    setStanceOverrides((prev) => {
      const next = { ...prev };
      if (fallback) {
        next[activePlayerId] = fallback;
      } else {
        delete next[activePlayerId];
      }
      return next;
    });
    if (fallback) {
      onStanceStep?.(fallback.toUpperCase());
    }
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

  const handleSelectPlayer = (id) => {
    setActivePlayerId(id);
    setIsFollowingTurn(id === currentTurnPlayerId);
  };

  const handleFreeStanceChange = (stance) => {
    if (!isMyTurn) return;
    if (!activePlayer) return;

    const baseline = backendTurnInitialStances?.[activePlayerId] || backendActivePlayer?.stance || activePlayer.stance;
    const distance = stanceDistance(baseline, stance);
    const revertTo = lastLegalStanceRef.current || baseline;

    const applyStance = (shouldSubmit = false) => {
      updatePlayerStance(stance);
      lastLegalStanceRef.current = stance;
      setPrompt(null);
      if (shouldSubmit) {
        onRealign?.(stance);
      } else {
        onStanceStep?.(stance.toUpperCase());
      }
    };

    if (distance <= 1) {
      applyStance(false);
      return;
    }

    // Move to the chosen stance visually, but require confirm if it's a long jump
    updatePlayerStance(stance);

    setPromptSafe({
      type: "stance",
      message: `Change stance to ${stance}?`,
      onConfirm: () => applyStance(true),
      onCancel: () => {
        if (revertTo && revertTo !== activePlayer.stance) {
          updatePlayerStance(revertTo);
          lastLegalStanceRef.current = revertTo;
          onStanceStep?.(revertTo.toUpperCase());
        }
        setPrompt(null);
      },
    });
  };

  const startExtendFlowWithChoice = (slotType) => {
    clearBuySelection();
    if (!activePlayer) return;
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

        {/* Main content area */}
        <div className="flex-1 min-h-0 px-6 py-4 overflow-hidden">
          <div className="relative w-full h-full overflow-hidden rounded-3xl">
            <div className={`h-full grid grid-cols-2 gap-3 transition-all duration-500 ${zoomedPanel ? "scale-95 opacity-0 pointer-events-none" : "opacity-100"}`}>
              <ThreatsPanel
                compact
                playersCount={players.length}
                rows={threatRows}
                boss={boss}
                onFightRow={onFightRow}
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
                        <ThreatsPanel rows={threatRows} boss={boss} onFightRow={onFightRow} />
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
