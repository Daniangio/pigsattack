import React, { useState, useMemo, useEffect, useRef } from "react";
import { useStore } from "../store";

// Import all components from their respective files
import { gameBackground, LURE_CARDS } from "./game/GameConstants.jsx";
import GameHeader from "./game/GameHeader.jsx";
// Import CollapsiblePlayerAssets instead of PlayerAssets
import { CollapsiblePlayerAssets } from "./game/PlayerBoard.jsx";
import { playerPortraits, PlayerInfoCard } from "./game/GameCoreComponents.jsx";
import { GameLog } from "./game/GameUIHelpers.jsx";
import {
  ArsenalMarket,
  UpgradesMarket,
  ThreatsPanel,
} from "./game/GamePanels.jsx";
import { ConfirmationModal, DefenseSubmission } from "./game/GameModals.jsx";
import {
  PlanningPhaseActions,
  AttractionPhaseActions,
  ActionPhaseActions,
  IntermissionPhaseActions,
} from "./game/GameActionPanels.jsx";
import GameMenu from "./game/GameMenu.jsx";

// --- MAIN GAME PAGE COMPONENT (REFACTORED FOR OVERLAPPING UI) ---
const GamePage = () => {
  const { user, gameState, token } = useStore((state) => ({
    user: state.user,
    gameState: state.gameState,
    token: state.token,
  }));

  const [showSurrenderModal, setShowSurrenderModal] = useState(false);
  const [viewingPlayerId, setViewingPlayerId] = useState(null);
  const [selectedThreatId, setSelectedThreatId] = useState(null);

  // New States for collapsible panels
  const [isAssetsPanelOpen, setIsAssetsPanelOpen] = useState(false);
  const [isQueueOpen, setIsQueueOpen] = useState(true); // Initiative Queue (Left)
  const [isLogOpen, setIsLogOpen] = useState(false); // Game Log (Right)

  // Ref for double-click logic
  const clickTimeoutRef = useRef(null);

  const playerPortraitsMap = useMemo(() => {
    if (!gameState?.players) return {};
    const playerIds =
      gameState.initiative_queue || Object.keys(gameState.players);
    const portraits = {};
    playerIds.forEach((pid, index) => {
      portraits[pid] = playerPortraits[index % playerPortraits.length];
    });
    return portraits;
  }, [gameState?.initiative_queue, gameState?.players]);

  const self = useMemo(() => {
    return gameState?.players ? gameState.players[user?.id] : null;
  }, [gameState, user?.id]);

  useEffect(() => {
    if (user?.id && !viewingPlayerId) {
      setViewingPlayerId(user.id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // --- REMOVED: Old useEffect logic that incorrectly reset viewingPlayerId ---
  // The viewingPlayerId state is now solely managed by handlePlayerInfoClick and handleToggleAssets.

  const sendGameAction = (actionName, data) => {
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
          sub_action: actionName,
          data: data,
        },
      });
    } catch (error) {
      console.error(`Failed to send game action '${actionName}':`, error);
    }
  };

  const handleSurrender = () => {
    sendGameAction("surrender", {});
    setShowSurrenderModal(false);
  };

  const handleReturnToLobby = () => {
    const sendMessage = useStore.getState().sendMessage;
    if (sendMessage) {
      try {
        sendMessage({ action: "return_to_lobby" });
      } catch (error) {
        console.error("Failed to return to lobby:", error);
      }
    }
  };

  const handlePlayerInfoClick = (playerId, isSelf) => {
    // Clear any pending single-click timeout
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current);
      clickTimeoutRef.current = null;

      // --- Double Click Action: View Player Board AND Open Panel ---
      setViewingPlayerId(playerId);
      setIsAssetsPanelOpen(true);
    } else {
      // --- Single Click Action: View Player Board ONLY, keep panel state ---
      clickTimeoutRef.current = setTimeout(() => {
        clickTimeoutRef.current = null;
        setViewingPlayerId(playerId);
        // On single click, the panel state (isAssetsPanelOpen) remains unchanged.
      }, 300); // 300ms window for double click
    }
  };

  const handleToggleAssets = () => {
    // If the panel is currently open and viewing a player other than self,
    // toggle means returning to self's view first, then closing the panel.
    if (isAssetsPanelOpen && viewingPlayerId !== user.id) {
      setViewingPlayerId(user.id);
    }
    setIsAssetsPanelOpen(!isAssetsPanelOpen);
  };

  const sendMessageForLoadingCheck = useStore((state) => state.sendMessage);

  const threatAssignments = useMemo(() => {
    const assignments = {};
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
  }, [gameState?.players, gameState?.player_threat_assignment]);

  const selectableThreats = useMemo(() => {
    if (
      gameState?.phase !== "ATTRACTION" ||
      !self ||
      self.user_id !== gameState?.attraction_turn_player_id
    ) {
      return [];
    }

    // --- FIX APPLIED HERE: Added optional chaining self?.user?.id ---
    const myPlan = gameState.player_plans[self?.user?.id];
    if (!myPlan) return [];

    const available = gameState.current_threats.filter((t) =>
      gameState.available_threat_ids.includes(t.id)
    );
    if (gameState.attraction_phase_state === "FIRST_PASS") {
      const myLureKey = myPlan.lure_card_key;
      const myLureCard = LURE_CARDS.find((c) => c.id === myLureKey);
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
  }, [
    gameState?.phase,
    self,
    gameState?.attraction_turn_player_id,
    gameState?.player_plans,
    gameState?.current_threats,
    gameState?.available_threat_ids,
    gameState?.attraction_phase_state,
  ]);

  const threatsToShow = useMemo(() => {
    if (!gameState) return [];
    if (gameState.phase === "PLANNING") {
      return gameState.current_threats || [];
    }
    const viewingPlayer = gameState.players[viewingPlayerId];
    if (viewingPlayer) {
      const assignedThreatId =
        gameState.player_threat_assignment[viewingPlayer.user_id];
      const assignedThreat = gameState.current_threats.find(
        (t) => t.id === assignedThreatId
      );
      if (assignedThreat) return [assignedThreat];
    }
    return gameState.current_threats || [];
  }, [
    gameState?.phase,
    gameState?.current_threats,
    gameState?.player_threat_assignment,
  ]);

  if (!gameState || !user || !sendMessageForLoadingCheck) {
    return (
      <div
        className="flex justify-center items-center min-h-screen bg-gray-900 text-white bg-cover bg-center bg-fixed"
        style={{
          backgroundImage: `url(${gameBackground})`,
          onError: (e) => {
            e.target.style.backgroundImage = "none";
            e.target.style.backgroundColor = "#1a202c";
          },
        }}
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

  const canConfirmThreat = selectedThreatId !== null;

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
      if (turnIndex === -1) return "PENDING";
      return myIndex < turnIndex ? "WAITING" : "PENDING";
    }
    if (phase === "INTERMISSION") {
      if (playerId === intermission_turn_player_id) return "ACTIVE";
      const purchaseState = gameState.intermission_purchases[playerId];
      return purchaseState !== 0 ? "WAITING" : "PENDING";
    }
    if (phase === "PLANNING") {
      return player.plan || player.plan_submitted ? "WAITING" : "ACTIVE";
    }
    if (phase === "DEFENSE") {
      const hasThreat = !!player_threat_assignment[playerId];
      if (!hasThreat) return "NONE";
      return player.defense ? "WAITING" : "ACTIVE";
    }
    return "NONE";
  };

  const handleMarketCardSelect = (cardType, cardId) => {
    if (phase === "ACTION") {
      const actionName =
        cardType === "UPGRADE" ? "perform_fortify" : "perform_armory_run";
      sendGameAction(actionName, {
        card_id: cardId,
      });
    } else if (phase === "INTERMISSION") {
      sendGameAction("buy_from_market", {
        card_id: cardId,
      });
    }
  };

  const handleThreatSelect = (threatId) => {
    if (phase === "ATTRACTION" && self?.user_id === attraction_turn_player_id) {
      setSelectedThreatId((prev) => (prev === threatId ? null : threatId));
    }
  };

  const isPureSpectator = !self;
  const hasLeft =
    self && (self.status === "SURRENDERED" || self.status === "DISCONNECTED");
  const isSpectator = isPureSpectator || hasLeft;

  const myActionKey = self?.plan ? self.plan.action_card_key : null;

  const isMyTurnForMarket =
    (phase === "ACTION" &&
      self &&
      self.user_id === action_turn_player_id &&
      (myActionKey === "FORTIFY" || myActionKey === "ARMORY_RUN")) ||
    (phase === "INTERMISSION" &&
      self &&
      self.user_id === intermission_turn_player_id);

  const viewingPlayerTurnStatus = viewingPlayerId
    ? getPlayerTurnStatus(viewingPlayerId)
    : "NONE";

  const myAssignedThreatId = player_threat_assignment[self?.user_id];
  const myAssignedThreat = current_threats.find(
    (t) => t.id === myAssignedThreatId
  );

  return (
    // Root container: Full screen, no scroll, flex column, relative for absolute children
    <div
      className="relative flex flex-col h-screen w-screen overflow-hidden text-white bg-cover bg-center bg-fixed"
      style={{
        backgroundImage: `url(${gameBackground})`,
        onError: (e) => {
          e.target.style.backgroundImage = "none";
          e.target.style.backgroundColor = "#1a202c";
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

      {/* 1. Top Bar: Markets + Game State + Menu (Fixed Top) */}
      <header className="fixed top-0 left-0 w-full flex-shrink-0 p-2 bg-black bg-opacity-60 shadow-lg z-30">
        <div className="flex justify-between items-start gap-4">
          {/* Left Market */}
          <div className="flex-1 max-w-xs h-[16vh] min-h-[120px]">
            <UpgradesMarket
              upgrade_market={market.upgrade_faceup}
              myTurn={isMyTurnForMarket}
              phase={phase}
              choiceType={myActionKey}
              onCardSelect={handleMarketCardSelect}
              playerScrap={self?.scrap}
            />
          </div>

          {/* Center Info */}
          <div className="flex-shrink-0 pt-2">
            <GameHeader round={round} era={era} phase={phase} />
          </div>

          {/* Right Market */}
          <div className="flex-1 max-w-xs h-[16vh] min-h-[120px]">
            <ArsenalMarket
              arsenal_market={market.arsenal_faceup}
              myTurn={isMyTurnForMarket}
              phase={phase}
              choiceType={myActionKey}
              onCardSelect={handleMarketCardSelect}
              playerScrap={self?.scrap}
            />
          </div>

          {/* Menu Trigger */}
          <div className="flex-shrink-0">
            <GameMenu
              onSurrender={() => setShowSurrenderModal(true)}
              onReturnToLobby={handleReturnToLobby}
              isSpectator={isPureSpectator}
              hasLeft={hasLeft}
              phase={phase}
            />
          </div>
        </div>
      </header>

      {/* 2. Main Board Area (Occupies full screen below header, above assets panel top bar) */}
      <main className="absolute inset-0 pt-[18vh] pb-[5rem] overflow-hidden">
        <div className="flex flex-col h-full gap-1 p-1">
          {isSpectator ? (
            <div className="text-center p-4 bg-gray-800 bg-opacity-70 rounded-lg h-full flex flex-col justify-center items-center">
              <p className="text-lg text-yellow-300 mb-4">
                {isPureSpectator
                  ? "You are spectating."
                  : `You have ${self?.status?.toLowerCase()}. You can continue watching.`}
              </p>
              <button
                onClick={handleReturnToLobby}
                className="btn btn-primary text-lg px-6 py-2"
              >
                Return to Lobby
              </button>
            </div>
          ) : (
            <>
              {/* Top Half: Threats (Main focus of the board) */}
              <div className="h-1/2 overflow-hidden">
                <ThreatsPanel
                  threats={threatsToShow}
                  threatAssignments={threatAssignments}
                  onThreatSelect={handleThreatSelect}
                  selectableThreats={selectableThreats}
                  selectedThreatId={selectedThreatId}
                  gameState={gameState}
                />
              </div>
              {/* Bottom Half: Action Panel */}
              <div className="h-1/2 overflow-hidden bg-gray-800 bg-opacity-50 rounded-lg">
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
                  <DefenseSubmission
                    player={self}
                    threat={myAssignedThreat}
                    sendGameAction={sendGameAction}
                    gameState={gameState}
                    token={token}
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
                  <div className="text-center p-4 h-full flex flex-col justify-center items-center">
                    <h3 className="text-xl text-gray-300">Phase: {phase}</h3>
                    <span className="loading loading-spinner loading-lg text-blue-400 mt-4"></span>
                    <p className="text-gray-400 mt-4">
                      Resolving game state...
                    </p>
                  </div>
                )}
                {phase === "GAME_OVER" && (
                  <div className="text-center p-4 h-full flex flex-col justify-center items-center">
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
            </>
          )}
        </div>
      </main>

      {/* 3. Overlapping Side Panels (Fixed) */}

      {/* Initiative Queue (Left) */}
      <div
        className={`fixed top-[18vh] bottom-[5rem] w-1/5 flex-shrink-0 p-2 bg-black bg-opacity-70 shadow-lg z-40 transition-transform duration-300 ${
          isQueueOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <button
          onClick={() => setIsQueueOpen(!isQueueOpen)}
          className="absolute top-1/2 -right-6 z-50 bg-gray-700 hover:bg-gray-600 text-white p-1 rounded-r-full -translate-y-1/2"
          title={isQueueOpen ? "Collapse Queue" : "Expand Queue"}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className={`h-5 w-5 transform transition-transform ${
              isQueueOpen ? "rotate-180" : "rotate-0"
            }`}
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z"
              clipRule="evenodd"
            />
          </svg>
        </button>

        <div className="flex flex-col gap-2 h-full overflow-y-auto pr-1">
          <h4 className="text-lg font-bold text-yellow-300 mb-2">INITIATIVE</h4>
          {initiative_queue.map((pid, index) => (
            <PlayerInfoCard
              key={pid}
              player={gameState.players[pid]}
              isSelf={pid === user.id}
              portrait={playerPortraitsMap[pid]}
              turnStatus={getPlayerTurnStatus(pid)}
              turnOrder={index + 1}
              plan={player_plans[pid]}
              isViewing={pid === viewingPlayerId}
              onClick={() => handlePlayerInfoClick(pid, pid === user.id)}
            />
          ))}
        </div>
      </div>

      {/* Game Log (Right) */}
      <div
        className={`fixed top-[18vh] bottom-[5rem] right-0 w-1/5 flex-shrink-0 p-2 bg-black bg-opacity-70 shadow-lg z-40 transition-transform duration-300 ${
          isLogOpen ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <button
          onClick={() => setIsLogOpen(!isLogOpen)}
          className="absolute top-1/2 -left-6 z-50 bg-gray-700 hover:bg-gray-600 text-white p-1 rounded-l-full -translate-y-1/2"
          title={isLogOpen ? "Collapse Log" : "Expand Log"}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className={`h-5 w-5 transform transition-transform ${
              isLogOpen ? "rotate-180" : "rotate-0"
            }`}
            viewBox="0 0 20 20"
            fill="currentColor"
          >
            <path
              fillRule="evenodd"
              d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
              clipRule="evenodd"
            />
          </svg>
        </button>
        <GameLog logs={log} className="bg-transparent" />
      </div>

      {/* 4. Player Assets Panel (Bottom) */}
      {self && (
        <CollapsiblePlayerAssets
          player={gameState.players[viewingPlayerId] || self}
          user={user}
          viewingPlayerId={viewingPlayerId}
          portrait={playerPortraitsMap[viewingPlayerId || user.id]}
          isAssetsOpen={isAssetsPanelOpen}
          toggleAssets={handleToggleAssets} // Use the custom handler
          onReturn={() => setViewingPlayerId(user.id)}
          phase={phase}
          playerPlan={player_plans[viewingPlayerId || user.id]}
          turnStatus={viewingPlayerTurnStatus}
        />
      )}
    </div>
  );
};

export default GamePage;
