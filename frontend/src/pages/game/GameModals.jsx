import React, { useState, useRef, useEffect } from "react";
import { SCRAP_TYPES } from "./GameConstants.jsx";

export const ConfirmationModal = ({
  title,
  message,
  onConfirm,
  onCancel,
  confirmText = "Confirm",
}) => (
  <div className="fixed inset-0 bg-black bg-opacity-75 flex justify-center items-center z-50">
    <div className="bg-gray-800 p-6 rounded-lg shadow-xl border border-gray-600">
      <h3 className="text-xl font-semibold text-white mb-4">{title}</h3>
      <p className="text-gray-300 mb-6">{message}</p>
      <div className="flex justify-end space-x-4">
        <button onClick={onCancel} className="btn btn-secondary">
          Cancel
        </button>
        <button onClick={onConfirm} className="btn btn-danger">
          {confirmText}
        </button>
      </div>
    </div>
  </div>
);

// --- MODIFIED: PreviewDisplay is now EXPORTED ---
export const PreviewDisplay = ({ preview, isLoading }) => {
  if (isLoading) {
    return (
      <div className="p-3 bg-gray-700 rounded-lg h-full flex items-center justify-center text-center">
        <p className="text-yellow-400">Calculating...</p>
      </div>
    );
  }

  if (!preview) {
    return (
      <div className="p-3 bg-gray-700 rounded-lg h-full flex items-center justify-center text-center">
        <p className="text-gray-400">
          Add scrap or cards from your Asset Panel to see preview.
        </p>
      </div>
    );
  }

  if (preview.error) {
    return (
      <div className="p-3 bg-red-900 rounded-lg h-full flex items-center justify-center text-center">
        <p className="text-red-400">Error: {preview.error}</p>
      </div>
    );
  }

  const formatTarget = (color) => {
    const original = preview.threat_original_stats[color];
    if (preview.threat_immune_to.includes(color)) return "Immune";
    if (preview.threat_resistant_to.includes(color))
      return `${original} (Resist)`;
    return original;
  };

  // --- MODIFIED: Removed mb-4, added flex-grow to fill parent
  return (
    <div className="p-3 bg-gray-900 rounded-lg flex flex-col justify-center flex-grow">
      <div className="flex justify-around items-center">
        {preview.is_kill ? (
          <h4 className="text-2xl font-bold text-green-400">PROJECTED KILL!</h4>
        ) : preview.player_total_defense.PARTS <
            preview.threat_original_stats.PARTS &&
          preview.player_total_defense.WIRING <
            preview.threat_original_stats.WIRING &&
          preview.player_total_defense.PLATES <
            preview.threat_original_stats.PLATES ? (
          <h4 className="text-2xl font-bold text-red-400">PROJECTED FAIL!</h4>
        ) : (
          <h4 className="text-2xl font-bold text-yellow-400">
            PROJECTED DEFEND
          </h4>
        )}
        <div className="text-sm text-gray-300">
          <p>Targets: {preview.threat_highest_stats_to_beat.join(", ")}</p>
          {preview.is_lure_to_weakness_active && (
            <p className="text-blue-400">Lure to Weakness Active!</p>
          )}
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2 mt-2 text-center">
        {["PARTS", "WIRING", "PLATES"].map((color) => {
          const target = preview.threat_original_stats[color];
          const defense = preview.player_total_defense[color];
          const isTarget = preview.threat_highest_stats_to_beat.includes(color);

          return (
            <div
              key={color}
              className={isTarget ? "bg-black/50 p-1 rounded" : ""}
            >
              <p
                className={`font-bold text-2xl ${
                  defense >= target ? "text-green-400" : "text-red-400"
                }`}
              >
                {defense} / {formatTarget(color)}
              </p>
              <p
                className={`text-xs font-semibold ${SCRAP_TYPES[color].color}`}
              >
                {SCRAP_TYPES[color].name}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// --- DefenseSubmission: HEAVILY REFACTORED ---
// It no longer contains the PreviewDisplay or the fetch logic.
// It is *only* the Staging Area + Submit Button.
export const DefenseSubmission = ({
  player,
  threat,
  sendGameAction,
  // NEW PROPS from GamePage
  defenseScrap,
  defenseArsenal,
  onScrapSpend,
  onArsenalToggle,
}) => {
  // REMOVED: All fetch logic, preview state, and token prop

  const handleSubmit = () => {
    // The payload for the *submission* is built from the props
    const payload = {
      scrap_spent: defenseScrap,
      arsenal_card_ids: Array.from(defenseArsenal),
      special_target_stat: null,
      special_corrode_stat: null,
      special_amp_spend: {},
    };
    sendGameAction("submit_defense", payload);
  };

  if (player.defense) {
    return (
      <div className="text-center p-4 h-full flex items-center justify-center">
        <h3 className="text-lg text-green-400">
          Defense submitted. Waiting...
        </h3>
      </div>
    );
  }
  if (!threat) {
    return (
      <div className="text-center p-4 h-full flex items-center justify-center">
        <h3 className="text-lg text-gray-400">
          No threat attracted. Waiting...
        </h3>
      </div>
    );
  }

  // --- NEW RENDER: Two-column layout with Staging Area ---
  return (
    <div className="h-full flex items-stretch p-3">
      {/* Left: Staging Area */}
      <div className="flex-grow flex flex-col pr-3 border-r border-gray-600 overflow-hidden">
        <h3 className="text-xl font-bold text-white mb-2 text-center">
          Defense Staging Area
        </h3>
        <h4 className="text-lg text-red-400 mb-2 text-center">
          vs. {threat.name}
        </h4>

        {/* Staging Area Content */}
        <div className="flex-grow flex flex-col p-2 bg-black bg-opacity-20 rounded-lg overflow-y-auto">
          <h4 className="text-white text-sm font-semibold mb-2">
            Selected for Defense:
          </h4>
          {/* Staged Scrap */}
          <div className="flex justify-around mb-3">
            {["PARTS", "WIRING", "PLATES"].map((color) => (
              <div key={color} className="text-center">
                <span
                  className={`font-bold text-2xl ${SCRAP_TYPES[color].color}`}
                >
                  {defenseScrap[color]}
                </span>
                <p className="text-xs text-gray-400">
                  {SCRAP_TYPES[color].name}
                </p>
                {defenseScrap[color] > 0 && (
                  <button
                    onClick={() => onScrapSpend(color, -1)}
                    className="text-xs bg-red-700 rounded-full px-2 py-0.5 mt-1 transition-transform hover:scale-110"
                    title="Remove 1"
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
          {/* Staged Arsenal */}
          <h5 className="text-white text-xs font-semibold mb-1">
            Selected Arsenal:
          </h5>
          <div className="flex flex-col gap-1">
            {defenseArsenal.size === 0 && (
              <p className="text-gray-500 text-xs italic">None</p>
            )}
            {Array.from(defenseArsenal).map((cardId) => {
              const card = player.arsenal_cards.find((c) => c.id === cardId);
              if (!card) return null;
              return (
                <div
                  key={card.id}
                  onClick={() => onArsenalToggle(card.id)}
                  className="bg-gray-700 p-1.5 rounded border border-gray-600 cursor-pointer hover:border-red-500 flex justify-between items-center"
                  title="Click to remove"
                >
                  <p className="text-white text-xs font-bold truncate">
                    {card.name}
                  </p>
                  <span className="text-red-500 text-xs font-bold">X</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Right: Instructions & Submit */}
      <div className="flex-shrink-0 w-48 flex flex-col justify-center items-center pl-3">
        <div className="text-center p-2 bg-black bg-opacity-25 rounded-lg mb-4 w-full">
          <p className="text-lg text-blue-300 animate-pulse">
            Submit Your Defense!
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Click items in your Asset Panel (bottom) to add them.
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Click items in the Staging Area (left) to remove them.
          </p>
        </div>
        <button
          onClick={handleSubmit}
          className="w-full btn btn-primary text-lg px-6"
        >
          Submit Defense
        </button>
      </div>
    </div>
  );
};

// --- ScavengeChoiceModal remains unchanged ---
export const ScavengeChoiceModal = ({ onConfirm, onCancel, player }) => {
  const hasScavengersEye = (player.upgrade_cards || []).some(
    (u) => u.special_effect_id === "SCAVENGERS_EYE"
  );
  const numToChoose = hasScavengersEye ? 3 : 2;
  const [selection, setSelection] = useState([]);
  const canConfirm = selection.length === numToChoose;

  const handleSelect = (scrapType) => {
    if (selection.length < numToChoose) {
      setSelection([...selection, scrapType]);
    }
  };
  const handleUndo = () => {
    setSelection(selection.slice(0, -1));
  };
  const handleSubmit = () => {
    if (canConfirm) {
      onConfirm(selection);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex justify-center items-center z-50">
      <div className="bg-gray-800 p-6 rounded-lg shadow-xl">
        <h3 className="text-xl font-semibold text-white mb-4">
          Action: SCAVENGE
        </h3>
        <p className="text-gray-300 mb-4">
          Choose {numToChoose} scrap from the supply:
          {hasScavengersEye && (
            <span className="text-green-400 block text-xs">
              (Scavenger's Eye lets you choose 3!)
            </span>
          )}
        </p>
        <div className="flex justify-center space-x-4 mb-4">
          <button
            onClick={() => handleSelect("PARTS")}
            disabled={selection.length >= numToChoose}
            className="btn btn-danger px-4 py-2"
          >
            Parts (PARTS)
          </button>
          <button
            onClick={() => handleSelect("WIRING")}
            disabled={selection.length >= numToChoose}
            className="btn btn-info px-4 py-2"
          >
            Wiring (WIRING)
          </button>
          <button
            onClick={() => handleSelect("PLATES")}
            disabled={selection.length >= numToChoose}
            className="btn btn-success px-4 py-2"
          >
            Plates (PLATES)
          </button>
        </div>
        <div className="h-10 p-2 bg-gray-900 rounded mb-4 flex items-center space-x-2">
          <span className="text-gray-400 text-sm">Selected:</span>
          {selection.map((type, index) => (
            <span
              key={index}
              className={`px-2 py-0.5 rounded text-sm ${SCRAP_TYPES[type].color} ${SCRAP_TYPES[type].bg}`}
            >
              {SCRAP_TYPES[type].name}
            </span>
          ))}
        </div>
        <div className="flex justify-between">
          <button onClick={handleUndo} className="btn btn-warning">
            Undo
          </button>
          <button
            onClick={onCancel}
            className="btn btn-secondary"
            title="Return to action panel"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canConfirm}
            className={`btn ${canConfirm ? "btn-primary" : "btn-disabled"}`}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
};
