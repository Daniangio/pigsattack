import React, { useEffect, useState } from "react";
import { useStore } from "../store.js";
import { useParams, useNavigate } from "react-router-dom";
import { apiBaseUrl } from "../utils/connection";

const apiBase = apiBaseUrl;

const RoomPage = ({ onLogout }) => {
  const { user, roomState, token } = useStore();
  const sendMessage = useStore((state) => state.sendMessage);
  const { roomId } = useParams();
  const navigate = useNavigate();
  const [deckOptions, setDeckOptions] = useState({
    threats: [{ name: "default" }],
    bosses: [{ name: "default" }],
    upgrades: [{ name: "default" }],
    weapons: [{ name: "default" }],
  });
  const [deckError, setDeckError] = useState(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const headers = token ? { Authorization: `Bearer ${token}` } : {};
    const loadDecks = async () => {
      try {
        const [threatRes, bossRes, upgradeRes, weaponRes] = await Promise.all([
          fetch(`${apiBase}/api/custom/threat-decks`, { headers }),
          fetch(`${apiBase}/api/custom/boss-decks`, { headers }),
          fetch(`${apiBase}/api/custom/upgrade-decks`, { headers }),
          fetch(`${apiBase}/api/custom/weapon-decks`, { headers }),
        ]);
        const [threatJson, bossJson, upgradeJson, weaponJson] = await Promise.all([
          threatRes.json(),
          bossRes.json(),
          upgradeRes.json(),
          weaponRes.json(),
        ]);
        if (cancelled) return;
        const withDefault = (list) => (Array.isArray(list) && list.length ? list : [{ name: "default" }]);
        setDeckOptions({
          threats: withDefault(threatJson.decks),
          bosses: withDefault(bossJson.decks),
          upgrades: withDefault(upgradeJson.decks),
          weapons: withDefault(weaponJson.decks),
        });
        setDeckError(null);
      } catch (e) {
        if (!cancelled) setDeckError("Failed to load deck lists.");
      }
    };
    loadDecks();
    return () => {
      cancelled = true;
    };
  }, [token]);

  // --- REFACTOR: Removed the complex useEffect and hasLoadedRoom ref ---
  // The StateGuard in App.jsx now handles all navigation logic:
  // 1. If roomState is null, StateGuard redirects from /room/* to /lobby.
  // 2. If roomState is for a different room, StateGuard redirects to the correct room.
  
  // This loading gate is now the *only* logic needed.
  // It handles the initial load while waiting for the server
  // to send the room_state message.
  if (!roomState || roomState.id !== roomId) {
    return (
      <div className="flex justify-center items-center h-screen">
         <div className="text-lg text-gray-400">Loading room...</div>
      </div>
    );
  }
  // --- END REFACTOR ---


  // If we get here, roomState is valid and matches roomId.

  const btn = "py-2 px-4 font-semibold rounded-md shadow-md transition duration-200 ease-in-out disabled:opacity-50 disabled:cursor-not-allowed";
  const btnPrimary = `${btn} bg-orange-600 hover:bg-orange-700 text-white`;
  const btnSecondary = `${btn} bg-gray-600 hover:bg-gray-500 text-white`;
  const btnInfo = `${btn} bg-blue-600 hover:bg-blue-700 text-white`;
  const btnDanger = `${btn} bg-red-700 hover:bg-red-800 text-white`;

  const isHost = user?.id === roomState.host_id;
  const canStartGame = roomState.players.length >= 2;
  const roomFull = roomState.players.length >= 5;
  const bots = roomState.players.filter((p) => p.is_bot);

  const handleLeaveRoom = () => {
    if (sendMessage) {
      sendMessage({ action: "leave_room" });
      // We still optimistically navigate here. The StateGuard
      // will also get the updated state and confirm this.
      navigate("/lobby");
    }
  };
  
  const handleStartGame = () => {
    if (isHost && canStartGame && sendMessage) {
      sendMessage({ action: "start_game" });
      // No navigation needed. StateGuard will handle the
      // navigation to /game/:gameId when gameState is received.
    }
  };

  const handleViewProfile = () => {
    navigate(`/profile/${user.id}`);
  };

  const handleGoToLobby = () => {
    navigate('/lobby');
  };

  const handleAddBot = () => {
    if (!sendMessage || !isHost) return;
    sendMessage({ action: "add_bot", payload: { room_id: roomId } });
  };

  const handleRemoveBot = () => {
    if (!sendMessage || !isHost) return;
    const bot = roomState.players.find((p) => p.is_bot);
    if (!bot) return;
    sendMessage({ action: "remove_bot", payload: { room_id: roomId, bot_id: bot.id } });
  };

  const handleSetBotPersonality = (botId, personality) => {
    if (!sendMessage || !isHost) return;
    sendMessage({
      action: "set_bot_personality",
      payload: { room_id: roomId, bot_id: botId, personality },
    });
  };

  const handleSetBotDepth = (botId, depth) => {
    if (!sendMessage || !isHost) return;
    sendMessage({
      action: "set_bot_depth",
      payload: { room_id: roomId, bot_id: botId, depth: Number(depth) },
    });
  };

  const handleSetBotPlanningProfile = (botId, planning_profile) => {
    if (!sendMessage || !isHost) return;
    sendMessage({
      action: "set_bot_planning_profile",
      payload: { room_id: roomId, bot_id: botId, planning_profile },
    });
  };

  const personalityOptions = [
    { value: "greedy", label: "Greedy (best)" },
    { value: "top3", label: "Top 3 (uniform)" },
    { value: "softmax5", label: "Top 5 (softmax)" },
  ];
  const planningProfileOptions = [
    { value: "full", label: "Full planning" },
    { value: "buy_only", label: "Buy only" },
    { value: "fight_only", label: "Fight only" },
    { value: "fight_buy", label: "Fight + buy" },
  ];
  const planningProfileLabels = {
    full: "Full planning",
    buy_only: "Buy only",
    fight_only: "Fight only",
    fight_buy: "Fight + buy",
  };

  const handleDeckChange = (key, value) => {
    if (!sendMessage) return;
    sendMessage({
      action: "set_room_decks",
      payload: { [key]: value },
    });
  };

  const deckSelectDisabled = !isHost || roomState.status !== "lobby";

  return (
    <div className="animate-fade-in">
      <header className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
        <h1 className="text-3xl font-bold">
          Room: <span className="text-orange-400">{roomState.name}</span>
        </h1>
        <div className="flex items-center gap-3">
          <span className="text-lg text-gray-300">
            Player: <span className="font-semibold text-orange-400">{user?.username}</span>
          </span>
          <button onClick={handleGoToLobby} className={btnSecondary}>
            Lobby
          </button>
          <button onClick={handleViewProfile} className={btnSecondary}>
            Profile
          </button>
          <button onClick={onLogout} className={btnDanger}>
            Logout
          </button>
        </div>
      </header>

      <div className="grid md:grid-cols-3 gap-6">
        {/* Players List */}
        <div className="md:col-span-2 p-6 bg-gray-800 rounded-lg border border-gray-700">
          <h2 className="text-2xl font-semibold mb-4 text-gray-100">Players</h2>
          <ul className="space-y-2">
            {roomState.players.map((p) => (
              <li key={p.id} className="p-3 bg-gray-700 border border-gray-600 rounded-md text-gray-200">
                <div className="flex items-center justify-between gap-3">
                  <div className="space-x-2">
                    <span>{p.username}</span>
                    {p.id === roomState.host_id && (
                      <span className="text-xs font-bold text-orange-400">(Host)</span>
                    )}
                    {p.id === user.id && (
                      <span className="text-xs font-medium text-gray-400">(You)</span>
                    )}
                    {p.is_bot && (
                      <span className="text-xs font-semibold text-blue-300">
                        Bot • {p.personality || "greedy"} • Depth {p.bot_depth ?? 2} • Plan{" "}
                        {planningProfileLabels[p.planning_profile || "full"] || "Full planning"}
                      </span>
                    )}
                  </div>
                  {p.is_bot && isHost && (
                    <div className="flex flex-wrap gap-2">
                      <select
                        className="text-sm bg-gray-800 border border-gray-600 rounded px-2 py-1 text-gray-100"
                        value={p.personality || "greedy"}
                        onChange={(e) => handleSetBotPersonality(p.id, e.target.value)}
                      >
                        {personalityOptions.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      <select
                        className="text-sm bg-gray-800 border border-gray-600 rounded px-2 py-1 text-gray-100"
                        value={p.planning_profile || "full"}
                        onChange={(e) => handleSetBotPlanningProfile(p.id, e.target.value)}
                      >
                        {planningProfileOptions.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                      <select
                        className="text-sm bg-gray-800 border border-gray-600 rounded px-2 py-1 text-gray-100"
                        value={p.bot_depth ?? 2}
                        onChange={(e) => handleSetBotDepth(p.id, e.target.value)}
                      >
                        {[1, 2, 3, 4, 5].map((d) => (
                          <option key={d} value={d}>
                            Depth {d}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>

        {/* Actions */}
        <div className="p-6 bg-gray-800 rounded-lg border border-gray-700 flex flex-col justify-between">
          <div>
            <h2 className="text-2xl font-semibold mb-4 text-gray-100">Actions</h2>
            {isHost && (
              <button
                onClick={handleStartGame}
                disabled={!canStartGame}
                className={`${btnPrimary} w-full mb-2`}
              >
                Start Game
              </button>
            )}
            {!canStartGame && isHost && (
              <p className="text-sm text-gray-400 text-center mb-4">
                Need at least 2 players to start.
              </p>
            )}
            {isHost && canStartGame && (
               <p className="text-sm text-green-400 text-center mb-4">
                Ready to start!
              </p>
            )}
            {!isHost && (
              <p className="text-sm text-gray-400 text-center mb-4">
                Waiting for host to start the game...
              </p>
            )}
            {isHost && (
              <div className="mt-4 space-y-2">
                <button
                  onClick={handleAddBot}
                  disabled={roomFull}
                  className={`${btnInfo} w-full`}
                  title={roomFull ? "Room is full" : "Add a bot to this room"}
                >
                  Add Bot
                </button>
                <button
                  onClick={handleRemoveBot}
                  disabled={!bots.length}
                  className={`${btnSecondary} w-full`}
                  title={!bots.length ? "No bots to remove" : "Remove a bot from this room"}
                >
                  Remove Bot
                </button>
              </div>
            )}
            <div className="mt-6">
              <h3 className="text-lg font-semibold text-gray-100 mb-2">Deck Selection</h3>
              {deckError && <p className="text-xs text-rose-300 mb-2">{deckError}</p>}
              <div className="space-y-2">
                <label className="block text-xs text-gray-400 uppercase tracking-[0.18em]">
                  Threats
                  <select
                    className="mt-1 w-full text-sm bg-gray-800 border border-gray-600 rounded px-2 py-1 text-gray-100"
                    value={roomState.threat_deck || "default"}
                    onChange={(e) => handleDeckChange("threat_deck", e.target.value)}
                    disabled={deckSelectDisabled}
                  >
                    {(deckOptions.threats || []).map((deck) => (
                      <option key={deck.name} value={deck.name}>
                        {deck.label || deck.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs text-gray-400 uppercase tracking-[0.18em]">
                  Bosses
                  <select
                    className="mt-1 w-full text-sm bg-gray-800 border border-gray-600 rounded px-2 py-1 text-gray-100"
                    value={roomState.boss_deck || "default"}
                    onChange={(e) => handleDeckChange("boss_deck", e.target.value)}
                    disabled={deckSelectDisabled}
                  >
                    {(deckOptions.bosses || []).map((deck) => (
                      <option key={deck.name} value={deck.name}>
                        {deck.label || deck.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs text-gray-400 uppercase tracking-[0.18em]">
                  Upgrades
                  <select
                    className="mt-1 w-full text-sm bg-gray-800 border border-gray-600 rounded px-2 py-1 text-gray-100"
                    value={roomState.upgrade_deck || "default"}
                    onChange={(e) => handleDeckChange("upgrade_deck", e.target.value)}
                    disabled={deckSelectDisabled}
                  >
                    {(deckOptions.upgrades || []).map((deck) => (
                      <option key={deck.name} value={deck.name}>
                        {deck.label || deck.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-xs text-gray-400 uppercase tracking-[0.18em]">
                  Weapons
                  <select
                    className="mt-1 w-full text-sm bg-gray-800 border border-gray-600 rounded px-2 py-1 text-gray-100"
                    value={roomState.weapon_deck || "default"}
                    onChange={(e) => handleDeckChange("weapon_deck", e.target.value)}
                    disabled={deckSelectDisabled}
                  >
                    {(deckOptions.weapons || []).map((deck) => (
                      <option key={deck.name} value={deck.name}>
                        {deck.label || deck.name}
                      </option>
                    ))}
                  </select>
                </label>
                {deckSelectDisabled && (
                  <p className="text-xs text-gray-400">Only the host can change decks before the game starts.</p>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={handleLeaveRoom}
            className={`${btnSecondary} w-full mt-auto`}
          >
            Leave Room
          </button>
        </div>
      </div>
    </div>
  );
};

export default RoomPage;
