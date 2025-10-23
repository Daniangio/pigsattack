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

// --- FIX: Game Log updated to stack from bottom ---
const GameLog = ({ logs }) => {
  const logEndRef = useRef(null);

  // Reverse the logs so newest are at the bottom
  const reversedLogs = useMemo(
    () => (logs ? logs.slice().reverse() : []),
    [logs]
  );

  useEffect(() => {
    // Scroll to the new message at the bottom
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [reversedLogs]);

  return (
    <div className="w-full h-48 bg-gray-900 bg-opacity-80 rounded-lg p-4 font-mono text-sm text-white overflow-y-auto shadow-inner flex flex-col">
      {/* Map the reversed logs */}
      {reversedLogs.map((log, index) => (
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

const PlayerHUD = ({ player, isSelf }) => {
  const { scrap } = player;
  return (
    <li
      className={`p-4 bg-gray-800 bg-opacity-70 rounded-lg shadow-lg flex justify-between items-center transition-all duration-300 ${
        isSelf ? "border-2 border-blue-400" : "border border-gray-700"
      }`}
    >
      <div>
        <span className="text-xl font-bold text-white">{player.username}</span>
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

// --- NEW: Threat Card Component ---
const ThreatCard = ({ threat }) => {
  if (!threat) return null;
  return (
    <div className="bg-gray-800 bg-opacity-90 rounded-lg shadow-lg p-4 border border-gray-700 flex flex-col justify-between">
      <div>
        <div className="flex justify-between items-center mb-2">
          <h4 className="text-lg font-bold text-red-300">{threat.name}</h4>
          <LureIcon lure={threat.lure} />
        </div>
        <p className="text-sm text-gray-300 mb-3 italic">
          &ldquo;{threat.ability || "No special ability."}&rdquo;
        </p>
      </div>
      <div className="flex justify-around text-center p-2 bg-black bg-opacity-20 rounded">
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
            <ThreatCard key={threat.id} threat={threat} />
          ))}
        </div>
      </div>
      {/* --- END NEW --- */}

      <p className="text-gray-300 pt-4 border-t border-gray-600">
        Choose your Lure and Action cards:
      </p>
      <div className="flex justify-around">
        <div>
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
        <div>
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
      <button onClick={handleSubmit} className="w-full btn btn-primary text-xl">
        Submit Plan
      </button>
    </div>
  );
};

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
  }, [player.upgrades, playerPlans.action_card]);
  // --- END NEW ---

  const handleSubmit = () => {
    sendGameAction("submit_defense", {
      scrap_spent: {
        PARTS: Number(parts),
        WIRING: Number(wiring),
        PLATES: Number(plates),
      },
      arsenal_ids: [], // TODO: Add UI for selecting arsenal cards
    });
  };

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
        <p className="text-lg text-red-100 font-semibold text-center">
          <span className="mr-3">Ferocity: {threat?.ferocity}</span>
          <span className="mr-3">Cunning: {threat?.cunning}</span>
          <span>Mass: {threat?.mass}</span>
        </p>
      </div>

      {/* --- NEW: Display Base Defense --- */}
      <div className="p-3 bg-gray-600 bg-opacity-80 rounded text-center">
        <h4 className="text-lg text-white font-semibold">Your Base Defense</h4>
        <p className="text-lg text-gray-200">(from cards + upgrades)</p>
        <p className="text-xl font-bold mt-1">
          <span className="text-red-400 mr-3">P: {baseDefense.PARTS}</span>
          <span className="text-blue-400 mr-3">W: {baseDefense.WIRING}</span>
          <span className="text-green-400">Pl: {baseDefense.PLATES}</span>
        </p>
      </div>
      {/* --- END NEW --- */}

      <p className="text-gray-300 pt-4 border-t border-gray-600">
        Spend Scrap to defend (1 Scrap = +2 Defense):
      </p>
      <div className="flex justify-around">
        <div>
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
        <div>
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
        <div>
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
      <button onClick={handleSubmit} className="w-full btn btn-primary text-xl">
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
    return gameState ? gameState.players[user.id] : null;
  }, [gameState, user.id]);

  const selfPlans = useMemo(() => {
    return gameState ? gameState.player_plans[user.id] : null;
  }, [gameState, user.id]);

  const selfDefense = useMemo(() => {
    return gameState ? gameState.player_defenses[user.id] : null;
  }, [gameState, user.id]);

  if (!gameState || !self) {
    return (
      <div
        className="flex justify-center items-center min-h-screen bg-gray-900 text-white bg-cover bg-center bg-fixed"
        style={{ backgroundImage: `url(${gameBackground})` }} // Fullscreen loading
      >
        Loading game state...
      </div>
    );
  }

  const { phase, log, initiative_queue, first_player, current_threats } =
    gameState;
  const isSpectator = !self;
  const hasLeft = self.status === "SURRENDERED" || self.status === "ELIMINATED";

  return (
    // --- FIX: Fullscreen Background ---
    <div
      className="p-8 min-h-screen text-white bg-cover bg-center bg-fixed"
      style={{ backgroundImage: `url(${gameBackground})` }}
    >
      <header className="flex justify-between items-center mb-6">
        <h1 className="text-4xl font-bold text-indigo-300 [text-shadow:_0_2px_4px_rgb(0_0_0_/_50%)]">
          Wild Pigs Will Attack!
        </h1>
        <button onClick={onLogout} className="btn btn-danger">
          Logout
        </button>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* --- Left Column (Players & Info) --- */}
        <div className="md:col-span-1 space-y-4">
          <div className="p-4 bg-gray-800 bg-opacity-70 rounded-lg shadow-lg">
            <h2 className="text-2xl font-semibold mb-3">Players</h2>
            <ul className="space-y-3">
              {initiative_queue.map((pid) => (
                <PlayerHUD
                  key={pid}
                  player={gameState.players[pid]}
                  isSelf={pid === user.id}
                />
              ))}
            </ul>
          </div>
          <div className="p-4 bg-gray-800 bg-opacity-70 rounded-lg shadow-lg">
            <h3 className="text-xl font-semibold">First Player</h3>
            <p className="text-blue-300">
              {gameState.players[first_player]?.username || "Unknown"}
            </p>
          </div>
        </div>

        {/* --- Center Column (Log & Actions) --- */}
        <div className="md:col-span-2 space-y-4">
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
                {phase === "DEFENSE" && (
                  <DefensePhaseActions
                    sendGameAction={sendGameAction}
                    defenseState={selfDefense}
                    player={self}
                    playerPlans={selfPlans} // Pass plans for card calculation
                    threat={self.assigned_threat}
                  />
                )}
                {phase !== "PLANNING" && phase !== "DEFENSE" && (
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
