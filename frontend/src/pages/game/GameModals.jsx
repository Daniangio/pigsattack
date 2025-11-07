import React, { useState, useRef, useEffect } from "react";
import { SCRAP_TYPES } from "./GameConstants.js";

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

const PreviewDisplay = ({ preview, isLoading }) => {
  if (isLoading) {
    return (
      <div className="p-3 bg-gray-700 rounded-lg mb-4 text-center">
        <p className="text-yellow-400">Calculating...</p>
      </div>
    );
  }

  if (!preview) {
    return (
      <div className="p-3 bg-gray-700 rounded-lg mb-4 text-center">
        <p className="text-gray-400">
          Adjust scrap or add cards to see preview.
        </p>
      </div>
    );
  }

  if (preview.error) {
    return (
      <div className="p-3 bg-red-900 rounded-lg mb-4 text-center">
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

  return (
    <div className="p-3 bg-gray-900 rounded-lg mb-4">
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

export const DefenseSubmission = ({
  player,
  threat,
  sendGameAction,
  gameState,
  token,
}) => {
  const { game_id } = gameState;
  const [scrap, setScrap] = useState({ PARTS: 0, WIRING: 0, PLATES: 0 });
  const [selectedArsenal, setSelectedArsenal] = useState(new Set());
  const [defensePreview, setDefensePreview] = useState(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const debounceTimeout = useRef(null);
  const availableScrap = player.scrap;

  useEffect(() => {
    if (debounceTimeout.current) {
      clearTimeout(debounceTimeout.current);
    }
    if (!threat) return;
    const payload = {
      scrap_spent: scrap,
      arsenal_card_ids: Array.from(selectedArsenal),
      special_target_stat: null,
      special_corrode_stat: null,
      special_amp_spend: {},
    };

    debounceTimeout.current = setTimeout(async () => {
      setIsPreviewLoading(true);
      try {
        const response = await fetch(`/api/game/${game_id}/preview_defense`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        });
        if (!response.ok) {
          const err = await response.json();
          throw new Error(err.detail || "Preview failed");
        }
        const previewData = await response.json();
        setDefensePreview(previewData);
      } catch (error) {
        console.error("Error fetching defense preview:", error);
        setDefensePreview({ error: `Could not get preview: ${error.message}` });
      }
      setIsPreviewLoading(false);
    }, 300);

    return () => {
      if (debounceTimeout.current) {
        clearTimeout(debounceTimeout.current);
      }
    };
  }, [scrap, selectedArsenal, threat, game_id, token]);

  const handleScrapChange = (color, amount) => {
    const newAmount = Math.max(
      0,
      Math.min(availableScrap[color] || 0, (scrap[color] || 0) + amount)
    );
    setScrap((prev) => ({ ...prev, [color]: newAmount }));
  };
  const handleSetMaxScrap = (color) => {
    setScrap((prev) => ({ ...prev, [color]: availableScrap[color] || 0 }));
  };
  const handleArsenalToggle = (cardId) => {
    setSelectedArsenal((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(cardId)) {
        newSet.delete(cardId);
      } else {
        newSet.add(cardId);
      }
      return newSet;
    });
  };

  const handleSubmit = () => {
    const payload = {
      scrap_spent: scrap,
      arsenal_card_ids: Array.from(selectedArsenal),
      special_target_stat: null,
      special_corrode_stat: null,
      special_amp_spend: {},
    };
    sendGameAction("submit_defense", payload);
  };

  if (player.defense_submitted) {
    return (
      <div className="text-center p-4">
        <h3 className="text-lg text-green-400">
          Defense submitted. Waiting...
        </h3>
      </div>
    );
  }
  if (!threat) {
    return (
      <div className="text-center p-4">
        <h3 className="text-lg text-gray-400">
          No threat attracted. Waiting...
        </h3>
      </div>
    );
  }

  return (
    <div className="p-2 bg-gray-700 bg-opacity-80 rounded-lg h-full flex flex-col">
      <h3 className="text-xl font-bold text-white mb-2 text-center">
        Submit Your Defense!
      </h3>
      <h4 className="text-lg text-red-400 mb-2 text-center">
        vs. {threat.name}
      </h4>
      <PreviewDisplay preview={defensePreview} isLoading={isPreviewLoading} />
      <div className="grid grid-cols-3 gap-4 mb-4">
        {["PARTS", "WIRING", "PLATES"].map((color) => (
          <div key={color} className="text-white">
            <div className="flex items-center mb-1">
              <img
                src={SCRAP_TYPES[color].img}
                alt={color}
                className="w-6 h-6 mr-2"
              />
              <span>(Avail: {availableScrap[color] || 0})</span>
            </div>
            <div className="flex items-center">
              <button
                onClick={() => handleScrapChange(color, -1)}
                className="px-2 py-1 bg-red-700 rounded"
              >
                -
              </button>
              <span className="mx-2 w-10 text-center">{scrap[color]}</span>
              <button
                onClick={() => handleScrapChange(color, 1)}
                className="px-2 py-1 bg-green-700 rounded"
              >
                +
              </button>
              <button
                onClick={() => handleSetMaxScrap(color)}
                className="ml-2 px-2 py-1 bg-blue-700 rounded text-xs"
              >
                Max
              </button>
            </div>
          </div>
        ))}
      </div>
      <div className="mb-4 flex-grow overflow-y-auto">
        <h5 className="text-white mb-2">Select Arsenal:</h5>
        <div className="flex flex-col gap-2">
          {player.arsenal_cards.length === 0 && (
            <p className="text-gray-400">No Arsenal cards in hand.</p>
          )}
          {player.arsenal_cards.map((card) => (
            <div
              key={card.id}
              onClick={() => handleArsenalToggle(card.id)}
              className={`p-2 border-2 rounded-lg cursor-pointer bg-gray-700 ${
                selectedArsenal.has(card.id)
                  ? "border-yellow-400"
                  : "border-gray-600"
              }`}
            >
              <p className="text-white text-sm font-bold">{card.name}</p>
              <p className="text-gray-300 text-xs">{card.effect_text}</p>
            </div>
          ))}
        </div>
      </div>
      <button
        onClick={handleSubmit}
        className="w-full py-3 bg-green-600 text-white font-bold rounded-lg hover:bg-green-700 transition-colors mt-2"
      >
        Submit Defense
      </button>
    </div>
  );
};

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