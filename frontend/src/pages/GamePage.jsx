import React, { useState, useMemo, useEffect, useRef } from "react";
import { useStore } from "../store";
import gameBackground from "../images/game-background.png"; // Load the background image

// --- DATA CONSTANTS ---
// From rules: "Armory Run adds +2 vs p", "Scavenge adds +2 vs k", etc.
const ACTION_CARD_DEFENSE = {
  SCAVENGE: { PARTS: 0, WIRING: 2, PLATES: 0 },
  FORTIFY: { PARTS: 0, WIRING: 0, PLATES: 2 },
  ARMORY_RUN: { PARTS: 2, WIRING: 0, PLATES: 0 },
  SCHEME: { PARTS: 1, WIRING: 1, PLATES: 1 },
};

// --- HELPER COMPONENTS ---

// --- NEW: Shared Turn Status Icon Component ---
// This is now a single component used by both PlayerHUD and InitiativeTrack
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
      <span className="sr-only">{title[turnStatus]}</span>
    </span>
  );
};
// --- END NEW COMPONENT ---

const PlayerStatusPill = ({ status }) => {
  const baseClasses = "px-3 py-1 text-sm font-semibold rounded-full shadow-md";
  const statusStyles = {
    ACTIVE: "bg-green-500 text-white",
    SURRENDERED: "bg-yellow-500 text-black",
    ELIMINATED: "bg-red-700 text-white",
    DISCONNECTED: "bg-gray-500 text-white",
  };
  return (
    <span className={`${baseClasses} ${statusStyles[status] || "bg-gray-400"}`}>
      {status}
    </span>
  );
};

// --- Game Log to stack from bottom ---
const GameLog = ({ logs }) => {
  const logEndRef = useRef(null);
  const gameLogs = logs || [];

  useEffect(() => {
    // Scroll to the new message at the bottom
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [gameLogs]);

  return (
    <div className="w-full h-48 bg-gray-900 bg-opacity-80 rounded-lg p-4 font-mono text-sm text-white overflow-y-auto shadow-inner flex flex-col">
      {/* Map the logs in their original order */}
      {gameLogs.map((log, index) => (
        <p key={index} className="text-green-400">
          <span className="text-gray-500 mr-2">&gt;</span>
          {log}
        </p>
      ))}
      {/* This empty div is the target for scrolling */}
      <div ref={logEndRef} />
    </div>
  );
};

// --- UPDATED: PlayerHUD component ---
// Now accepts `turnStatus` prop and uses the shared `TurnStatusIcon`
const PlayerHUD = ({ player, isSelf, turnStatus }) => {
  if (!player) return null; // Add guard for missing player prop
  const { scrap } = player;

  return (
    <li
      className={`p-4 bg-gray-800 bg-opacity-70 rounded-lg shadow-lg flex justify-between items-center transition-all duration-300 ${
        isSelf ? "border-2 border-blue-400" : "border border-gray-700"
      }`}
    >
      <div>
        <span className="text-xl font-bold text-white flex items-center">
          {player.username}
          {/* Use the new shared component */}
          {/* <div className="ml-2">
            <TurnStatusIcon turnStatus={turnStatus} size="h-6 w-6" />
          </div> */}
        </span>
        {isSelf && <span className="text-blue-300"> (You)</span>}
        <div className="flex space-x-2 mt-2">
          <span className="text-red-500 font-semibold">HP: {player.hp}</span>
          <span className="text-gray-400">|</span>
          <span className="text-red-400" title="Parts">
            P: {scrap.PARTS}
          </span>
          <span className="text-blue-400" title="Wiring">
            W: {scrap.WIRING}
          </span>
          <span className="text-green-400" title="Plates">
            Pl: {scrap.PLATES}
          </span>
        </div>
      </div>
      <PlayerStatusPill status={player.status} />
    </li>
  );
};

// --- Initiative Track Component ---
const InitiativeTrack = ({
  initiative_queue,
  players,
  getPlayerTurnStatus,
}) => {
  return (
    <div className="flex flex-col items-center justify-center space-y-2">
      {initiative_queue.map((pid, index) => (
        <React.Fragment key={pid}>
          <div className="relative flex items-center justify-center w-full max-w-xs bg-indigo-900 text-white font-semibold px-4 py-2 rounded-lg shadow-md border-2 border-indigo-700">
            {/* Use the new shared component, wrapped in a div for positioning */}
            <span className="flex-grow">{players[pid]?.username || "???"}</span>
            <div className="mr-2 flex-shrink-0">
              <TurnStatusIcon
                turnStatus={getPlayerTurnStatus(pid)}
                size="h-8 w-8"
              />
            </div>
          </div>
          {index < initiative_queue.length - 1 && (
            <span className="text-2xl text-gray-400 font-light">&darr;</span>
          )}
        </React.Fragment>
      ))}
    </div>
  );
};
// --- END UPDATED COMPONENT ---

// --- NEW: Lure Icon Component ---
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
      className={`px-2 py-1 text-xs font-semibold rounded-full border ${
        lureStyles[lure] || "bg-gray-700"
      }`}
    >
      {lureText[lure] || "Unknown Lure"}
    </span>
  );
};

// --- NEW: Player Tag for assigned cards ---
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

// --- UPDATED: Threat Card Component ---
const ThreatCard = ({
  threat,
  onClick,
  isSelected,
  isSelectable, // Can the current player click this?
  isAvailable,
}) => {
  if (!threat) return null;

  const baseStyle =
    "bg-gray-800 bg-opacity-90 rounded-lg shadow-lg p-4 border flex flex-col justify-between transition-all duration-200 h-full"; // Added h-full
  let borderStyle = "border-gray-700";
  let cursorStyle = "cursor-default";
  let opacityStyle = "opacity-100";
  let positionStyle = "relative"; // For the player tag

  if (!isAvailable) {
    borderStyle = "border-gray-900";
    opacityStyle = "opacity-40";
  } else if (isSelectable) {
    borderStyle = "border-blue-400";
    cursorStyle = "cursor-pointer hover:border-blue-300";
  }

  if (isSelected) {
    borderStyle = "border-green-500 ring-2 ring-green-500";
  }

  return (
    <div
      className={`${baseStyle} ${borderStyle} ${cursorStyle} ${opacityStyle} ${positionStyle}`}
      onClick={onClick}
    >
      <div>
        <div className="flex justify-between items-center mb-2">
          <h4 className="text-lg font-bold text-red-300">{threat.name}</h4>
          <LureIcon lure={threat.lure} />
        </div>
        <p className="text-sm text-gray-300 mb-3 italic">
          &ldquo;{threat.ability || "No special ability."}&rdquo;
        </p>
      </div>
      <div className="flex justify-around text-center p-2 bg-black bg-opacity-20 rounded mt-auto">
        {" "}
        {/* Added mt-auto */}
        <div>
          <span className="text-red-400 font-semibold text-sm">Ferocity</span>
          <p className="text-xl font-bold">{threat.ferocity}</p>
        </div>
        <div>
          <span className="text-blue-400 font-semibold text-sm">Cunning</span>
          <p className="text-xl font-bold">{threat.cunning}</p>
        </div>
        <div>
          <span className="text-green-400 font-semibold text-sm">Mass</span>
          <p className="text-xl font-bold">{threat.mass}</p>
        </div>
      </div>
    </div>
  );
};

// --- ACTION PANEL COMPONENTS ---

// --- UPDATED: Planning Phase ---
const PlanningPhaseActions = ({
  sendGameAction,
  playerState,
  currentThreats,
}) => {
  const [lure, setLure] = useState("BLOODY_RAGS");
  const [action, setAction] = useState("SCAVENGE");

  const handleSubmit = () => {
    sendGameAction("submit_plan", { lure, action });
  };

  // Add guard for playerState
  if (!playerState) {
    return (
      <div className="text-center p-4">
        <h3 className="text-xl text-yellow-400">Loading plan...</h3>
      </div>
    );
  }

  if (playerState.ready) {
    return (
      <div className="text-center p-4">
        <h3 className="text-xl text-green-400">
          Plan submitted. Waiting for other players...
        </h3>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 bg-gray-700 bg-opacity-80 rounded-lg">
      <h3 className="text-2xl font-semibold text-white">Phase: PLANNING</h3>

      {/* --- NEW: Display Threat Cards --- */}
      <div className="mb-4">
        <p className="text-gray-300 mb-3">Wilderness Threats:</p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {currentThreats.map((threat) => (
            // Render non-interactive threat card
            <ThreatCard
              key={threat.id}
              threat={threat}
              isAvailable={true}
              isSelectable={false}
              isSelected={false}
              onClick={null}
            />
          ))}
        </div>
      </div>
      {/* --- END NEW --- */}

      <p className="text-gray-300 pt-4 border-t border-gray-600">
        Choose your Lure and Action cards:
      </p>
      <div className="flex flex-col sm:flex-row justify-around space-y-4 sm:space-y-0 sm:space-x-4">
        <div className="flex-1">
          <label className="block text-gray-300 mb-2">Lure Card</label>
          <select
            value={lure}
            onChange={(e) => setLure(e.target.value)}
            className="p-2 rounded bg-gray-800 text-white w-full"
          >
            <option value="BLOODY_RAGS">Bloody Rags</option>
            <option value="STRANGE_NOISES">Strange Noises</option>
            <option value="FALLEN_FRUIT">Fallen Fruit</option>
          </select>
        </div>
        <div className="flex-1">
          <label className="block text-gray-300 mb-2">Action Card</label>
          <select
            value={action}
            onChange={(e) => setAction(e.target.value)}
            className="p-2 rounded bg-gray-800 text-white w-full"
          >
            <option value="SCAVENGE">Scavenge</option>
            <option value="FORTIFY">Fortify</option>
            <option value="ARMORY_RUN">Armory Run</option>
            <option value="SCHEME">Scheme</option>
          </select>
        </div>
      </div>
      <button
        onClick={handleSubmit}
        className="w-full btn btn-primary text-xl mt-4"
      >
        Submit Plan
      </button>
    </div>
  );
};

// --- START NEW COMPONENT: AttractionPhaseActions ---
const AttractionPhaseActions = ({ sendGameAction, player, gameState }) => {
  const [selectedThreatId, setSelectedThreatId] = useState(null);
  const {
    attraction_phase_state,
    attraction_turn_player_id,
    current_threats,
    available_threat_ids,
    player_plans,
    players,
  } = gameState;

  // --- NEW: Create a map of which player has which threat ---
  const threatAssignments = useMemo(() => {
    const assignments = {};
    if (!players) return assignments;

    Object.values(players).forEach((p) => {
      if (p.assigned_threat) {
        assignments[p.assigned_threat.id] = p.username;
      }
    });
    return assignments;
  }, [players]);

  const isMyTurn = player.user_id === attraction_turn_player_id;
  const myPlan = player_plans[player.user_id];

  // --- FIX: Add guard for myPlan ---
  if (!myPlan) {
    return (
      <div className="text-center p-4">
        <h3 className="text-xl text-yellow-400">Loading attraction state...</h3>
      </div>
    );
  }

  const myLure = myPlan.lure_card;

  const { availableThreats, selectableThreats, matchingThreats } =
    useMemo(() => {
      const available = current_threats.filter((t) =>
        available_threat_ids.includes(t.id)
      );
      const matching = available.filter((t) => t.lure === myLure);

      let selectable = [];
      if (isMyTurn) {
        if (attraction_phase_state === "FIRST_PASS") {
          selectable = matching; // Rule: Can only select matching
        } else {
          // SECOND_PASS
          selectable = available; // Rule: Can select any remainder
        }
      }
      return {
        availableThreats: available,
        selectableThreats: selectable,
        matchingThreats: matching,
      };
    }, [
      current_threats,
      available_threat_ids,
      myLure,
      isMyTurn,
      attraction_phase_state,
    ]);

  // --- UPDATED: Button Logic ---
  const canConfirm = selectedThreatId !== null;

  // --- Handlers ---
  const handleSelectThreat = (threatId) => {
    if (!isMyTurn) return;
    // Check if this threat is actually in the selectable list
    if (selectableThreats.some((t) => t.id === threatId)) {
      setSelectedThreatId(threatId);
    }
  };

  const handleSubmit = () => {
    if (canConfirm) {
      sendGameAction("select_threat", { threat_id: selectedThreatId });
      setSelectedThreatId(null);
    }
  };

  // --- Render ---
  const currentPlayerName =
    players[attraction_turn_player_id]?.username || "A player";

  return (
    <div className="space-y-4 p-4 bg-gray-700 bg-opacity-80 rounded-lg">
      <h3 className="text-2xl font-semibold text-white">
        Phase: ATTRACTION (
        {attraction_phase_state === "FIRST_PASS" ? "First Pass" : "Second Pass"}
        )
      </h3>

      {/* --- NEW: Turn Indicator --- */}
      <div className="text-center p-3 bg-black bg-opacity-25 rounded-lg">
        {isMyTurn ? (
          <>
            <p className="text-xl text-blue-300 animate-pulse">
              It's your turn to choose!
            </p>
            <p className="text-md text-gray-200">
              Your Lure: <LureIcon lure={myLure} />
            </p>
          </>
        ) : (
          <p className="text-xl text-yellow-300">
            Waiting for {currentPlayerName} to choose a threat...
          </p>
        )}
      </div>

      {/* --- Threat Display --- */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 my-4">
        {current_threats.map((threat) => {
          const assignedTo = threatAssignments[threat.id];
          const isAvailable = !assignedTo;
          const isSelectable =
            isMyTurn && selectableThreats.some((t) => t.id === threat.id);
          const isSelected = threat.id === selectedThreatId;

          return (
            <div key={threat.id} className="relative">
              <ThreatCard
                threat={threat}
                isAvailable={isAvailable}
                isSelectable={isSelectable}
                isSelected={isSelected}
                onClick={() => handleSelectThreat(threat.id)}
              />
              {assignedTo && <PlayerTag username={assignedTo} />}
            </div>
          );
        })}
      </div>

      {/* --- Action Buttons --- */}
      <div className="flex justify-end items-center pt-4 border-t border-gray-600">
        {/* The "No Matching Lure" button is removed as the server handles this skip automatically */}
        <button
          onClick={handleSubmit}
          disabled={!canConfirm || !isMyTurn}
          className={`btn ${
            canConfirm ? "btn-primary" : "btn-disabled"
          } text-xl px-8`}
        >
          Confirm Selection
        </button>
      </div>
    </div>
  );
};
// --- END NEW COMPONENT ---

// --- UPDATED: Defense Phase ---
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

  // --- NEW: Calculate Base Defense ---
  const baseDefense = useMemo(() => {
    // --- FIX: Add guards for player and playerPlans ---
    if (!player || !playerPlans) {
      return { PARTS: 0, WIRING: 0, PLATES: 0 };
    }

    const allCards = ["SCAVENGE", "FORTIFY", "ARMORY_RUN", "SCHEME"];
    const usedAction = playerPlans.action_card;

    // Check for Master Schemer upgrade
    const hasMasterSchemer = player.upgrades.some(
      (u) => u.special_effect_id === "MASTER_SCHEMER"
    );

    // Define card defenses, checking for Master Schemer
    const cardDefenseValues = {
      ...ACTION_CARD_DEFENSE,
      SCHEME: hasMasterSchemer
        ? { PARTS: 2, WIRING: 2, PLATES: 2 }
        : { PARTS: 1, WIRING: 1, PLATES: 1 },
    };

    const unusedCards = allCards.filter((c) => c !== usedAction);

    const cardDefense = { PARTS: 0, WIRING: 0, PLATES: 0 };
    unusedCards.forEach((cardName) => {
      const defense = cardDefenseValues[cardName];
      cardDefense.PARTS += defense.PARTS;
      cardDefense.WIRING += defense.WIRING;
      cardDefense.PLATES += defense.PLATES;
    });

    const upgradeDefense = { PARTS: 0, WIRING: 0, PLATES: 0 };
    player.upgrades.forEach((upgrade) => {
      if (upgrade.permanent_defense) {
        upgradeDefense.PARTS += upgrade.permanent_defense.PARTS || 0;
        upgradeDefense.WIRING += upgrade.permanent_defense.WIRING || 0;
        upgradeDefense.PLATES += upgrade.permanent_defense.PLATES || 0;
      }
      // TODO: Add logic for other special upgrades like Trophy Rack
    });

    return {
      PARTS: cardDefense.PARTS + upgradeDefense.PARTS,
      WIRING: cardDefense.WIRING + upgradeDefense.WIRING,
      PLATES: cardDefense.PLATES + upgradeDefense.PLATES,
    };
  }, [player, playerPlans]); // --- FIX: Use player and playerPlans as dependencies ---
  // --- END NEW ---

  const handleSubmit = () => {
    sendGameAction("submit_defense", {
      scrap_spent: {
        PARTS: Number(parts) || 0,
        WIRING: Number(wiring) || 0,
        PLATES: Number(plates) || 0,
      },
      arsenal_ids: [], // TODO: Add UI for selecting arsenal cards
    });
  };

  if (!threat) {
    return (
      <div className="space-y-4 p-4 bg-gray-700 bg-opacity-80 rounded-lg">
        <h3 className="text-2xl font-semibold text-white">Phase: DEFENSE</h3>
        <div className="p-3 bg-gray-600 bg-opacity-80 rounded text-center">
          <h4 className="text-lg text-white font-semibold">
            You attracted no threat.
          </h4>
          <p className="text-gray-200">Waiting for other players...</p>
        </div>
      </div>
    );
  }

  // --- FIX: Add guard for defenseState ---
  if (!defenseState) {
    return (
      <div className="text-center p-4">
        <h3 className="text-xl text-yellow-400">Loading defense...</h3>
      </div>
    );
  }

  if (defenseState.ready) {
    return (
      <div className="text-center p-4">
        <h3 className="text-xl text-green-400">
          Defense submitted. Waiting for other players...
        </h3>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4 bg-gray-700 bg-opacity-80 rounded-lg">
      <h3 className="text-2xl font-semibold text-white">Phase: DEFENSE</h3>

      {/* Display Threat */}
      <div className="p-3 bg-red-900 bg-opacity-60 rounded">
        <h4 className="text-xl text-red-300">Your Threat: {threat?.name}</h4>
        <p className="text-lg text-red-100 font-semibold text-center flex flex-wrap justify-center">
          <span className="mr-3">Ferocity: {threat?.ferocity}</span>
          <span className="mr-3">Cunning: {threat?.cunning}</span>
          <span>Mass: {threat?.mass}</span>
        </p>
      </div>

      {/* --- NEW: Display Base Defense --- */}
      <div className="p-3 bg-gray-600 bg-opacity-80 rounded text-center">
        <h4 className="text-lg text-white font-semibold">Your Base Defense</h4>
        <p className="text-gray-200 text-sm">(from cards + upgrades)</p>
        <p className="text-xl font-bold mt-1 flex flex-wrap justify-center">
          <span className="text-red-400 mr-3">P: {baseDefense.PARTS}</span>
          <span className="text-blue-400 mr-3">W: {baseDefense.WIRING}</span>
          <span className="text-green-400">Pl: {baseDefense.PLATES}</span>
        </p>
      </div>
      {/* --- END NEW --- */}

      <p className="text-gray-300 pt-4 border-t border-gray-600">
        Spend Scrap to defend (1 Scrap = +2 Defense):
      </p>
      <div className="flex flex-col sm:flex-row justify-around space-y-4 sm:space-y-0 sm:space-x-2">
        <div className="flex-1 text-center sm:text-left">
          <label className="block text-red-400">Parts (vs Ferocity)</label>
          <input
            type="number"
            min="0"
            max={player.scrap.PARTS}
            value={parts}
            onChange={(e) => setParts(e.target.value)}
            className="w-24 p-2 rounded bg-gray-800 text-white"
          />
          <span className="text-gray-400 text-sm"> / {player.scrap.PARTS}</span>
        </div>
        <div className="flex-1 text-center sm:text-left">
          <label className="block text-blue-400">Wiring (vs Cunning)</label>
          <input
            type="number"
            min="0"
            max={player.scrap.WIRING}
            value={wiring}
            onChange={(e) => setWiring(e.target.value)}
            className="w-24 p-2 rounded bg-gray-800 text-white"
          />
          <span className="text-gray-400 text-sm">
            {" "}
            / {player.scrap.WIRING}
          </span>
        </div>
        <div className="flex-1 text-center sm:text-left">
          <label className="block text-green-400">Plates (vs Mass)</label>
          <input
            type="number"
            min="0"
            max={player.scrap.PLATES}
            value={plates}
            onChange={(e) => setPlates(e.target.value)}
            className="w-24 p-2 rounded bg-gray-800 text-white"
          />
          <span className="text-gray-400 text-sm">
            {" "}
            / {player.scrap.PLATES}
          </span>
        </div>
      </div>
      <button
        onClick={handleSubmit}
        className="w-full btn btn-primary text-xl mt-4"
      >
        Submit Defense
      </button>
    </div>
  );
};

// --- MAIN GAME PAGE COMPONENT ---
const GamePage = ({ onLogout, sendMessage }) => {
  const { user, gameState } = useStore();

  const sendGameAction = (action, data) => {
    sendMessage({
      action: "game_action",
      payload: {
        game_action: action,
        data: data,
      },
    });
  };

  const handleSurrender = () => sendMessage({ action: "surrender" });
  const handleReturnToLobby = () => sendMessage({ action: "return_to_lobby" });

  const self = useMemo(() => {
    // Add guard for gameState.players
    return gameState?.players ? gameState.players[user.id] : null;
  }, [gameState, user.id]);

  const selfPlans = useMemo(() => {
    // Add guard for gameState.player_plans
    return gameState?.player_plans ? gameState.player_plans[user.id] : null;
  }, [gameState, user.id]);

  const selfDefense = useMemo(() => {
    // Add guard for gameState.player_defenses
    return gameState?.player_defenses
      ? gameState.player_defenses[user.id]
      : null;
  }, [gameState, user.id]);

  if (!gameState || !user) {
    return (
      <div
        className="flex justify-center items-center min-h-screen bg-gray-900 text-white bg-cover bg-center bg-fixed"
        style={{ backgroundImage: `url(${gameBackground})` }} // Fullscreen loading
      >
        Loading game state...
      </div>
    );
  }

  const {
    phase,
    log,
    initiative_queue,
    current_threats,
    attraction_turn_player_id,
    player_plans,
    player_defenses,
  } = gameState;

  const getPlayerTurnStatus = (playerId) => {
    if (phase === "ATTRACTION") {
      if (playerId === attraction_turn_player_id) {
        return "ACTIVE";
      }
      // A player has "acted" if they are no longer in the initiative queue for this phase
      // This logic is flawed, let's check unassigned_player_ids
      const hasActed = !gameState.unassigned_player_ids.includes(playerId);
      return hasActed ? "WAITING" : "PENDING";
    }

    if (phase === "PLANNING") {
      const plan = player_plans[playerId];
      return plan?.ready ? "WAITING" : "ACTIVE";
    }

    if (phase === "DEFENSE") {
      const defense = player_defenses[playerId];
      // If they have no threat, they are effectively "waiting"
      const hasNoThreat = !gameState.players[playerId]?.assigned_threat;
      return defense?.ready || hasNoThreat ? "WAITING" : "ACTIVE";
    }

    return "NONE"; // No specific turn status for other phases
  };

  // --- FIX: Safer logic for spectators and eliminated players ---
  const isSpectator = !self;
  const hasLeft = self
    ? self.status === "SURRENDERED" || self.status === "ELIMINATED"
    : false;
  // --- END FIX ---

  return (
    // --- FIX: Fullscreen Background ---
    <div
      className="p-4 sm:p-8 min-h-screen text-white bg-cover bg-center bg-fixed"
      style={{ backgroundImage: `url(${gameBackground})` }}
    >
      <header className="flex flex-col sm:flex-row justify-between items-center mb-6 space-y-4 sm:space-y-0">
        <h1 className="text-3xl sm:text-4xl font-bold text-indigo-300 [text-shadow:_0_2px_4px_rgb(0_0_0_/_50%)]">
          Wild Pigs Will Attack!
        </h1>
        <button onClick={onLogout} className="btn btn-danger">
          Logout
        </button>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* --- Left Column (Players & Info) --- */}
        <div className="lg:col-span-1 space-y-4">
          <div className="p-4 bg-gray-800 bg-opacity-70 rounded-lg shadow-lg">
            <h2 className="text-2xl font-semibold mb-3">Players</h2>
            <ul className="space-y-3">
              {/* --- FIX: Pass turnStatus to PlayerHUD --- */}
              {initiative_queue.map((pid) => (
                <PlayerHUD
                  key={pid}
                  player={gameState.players[pid]}
                  isSelf={pid === user.id}
                  turnStatus={getPlayerTurnStatus(pid)}
                />
              ))}
            </ul>
            <h2 className="text-2xl font-semibold mt-6 mb-4 pt-4 border-t border-gray-600">
              Turn Order
            </h2>
            <InitiativeTrack
              initiative_queue={initiative_queue}
              players={gameState.players}
              getPlayerTurnStatus={getPlayerTurnStatus}
            />
          </div>
        </div>

        {/* --- Center Column (Log & Actions) --- */}
        <div className="lg:col-span-2 space-y-4">
          <GameLog logs={log} />

          <div className="p-4 bg-gray-800 bg-opacity-70 rounded-lg shadow-lg">
            {isSpectator ? (
              <p>You are spectating...</p>
            ) : hasLeft ? (
              <>
                <p className="text-yellow-300 text-xl mb-4">
                  You are {self.status.toLowerCase()}. You can watch until the
                  game ends.
                </p>
                <button
                  onClick={handleReturnToLobby}
                  className="btn btn-primary text-xl px-8 py-3"
                >
                  Return to Lobby
                </button>
              </>
            ) : (
              <>
                {/* --- Contextual Action Panel --- */}
                {phase === "PLANNING" && (
                  <PlanningPhaseActions
                    sendGameAction={sendGameAction}
                    playerState={selfPlans}
                    currentThreats={current_threats} // Pass threats
                  />
                )}

                {/* --- NEWLY ADDED --- */}
                {phase === "ATTRACTION" && (
                  <AttractionPhaseActions
                    sendGameAction={sendGameAction}
                    player={self}
                    gameState={gameState}
                  />
                )}

                {phase === "DEFENSE" && (
                  <DefensePhaseActions
                    sendGameAction={sendGameAction}
                    defenseState={selfDefense}
                    player={self}
                    playerPlans={selfPlans} // Pass plans for card calculation
                    threat={self.assigned_threat}
                  />
                )}

                {/* --- UPDATED TO EXCLUDE NEW PHASE --- */}
                {phase !== "PLANNING" &&
                  phase !== "DEFENSE" &&
                  phase !== "ATTRACTION" && (
                    <div className="text-center p-4">
                      <h3 className="text-2xl text-gray-300">Phase: {phase}</h3>
                      <p className="text-gray-400">Waiting for server...</p>
                    </div>
                  )}
              </>
            )}
          </div>

          {/* --- Surrender Button --- */}
          {!isSpectator && !hasLeft && (
            <div className="text-center mt-6">
              <button
                onClick={handleSurrender}
                className="btn btn-warning text-lg px-6 py-2"
              >
                Surrender
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default GamePage;
