import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../store";
import { buildApiUrl } from "../utils/connection";

const formatPercent = (value) => {
  if (!Number.isFinite(value)) return "0.0%";
  return `${(value * 100).toFixed(1)}%`;
};

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const formatPayload = (payload) => {
  if (!payload || Object.keys(payload).length === 0) return "";
  const text = JSON.stringify(payload);
  if (text.length <= 120) return text;
  return `${text.slice(0, 117)}...`;
};

const BotSimulationPage = () => {
  const token = useStore((state) => state.token);
  const navigate = useNavigate();
  const [simulations, setSimulations] = useState("100");
  const [botCount, setBotCount] = useState("4");
  const [botDepth, setBotDepth] = useState("2");
  const [maxActions, setMaxActions] = useState("400");
  const [maxTurns, setMaxTurns] = useState("200");
  const [personality, setPersonality] = useState("greedy");
  const [planningProfile, setPlanningProfile] = useState("full");
  const [seed, setSeed] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState(null);
  const [jobId, setJobId] = useState(null);
  const [jobStatus, setJobStatus] = useState(null);
  const [jobConfig, setJobConfig] = useState(null);
  const [actionFilter, setActionFilter] = useState("");
  const [cardFilter, setCardFilter] = useState("");
  const [selectedRunId, setSelectedRunId] = useState(null);
  const [fullLogOpen, setFullLogOpen] = useState(false);
  const [fullLogQuery, setFullLogQuery] = useState("");
  const pollRef = useRef(null);

  const resetFilters = () => {
    setActionFilter("");
    setCardFilter("");
  };

  const handleRun = async (event) => {
    event.preventDefault();
    setRunning(true);
    setError("");
    setResult(null);
    setJobId(null);
    setJobStatus(null);
    resetFilters();
    const payload = {
      simulations: toNumber(simulations, 100),
      bot_count: toNumber(botCount, 4),
      bot_depth: toNumber(botDepth, 2),
      max_actions_per_run: toNumber(maxActions, 400),
      max_turns: toNumber(maxTurns, 200),
      planning_profile: planningProfile,
      personality,
    };
    if (seed !== "") {
      payload.seed = toNumber(seed, 0);
    }
    setJobConfig(payload);
    try {
      const response = await fetch(buildApiUrl("/api/simulations/bots/start"), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        let detail = "Failed to run simulations.";
        try {
          const err = await response.json();
          detail = err?.detail || err?.message || detail;
        } catch (parseError) {
          detail = response.statusText || detail;
        }
        throw new Error(detail);
      }
      const data = await response.json();
      if (!data?.job_id) {
        throw new Error("Simulation job did not start.");
      }
      setJobId(data.job_id);
    } catch (err) {
      setError(err?.message || "Failed to run simulations.");
      setRunning(false);
    } finally {
      setRunning(false);
    }
  };

  const fetchJobStatus = async (activeJobId) => {
    const response = await fetch(buildApiUrl(`/api/simulations/bots/${activeJobId}/status`), {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!response.ok) {
      let detail = "Failed to load simulation status.";
      try {
        const err = await response.json();
        detail = err?.detail || err?.message || detail;
      } catch (parseError) {
        detail = response.statusText || detail;
      }
      throw new Error(detail);
    }
    return response.json();
  };

  const fetchJobResult = async (activeJobId) => {
    const response = await fetch(buildApiUrl(`/api/simulations/bots/${activeJobId}/result`), {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!response.ok) {
      let detail = "Failed to load simulation result.";
      try {
        const err = await response.json();
        detail = err?.detail || err?.message || detail;
      } catch (parseError) {
        detail = response.statusText || detail;
      }
      throw new Error(detail);
    }
    return response.json();
  };

  useEffect(() => {
    if (!jobId) return () => {};
    let cancelled = false;
    const poll = async () => {
      try {
        const status = await fetchJobStatus(jobId);
        if (cancelled) return;
        setJobStatus(status);
        if (status?.status === "completed") {
          if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
          const data = await fetchJobResult(jobId);
          if (!cancelled) {
            setResult(data);
            setSelectedRunId(data?.runs?.[0]?.id ?? null);
          }
        }
        if (status?.status === "failed") {
          if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
          setError(status?.error || "Simulation failed.");
        }
      } catch (err) {
        if (cancelled) return;
        setError(err?.message || "Failed to poll simulation status.");
      }
    };
    poll();
    pollRef.current = setInterval(poll, 800);
    return () => {
      cancelled = true;
      if (pollRef.current) {
        clearInterval(pollRef.current);
        pollRef.current = null;
      }
    };
  }, [jobId, token]);

  const actionOptions = useMemo(() => {
    if (!result?.action_counts) return [];
    return Object.keys(result.action_counts).sort();
  }, [result]);

  const cardOptions = useMemo(() => {
    const usage = result?.card_usage || {};
    const kindIndex = result?.card_index || {};
    return Object.keys(usage)
      .map((name) => ({
        name,
        kind: kindIndex[name] || "",
        count: usage[name],
      }))
      .sort((a, b) => {
        if (a.kind !== b.kind) return a.kind.localeCompare(b.kind);
        return a.name.localeCompare(b.name);
      });
  }, [result]);

  const normalizeFilter = (value) => value.trim().toLowerCase();
  const actionFilterValue = normalizeFilter(actionFilter);
  const cardFilterValue = normalizeFilter(cardFilter);

  const filteredRuns = useMemo(() => {
    if (!result?.runs) return [];
    return result.runs.filter((run) => {
      const matchesAction =
        !actionFilterValue || (run.action_types || []).some((action) => normalizeFilter(action) === actionFilterValue);
      const matchesCard =
        !cardFilterValue ||
        (run.cards_used || []).some((card) => normalizeFilter(card.name).includes(cardFilterValue));
      return matchesAction && matchesCard;
    });
  }, [result, actionFilterValue, cardFilterValue]);

  useEffect(() => {
    if (!filteredRuns.length) {
      setSelectedRunId(null);
      return;
    }
    if (!selectedRunId || !filteredRuns.some((run) => run.id === selectedRunId)) {
      setSelectedRunId(filteredRuns[0].id);
    }
  }, [filteredRuns, selectedRunId]);

  const selectedRun = useMemo(() => {
    if (!selectedRunId) return null;
    return (result?.runs || []).find((run) => run.id === selectedRunId) || null;
  }, [result, selectedRunId]);

  useEffect(() => {
    if (!selectedRunId) {
      setFullLogOpen(false);
    }
    setFullLogQuery("");
  }, [selectedRunId]);

  const filteredWins = useMemo(() => {
    const wins = {};
    filteredRuns.forEach((run) => {
      if (run.winner_id) {
        wins[run.winner_id] = (wins[run.winner_id] || 0) + 1;
      }
    });
    return wins;
  }, [filteredRuns]);

  const filteredActionCounts = useMemo(() => {
    const counts = {};
    filteredRuns.forEach((run) => {
      (run.actions || []).forEach((action) => {
        counts[action.type] = (counts[action.type] || 0) + 1;
      });
    });
    return counts;
  }, [filteredRuns]);

  const filteredCardUsage = useMemo(() => {
    const counts = {};
    filteredRuns.forEach((run) => {
      (run.actions || []).forEach((action) => {
        (action.cards || []).forEach((card) => {
          counts[card.name] = (counts[card.name] || 0) + 1;
        });
      });
    });
    return counts;
  }, [filteredRuns]);

  const filteredActions = useMemo(() => {
    if (!selectedRun?.actions) return [];
    return selectedRun.actions.filter((action) => {
      const matchesAction = !actionFilterValue || normalizeFilter(action.type) === actionFilterValue;
      const matchesCard =
        !cardFilterValue ||
        (action.cards || []).some((card) => normalizeFilter(card.name).includes(cardFilterValue));
      return matchesAction && matchesCard;
    });
  }, [selectedRun, actionFilterValue, cardFilterValue]);

  const fullLogActions = useMemo(() => {
    if (!selectedRun?.actions) return [];
    const query = fullLogQuery.trim().toLowerCase();
    if (!query) return selectedRun.actions;
    return selectedRun.actions.filter((action) => {
      if (action.type?.toLowerCase().includes(query)) return true;
      if (action.player_name?.toLowerCase().includes(query)) return true;
      if ((action.cards || []).some((card) => card.name?.toLowerCase().includes(query))) return true;
      const payload = action.payload ? JSON.stringify(action.payload).toLowerCase() : "";
      return payload.includes(query);
    });
  }, [selectedRun, fullLogQuery]);

  const players = result?.players || [];
  const filteredRunCount = filteredRuns.length;
  const isRunning =
    running ||
    (jobId && jobStatus?.status !== "completed" && jobStatus?.status !== "failed");

  const statusProgress = jobStatus?.progress ?? 0;
  const statusPercent = Math.round(statusProgress * 100);
  const statusElapsed = jobStatus?.elapsed_ms ? `${Math.round(jobStatus.elapsed_ms / 1000)}s` : "--";
  const statusEta = jobStatus?.eta_ms ? `${Math.round(jobStatus.eta_ms / 1000)}s` : "--";
  const botCountDisplay = jobConfig?.bot_count ?? botCount;
  const progressPlayers = Array.from({ length: Number(botCountDisplay) || 0 }, (_, idx) => {
    const id = `bot_${idx + 1}`;
    return {
      id,
      name: `Bot ${idx + 1}`,
      wins: jobStatus?.wins?.[id] || 0,
    };
  });

  return (
    <div className="space-y-6 animate-fade-in">
      <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-orange-400">Bot Simulation Lab</h1>
          <p className="text-gray-400 text-sm mt-1">
            Run bot-only games in the backend and inspect action logs, wins, and card usage.
          </p>
        </div>
        <button
          onClick={() => navigate("/lobby")}
          className="px-3 py-2 rounded-md border border-gray-700 text-gray-200 hover:border-orange-400 text-sm"
        >
          Back to Lobby
        </button>
      </header>

      <form
        onSubmit={handleRun}
        className="bg-gray-800 border border-gray-700 rounded-lg p-5 space-y-4"
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <label className="text-sm text-gray-300 flex flex-col gap-2">
            Simulations
            <input
              type="number"
              min="1"
              max="300"
              value={simulations}
              onChange={(event) => setSimulations(event.target.value)}
              className="px-3 py-2 rounded-md bg-gray-900 border border-gray-700 text-gray-100"
            />
          </label>
          <label className="text-sm text-gray-300 flex flex-col gap-2">
            Bots
            <input
              type="number"
              min="2"
              max="6"
              value={botCount}
              onChange={(event) => setBotCount(event.target.value)}
              className="px-3 py-2 rounded-md bg-gray-900 border border-gray-700 text-gray-100"
            />
          </label>
          <label className="text-sm text-gray-300 flex flex-col gap-2">
            Bot depth
            <input
              type="number"
              min="1"
              max="5"
              value={botDepth}
              onChange={(event) => setBotDepth(event.target.value)}
              className="px-3 py-2 rounded-md bg-gray-900 border border-gray-700 text-gray-100"
            />
          </label>
          <label className="text-sm text-gray-300 flex flex-col gap-2">
            Max actions
            <input
              type="number"
              min="50"
              max="2000"
              value={maxActions}
              onChange={(event) => setMaxActions(event.target.value)}
              className="px-3 py-2 rounded-md bg-gray-900 border border-gray-700 text-gray-100"
            />
          </label>
          <label className="text-sm text-gray-300 flex flex-col gap-2">
            Max turns
            <input
              type="number"
              min="10"
              max="1000"
              value={maxTurns}
              onChange={(event) => setMaxTurns(event.target.value)}
              className="px-3 py-2 rounded-md bg-gray-900 border border-gray-700 text-gray-100"
            />
          </label>
          <label className="text-sm text-gray-300 flex flex-col gap-2">
            Seed (optional)
            <input
              type="number"
              value={seed}
              onChange={(event) => setSeed(event.target.value)}
              className="px-3 py-2 rounded-md bg-gray-900 border border-gray-700 text-gray-100"
            />
          </label>
          <label className="text-sm text-gray-300 flex flex-col gap-2">
            Personality
            <select
              value={personality}
              onChange={(event) => setPersonality(event.target.value)}
              className="px-3 py-2 rounded-md bg-gray-900 border border-gray-700 text-gray-100"
            >
              <option value="greedy">Greedy</option>
              <option value="top3">Top 3</option>
              <option value="softmax5">Softmax 5</option>
            </select>
          </label>
          <label className="text-sm text-gray-300 flex flex-col gap-2">
            Planning profile
            <select
              value={planningProfile}
              onChange={(event) => setPlanningProfile(event.target.value)}
              className="px-3 py-2 rounded-md bg-gray-900 border border-gray-700 text-gray-100"
            >
              <option value="full">Full</option>
              <option value="buy_only">Buy only</option>
              <option value="fight_only">Fight only</option>
              <option value="fight_buy">Fight + Buy</option>
            </select>
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={isRunning}
            className="px-4 py-2 rounded-md bg-orange-600 hover:bg-orange-700 text-white font-semibold disabled:opacity-60"
          >
            {isRunning ? "Running..." : "Run Simulations"}
          </button>
          {result && (
            <button
              type="button"
              onClick={resetFilters}
              className="px-3 py-2 rounded-md border border-gray-600 text-gray-200 hover:border-orange-400 text-sm"
            >
              Reset Filters
            </button>
          )}
          {error && <span className="text-rose-300 text-sm">{error}</span>}
        </div>
      </form>

      {jobStatus && (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-100">Simulation Progress</h2>
            <span className="text-xs text-gray-400">
              {jobStatus.completed_runs}/{jobStatus.total_runs} • {statusPercent}%
            </span>
          </div>
          <div className="h-2 rounded-full bg-gray-700 overflow-hidden">
            <div
              className="h-full bg-orange-500 transition-all"
              style={{ width: `${statusPercent}%` }}
            />
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-gray-300">
            <div className="space-y-1">
              <div>Elapsed: {statusElapsed}</div>
              <div>ETA: {statusEta}</div>
              <div>Bots: {botCountDisplay}</div>
            </div>
            <div className="space-y-1">
              <div>Avg actions/run: {jobStatus.avg_actions?.toFixed(1)}</div>
              <div>Status: {jobStatus.status}</div>
              <div>{jobStatus.message}</div>
            </div>
            <div className="space-y-1">
              {jobStatus.latest_run ? (
                <>
                  <div>Last run: #{jobStatus.latest_run.id}</div>
                  <div>Winner: {jobStatus.latest_run.winner_name || "None"}</div>
                  <div>Actions: {jobStatus.latest_run.total_actions}</div>
                </>
              ) : (
                <div>Preparing first run...</div>
              )}
            </div>
          </div>
          {progressPlayers.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs text-gray-300">
              {progressPlayers.map((player) => (
                <div key={player.id} className="flex items-center justify-between border border-gray-700 rounded-md px-2 py-1">
                  <span>{player.name}</span>
                  <span className="text-gray-100">{player.wins}</span>
                </div>
              ))}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-300">
            <div className="space-y-2">
              <div className="text-xs uppercase tracking-wide text-gray-400">Top actions</div>
              <div className="space-y-1">
                {(jobStatus.top_actions || []).length ? (
                  jobStatus.top_actions.map((entry) => (
                    <div key={entry.name} className="flex justify-between">
                      <span>{entry.name}</span>
                      <span className="text-gray-100">{entry.count}</span>
                    </div>
                  ))
                ) : (
                  <div className="text-gray-500">No data yet</div>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <div className="text-xs uppercase tracking-wide text-gray-400">Top cards</div>
              <div className="space-y-1">
                {(jobStatus.top_cards || []).length ? (
                  jobStatus.top_cards.map((entry) => (
                    <div key={entry.name} className="flex justify-between">
                      <span>
                        {entry.kind ? `${entry.kind} - ${entry.name}` : entry.name}
                      </span>
                      <span className="text-gray-100">{entry.count}</span>
                    </div>
                  ))
                ) : (
                  <div className="text-gray-500">No data yet</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {result && (
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          <section className="xl:col-span-1 space-y-4">
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-100">Summary</h2>
                <span className="text-xs text-gray-400">
                  {result.duration_ms ? `${result.duration_ms}ms` : ""}
                </span>
              </div>
              <div className="text-sm text-gray-300 space-y-1">
                <div>Runs: {result.simulations}</div>
                <div>Filtered: {filteredRunCount}</div>
                <div>Bots: {result.bot_count}</div>
              </div>
            </div>

            <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 space-y-3">
              <h3 className="text-sm font-semibold text-gray-200 uppercase tracking-wide">Wins</h3>
              <div className="space-y-2 text-sm text-gray-300">
                {players.map((player) => {
                  const wins = filteredWins[player.id] || 0;
                  const rate = filteredRunCount ? wins / filteredRunCount : 0;
                  return (
                    <div key={player.id} className="flex items-center justify-between">
                      <span>{player.name}</span>
                      <span className="text-gray-100">
                        {wins} ({formatPercent(rate)})
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 space-y-3">
              <h3 className="text-sm font-semibold text-gray-200 uppercase tracking-wide">Action Mix</h3>
              <div className="space-y-2 text-sm text-gray-300 max-h-52 overflow-auto pr-2">
                {Object.entries(filteredActionCounts)
                  .sort((a, b) => b[1] - a[1])
                  .map(([action, count]) => (
                    <div key={action} className="flex items-center justify-between">
                      <span>{action}</span>
                      <span className="text-gray-100">{count}</span>
                    </div>
                  ))}
              </div>
            </div>

            <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 space-y-3">
              <h3 className="text-sm font-semibold text-gray-200 uppercase tracking-wide">Card Usage</h3>
              <div className="space-y-2 text-sm text-gray-300 max-h-52 overflow-auto pr-2">
                {Object.entries(filteredCardUsage)
                  .sort((a, b) => b[1] - a[1])
                  .map(([card, count]) => (
                    <div key={card} className="flex items-center justify-between">
                      <span>{card}</span>
                      <span className="text-gray-100">{count}</span>
                    </div>
                  ))}
              </div>
            </div>
          </section>

          <section className="xl:col-span-2 space-y-4">
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 space-y-4">
              <h2 className="text-lg font-semibold text-gray-100">Filters</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="text-sm text-gray-300 flex flex-col gap-2">
                  Action type
                  <select
                    value={actionFilter}
                    onChange={(event) => setActionFilter(event.target.value)}
                    className="px-3 py-2 rounded-md bg-gray-900 border border-gray-700 text-gray-100"
                  >
                    <option value="">All actions</option>
                    {actionOptions.map((action) => (
                      <option key={action} value={action}>
                        {action}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm text-gray-300 flex flex-col gap-2">
                  Weapon or upgrade
                  <select
                    value={cardFilter}
                    onChange={(event) => setCardFilter(event.target.value)}
                    className="px-3 py-2 rounded-md bg-gray-900 border border-gray-700 text-gray-100"
                  >
                    <option value="">All cards</option>
                    {cardOptions.map((card) => (
                      <option key={card.name} value={card.name}>
                        {card.kind ? `${card.kind} - ${card.name}` : card.name}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-200 uppercase tracking-wide">Runs</h3>
                  <span className="text-xs text-gray-400">
                    {filteredRunCount} / {result.runs?.length || 0}
                  </span>
                </div>
                <div className="space-y-2 max-h-80 overflow-auto pr-2">
                  {filteredRuns.map((run) => {
                    const isSelected = run.id === selectedRunId;
                    return (
                      <button
                        key={run.id}
                        type="button"
                        onClick={() => setSelectedRunId(run.id)}
                        className={`w-full text-left px-3 py-2 rounded-md border transition ${
                          isSelected
                            ? "border-orange-400 bg-orange-500/10 text-gray-100"
                            : "border-gray-700 bg-gray-900/60 text-gray-300 hover:border-gray-500"
                        }`}
                      >
                        <div className="flex items-center justify-between text-sm">
                          <span>Run {run.id}</span>
                          <span>{run.winner_name || "No winner"}</span>
                        </div>
                        <div className="text-xs text-gray-400 mt-1">
                          Actions {run.total_actions} • {run.ended_reason}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="lg:col-span-2 space-y-4">
                <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 space-y-3">
                  <h3 className="text-sm font-semibold text-gray-200 uppercase tracking-wide">Final Stats</h3>
                  {selectedRun?.final_stats?.length ? (
                    <div className="space-y-2 text-sm text-gray-300">
                      {selectedRun.final_stats.map((entry) => (
                        <div
                          key={entry.user_id}
                          className="flex flex-wrap items-center justify-between gap-2 border border-gray-700 rounded-md px-3 py-2"
                        >
                          <div className="font-semibold text-gray-100">{entry.username}</div>
                          <div className="flex flex-wrap gap-3 text-xs text-gray-400">
                            <span>Score {entry.score}</span>
                            <span>VP {entry.vp}</span>
                            <span>Wounds {entry.wounds}</span>
                            <span>Threats {entry.threats_defeated}</span>
                            <span>Tokens {Object.values(entry.tokens || {}).reduce((a, b) => a + b, 0)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400">Select a run to view final stats.</p>
                  )}
                </div>

                <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-gray-200 uppercase tracking-wide">Action Log</h3>
                    <span className="text-xs text-gray-400">
                      {filteredActions.length} / {selectedRun?.actions?.length || 0}
                    </span>
                  </div>
                  {selectedRun?.actions?.length ? (
                    <div className="flex items-center gap-3 text-xs text-gray-400">
                      <button
                        type="button"
                        onClick={() => setFullLogOpen(true)}
                        className="px-2 py-1 rounded-md border border-gray-600 text-gray-200 hover:border-orange-400"
                      >
                        Open full log
                      </button>
                      <span>Filters still apply in the preview panel above.</span>
                    </div>
                  ) : null}
                  <div className="space-y-2 max-h-96 overflow-auto pr-2 text-sm">
                    {filteredActions.map((action) => {
                      const cards = (action.cards || []).map((card) => card.name).join(", ");
                      return (
                        <div
                          key={`${action.index}-${action.player_id}`}
                          className="border border-gray-700 rounded-md px-3 py-2 bg-gray-900/60"
                        >
                          <div className="flex items-center justify-between">
                            <div className="text-gray-100">
                              #{action.index} {action.player_name} · {action.type}
                            </div>
                            {action.status !== "ok" && (
                              <span className="text-xs text-rose-300">{action.status}</span>
                            )}
                          </div>
                          <div className="text-xs text-gray-400 mt-1 flex flex-wrap gap-3">
                            <span>Round {action.round}</span>
                            <span>Era {action.era}</span>
                            {action.forced && <span>Forced</span>}
                          </div>
                          {cards && <div className="text-xs text-gray-300 mt-1">Cards: {cards}</div>}
                          {formatPayload(action.payload) && (
                            <div className="text-xs text-gray-500 mt-1">Payload: {formatPayload(action.payload)}</div>
                          )}
                          {action.error && (
                            <div className="text-xs text-rose-300 mt-1">Error: {action.error}</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      )}
      {fullLogOpen && selectedRun && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-5xl shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
              <div>
                <h3 className="text-lg font-semibold text-gray-100">Run {selectedRun.id} Full Log</h3>
                <p className="text-xs text-gray-400">
                  {fullLogActions.length} / {selectedRun.actions?.length || 0} actions
                </p>
              </div>
              <button
                type="button"
                onClick={() => setFullLogOpen(false)}
                className="px-3 py-1 rounded-md border border-gray-600 text-gray-200 hover:border-orange-400 text-sm"
              >
                Close
              </button>
            </div>
            <div className="px-5 py-4 border-b border-gray-700">
              <input
                type="text"
                value={fullLogQuery}
                onChange={(event) => setFullLogQuery(event.target.value)}
                placeholder="Search actions, players, cards, payload..."
                className="w-full px-3 py-2 rounded-md bg-gray-800 border border-gray-700 text-gray-100 text-sm"
              />
            </div>
            <div className="px-5 py-4 max-h-[70vh] overflow-auto space-y-2 text-sm">
              {fullLogActions.map((action) => {
                const cards = (action.cards || []).map((card) => card.name).join(", ");
                return (
                  <div
                    key={`full-${action.index}-${action.player_id}`}
                    className="border border-gray-700 rounded-md px-3 py-2 bg-gray-950/50"
                  >
                    <div className="flex items-center justify-between">
                      <div className="text-gray-100">
                        #{action.index} {action.player_name} · {action.type}
                      </div>
                      {action.status !== "ok" && (
                        <span className="text-xs text-rose-300">{action.status}</span>
                      )}
                    </div>
                    <div className="text-xs text-gray-400 mt-1 flex flex-wrap gap-3">
                      <span>Round {action.round}</span>
                      <span>Era {action.era}</span>
                      {action.forced && <span>Forced</span>}
                    </div>
                    {cards && <div className="text-xs text-gray-300 mt-1">Cards: {cards}</div>}
                    {formatPayload(action.payload) && (
                      <div className="text-xs text-gray-500 mt-1">Payload: {formatPayload(action.payload)}</div>
                    )}
                    {action.error && (
                      <div className="text-xs text-rose-300 mt-1">Error: {action.error}</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BotSimulationPage;
