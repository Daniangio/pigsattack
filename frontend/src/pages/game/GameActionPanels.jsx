import React, { useState, useEffect, useRef } from "react";
import { LURE_CARDS, ACTION_CARDS } from "./GameConstants.jsx";
import { ScavengeChoiceModal } from "./GameModals.jsx";
import { LureIcon } from "./GameUIHelpers.jsx";

export const PlanningPhaseActions = ({ sendGameAction, player }) => {
  const [lure, setLure] = useState(null);
  const [action, setAction] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const failSafeTimeoutRef = useRef(null);

  useEffect(() => {
    // If the plan is submitted (player.plan exists) and there's a timeout running,
    // clear it and reset the loading state.
    if (player.plan && failSafeTimeoutRef.current) {
      clearTimeout(failSafeTimeoutRef.current);
      failSafeTimeoutRef.current = null;
      setIsLoading(false);
    }
  }, [player.plan]);

  useEffect(() => {
    return () => {
      if (failSafeTimeoutRef.current) {
        clearTimeout(failSafeTimeoutRef.current);
      }
    };
  }, []);

  // If the player object has a 'plan' property, it means they have successfully
  // submitted their plan for the round.
  if (player?.plan) {
    return (
      <div className="text-center p-4 h-full flex items-center justify-center">
        <h3 className="text-lg text-green-400">
          Plan submitted. Waiting for other players...
        </h3>
      </div>
    );
  }

  if (!player || !player.action_cards || !player.lure_cards) {
    return (
      <div className="text-center p-4 bg-gray-700 bg-opacity-80 rounded-lg h-full flex flex-col justify-center items-center">
        <h3 className="text-lg text-yellow-400">Loading planning state...</h3>
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-400 mx-auto mt-2"></div>
      </div>
    );
  }

  const canConfirm = lure && action && !isLoading;

  const handleSubmit = () => {
    if (canConfirm) {
      setIsLoading(true);
      failSafeTimeoutRef.current = setTimeout(() => {
        setIsLoading(false);
        console.error("Plan submission timed out.");
      }, 5000);

      try {
        // Send the constant IDs (e.g., "BLOODY_RAGS")
        sendGameAction("submit_plan", {
          lure_card_id: lure,
          action_card_id: action,
        });
      } catch (error) {
        console.error("Failed to submit plan:", error);
        setIsLoading(false);
        if (failSafeTimeoutRef.current) {
          clearTimeout(failSafeTimeoutRef.current);
        }
      }
    }
  };

  return (
    <div className="h-full flex items-stretch p-3">
      {/* Center: Card Selection Area - Takes most horizontal space */}
      <div className="flex-grow flex flex-col justify-center items-end pr-3 border-r border-gray-600">
        <div className="flex flex-row gap-8 items-center justify-end w-full">
          {/* Lure Selection Container */}
          <div className="flex flex-col items-center flex-shrink-0">
            <h4 className="text-white font-semibold mb-1 text-sm">
              Choose Lure:
            </h4>
            <div className="flex flex-row gap-2 overflow-x-auto pb-1">
              {player.lure_cards.map((backendCard) => {
                const constantCard = LURE_CARDS.find(
                  (c) => c.name === backendCard.name
                );
                if (!constantCard) return null;

                const isUnavailable =
                  backendCard.id === player.last_round_lure_id;

                return (
                  <img
                    key={constantCard.id}
                    src={constantCard.image}
                    alt={constantCard.name}
                    onClick={() => !isUnavailable && setLure(constantCard.id)}
                    className={`w-20 h-28 object-cover rounded-md shadow-md flex-shrink-0 transition-all ${
                      isUnavailable
                        ? "opacity-30 cursor-not-allowed"
                        : "cursor-pointer"
                    } ${
                      lure === constantCard.id
                        ? "ring-4 ring-blue-400"
                        : "ring-2 ring-gray-600 hover:ring-blue-300"
                    }`}
                    title={
                      isUnavailable ? `Used last round` : constantCard.name
                    }
                  />
                );
              })}
            </div>
          </div>

          {/* Action Selection Container */}
          <div className="flex flex-col items-center flex-shrink-0">
            <h4 className="text-white font-semibold mb-1 text-sm">
              Choose Action:
            </h4>
            <div className="flex flex-row gap-2 overflow-x-auto pb-1">
              {player.action_cards.map((backendCard) => {
                const constantCard = ACTION_CARDS.find(
                  (c) => c.name === backendCard.name
                );
                if (!constantCard) return null;

                return (
                  <img
                    key={constantCard.id}
                    src={constantCard.image}
                    alt={constantCard.name}
                    onClick={() => setAction(constantCard.id)}
                    className={`w-20 h-28 object-cover rounded-md shadow-md flex-shrink-0 transition-all cursor-pointer ${
                      action === constantCard.id
                        ? "ring-4 ring-blue-400"
                        : "ring-2 ring-gray-600 hover:ring-blue-300"
                    }`}
                    title={constantCard.name}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Right: Status and Submit - Fixed width for better screen usage */}
      <div className="flex-shrink-0 w-48 flex flex-col justify-center items-center pl-3">
        <div className="text-center p-2 bg-black bg-opacity-25 rounded-lg mb-4 w-full">
          <p className="text-lg text-blue-300">Choose your Lure and Action.</p>
          <p className="text-xs text-gray-400 mt-1">Phase: PLANNING</p>
        </div>

        <button
          onClick={handleSubmit}
          disabled={!canConfirm || isLoading}
          className={`btn ${
            canConfirm ? "btn-primary" : "btn-disabled"
          } text-lg px-6 w-full ${isLoading ? "loading" : ""}`}
        >
          {isLoading ? "Submitting..." : "Confirm Plan"}
        </button>
      </div>
    </div>
  );
};

export const AttractionPhaseActions = ({
  sendGameAction,
  player,
  gameState,
  selectedThreatId,
  canConfirm,
}) => {
  const { attraction_turn_player_id, attraction_phase_state, players } =
    gameState;
  const isMyTurn = player.user_id === attraction_turn_player_id;

  // Use player.user_id (which is the key) to get the plan
  const myPlan = gameState.player_plans[player.user_id];
  const myLureKey = myPlan ? myPlan.lure_card_key : null;
  const myLureCard = myLureKey
    ? LURE_CARDS.find((c) => c.id === myLureKey)
    : null;
  const myLureName = myLureCard ? myLureCard.name : "NONE";

  const handleSubmit = () => {
    if (canConfirm) {
      try {
        sendGameAction("assign_threat", { threat_id: selectedThreatId });
      } catch (error) {
        console.error("Failed to assign threat:", error);
      }
    }
  };

  const currentPlayerName =
    players[attraction_turn_player_id]?.username || "A player";

  return (
    <div className="h-full flex flex-col justify-center items-center space-y-3 p-3 bg-gray-700 bg-opacity-80 rounded-lg">
      <div className="text-center p-2 bg-black bg-opacity-25 rounded-lg w-full max-w-md">
        {isMyTurn ? (
          <>
            <p className="text-lg text-blue-300 animate-pulse">
              It's your turn to choose a Threat!
            </p>
            <div className="flex items-center justify-center gap-2 text-sm text-gray-200 mt-1">
              Your Lure:
              <LureIcon lure={myLureName} size="w-6 h-6" />
              <span className="font-semibold">{myLureName}</span>
            </div>
            <p className="text-xs text-gray-400 mt-1">
              Phase: ATTRACTION (
              {attraction_phase_state === "FIRST_PASS"
                ? "First Pass - Must pick a matching lure"
                : "Second Pass - Pick from remaining"}
              )
            </p>
          </>
        ) : (
          <p className="text-lg text-yellow-300">
            Waiting for {currentPlayerName} to choose a threat...
          </p>
        )}
      </div>

      <div className="flex justify-center items-center pt-3 border-t border-gray-600 w-full max-w-md">
        <button
          onClick={handleSubmit}
          disabled={!canConfirm || !isMyTurn}
          className={`btn ${
            canConfirm ? "btn-primary animate-pulse" : "btn-disabled"
          } text-lg px-6`}
        >
          {canConfirm ? "Confirm Threat" : "Select a Threat"}
        </button>
      </div>
    </div>
  );
};

export const ActionPhaseActions = ({ sendGameAction, player, gameState }) => {
  const { action_turn_player_id, players } = gameState;
  const isMyTurn = player.user_id === action_turn_player_id;

  // --- REFACTORED FIX ---
  // The backend now sends player.plan.action_card_key (e.g., "SCAVENGE")
  const myActionKey = player.plan ? player.plan.action_card_key : null;
  const myActionCard = myActionKey
    ? ACTION_CARDS.find((c) => c.id === myActionKey) // "SCAVENGE" === "SCAVENGE"
    : null;
  const myChoiceName = myActionCard ? myActionCard.name.toUpperCase() : null;

  const [showScavengeModal, setShowScavengeModal] = useState(false);

  useEffect(() => {
    if (isMyTurn && myChoiceName === "SCAVENGE") {
      setShowScavengeModal(true);
    } else {
      setShowScavengeModal(false);
    }
  }, [isMyTurn, myChoiceName]);

  const handleScavengeConfirm = (choices) => {
    try {
      sendGameAction("perform_scavenge", {
        choices: choices,
      });
      setShowScavengeModal(false);
    } catch (error) {
      console.error("Failed to submit scavenge choice:", error);
    }
  };

  const handlePass = (actionType) => {
    const actionName =
      actionType === "FORTIFY" ? "perform_fortify" : "perform_armory_run";
    try {
      sendGameAction(actionName, {});
    } catch (error) {
      console.error(`Failed to pass ${actionType}:`, error);
    }
  };

  const handleSchemeConfirm = () => {
    try {
      sendGameAction("perform_scheme", {});
    } catch (error) {
      console.error("Failed to perform scheme:", error);
    }
  };

  const currentPlayerName =
    players[action_turn_player_id]?.username || "A player";

  return (
    <div className="h-full flex flex-col justify-center items-center space-y-3 p-3 bg-gray-700 bg-opacity-80 rounded-lg">
      {showScavengeModal && (
        <ScavengeChoiceModal
          onConfirm={handleScavengeConfirm}
          onCancel={() => setShowScavengeModal(false)}
          player={player}
        />
      )}

      <div className="text-center p-2 bg-black bg-opacity-25 rounded-lg w-full max-w-md">
        {isMyTurn ? (
          <>
            <p className="text-lg text-blue-300 animate-pulse">
              It's your turn to act!
            </p>
            <p className="text-sm text-gray-200">
              {/* This will now find the name correctly */}
              Your Action: {myChoiceName || "NONE"}
            </p>
            <p className="text-xs text-gray-400">Phase: ACTION</p>
          </>
        ) : (
          <p className="text-lg text-yellow-300">
            Waiting for {currentPlayerName} to act...
          </p>
        )}
      </div>

      {isMyTurn &&
        (myChoiceName === "FORTIFY" || myChoiceName === "ARMORY_RUN") && (
          <div className="pt-3 border-t border-gray-600 text-center w-full max-w-md">
            <p className="text-gray-300 mb-2">
              Select a card from the market to buy, or Pass to gain 2 random
              scrap.
            </p>
            <button
              onClick={() => handlePass(myChoiceName)}
              className="btn btn-warning"
            >
              Pass Action (Gain 2 Scrap)
            </button>
          </div>
        )}

      {isMyTurn && myChoiceName === "SCAVENGE" && (
        <div className="pt-3 border-t border-gray-600 text-center w-full max-w-md">
          <p className="text-gray-300 mb-2">
            Choose your scrap from the supply.
          </p>
          <button
            onClick={() => setShowScavengeModal(true)}
            className="btn btn-primary"
          >
            Choose Scrap
          </button>
        </div>
      )}

      {isMyTurn && myChoiceName === "SCHEME" && (
        <div className="pt-3 border-t border-gray-600 text-center w-full max-w-md">
          <p className="text-gray-300 mb-2">Confirm your Scheme action.</p>
          <button onClick={handleSchemeConfirm} className="btn btn-primary">
            Confirm Scheme
          </button>
        </div>
      )}
    </div>
  );
};

export const IntermissionPhaseActions = ({
  sendGameAction,
  player,
  gameState,
}) => {
  const { intermission_turn_player_id, players } = gameState;
  const isMyTurn = player.user_id === intermission_turn_player_id;

  const handlePass = () => {
    try {
      sendGameAction("pass_buy", {});
    } catch (error) {
      console.error("Failed to pass intermission turn:", error);
    }
  };

  const currentPlayerName =
    players[intermission_turn_player_id]?.username || "A player";

  return (
    <div className="h-full flex flex-col justify-center items-center space-y-3 p-3 bg-gray-700 bg-opacity-80 rounded-lg">
      <div className="text-center p-2 bg-black bg-opacity-25 rounded-lg w-full max-w-md">
        {isMyTurn ? (
          <>
            <p className="text-lg text-blue-300 animate-pulse">
              It's your turn to buy!
            </p>
            <p className="text-sm text-gray-200">
              You may buy one card from the Market (it's free!).
            </p>
            <p className="text-xs text-gray-400">Phase: INTERMISSION</p>
          </>
        ) : (
          <p className="text-lg text-yellow-300">
            Waiting for {currentPlayerName} to buy...
          </p>
        )}
      </div>

      {isMyTurn && (
        <div className="pt-3 border-t border-gray-600 text-center w-full max-w-md">
          <p className="text-gray-300 mb-2">
            Select a card from the market or Pass.
          </p>
          <button onClick={handlePass} className="btn btn-primary">
            Pass Turn
          </button>
        </div>
      )}
    </div>
  );
};
