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
    if (!lure && player && player.lure_cards && player.lure_cards.length > 0) {
      const firstAvailableLure = player.lure_cards[0]?.id;
      if (firstAvailableLure) {
        setLure(firstAvailableLure);
      }
    }
    if (
      !action &&
      player &&
      player.action_cards &&
      player.action_cards.length > 0
    ) {
      setAction(player.action_cards[0]?.id);
    }
  }, [player?.lure_cards, player?.action_cards]);

  useEffect(() => {
    if (player.plan_submitted && failSafeTimeoutRef.current) {
      clearTimeout(failSafeTimeoutRef.current);
      failSafeTimeoutRef.current = null;
      setIsLoading(false);
    }
  }, [player.plan_submitted]);

  useEffect(() => {
    return () => {
      if (failSafeTimeoutRef.current) {
        clearTimeout(failSafeTimeoutRef.current);
      }
    };
  }, []);

  if (player?.plan_submitted) {
    return (
      <div className="text-center p-4">
        <h3 className="text-lg text-green-400">
          Plan submitted. Waiting for other players...
        </h3>
      </div>
    );
  }

  if (!player || !player.action_cards || !player.lure_cards) {
    return (
      <div className="text-center p-4 bg-gray-700 bg-opacity-80 rounded-lg">
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

  const actionCardsInHand = player.action_cards.map((backendCard) =>
    ACTION_CARDS.find((c) => c.name === backendCard.name)
  );
  const lureCardsInHand = player.lure_cards.map((backendCard) =>
    LURE_CARDS.find((c) => c.name === backendCard.name)
  );

  return (
    <div className="space-y-3 p-3 bg-gray-700 bg-opacity-80 rounded-lg">
      <div className="text-center p-2 bg-black bg-opacity-25 rounded-lg">
        <p className="text-lg text-blue-300">
          Choose your Lure and Action for this round.
        </p>
        <p className="text-xs text-gray-400">Phase: PLANNING</p>
      </div>

      <div>
        <h4 className="text-white font-semibold mb-2">Choose Lure:</h4>
        <div className="flex justify-center gap-2">
          {lureCardsInHand.map((card) => {
            if (!card) return null;
            const isUnavailable = false; // Original v1.8 rule disabled
            return (
              <img
                key={card.id}
                src={card.image}
                alt={card.name}
                onClick={() => !isUnavailable && setLure(card.id)}
                className={`w-20 h-28 object-cover rounded-md shadow-md transition-all ${
                  isUnavailable
                    ? "opacity-30 cursor-not-allowed"
                    : "cursor-pointer"
                } ${
                  lure === card.id
                    ? "ring-4 ring-blue-400"
                    : "ring-2 ring-gray-600 hover:ring-blue-300"
                }`}
                title={isUnavailable ? `Used last round` : card.name}
              />
            );
          })}
        </div>
      </div>

      <div>
        <h4 className="text-white font-semibold mb-2">Choose Action:</h4>
        <div className="flex justify-center gap-2">
          {actionCardsInHand.map((card) => {
            if (!card) return null;
            return (
              <img
                key={card.id}
                src={card.image}
                alt={card.name}
                onClick={() => setAction(card.id)}
                className={`w-20 h-28 object-cover rounded-md shadow-md transition-all cursor-pointer ${
                  action === card.id
                    ? "ring-4 ring-blue-400"
                    : "ring-2 ring-gray-600 hover:ring-blue-300"
                }`}
                title={card.name}
              />
            );
          })}
        </div>
      </div>

      <div className="flex justify-center items-center pt-3 border-t border-gray-600">
        <button
          onClick={handleSubmit}
          disabled={!canConfirm || isLoading}
          className={`btn ${
            canConfirm ? "btn-primary" : "btn-disabled"
          } text-lg px-6 ${isLoading ? "loading" : ""}`}
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
  const myLure = player.plan ? player.plan.lure_card_id : "NONE";

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

export const ActionPhaseActions = ({ sendGameAction, player, gameState }) => {
  const { action_turn_player_id, players } = gameState;
  const isMyTurn = player.user_id === action_turn_player_id;
  const myChoice = player.plan ? player.plan.action_card_id : null;
  const [showScavengeModal, setShowScavengeModal] = useState(false);

  useEffect(() => {
    if (isMyTurn && myChoice === "SCAVENGE") {
      setShowScavengeModal(true);
    } else {
      setShowScavengeModal(false);
    }
  }, [isMyTurn, myChoice]);

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
    <div className="space-y-3 p-3 bg-gray-700 bg-opacity-80 rounded-lg">
      {showScavengeModal && (
        <ScavengeChoiceModal
          onConfirm={handleScavengeConfirm}
          onCancel={() => setShowScavengeModal(false)}
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
            Select a card from the market to buy, or Pass to gain 2 random
            scrap.
          </p>
          <button
            onClick={() => handlePass(myChoice)}
            className="btn btn-warning"
          >
            Pass Action (Gain 2 Scrap)
          </button>
        </div>
      )}

      {isMyTurn && myChoice === "SCAVENGE" && (
        <div className="pt-3 border-t border-gray-600 text-center">
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

      {isMyTurn && myChoice === "SCHEME" && (
        <div className="pt-3 border-t border-gray-600 text-center">
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
    <div className="space-y-3 p-3 bg-gray-700 bg-opacity-80 rounded-lg">
      <div className="text-center p-2 bg-black bg-opacity-25 rounded-lg">
        {isMyTurn ? (
          <>
            <p className="text-lg text-blue-300 animate-pulse">
              It's your turn to buy!
            </p>
            <p className="text-sm text-gray-200">
              You may take one FREE card from the Market.
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
        <div className="pt-3 border-t border-gray-600 text-center">
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
