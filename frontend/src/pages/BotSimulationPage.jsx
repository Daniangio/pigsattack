import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../store";
import { buildApiUrl } from "../utils/connection";
import BotSimulationResultsPanel from "../components/simulations/BotSimulationResultsPanel";

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const BotSimulationPage = () => {
  const token = useStore((state) => state.token);
  const navigate = useNavigate();
  const [simulations, setSimulations] = useState("100");
  const [botCount, setBotCount] = useState("4");
  const [botDepth, setBotDepth] = useState("2");
  const [parallelism, setParallelism] = useState("32");
  const [personality, setPersonality] = useState("mixed");
  const [planningProfile, setPlanningProfile] = useState("full");
  const [randomness, setRandomness] = useState("0.15");
  const [seed, setSeed] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [jobId, setJobId] = useState(null);
  const [jobStatus, setJobStatus] = useState(null);
  const [jobConfig, setJobConfig] = useState(null);
  const pollRef = useRef(null);

  const handleRun = async (event) => {
    event.preventDefault();
    setRunning(true);
    setError("");
    setJobId(null);
    setJobStatus(null);
    const payload = {
      simulations: toNumber(simulations, 100),
      bot_count: toNumber(botCount, 4),
      bot_depth: toNumber(botDepth, 2),
      parallelism: toNumber(parallelism, 32),
      planning_profile: planningProfile,
      personality,
      randomness: toNumber(randomness, 0),
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

  const handleStopRun = async () => {
    if (!jobId) return;
    if (!window.confirm("Stop the running simulation?")) return;
    try {
      const response = await fetch(buildApiUrl(`/api/simulations/bots/${jobId}/stop`), {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) {
        let detail = "Failed to stop simulations.";
        try {
          const err = await response.json();
          detail = err?.detail || err?.message || detail;
        } catch (parseError) {
          detail = response.statusText || detail;
        }
        throw new Error(detail);
      }
      const data = await response.json();
      setJobStatus(data);
      setError("");
    } catch (err) {
      setError(err?.message || "Failed to stop simulations.");
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
        }
        if (status?.status === "failed" || status?.status === "cancelled") {
          if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
          if (status?.status === "failed") {
            setError(status?.error || "Simulation failed.");
          }
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

  const isRunning =
    running ||
    (jobId && !["completed", "failed", "cancelled"].includes(jobStatus?.status));

  const statusProgress = jobStatus?.progress ?? 0;
  const statusPercent = Math.round(statusProgress * 100);
  const statusElapsed = jobStatus?.elapsed_ms ? `${Math.round(jobStatus.elapsed_ms / 1000)}s` : "--";
  const statusEta = jobStatus?.eta_ms ? `${Math.round(jobStatus.eta_ms / 1000)}s` : "--";
  const botCountDisplay = jobConfig?.bot_count ?? botCount;
  const processDisplay = jobConfig?.parallelism ?? parallelism;
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
            Processes
            <input
              type="number"
              min="1"
              max="64"
              value={parallelism}
              onChange={(event) => setParallelism(event.target.value)}
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
              <option value="mixed">Mixed (Greedy + Random)</option>
              <option value="greedy">Greedy</option>
              <option value="top3">Top 3</option>
              <option value="softmax5">Softmax 5</option>
              <option value="random">Random</option>
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
          <label className="text-sm text-gray-300 flex flex-col gap-2">
            Randomness (0-1)
            <input
              type="number"
              min="0"
              max="1"
              step="0.05"
              value={randomness}
              onChange={(event) => setRandomness(event.target.value)}
              className="px-3 py-2 rounded-md bg-gray-900 border border-gray-700 text-gray-100"
            />
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
          {isRunning && (
            <button
              type="button"
              onClick={handleStopRun}
              className="px-3 py-2 rounded-md border border-rose-500/70 text-rose-200 hover:border-rose-400 text-sm"
            >
              Stop
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
              <div>Processes: {processDisplay}</div>
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
      <BotSimulationResultsPanel autoLoadResultId={jobStatus?.stored_result_id} />
    </div>
  );
};

export default BotSimulationPage;
