import React, { useEffect, useMemo, useRef, useState } from "react";
import { Info } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../store";
import { buildApiUrl } from "../utils/connection";
import HoverPreviewPortal, { setHoverPreview } from "../components/hover/HoverPreviewPortal";
import BotSimulationResultsPanel from "../components/simulations/BotSimulationResultsPanel";

const DEFAULT_SETTINGS = {
  vpValue: 3.0,
  gameLength: 12,
};

const formatPercent = (value) => {
  if (!Number.isFinite(value)) return "--";
  return `${(value * 100).toFixed(1)}%`;
};

const formatSignedPercent = (value) => {
  if (!Number.isFinite(value)) return "--";
  const pct = value * 100;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
};

const formatSignedNumber = (value, digits = 2) => {
  if (!Number.isFinite(value)) return "--";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}`;
};

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeCost = (cost = {}) => ({
  R: toNumber(cost.R ?? cost.r ?? 0),
  B: toNumber(cost.B ?? cost.b ?? 0),
  G: toNumber(cost.G ?? cost.g ?? 0),
});

const getResourceSum = (cost) => (cost.R || 0) + (cost.B || 0) + (cost.G || 0);

const getFlexibilityScore = (cost) => {
  let colors = 0;
  if (cost.R > 0) colors += 1;
  if (cost.B > 0) colors += 1;
  if (cost.G > 0) colors += 1;
  return 1 - 0.1 * Math.max(0, colors - 1);
};

const parseWeaponOutput = (tags = []) => {
  const list = Array.isArray(tags) ? tags : [];
  let output = 0;
  list.forEach((tag) => {
    const match = String(tag).match(/cost_reduction:([RGB])?(\d+)/);
    if (match) output = Math.max(output, parseInt(match[2], 10));
    const dayMatch = String(tag).match(/cost_reduction:([RGB])?(\d+):day/);
    const nightMatch = String(tag).match(/cost_reduction:([RGB])?(\d+):night/);
    if (dayMatch && nightMatch) {
      output = (parseInt(dayMatch[2], 10) + parseInt(nightMatch[2], 10)) / 2;
    }
  });
  return output;
};

const parseProduction = (tags = []) => {
  const list = Array.isArray(tags) ? tags : [];
  let prod = 0;
  list.forEach((tag) => {
    const match = String(tag).match(/production:([RGB]|stance|lowest)?(\d+)/);
    if (match) prod += parseInt(match[2], 10);
    const dayMatch = String(tag).match(/production:([RGB])?(\d+):day/);
    const nightMatch = String(tag).match(/production:([RGB])?(\d+):night/);
    if (dayMatch) prod += parseInt(dayMatch[2], 10) * 0.5;
    if (nightMatch) prod += parseInt(nightMatch[2], 10) * 0.5;
  });
  return prod;
};

const clampValue = (value, min, max) => Math.min(max, Math.max(min, value));

const medianValue = (values) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
};

const InfoAnchor = ({ description, onShow, onHide }) => (
  <span className="inline-flex">
    <button
      type="button"
      aria-label="Info"
      className="text-slate-500 hover:text-slate-200 focus:outline-none"
      onMouseEnter={(event) => onShow?.(event, description)}
      onMouseLeave={onHide}
      onFocus={(event) => onShow?.(event, description)}
      onBlur={onHide}
    >
      <Info size={12} />
    </button>
  </span>
);

const InfoLabel = ({ label, description, onShow, onHide }) => (
  <span className="inline-flex items-center gap-1">
    <span>{label}</span>
    <InfoAnchor description={description} onShow={onShow} onHide={onHide} />
  </span>
);

const LoadingIndicator = ({ label }) => (
  <span className="inline-flex items-center gap-2 text-xs text-gray-400">
    <span className="h-3 w-3 animate-spin rounded-full border-2 border-gray-400 border-t-transparent" />
    <span>{label}</span>
  </span>
);

const buildBuyTurnBins = (histogram, maxBins = 10) => {
  if (!histogram) return [];
  const entries = Object.entries(histogram)
    .map(([key, value]) => ({
      turn: Number(key),
      count: Number(value) || 0,
    }))
    .filter((entry) => Number.isFinite(entry.turn) && entry.turn > 0 && entry.count > 0)
    .sort((a, b) => a.turn - b.turn);
  if (!entries.length) return [];
  const maxTurn = entries[entries.length - 1].turn;
  const binCount = Math.min(maxBins, Math.max(1, maxTurn));
  const binSize = Math.ceil(maxTurn / binCount);
  const bins = Array.from({ length: binCount }, (_, idx) => {
    const start = idx * binSize + 1;
    const end = Math.min(maxTurn, (idx + 1) * binSize);
    let count = 0;
    entries.forEach((entry) => {
      if (entry.turn >= start && entry.turn <= end) {
        count += entry.count;
      }
    });
    return {
      label: start === end ? `${start}` : `${start}-${end}`,
      count,
    };
  });
  return bins;
};

const computeAbsoluteAvgTurn = (dayHistogram, nightHistogram) => {
  let total = 0;
  let count = 0;
  Object.entries(dayHistogram || {}).forEach(([key, value]) => {
    const turn = Number(key);
    const amount = Number(value) || 0;
    if (Number.isFinite(turn) && amount > 0) {
      total += turn * amount;
      count += amount;
    }
  });
  Object.entries(nightHistogram || {}).forEach(([key, value]) => {
    const turn = Number(key);
    const amount = Number(value) || 0;
    if (Number.isFinite(turn) && amount > 0) {
      total += (turn + 6) * amount;
      count += amount;
    }
  });
  return count ? total / count : null;
};

const computeAvgTurn = (histogram, offset = 0) => {
  let total = 0;
  let count = 0;
  Object.entries(histogram || {}).forEach(([key, value]) => {
    const turn = Number(key);
    const amount = Number(value) || 0;
    if (Number.isFinite(turn) && amount > 0) {
      total += (turn + offset) * amount;
      count += amount;
    }
  });
  return count ? total / count : null;
};

const buildTagDescription = (tag, row) => {
  const ctx = row.tagContext || {};
  const pickRateText = formatPercent(row.pickRate);
  const medianText = formatPercent(ctx.pickRateMedian);
  const wraText = formatSignedPercent(row.winRateAdded);
  const wraAbsText = formatPercent(Math.abs(row.winRateAdded || 0));
  const wraStrongText = formatPercent(ctx.wraStrong);
  const wraWeakText = formatPercent(ctx.wraWeak);
  const tempoShare = Math.round((ctx.tempoShare || 0) * 100);
  const dayShareText = formatPercent(row.dayShare);
  const nightShareText = formatPercent(row.nightShare);
  const totalBuys = (row.dayBuys || 0) + (row.nightBuys || 0);
  const avgAcquireTurnText =
    row.avgAcquireTurn !== null && Number.isFinite(row.avgAcquireTurn)
      ? row.avgAcquireTurn.toFixed(1)
      : "--";
  const avgDayTurnText =
    row.avgDayTurn !== null && Number.isFinite(row.avgDayTurn) ? row.avgDayTurn.toFixed(1) : "--";
  const avgNightTurnText =
    row.avgNightTurn !== null && Number.isFinite(row.avgNightTurn) ? row.avgNightTurn.toFixed(1) : "--";
  const buySampleText = totalBuys ? `n=${totalBuys} buys` : "n=0 buys";
  const earlyTurnText = Number.isFinite(ctx.earlyTurn) ? ctx.earlyTurn.toFixed(1) : "--";
  const lateTurnText = Number.isFinite(ctx.lateTurn) ? ctx.lateTurn.toFixed(1) : "--";
  const deltaCtx = row.deltaVPContext || {};
  const deltaStrongText = Number.isFinite(deltaCtx.deltaStrong) ? deltaCtx.deltaStrong.toFixed(2) : "--";
  const deltaWeakText = Number.isFinite(deltaCtx.deltaWeak) ? deltaCtx.deltaWeak.toFixed(2) : "--";
  const deltaImpact = Number.isFinite(ctx.deltaImpact) ? ctx.deltaImpact : null;
  const deltaSamples = Number.isFinite(ctx.deltaSamples) ? ctx.deltaSamples : 0;
  const deltaNote =
    ctx.deltaUsed && deltaImpact !== null
      ? ` Delta VP ${formatSignedNumber(deltaImpact, 2)} (n=${deltaSamples}, strong=${deltaStrongText}).`
      : "";

  if (tag.startsWith("VP ")) {
    const pattern = tag.slice(3);
    switch (pattern) {
      case "Snowball":
        return `VP Pattern (Snowball): early delta >= ${deltaStrongText} and late delta <= ${deltaWeakText}.`;
      case "Finisher":
        return `VP Pattern (Finisher): early delta <= -${deltaWeakText} and late delta >= ${deltaStrongText}.`;
      case "Delta Trap":
        return `VP Pattern (Delta Trap): early delta <= -${deltaWeakText} and late delta <= -${deltaWeakText}.`;
      case "Panic Button":
        return `VP Pattern (Panic Button): early delta <= ${deltaWeakText} and late delta >= ${deltaWeakText}.`;
      case "Anchor":
        return `VP Pattern (Anchor): early delta <= -${deltaWeakText} with late delta near 0.`;
      default:
        return "VP pattern derived from early vs late delta VP thresholds.";
    }
  }

  switch (tag) {
    case "Overpowered":
      return `Overpowered: WRA ${wraText} >= ${wraStrongText} and pick rate ${pickRateText} >= median ${medianText}.${deltaNote}`;
    case "Sleeper":
      return `Sleeper: WRA ${wraText} >= ${wraStrongText} with pick rate ${pickRateText} below median ${medianText}.${deltaNote}`;
    case "Trap":
      return `Trap: WRA ${wraText} <= -${wraStrongText} with pick rate ${pickRateText} >= median ${medianText}.${deltaNote}`;
    case "Underpowered":
      return `Underpowered: WRA ${wraText} <= -${wraStrongText} and pick rate ${pickRateText} below median ${medianText}.${deltaNote}`;
    case "Utility":
      return `Utility: low-cost flexible tool with pick rate ${pickRateText} and WRA ${wraText}.`;
    case "Balanced":
      return `Balanced: |WRA| ${wraAbsText} <= ${wraWeakText}.${ctx.deltaUsed ? ` Delta VP within ±${deltaWeakText}.` : ""}`;
    case "Swingy":
      return `Swingy: |WRA| ${wraAbsText} between ${wraWeakText} and ${wraStrongText}.${deltaNote}`;
    case "Situational": {
      const situationalCutoff = ctx.pickRateMedian ? ctx.pickRateMedian * 0.6 : null;
      const situationalText = formatPercent(situationalCutoff);
      return `Situational: pick rate ${pickRateText} < ${situationalText} with |WRA| <= ${wraWeakText}.`;
    }
    case "Tempo":
      if (row.dayShare !== null) {
        return `Tempo: ${dayShareText} of buys in day (avg day turn ${avgDayTurnText}, avg turn ${avgAcquireTurnText}), threshold ${tempoShare}%. ${buySampleText}.`;
      }
      return `Tempo: avg acquire turn ${avgAcquireTurnText} (1-12) <= early threshold ${earlyTurnText}. ${buySampleText}.`;
    case "Finisher":
      if (row.nightShare !== null) {
        return `Finisher: ${nightShareText} of buys at night (avg night turn ${avgNightTurnText}, avg turn ${avgAcquireTurnText}), threshold ${tempoShare}%. ${buySampleText}.`;
      }
      return `Finisher: avg acquire turn ${avgAcquireTurnText} (1-12) >= late threshold ${lateTurnText}. ${buySampleText}.`;
    default:
      return "Classification derived from win rate added, pick rate, and acquisition timing.";
  }
};

const BalanceLabPage = () => {
  const token = useStore((state) => state.token);
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("simulate");

  const [settings, setSettings] = useState(DEFAULT_SETTINGS);

  const [deckLists, setDeckLists] = useState({
    threats: [],
    bosses: [],
    upgrades: [],
    weapons: [],
  });
  const [deckError, setDeckError] = useState("");

  const [threatDeck, setThreatDeck] = useState("default");
  const [bossDeck, setBossDeck] = useState("default");
  const [upgradeDeck, setUpgradeDeck] = useState("default");
  const [weaponDeck, setWeaponDeck] = useState("default");

  const [simulations, setSimulations] = useState("100");
  const [botCount, setBotCount] = useState("4");
  const [botDepth, setBotDepth] = useState("2");
  const [parallelism, setParallelism] = useState("32");
  const [personality, setPersonality] = useState("mixed");
  const [planningProfile, setPlanningProfile] = useState("full");
  const [randomness, setRandomness] = useState("0.15");
  const [seed, setSeed] = useState("");
  const [running, setRunning] = useState(false);
  const [jobId, setJobId] = useState(null);
  const [jobStatus, setJobStatus] = useState(null);
  const [runError, setRunError] = useState("");
  const pollRef = useRef(null);

  const [resultsLibrary, setResultsLibrary] = useState([]);
  const [libraryError, setLibraryError] = useState("");
  const [isResultsLibraryLoading, setIsResultsLibraryLoading] = useState(false);

  const [analysisDeckType, setAnalysisDeckType] = useState("weapons");
  const [analysisDeckName, setAnalysisDeckName] = useState("default");
  const [analysisDeckData, setAnalysisDeckData] = useState([]);
  const [analysisError, setAnalysisError] = useState("");

  const [simResult, setSimResult] = useState(null);
  const [simResultId, setSimResultId] = useState("");
  const [simResultSource, setSimResultSource] = useState("none");
  const [simUploadError, setSimUploadError] = useState("");
  const [isSimResultLoading, setIsSimResultLoading] = useState(false);
  const [hoveredPoint, setHoveredPoint] = useState(null);
  const [hoveredPointPos, setHoveredPointPos] = useState(null);
  const [deltaHoveredPoint, setDeltaHoveredPoint] = useState(null);
  const [deltaHoveredPointPos, setDeltaHoveredPointPos] = useState(null);
  const [infoPanel, setInfoPanel] = useState(null);
  const [synergyPanel, setSynergyPanel] = useState(null);
  const [deltaVPPanel, setDeltaVPPanel] = useState(null);
  const chartRef = useRef(null);
  const deltaChartRef = useRef(null);
  const tableRef = useRef(null);

  const fetchDeckList = async (endpoint) => {
    const response = await fetch(buildApiUrl(`/api/custom/${endpoint}`), {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!response.ok) {
      let detail = "Failed to load deck list.";
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

  const fetchDeckData = async (endpoint, name) => {
    const response = await fetch(buildApiUrl(`/api/custom/${endpoint}/${name}`), {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!response.ok) {
      let detail = "Failed to load deck.";
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

  const fetchResultsLibrary = async () => {
    const response = await fetch(buildApiUrl("/api/simulations/bots/results"), {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!response.ok) {
      let detail = "Failed to load saved results.";
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

  const refreshResultsLibrary = async () => {
    const data = await fetchResultsLibrary();
    setResultsLibrary(data?.results || []);
    setLibraryError("");
  };

  const fetchResultById = async (resultId) => {
    const response = await fetch(buildApiUrl(`/api/simulations/bots/results/${resultId}`), {
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
    let cancelled = false;
    Promise.all([
      fetchDeckList("threat-decks"),
      fetchDeckList("boss-decks"),
      fetchDeckList("upgrade-decks"),
      fetchDeckList("weapon-decks"),
    ])
      .then(([threats, bosses, upgrades, weapons]) => {
        if (cancelled) return;
        setDeckLists({
          threats: threats?.decks || [],
          bosses: bosses?.decks || [],
          upgrades: upgrades?.decks || [],
          weapons: weapons?.decks || [],
        });
        setDeckError("");
      })
      .catch((err) => {
        if (cancelled) return;
        setDeckError(err?.message || "Failed to load decks.");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    let cancelled = false;
    setIsResultsLibraryLoading(true);
    fetchResultsLibrary()
      .then((data) => {
        if (cancelled) return;
        setResultsLibrary(data?.results || []);
        setLibraryError("");
      })
      .catch((err) => {
        if (cancelled) return;
        setLibraryError(err?.message || "Failed to load saved results.");
      })
      .finally(() => {
        if (cancelled) return;
        setIsResultsLibraryLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    const list = analysisDeckType === "weapons" ? deckLists.weapons : deckLists.upgrades;
    if (!list.length) return;
    if (!list.some((entry) => entry.name === analysisDeckName)) {
      setAnalysisDeckName(list[0].name);
    }
  }, [analysisDeckType, deckLists, analysisDeckName]);

  useEffect(() => {
    let cancelled = false;
    if (!analysisDeckName) return () => {};
    const endpoint = analysisDeckType === "weapons" ? "weapon-decks" : "upgrade-decks";
    fetchDeckData(endpoint, analysisDeckName)
      .then((data) => {
        if (cancelled) return;
        const list = Array.isArray(data)
          ? data
          : analysisDeckType === "weapons"
            ? data?.weapons || []
            : data?.upgrades || [];
        setAnalysisDeckData(list);
        setAnalysisError("");
      })
      .catch((err) => {
        if (cancelled) return;
        setAnalysisError(err?.message || "Failed to load deck data.");
      });
    return () => {
      cancelled = true;
    };
  }, [analysisDeckType, analysisDeckName, token]);

  const handleRun = async (event) => {
    event.preventDefault();
    setRunning(true);
    setRunError("");
    setJobStatus(null);
    setJobId(null);
    const payload = {
      simulations: toNumber(simulations, 100),
      bot_count: toNumber(botCount, 4),
      bot_depth: toNumber(botDepth, 2),
      parallelism: toNumber(parallelism, 32),
      planning_profile: planningProfile,
      personality,
      randomness: toNumber(randomness, 0),
      threat_deck: threatDeck,
      boss_deck: bossDeck,
      upgrade_deck: upgradeDeck,
      weapon_deck: weaponDeck,
    };
    if (seed !== "") {
      payload.seed = toNumber(seed, 0);
    }
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
      setRunError(err?.message || "Failed to run simulations.");
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
      setRunError("");
    } catch (err) {
      setRunError(err?.message || "Failed to stop simulations.");
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
          try {
            const data = await fetchResultsLibrary();
            if (!cancelled) {
              setResultsLibrary(data?.results || []);
              setLibraryError("");
            }
          } catch (err) {
            if (!cancelled) {
              setLibraryError(err?.message || "Failed to refresh saved results.");
            }
          }
        }
        if (status?.status === "failed" || status?.status === "cancelled") {
          if (pollRef.current) {
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
          if (status?.status === "failed") {
            setRunError(status?.error || "Simulation failed.");
          }
        }
      } catch (err) {
        if (cancelled) return;
        setRunError(err?.message || "Failed to poll simulation status.");
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

  const handleSimUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setSimUploadError("");
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      setSimResult(parsed);
      setSimResultId(`upload:${file.name}:${Date.now()}`);
      setSimResultSource("upload");
    } catch (err) {
      setSimUploadError(err?.message || "Failed to parse simulation JSON.");
    } finally {
      event.target.value = "";
    }
  };

  const handleLoadStoredResult = async (resultId) => {
    if (!resultId) {
      setSimResult(null);
      setSimResultId("");
      setSimResultSource("none");
      return;
    }
    setIsSimResultLoading(true);
    try {
      const data = await fetchResultById(resultId);
      setSimResult(data);
      setSimResultId(resultId);
      setSimResultSource("stored");
      setSimUploadError("");
    } catch (err) {
      setSimUploadError(err?.message || "Failed to load stored result.");
    } finally {
      setIsSimResultLoading(false);
    }
  };

  const handleDeleteStoredResult = async () => {
    if (!simResultId || simResultSource !== "stored") return;
    if (!window.confirm(`Delete stored simulation ${simResultId}?`)) return;
    try {
      const response = await fetch(
        buildApiUrl(`/api/simulations/bots/results/${simResultId}`),
        {
          method: "DELETE",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        }
      );
      if (!response.ok) {
        let detail = "Failed to delete the stored result.";
        try {
          const err = await response.json();
          detail = err?.detail || err?.message || detail;
        } catch (parseError) {
          detail = response.statusText || detail;
        }
        throw new Error(detail);
      }
      setSimResult(null);
      setSimResultId("");
      setSimResultSource("none");
      await refreshResultsLibrary();
    } catch (err) {
      setLibraryError(err?.message || "Failed to delete the stored result.");
    }
  };

  const simCardStats = useMemo(() => {
    if (!simResult) return new Map();
    if (simResult.card_balance_data && typeof simResult.card_balance_data === "object") {
      return new Map(Object.entries(simResult.card_balance_data));
    }

    const stats = new Map();
    const ensure = (name, kind) => {
      if (!name) return null;
      if (!stats.has(name)) {
        stats.set(name, {
          name,
          kind,
          times_offered: 0,
          times_bought: 0,
          buy_turn_histogram: {},
          buy_turn_histogram_day: {},
          buy_turn_histogram_night: {},
          buy_turns_total: 0,
          buy_turns_samples: 0,
          wins_with_card: 0,
          games_with_card: 0,
        });
      }
      const entry = stats.get(name);
      if (kind && !entry.kind) entry.kind = kind;
      return entry;
    };

    (simResult.runs || []).forEach((run) => {
      (run.actions || []).forEach((action) => {
        if (action.type === "buy_weapon" || action.type === "buy_upgrade") {
          const round = Number(action.round) || 0;
          const eraKey = String(action.era || "day").toLowerCase() === "night" ? "night" : "day";
          (action.cards || []).forEach((card) => {
            const entry = ensure(card?.name, card?.kind);
            if (entry) {
              entry.times_bought += 1;
              entry.buy_turn_histogram[round] = (entry.buy_turn_histogram[round] || 0) + 1;
              if (eraKey === "night") {
                entry.buy_turn_histogram_night[round] =
                  (entry.buy_turn_histogram_night[round] || 0) + 1;
              } else {
                entry.buy_turn_histogram_day[round] =
                  (entry.buy_turn_histogram_day[round] || 0) + 1;
              }
              entry.buy_turns_total += round;
              entry.buy_turns_samples += 1;
            }
          });
        }
      });
      const winnerId = run.winner_id;
      (run.final_stats || []).forEach((player) => {
        const owned = new Set();
        (player.upgrades || []).forEach((name) => {
          if (name) owned.add([String(name), "upgrade"].join("|"));
        });
        (player.weapons || []).forEach((weapon) => {
          const name = weapon?.name || weapon?.id || weapon;
          if (name) owned.add([String(name), "weapon"].join("|"));
        });
        owned.forEach((key) => {
          const [name, kind] = key.split("|");
          const entry = ensure(name, kind);
          if (entry) {
            entry.games_with_card += 1;
            if (winnerId && player.user_id === winnerId) {
              entry.wins_with_card += 1;
            }
          }
        });
      });
    });

    const baseline = simResult.bot_count ? 1 / simResult.bot_count : 0;
    stats.forEach((entry) => {
      if (entry.games_with_card > 0) {
        entry.win_rate_when_owned = entry.wins_with_card / entry.games_with_card;
      } else {
        entry.win_rate_when_owned = 0;
      }
      entry.win_rate_added = entry.win_rate_when_owned - baseline;
      entry.win_rate_added_weighted = entry.win_rate_added;
    });
    return stats;
  }, [simResult]);

  const simEraStats = useMemo(() => {
    if (!simResult?.runs?.length) return new Map();
    const baseline = simResult.bot_count ? 1 / simResult.bot_count : 0;
    const stats = new Map();
    const ensure = (name) => {
      if (!stats.has(name)) {
        stats.set(name, {
          day: { buyers: 0, wins: 0, winRate: null, wra: null },
          night: { buyers: 0, wins: 0, winRate: null, wra: null },
        });
      }
      return stats.get(name);
    };

    simResult.runs.forEach((run) => {
      const winnerId = run.winner_id;
      const seen = new Set();
      (run.actions || []).forEach((action) => {
        if (action.type !== "buy_weapon" && action.type !== "buy_upgrade") return;
        const eraKey = String(action.era || "day").toLowerCase() === "night" ? "night" : "day";
        const cards = (action.cards || []).map((card) => card?.name).filter(Boolean);
        const fallbackName = action?.payload?.card_name;
        if (!cards.length && fallbackName) cards.push(fallbackName);
        cards.forEach((name) => {
          if (!name || !action.player_id) return;
          const key = `${action.player_id}|${name}|${eraKey}`;
          if (seen.has(key)) return;
          seen.add(key);
          const entry = ensure(name);
          entry[eraKey].buyers += 1;
          if (winnerId && action.player_id === winnerId) {
            entry[eraKey].wins += 1;
          }
        });
      });
    });

    stats.forEach((entry) => {
      ["day", "night"].forEach((eraKey) => {
        const eraEntry = entry[eraKey];
        if (eraEntry.buyers > 0) {
          eraEntry.winRate = eraEntry.wins / eraEntry.buyers;
          eraEntry.wra = eraEntry.winRate - baseline;
        }
      });
    });
    return stats;
  }, [simResult]);

  const simSynergyStats = useMemo(() => {
    if (!simResult?.runs?.length) return new Map();
    const stats = new Map();
    const ensure = (name) => {
      if (!stats.has(name)) {
        stats.set(name, new Map());
      }
      return stats.get(name);
    };

    simResult.runs.forEach((run) => {
      const winnerId = run.winner_id;
      (run.final_stats || []).forEach((player) => {
        const owned = new Set();
        (player.upgrades || []).forEach((name) => {
          if (name) owned.add(String(name));
        });
        (player.weapons || []).forEach((weapon) => {
          const name = weapon?.name || weapon?.id || weapon;
          if (name) owned.add(String(name));
        });
        const cards = Array.from(owned);
        if (!cards.length) return;
        cards.forEach((cardName) => {
          const map = ensure(cardName);
          cards.forEach((partner) => {
            if (partner === cardName) return;
            const entry = map.get(partner) || { games: 0, wins: 0 };
            entry.games += 1;
            if (winnerId && (player.user_id === winnerId || player.id === winnerId)) {
              entry.wins += 1;
            }
            map.set(partner, entry);
          });
        });
      });
    });
    return stats;
  }, [simResult]);

  const analysisRows = useMemo(() => {
    const baseline = simResult?.bot_count ? 1 / simResult.bot_count : 0;
    const rows = (analysisDeckData || []).map((card) => {
      const cost = normalizeCost(card.cost || {});
      const name = card.name || card.id || "Unknown";
      const manualBonus = toNumber(card.manualBonus, 0);
      let mathScore = 0;
      let details = {};

      if (analysisDeckType === "weapons") {
        const uses = toNumber(card.uses, 0);
        const output = parseWeaponOutput(card.tags || []);
        const flex = getFlexibilityScore(cost);
        const rawValue = output * uses + manualBonus;
        const costSum = getResourceSum(cost);
        const efficiency = costSum > 0 ? (rawValue * flex) / costSum : 0;
        mathScore = efficiency;
        details = { uses, output, flex, efficiency, costSum };
      } else {
        const prod = parseProduction(card.tags || []);
        const costSum = getResourceSum(cost);
        const vpVal = toNumber(card.vp, 0) * settings.vpValue;
        const payback = prod > 0 ? costSum / prod : 99;
        const lifetime = prod * settings.gameLength + vpVal + manualBonus - costSum;
        mathScore = lifetime;
        details = { prod, costSum, payback, lifetime, vpVal };
      }

      const simEntry = simCardStats.get(name);
      const timesOffered = toNumber(simEntry?.times_offered, 0);
      const timesBought = toNumber(simEntry?.times_bought, 0);
      const winsWithCard = toNumber(simEntry?.wins_with_card, 0);
      const gamesWithCard = toNumber(simEntry?.games_with_card, 0);
      const winRateOwned = Number.isFinite(simEntry?.win_rate_when_owned)
        ? simEntry.win_rate_when_owned
        : gamesWithCard
          ? winsWithCard / gamesWithCard
          : baseline;
      const winRateAdded = Number.isFinite(simEntry?.win_rate_added)
        ? simEntry.win_rate_added
        : winRateOwned - baseline;
      const winRateAddedWeighted = Number.isFinite(simEntry?.win_rate_added_weighted)
        ? simEntry.win_rate_added_weighted
        : winRateAdded;
      const avgBuyTurn = simEntry?.buy_turns_samples
        ? toNumber(simEntry.buy_turns_total, 0) / toNumber(simEntry.buy_turns_samples, 1)
        : null;
      const buyTurnHistogram = simEntry?.buy_turn_histogram || null;
      const buyTurnHistogramDay = simEntry?.buy_turn_histogram_day || null;
      const buyTurnHistogramNight = simEntry?.buy_turn_histogram_night || null;
      const buyTurnBins = buildBuyTurnBins(buyTurnHistogram, 10);
      const buyTurnDayBins = buildBuyTurnBins(buyTurnHistogramDay, 7);
      const buyTurnNightBins = buildBuyTurnBins(buyTurnHistogramNight, 7);
      const buyTurnMax = buyTurnBins.reduce((maxVal, bin) => Math.max(maxVal, bin.count), 0);
      const buyTurnDayMax = buyTurnDayBins.reduce((maxVal, bin) => Math.max(maxVal, bin.count), 0);
      const buyTurnNightMax = buyTurnNightBins.reduce((maxVal, bin) => Math.max(maxVal, bin.count), 0);
      const dayBuys = buyTurnHistogramDay
        ? Object.values(buyTurnHistogramDay).reduce((sum, val) => sum + (Number(val) || 0), 0)
        : 0;
      const nightBuys = buyTurnHistogramNight
        ? Object.values(buyTurnHistogramNight).reduce((sum, val) => sum + (Number(val) || 0), 0)
        : 0;
      const totalEraBuys = dayBuys + nightBuys;
      const dayShare = totalEraBuys ? dayBuys / totalEraBuys : null;
      const nightShare = totalEraBuys ? nightBuys / totalEraBuys : null;
      const avgDayTurn = computeAvgTurn(buyTurnHistogramDay, 0);
      const avgNightTurn = computeAvgTurn(buyTurnHistogramNight, 6);
      const eraStats = simEraStats.get(name);
      const eraDayWra = Number.isFinite(eraStats?.day?.wra) ? eraStats.day.wra : null;
      const eraNightWra = Number.isFinite(eraStats?.night?.wra) ? eraStats.night.wra : null;
      const eraDayBuyers = eraStats?.day?.buyers || 0;
      const eraNightBuyers = eraStats?.night?.buyers || 0;
      const pickRate = timesOffered ? timesBought / timesOffered : null;
      const activationEfficiency = timesBought
        ? (analysisDeckType === "weapons"
            ? toNumber(simEntry?.times_used, 0)
            : toNumber(simEntry?.times_activated, 0)) / timesBought
        : null;
      const deltaVPTotal = toNumber(simEntry?.delta_vp_total, 0);
      const deltaVPSamples = toNumber(simEntry?.delta_vp_samples, 0);
      const deltaVPAvg = deltaVPSamples ? deltaVPTotal / deltaVPSamples : null;
      const deltaVPNormTotal = toNumber(simEntry?.delta_vp_norm_total, 0);
      const deltaVPNormSamples = toNumber(simEntry?.delta_vp_norm_samples, 0);
      const deltaVPNormAvg = deltaVPNormSamples ? deltaVPNormTotal / deltaVPNormSamples : null;
      const deltaVPEarlyTotal = toNumber(simEntry?.delta_vp_early_total, 0);
      const deltaVPEarlySamples = toNumber(simEntry?.delta_vp_early_samples, 0);
      const deltaVPEarlyAvg = deltaVPEarlySamples ? deltaVPEarlyTotal / deltaVPEarlySamples : null;
      const deltaVPMidTotal = toNumber(simEntry?.delta_vp_mid_total, 0);
      const deltaVPMidSamples = toNumber(simEntry?.delta_vp_mid_samples, 0);
      const deltaVPMidAvg = deltaVPMidSamples ? deltaVPMidTotal / deltaVPMidSamples : null;
      const deltaVPLateTotal = toNumber(simEntry?.delta_vp_late_total, 0);
      const deltaVPLateSamples = toNumber(simEntry?.delta_vp_late_samples, 0);
      const deltaVPLateAvg = deltaVPLateSamples ? deltaVPLateTotal / deltaVPLateSamples : null;
      const avgAcquireTurn =
        computeAbsoluteAvgTurn(buyTurnHistogramDay, buyTurnHistogramNight) ?? avgBuyTurn;
      const deltaVPPowerScore =
        Number.isFinite(deltaVPEarlyAvg) &&
        Number.isFinite(deltaVPMidAvg) &&
        Number.isFinite(deltaVPLateAvg)
          ? deltaVPEarlyAvg * 1.2 + deltaVPMidAvg * 1.0 + deltaVPLateAvg * 0.8
          : null;

      const realizedPower =
        simResult && Number.isFinite(winRateAdded) ? mathScore * (1 + winRateAdded) : null;

      let synergyTop = null;
      let antiSynergyTop = null;
      let synergyEntries = [];
      let antiSynergyEntries = [];
      if (simResult) {
        const synergyMap = simSynergyStats.get(name);
        if (synergyMap) {
          const minSamples = 3;
          synergyMap.forEach((value, partner) => {
            if (!value || value.games < minSamples) return;
            const winRate = value.games > 0 ? value.wins / value.games : 0;
            const base = Number.isFinite(winRateOwned) ? winRateOwned : baseline;
            const delta = winRate - base;
            const entry = {
              partner,
              delta,
              games: value.games,
              winRate,
            };
            if (delta > 0) {
              synergyEntries.push(entry);
            } else if (delta < 0) {
              antiSynergyEntries.push(entry);
            }
          });
          synergyEntries.sort((a, b) => b.delta - a.delta);
          antiSynergyEntries.sort((a, b) => a.delta - b.delta);
          synergyTop = synergyEntries[0] || null;
          antiSynergyTop = antiSynergyEntries[0] || null;
        }
      }

      const trap =
        simResult && analysisDeckType === "weapons"
          ? mathScore >= 1.5 && winRateAdded < 0
          : simResult
            ? mathScore > 0 && winRateAdded < 0
            : false;

      return {
        name,
        cost,
        mathScore,
        details,
        rawCard: card,
        timesOffered,
        timesBought,
        winRateOwned,
        winRateAdded,
        winRateAddedWeighted,
        avgBuyTurn,
        buyTurnBins,
        buyTurnMax,
        buyTurnDayBins,
        buyTurnNightBins,
        buyTurnDayMax,
        buyTurnNightMax,
        dayBuys,
        nightBuys,
        dayShare,
        nightShare,
        avgDayTurn,
        avgNightTurn,
        eraDayWra,
        eraNightWra,
        eraDayBuyers,
        eraNightBuyers,
        pickRate,
        activationEfficiency,
        deltaVPAvg,
        deltaVPSamples,
        deltaVPNormAvg,
        deltaVPEarlyAvg,
        deltaVPMidAvg,
        deltaVPLateAvg,
        deltaVPEarlySamples,
        deltaVPMidSamples,
        deltaVPLateSamples,
        deltaVPPowerScore,
        avgAcquireTurn,
        realizedPower,
        synergyTop,
        antiSynergyTop,
        synergyEntries,
        antiSynergyEntries,
        trap,
      };
    });

    const mathRanked = [...rows].sort((a, b) => b.mathScore - a.mathScore);
    mathRanked.forEach((row, idx) => {
      row.mathRank = idx + 1;
    });
    if (simResult) {
      const simRanked = [...rows].sort((a, b) => b.winRateAdded - a.winRateAdded);
      simRanked.forEach((row, idx) => {
        row.simRank = idx + 1;
      });
      rows.forEach((row) => {
        if (row.simRank && row.mathRank) {
          row.rankDelta = row.simRank - row.mathRank;
        }
      });
    }

    if (simResult) {
      const pickRates = rows.map((row) => row.pickRate).filter((value) => value !== null);
      const pickRateMedian = medianValue(pickRates);
      const wraStrong = 0.05;
      const wraWeak = 0.02;
      const wraSevere = wraStrong * 1.6;
      const earlyTurn = Math.max(3, settings.gameLength * 0.35);
      const lateTurn = Math.max(6, settings.gameLength * 0.7);
      const tempoShare = 0.6;
      const mathScores = rows.map((row) => row.mathScore).filter((value) => Number.isFinite(value));
      const mathMedian = medianValue(mathScores);
      const deltaAbs = rows
        .map((row) => (Number.isFinite(row.deltaVPAvg) ? Math.abs(row.deltaVPAvg) : null))
        .filter((value) => value !== null);
      const deltaMedianAbs = medianValue(deltaAbs);
      const deltaStrong = Math.max(1, deltaMedianAbs || 0);
      const deltaWeak = Math.max(0.5, deltaStrong * 0.5);
      const minDeltaSamples = 5;

      rows.forEach((row) => {
        const early = row.deltaVPEarlyAvg;
        const late = row.deltaVPLateAvg;
        if (!Number.isFinite(early) || !Number.isFinite(late)) {
          row.deltaVPDiagnosis = null;
          row.deltaVPContext = { deltaStrong, deltaWeak };
          return;
        }
        let diagnosis = null;
        if (early >= deltaStrong && late <= deltaWeak) {
          diagnosis = "Snowball";
        } else if (early <= -deltaWeak && late >= deltaStrong) {
          diagnosis = "Finisher";
        } else if (early <= -deltaWeak && late <= -deltaWeak) {
          diagnosis = "Delta Trap";
        } else if (early <= deltaWeak && late >= deltaWeak) {
          diagnosis = "Panic Button";
        } else if (early <= -deltaWeak && Math.abs(late) <= deltaWeak) {
          diagnosis = "Anchor";
        }
        row.deltaVPDiagnosis = diagnosis;
        row.deltaVPContext = { deltaStrong, deltaWeak };
      });

      rows.forEach((row) => {
        const tags = [];
        const pickRate = row.pickRate ?? 0;
        const costSum = row.details?.costSum ?? getResourceSum(row.cost || {});
        const flex = row.details?.flex ?? 0;
        const output = row.details?.output ?? 0;
        const isUtility =
          analysisDeckType === "weapons" && costSum <= 2 && flex >= 0.9 && output <= 3;
        const wraValue = Number.isFinite(row.winRateAdded) ? row.winRateAdded : 0;
        const deltaSamples = Number.isFinite(row.deltaVPSamples)
          ? row.deltaVPSamples
          : (row.deltaVPEarlySamples || 0) + (row.deltaVPMidSamples || 0) + (row.deltaVPLateSamples || 0);
        const deltaImpact = Number.isFinite(row.deltaVPAvg) ? row.deltaVPAvg : null;
        const deltaUsed = deltaImpact !== null && deltaSamples >= minDeltaSamples;
        const deltaPositive = deltaUsed && deltaImpact >= deltaStrong;
        const deltaNegative = deltaUsed && deltaImpact <= -deltaStrong;
        const deltaNeutral = deltaUsed && Math.abs(deltaImpact) <= deltaWeak;
        const positiveSignal = wraValue >= wraStrong || (deltaPositive && wraValue > -wraWeak);
        const negativeSignal = wraValue <= -wraStrong || (deltaNegative && wraValue < wraWeak);

        if (positiveSignal) {
          tags.push(pickRate >= pickRateMedian ? "Overpowered" : "Sleeper");
        } else if (negativeSignal) {
          if (pickRate >= pickRateMedian) {
            tags.push("Trap");
          } else if (isUtility && wraValue > -wraSevere) {
            tags.push("Utility");
          } else {
            tags.push("Underpowered");
          }
        } else if (Math.abs(wraValue) <= wraWeak && (!deltaUsed || deltaNeutral)) {
          tags.push("Balanced");
        } else {
          tags.push("Swingy");
        }
        if (pickRate < pickRateMedian * 0.6 && Math.abs(wraValue) <= wraWeak) {
          tags.push("Situational");
        }
        if (row.dayShare !== null && row.nightShare !== null) {
          if (row.dayShare >= tempoShare) tags.push("Tempo");
          if (row.nightShare >= tempoShare) tags.push("Finisher");
        } else if (row.avgAcquireTurn !== null) {
          if (row.avgAcquireTurn <= earlyTurn) tags.push("Tempo");
          if (row.avgAcquireTurn >= lateTurn) tags.push("Finisher");
        }
        if (isUtility && !tags.includes("Utility")) tags.push("Utility");
        if (row.deltaVPDiagnosis) tags.push(`VP ${row.deltaVPDiagnosis}`);
        row.tags = tags;
        row.trap = tags.includes("Trap");
        row.tagContext = {
          pickRate,
          pickRateMedian,
          wraStrong,
          wraWeak,
          wraSevere,
          mathMedian,
          earlyTurn,
          lateTurn,
          tempoShare,
          deltaStrong,
          deltaWeak,
          deltaImpact,
          deltaSamples,
          deltaUsed,
          deltaNeutral,
          totalBuys: (row.dayBuys || 0) + (row.nightBuys || 0),
        };
      });
    }

    return rows;
  }, [analysisDeckData, analysisDeckType, settings, simCardStats, simEraStats, simSynergyStats, simResult]);

  const scatterData = useMemo(() => {
    const points = analysisRows.filter((row) => Number.isFinite(row.winRateAdded));
    if (!points.length) {
      return { points: [], minX: 0, maxX: 1, maxAbsY: 0.05 };
    }
    const values = points.map((row) => row.mathScore);
    const minX = Math.min(...values);
    const maxX = Math.max(...values);
    const maxAbsY = Math.max(...points.map((row) => Math.abs(row.winRateAdded)), 0.05);
    return { points, minX, maxX, maxAbsY };
  }, [analysisRows]);

  const deltaVPScatter = useMemo(() => {
    const points = analysisRows.filter(
      (row) => Number.isFinite(row.deltaVPAvg) && Number.isFinite(row.avgAcquireTurn)
    );
    if (!points.length) {
      return { points: [], minX: 0, maxX: 12, maxAbsY: 1 };
    }
    const turns = points.map((row) => row.avgAcquireTurn);
    const minX = Math.min(...turns);
    const maxX = Math.max(...turns);
    const maxAbsY = Math.max(...points.map((row) => Math.abs(row.deltaVPAvg)), 1);
    return { points, minX, maxX, maxAbsY };
  }, [analysisRows]);

  const chartWidth = 720;
  const chartHeight = 320;
  const chartPadding = { top: 24, right: 24, bottom: 40, left: 56 };
  const plotWidth = chartWidth - chartPadding.left - chartPadding.right;
  const plotHeight = chartHeight - chartPadding.top - chartPadding.bottom;
  const xScale = (value) => {
    if (scatterData.maxX === scatterData.minX) {
      return chartPadding.left + plotWidth / 2;
    }
    const ratio = (value - scatterData.minX) / (scatterData.maxX - scatterData.minX);
    return chartPadding.left + clampValue(ratio, 0, 1) * plotWidth;
  };
  const yScale = (value) => {
    const range = scatterData.maxAbsY || 0.05;
    const clamped = clampValue(value, -range, range);
    return chartPadding.top + ((range - clamped) / (range * 2)) * plotHeight;
  };
  const deltaXScale = (value) => {
    if (deltaVPScatter.maxX === deltaVPScatter.minX) {
      return chartPadding.left + plotWidth / 2;
    }
    const ratio = (value - deltaVPScatter.minX) / (deltaVPScatter.maxX - deltaVPScatter.minX);
    return chartPadding.left + clampValue(ratio, 0, 1) * plotWidth;
  };
  const deltaYScale = (value) => {
    const range = deltaVPScatter.maxAbsY || 1;
    const clamped = clampValue(value, -range, range);
    return chartPadding.top + ((range - clamped) / (range * 2)) * plotHeight;
  };

  const analysisDeckOptions =
    analysisDeckType === "weapons" ? deckLists.weapons : deckLists.upgrades;

  const isRunning =
    running ||
    (jobId && !["completed", "failed", "cancelled"].includes(jobStatus?.status));
  const statusProgress = jobStatus?.progress ?? 0;
  const statusPercent = Math.round(statusProgress * 100);
  const previewCard = (row, lock = false) => {
    if (!row) return;
    const raw = row.rawCard || {};
    const card = {
      id: raw.id || row.name,
      name: row.name,
      type: analysisDeckType === "weapons" ? "Weapon" : "Upgrade",
      cost: raw.cost || row.cost,
      vp: raw.vp,
      uses: analysisDeckType === "weapons" ? raw.uses : undefined,
      effect: raw.effect,
      tags: raw.tags,
    };
    setHoverPreview({
      type: "market",
      data: card,
      sourceId: card.id || card.name,
      lock,
    });
  };
  const updateHoveredPoint = (event, row) => {
    const container = chartRef.current;
    if (!container) {
      setHoveredPoint(row);
      return;
    }
    const rect = container.getBoundingClientRect();
    setHoveredPoint(row);
    setHoveredPointPos({
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      width: rect.width,
      height: rect.height,
    });
  };
  const clearHoveredPoint = () => {
    setHoveredPoint(null);
    setHoveredPointPos(null);
  };
  const updateDeltaHoveredPoint = (event, row) => {
    const container = deltaChartRef.current;
    if (!container) {
      setDeltaHoveredPoint(row);
      return;
    }
    const rect = container.getBoundingClientRect();
    setDeltaHoveredPoint(row);
    setDeltaHoveredPointPos({
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      width: rect.width,
      height: rect.height,
    });
  };
  const clearDeltaHoveredPoint = () => {
    setDeltaHoveredPoint(null);
    setDeltaHoveredPointPos(null);
  };
  const openSynergyPanel = (row) => {
    if (!simResult || !row) return;
    const entries = row.synergyEntries || [];
    const antiEntries = row.antiSynergyEntries || [];
    if (!entries.length && !antiEntries.length) return;
    setInfoPanel(null);
    setSynergyPanel({
      name: row.name,
      baseWinRate: row.winRateOwned,
      winRateAdded: row.winRateAdded,
      entries,
      antiEntries,
    });
  };
  const closeSynergyPanel = () => setSynergyPanel(null);
  const openDeltaVPPanel = (row) => {
    if (!simResult || !row) return;
    if (row.deltaVPAvg === null && row.deltaVPNormAvg === null) return;
    setInfoPanel(null);
    setDeltaVPPanel({
      name: row.name,
      avg: row.deltaVPAvg,
      normAvg: row.deltaVPNormAvg,
      powerScore: row.deltaVPPowerScore,
      avgTurn: row.avgAcquireTurn,
      earlyAvg: row.deltaVPEarlyAvg,
      midAvg: row.deltaVPMidAvg,
      lateAvg: row.deltaVPLateAvg,
      earlyCount: row.deltaVPEarlySamples,
      midCount: row.deltaVPMidSamples,
      lateCount: row.deltaVPLateSamples,
      diagnosis: row.deltaVPDiagnosis,
    });
  };
  const closeDeltaVPPanel = () => setDeltaVPPanel(null);
  const showInfoPanel = (event, description) => {
    if (!description) return;
    const anchorRect = event.currentTarget.getBoundingClientRect();
    const tableRect = tableRef.current?.getBoundingClientRect();
    const limitRect =
      tableRef.current && tableRef.current.contains(event.currentTarget) && tableRect
        ? tableRect
        : {
            left: 0,
            right: window.innerWidth,
            top: 0,
            bottom: window.innerHeight,
          };
    setInfoPanel({ description, anchorRect, limitRect });
  };
  const hideInfoPanel = () => setInfoPanel(null);
  const infoHandlers = { onShow: showInfoPanel, onHide: hideInfoPanel };
  const infoPanelStyle = useMemo(() => {
    if (!infoPanel) return null;
    const panelWidth = 260;
    const panelHeight = 140;
    const offset = 8;
    const { anchorRect, limitRect } = infoPanel;
    let left = anchorRect.left;
    if (anchorRect.left + panelWidth > limitRect.right) {
      left = anchorRect.right - panelWidth;
    }
    left = clampValue(left, limitRect.left + 8, limitRect.right - panelWidth - 8);
    let top = anchorRect.bottom + offset;
    if (top + panelHeight > limitRect.bottom) {
      top = anchorRect.top - panelHeight - offset;
    }
    top = clampValue(top, limitRect.top + 8, limitRect.bottom - panelHeight - 8);
    return { left, top, width: panelWidth };
  }, [infoPanel]);
  const tagStyles = {
    Overpowered: "bg-orange-500/20 text-orange-200 border-orange-500/40",
    Sleeper: "bg-emerald-500/20 text-emerald-200 border-emerald-500/40",
    Trap: "bg-yellow-500/20 text-yellow-200 border-yellow-500/40",
    Underpowered: "bg-slate-500/20 text-slate-200 border-slate-500/40",
    Utility: "bg-blue-500/20 text-blue-200 border-blue-500/40",
    Balanced: "bg-sky-500/20 text-sky-200 border-sky-500/40",
    Tempo: "bg-purple-500/20 text-purple-200 border-purple-500/40",
    Finisher: "bg-fuchsia-500/20 text-fuchsia-200 border-fuchsia-500/40",
    Situational: "bg-teal-500/20 text-teal-200 border-teal-500/40",
    Swingy: "bg-rose-500/20 text-rose-200 border-rose-500/40",
  };
  const getTagStyle = (tag) => {
    if (tag.startsWith("VP ")) {
      return "bg-indigo-500/20 text-indigo-200 border-indigo-500/40";
    }
    return tagStyles[tag] || "bg-slate-700/40 text-slate-200 border-slate-600/40";
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-3xl font-bold text-orange-400">Balance Lab</h1>
          <p className="text-gray-400 text-sm mt-1">
            Combine math-based scoring with simulation evidence to evaluate card balance.
          </p>
        </div>
        <button
          onClick={() => navigate("/lobby")}
          className="px-3 py-2 rounded-md border border-gray-700 text-gray-200 hover:border-orange-400 text-sm"
        >
          Back to Lobby
        </button>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setActiveTab("simulate")}
          className={`px-3 py-2 rounded-md border text-sm ${
            activeTab === "simulate"
              ? "border-orange-400 bg-orange-500/10 text-gray-100"
              : "border-gray-700 text-gray-300 hover:border-gray-500"
          }`}
        >
          Simulation Runner
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("analysis")}
          className={`px-3 py-2 rounded-md border text-sm ${
            activeTab === "analysis"
              ? "border-orange-400 bg-orange-500/10 text-gray-100"
              : "border-gray-700 text-gray-300 hover:border-gray-500"
          }`}
        >
          Deck Analysis
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("results")}
          className={`px-3 py-2 rounded-md border text-sm ${
            activeTab === "results"
              ? "border-orange-400 bg-orange-500/10 text-gray-100"
              : "border-gray-700 text-gray-300 hover:border-gray-500"
          }`}
        >
          Simulation Results
        </button>
      </div>

      {deckError && <div className="text-rose-300 text-sm">{deckError}</div>}

      {activeTab === "simulate" ? (
        <div className="space-y-6">
          <form
            onSubmit={handleRun}
            className="bg-gray-800 border border-gray-700 rounded-lg p-5 space-y-4"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <label className="text-sm text-gray-300 flex flex-col gap-2">
                Threats deck
                <select
                  value={threatDeck}
                  onChange={(event) => setThreatDeck(event.target.value)}
                  className="px-3 py-2 rounded-md bg-gray-900 border border-gray-700 text-gray-100"
                >
                  {(deckLists.threats || []).map((deck) => (
                    <option key={deck.name} value={deck.name}>
                      {deck.label || deck.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm text-gray-300 flex flex-col gap-2">
                Bosses deck
                <select
                  value={bossDeck}
                  onChange={(event) => setBossDeck(event.target.value)}
                  className="px-3 py-2 rounded-md bg-gray-900 border border-gray-700 text-gray-100"
                >
                  {(deckLists.bosses || []).map((deck) => (
                    <option key={deck.name} value={deck.name}>
                      {deck.label || deck.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm text-gray-300 flex flex-col gap-2">
                Upgrades deck
                <select
                  value={upgradeDeck}
                  onChange={(event) => setUpgradeDeck(event.target.value)}
                  className="px-3 py-2 rounded-md bg-gray-900 border border-gray-700 text-gray-100"
                >
                  {(deckLists.upgrades || []).map((deck) => (
                    <option key={deck.name} value={deck.name}>
                      {deck.label || deck.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm text-gray-300 flex flex-col gap-2">
                Weapons deck
                <select
                  value={weaponDeck}
                  onChange={(event) => setWeaponDeck(event.target.value)}
                  className="px-3 py-2 rounded-md bg-gray-900 border border-gray-700 text-gray-100"
                >
                  {(deckLists.weapons || []).map((deck) => (
                    <option key={deck.name} value={deck.name}>
                      {deck.label || deck.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>

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
              <label className="text-sm text-gray-300 flex flex-col gap-2">
                Seed (optional)
                <input
                  type="number"
                  value={seed}
                  onChange={(event) => setSeed(event.target.value)}
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
              {runError && <span className="text-rose-300 text-sm">{runError}</span>}
            </div>
          </form>

          {jobStatus && (
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-5 space-y-3 text-sm text-gray-300">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-100">Simulation Progress</h2>
                <span className="text-xs text-gray-400">
                  {jobStatus.completed_runs}/{jobStatus.total_runs} - {statusPercent}%
                </span>
              </div>
              <div className="h-2 rounded-full bg-gray-700 overflow-hidden">
                <div
                  className="h-full bg-orange-500 transition-all"
                  style={{ width: `${statusPercent}%` }}
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-gray-400">
                <div>Avg actions/run: {jobStatus.avg_actions?.toFixed(1)}</div>
                <div>Status: {jobStatus.status}</div>
                <div>{jobStatus.message}</div>
              </div>
              {jobStatus.latest_run && (
                <div className="text-xs text-gray-400">
                  Last run #{jobStatus.latest_run.id} - Winner {jobStatus.latest_run.winner_name || "None"}
                </div>
              )}
            </div>
          )}
        </div>
      ) : activeTab === "analysis" ? (
        <div className="space-y-6">
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-5 space-y-4">
            <div className="flex flex-wrap gap-4">
              <label className="text-sm text-gray-300 flex flex-col gap-2">
                Deck type
                <select
                  value={analysisDeckType}
                  onChange={(event) => setAnalysisDeckType(event.target.value)}
                  className="px-3 py-2 rounded-md bg-gray-900 border border-gray-700 text-gray-100"
                >
                  <option value="weapons">Weapons</option>
                  <option value="upgrades">Upgrades</option>
                </select>
              </label>
              <label className="text-sm text-gray-300 flex flex-col gap-2">
                Deck name
                <select
                  value={analysisDeckName}
                  onChange={(event) => setAnalysisDeckName(event.target.value)}
                  className="px-3 py-2 rounded-md bg-gray-900 border border-gray-700 text-gray-100"
                >
                  {(analysisDeckOptions || []).map((deck) => (
                    <option key={deck.name} value={deck.name}>
                      {deck.label || deck.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm text-gray-300 flex flex-col gap-2">
                Simulation result
                <select
                  value={simResultSource === "stored" ? simResultId : ""}
                  onChange={(event) => handleLoadStoredResult(event.target.value)}
                  className="px-3 py-2 rounded-md bg-gray-900 border border-gray-700 text-gray-100"
                >
                  <option value="">None</option>
                  {resultsLibrary.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.created_at} - {entry.label || entry.id}
                    </option>
                  ))}
                </select>
              </label>
              <div className="flex items-end">
                <button
                  type="button"
                  disabled={!simResultId || simResultSource !== "stored"}
                  onClick={handleDeleteStoredResult}
                  className="px-3 py-2 rounded-md border border-rose-500/70 text-rose-200 hover:border-rose-400 text-sm disabled:opacity-60"
                >
                  Delete Result
                </button>
              </div>
              <label className="text-sm text-gray-300 flex flex-col gap-2">
                Upload JSON
                <input
                  type="file"
                  accept=".json"
                  onChange={handleSimUpload}
                  className="px-3 py-2 rounded-md bg-gray-900 border border-gray-700 text-gray-100"
                />
              </label>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-xs text-gray-400">
              <span>
                Active sim:{" "}
                {simResultSource === "upload"
                  ? "Uploaded JSON"
                  : simResultSource === "stored"
                    ? `Stored ${simResultId}`
                    : "None"}
              </span>
              {isResultsLibraryLoading && <LoadingIndicator label="Loading results..." />}
              {isSimResultLoading && <LoadingIndicator label="Loading simulation..." />}
              {libraryError && <span className="text-rose-300">{libraryError}</span>}
              {simUploadError && <span className="text-rose-300">{simUploadError}</span>}
              {analysisError && <span className="text-rose-300">{analysisError}</span>}
            </div>
          </div>

          <div className="bg-gray-800 border border-gray-700 rounded-lg p-5 space-y-4">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-gray-100">Math Settings</h2>
                <InfoAnchor
                  description="Tune the constants used in the theoretical score. VP Value converts VP into resource-equivalent value; Game Length controls lifetime projections for upgrades."
                  {...infoHandlers}
                />
              </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-gray-300">
              <label className="flex flex-col gap-2">
                VP Value
                <input
                  type="number"
                  value={settings.vpValue}
                  onChange={(event) =>
                    setSettings((prev) => ({ ...prev, vpValue: toNumber(event.target.value, 0) }))
                  }
                  className="px-3 py-2 rounded-md bg-gray-900 border border-gray-700 text-gray-100"
                />
              </label>
              <label className="flex flex-col gap-2">
                Game Length (turns)
                <input
                  type="number"
                  value={settings.gameLength}
                  onChange={(event) =>
                    setSettings((prev) => ({ ...prev, gameLength: toNumber(event.target.value, 0) }))
                  }
                  className="px-3 py-2 rounded-md bg-gray-900 border border-gray-700 text-gray-100"
                />
              </label>
            </div>
          </div>

          {simResult && (
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-5 space-y-3">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-gray-100">Design Space</h2>
                <InfoAnchor
                  description="Each dot is a card. X-axis is the math score (efficiency or lifetime value). Y-axis is Win Rate Added vs baseline. Hover a dot for details."
                  {...infoHandlers}
                />
              </div>
              <div ref={chartRef} className="relative">
                <svg
                  viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                  className="w-full h-auto"
                  role="img"
                  aria-label="Math score vs win rate added"
                >
                  <rect
                    x={chartPadding.left}
                    y={chartPadding.top}
                    width={plotWidth}
                    height={plotHeight}
                    fill="rgba(17, 24, 39, 0.6)"
                    stroke="rgba(55, 65, 81, 0.9)"
                  />
                  <line
                    x1={chartPadding.left}
                    x2={chartPadding.left + plotWidth}
                    y1={yScale(0)}
                    y2={yScale(0)}
                    stroke="rgba(148, 163, 184, 0.5)"
                    strokeDasharray="4 4"
                  />
                  <text
                    x={chartPadding.left}
                    y={chartPadding.top + plotHeight + 28}
                    fill="rgba(156, 163, 175, 1)"
                    fontSize="12"
                  >
                    {analysisDeckType === "weapons" ? "Theoretical Efficiency ->" : "Lifetime Value ->"}
                  </text>
                  <text
                    x={chartPadding.left - 36}
                    y={chartPadding.top - 8}
                    fill="rgba(156, 163, 175, 1)"
                    fontSize="12"
                  >
                    Win Rate Added
                  </text>
                  {scatterData.points.map((row) => (
                    <circle
                      key={`scatter-${row.name}`}
                      cx={xScale(row.mathScore)}
                      cy={yScale(row.winRateAdded)}
                      r={row.trap ? 6 : 4}
                      fill={row.trap ? "#facc15" : "#94a3b8"}
                      opacity="0.9"
                      onMouseEnter={(event) => updateHoveredPoint(event, row)}
                      onMouseMove={(event) => updateHoveredPoint(event, row)}
                      onMouseLeave={clearHoveredPoint}
                    />
                  ))}
                </svg>
                {hoveredPoint && hoveredPointPos && (
                  <div
                    className="absolute rounded-md border border-slate-700 bg-slate-950/95 p-3 text-xs text-slate-200 shadow-xl pointer-events-none"
                    style={{
                      left: (() => {
                        const panelWidth = 220;
                        const offset = 12;
                        const maxWidth = hoveredPointPos.width || 0;
                        let left = hoveredPointPos.x + offset;
                        if (maxWidth && left + panelWidth > maxWidth) {
                          left = hoveredPointPos.x - panelWidth - offset;
                        }
                        return Math.max(8, left);
                      })(),
                      top: (() => {
                        const panelHeight = 140;
                        const offset = 12;
                        const maxHeight = hoveredPointPos.height || 0;
                        let top = hoveredPointPos.y + offset;
                        if (maxHeight && top + panelHeight > maxHeight) {
                          top = hoveredPointPos.y - panelHeight - offset;
                        }
                        return Math.max(8, top);
                      })(),
                    }}
                  >
                    <div className="text-sm font-semibold text-slate-100">{hoveredPoint.name}</div>
                    <div className="mt-1 text-slate-400">
                      {analysisDeckType === "weapons" ? "Efficiency" : "Lifetime"}:{" "}
                      {hoveredPoint.mathScore.toFixed(2)}
                    </div>
                    <div className="text-slate-400">Sim Win %: {formatPercent(hoveredPoint.winRateOwned)}</div>
                    <div className="text-slate-400">WRA: {formatSignedPercent(hoveredPoint.winRateAdded)}</div>
                    <div className="text-slate-400">
                      Pick Rate:{" "}
                      {hoveredPoint.pickRate !== null ? formatPercent(hoveredPoint.pickRate) : "--"}
                    </div>
                    <div className="text-slate-400">
                      Avg Acquire Turn:{" "}
                      {Number.isFinite(hoveredPoint.avgAcquireTurn)
                        ? hoveredPoint.avgAcquireTurn.toFixed(1)
                        : hoveredPoint.avgBuyTurn !== null
                          ? hoveredPoint.avgBuyTurn.toFixed(1)
                          : "--"}
                    </div>
                    {hoveredPoint.tags?.length ? (
                      <div className="text-slate-400">
                        Tags: {hoveredPoint.tags.join(", ")}
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            </div>
          )}

          {simResult && (
            <div className="bg-gray-800 border border-gray-700 rounded-lg p-5 space-y-3">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-gray-100">Delta VP Timing</h2>
                <InfoAnchor
                  description="X-axis is average turn acquired (Day 1-6, Night 7-12). Y-axis is average delta VP vs opponents. Click a card's Delta VP cell for the full timing breakdown."
                  {...infoHandlers}
                />
              </div>
              <div ref={deltaChartRef} className="relative">
                <svg
                  viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                  className="w-full h-auto"
                  role="img"
                  aria-label="Average turn acquired vs delta VP"
                >
                  <rect
                    x={chartPadding.left}
                    y={chartPadding.top}
                    width={plotWidth}
                    height={plotHeight}
                    fill="rgba(17, 24, 39, 0.6)"
                    stroke="rgba(55, 65, 81, 0.9)"
                  />
                  <line
                    x1={chartPadding.left}
                    x2={chartPadding.left + plotWidth}
                    y1={deltaYScale(0)}
                    y2={deltaYScale(0)}
                    stroke="rgba(148, 163, 184, 0.5)"
                    strokeDasharray="4 4"
                  />
                  {deltaVPScatter.minX <= 4 && deltaVPScatter.maxX >= 4 && (
                    <line
                      x1={deltaXScale(4)}
                      x2={deltaXScale(4)}
                      y1={chartPadding.top}
                      y2={chartPadding.top + plotHeight}
                      stroke="rgba(148, 163, 184, 0.4)"
                      strokeDasharray="4 4"
                    />
                  )}
                  {deltaVPScatter.minX <= 8 && deltaVPScatter.maxX >= 8 && (
                    <line
                      x1={deltaXScale(8)}
                      x2={deltaXScale(8)}
                      y1={chartPadding.top}
                      y2={chartPadding.top + plotHeight}
                      stroke="rgba(148, 163, 184, 0.4)"
                      strokeDasharray="4 4"
                    />
                  )}
                  <text
                    x={chartPadding.left}
                    y={chartPadding.top + plotHeight + 28}
                    fill="rgba(156, 163, 175, 1)"
                    fontSize="12"
                  >
                    Avg Turn Acquired ->
                  </text>
                  <text
                    x={chartPadding.left - 36}
                    y={chartPadding.top - 8}
                    fill="rgba(156, 163, 175, 1)"
                    fontSize="12"
                  >
                    Delta VP
                  </text>
                  {deltaVPScatter.points.map((row) => (
                    <circle
                      key={`delta-${row.name}`}
                      cx={deltaXScale(row.avgAcquireTurn)}
                      cy={deltaYScale(row.deltaVPAvg)}
                      r={4}
                      fill={row.deltaVPAvg >= 0 ? "#34d399" : "#f87171"}
                      opacity="0.9"
                      onMouseEnter={(event) => updateDeltaHoveredPoint(event, row)}
                      onMouseMove={(event) => updateDeltaHoveredPoint(event, row)}
                      onMouseLeave={clearDeltaHoveredPoint}
                    />
                  ))}
                </svg>
                {deltaHoveredPoint && deltaHoveredPointPos && (
                  <div
                    className="absolute rounded-md border border-slate-700 bg-slate-950/95 p-3 text-xs text-slate-200 shadow-xl pointer-events-none"
                    style={{
                      left: (() => {
                        const panelWidth = 220;
                        const offset = 12;
                        const maxWidth = deltaHoveredPointPos.width || 0;
                        let left = deltaHoveredPointPos.x + offset;
                        if (maxWidth && left + panelWidth > maxWidth) {
                          left = deltaHoveredPointPos.x - panelWidth - offset;
                        }
                        return Math.max(8, left);
                      })(),
                      top: (() => {
                        const panelHeight = 140;
                        const offset = 12;
                        const maxHeight = deltaHoveredPointPos.height || 0;
                        let top = deltaHoveredPointPos.y + offset;
                        if (maxHeight && top + panelHeight > maxHeight) {
                          top = deltaHoveredPointPos.y - panelHeight - offset;
                        }
                        return Math.max(8, top);
                      })(),
                    }}
                  >
                    <div className="text-sm font-semibold text-slate-100">{deltaHoveredPoint.name}</div>
                    <div className="text-slate-400">
                      Avg Turn:{" "}
                      {Number.isFinite(deltaHoveredPoint.avgAcquireTurn)
                        ? deltaHoveredPoint.avgAcquireTurn.toFixed(1)
                        : "--"}
                    </div>
                    <div className="text-slate-400">
                      Delta VP: {formatSignedNumber(deltaHoveredPoint.deltaVPAvg, 2)}
                    </div>
                    <div className="text-slate-400">
                      /turn: {formatSignedNumber(deltaHoveredPoint.deltaVPNormAvg, 2)}
                    </div>
                    {deltaHoveredPoint.deltaVPDiagnosis ? (
                      <div className="text-slate-400">
                        Diagnosis: {deltaHoveredPoint.deltaVPDiagnosis}
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="bg-gray-800 border border-gray-700 rounded-lg p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-semibold text-gray-100">Card Evaluation</h2>
                <InfoAnchor
                  description="Math-only columns explain expected value; sim columns show how bots actually performed. Hover rows for the detailed card preview."
                  {...infoHandlers}
                />
              </div>
              <span className="text-xs text-gray-400">
                Cards: {analysisRows.length} - Baseline win rate{" "}
                {formatPercent(simResult?.bot_count ? 1 / simResult.bot_count : NaN)}
              </span>
            </div>

            <div ref={tableRef} className="overflow-auto border border-gray-700 rounded-lg">
              <table className="min-w-full text-sm text-gray-300">
                <thead className="bg-gray-900/60 text-xs uppercase tracking-wide text-gray-400">
                  <tr>
                    <th className="px-3 py-2 text-left">
                      <InfoLabel
                        label="Card"
                        description="Card name. Hover a row to open the full card detail panel."
                        {...infoHandlers}
                      />
                    </th>
                    <th className="px-3 py-2 text-left">
                      <InfoLabel
                        label="Cost"
                        description="Resource cost in R/B/G for buying the card."
                        {...infoHandlers}
                      />
                    </th>
                    {analysisDeckType === "weapons" ? (
                      <>
                        <th className="px-3 py-2 text-left">
                          <InfoLabel
                            label="Uses"
                            description="How many times the weapon can be played before it is spent."
                            {...infoHandlers}
                          />
                        </th>
                        <th className="px-3 py-2 text-left">
                          <InfoLabel
                            label="Power"
                            description="Power per use derived from fight cost reduction tags."
                            {...infoHandlers}
                          />
                        </th>
                        <th className="px-3 py-2 text-left">
                          <InfoLabel
                            label="Flex"
                            description="Flexibility score based on color spread: 1.0 single color, 0.8 tri-color."
                            {...infoHandlers}
                          />
                        </th>
                        <th className="px-3 py-2 text-left">
                          <InfoLabel
                            label="Efficiency"
                            description="Math score: ((power * uses) + manual bonus) * flexibility / total cost."
                            {...infoHandlers}
                          />
                        </th>
                      </>
                    ) : (
                      <>
                        <th className="px-3 py-2 text-left">
                          <InfoLabel
                            label="Yield"
                            description="Estimated resources per turn from production tags."
                            {...infoHandlers}
                          />
                        </th>
                        <th className="px-3 py-2 text-left">
                          <InfoLabel
                            label="Payback"
                            description="Turns needed to recoup the cost based on production."
                            {...infoHandlers}
                          />
                        </th>
                        <th className="px-3 py-2 text-left">
                          <InfoLabel
                            label="Lifetime"
                            description="Projected net value over the game length, including VP and bonuses."
                            {...infoHandlers}
                          />
                        </th>
                      </>
                    )}
                    <th className="px-3 py-2 text-left">
                      <InfoLabel
                        label="Sim Win %"
                        description="Win rate of players who owned the card in simulations."
                        {...infoHandlers}
                      />
                    </th>
                    <th className="px-3 py-2 text-left">
                      <InfoLabel
                        label="WRA"
                        description="Win Rate Added vs baseline (1 / bot count). Positive means above average."
                        {...infoHandlers}
                      />
                    </th>
                    <th className="px-3 py-2 text-left">
                      <InfoLabel
                        label="Delta VP"
                        description="Average score delta vs opponents for buyers. Click for early/mid/late breakdown and normalized impact."
                        {...infoHandlers}
                      />
                    </th>
                    <th className="px-3 py-2 text-left">
                      <InfoLabel
                        label="Pick"
                        description="Pick rate when offered: times bought / times offered."
                        {...infoHandlers}
                      />
                    </th>
                    <th className="px-3 py-2 text-left">
                      <InfoLabel
                        label="Buy Dist D/N"
                        description="Day (top) and night (bottom) buy turn distributions. Each bar is a turn bucket."
                        {...infoHandlers}
                      />
                    </th>
                    <th className="px-3 py-2 text-left">
                      <InfoLabel
                        label="Era WRA"
                        description="Win Rate Added split by day vs night buys (unique buyers per era)."
                        {...infoHandlers}
                      />
                    </th>
                    <th className="px-3 py-2 text-left" colSpan={2}>
                      <InfoLabel
                        label="Synergy / Anti"
                        description="Best positive and negative co-owned partners by win-rate delta vs owning the card alone. Click a cell for the full list."
                        {...infoHandlers}
                      />
                    </th>
                    <th className="px-3 py-2 text-left">
                      <InfoLabel
                        label="Realized"
                        description="Math score adjusted by WRA: math score * (1 + WRA)."
                        {...infoHandlers}
                      />
                    </th>
                    <th className="px-3 py-2 text-left">
                      <InfoLabel
                        label="Delta"
                        description="Rank difference: sim rank minus math rank. Positive means sim performance exceeds math expectations."
                        {...infoHandlers}
                      />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {analysisRows.map((row) => (
                    <tr
                      key={`row-${row.name}`}
                      className="border-t border-gray-800 hover:bg-gray-900/40"
                      onMouseEnter={() => previewCard(row)}
                      onMouseLeave={() => setHoverPreview(null)}
                    >
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className={row.trap ? "text-yellow-300 font-semibold" : "text-gray-100"}>
                          {row.name}
                        </span>
                        {row.tags?.length ? (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {row.tags.map((tag) => (
                              <button
                                type="button"
                                key={`${row.name}-${tag}`}
                                className={`px-2 py-0.5 rounded-full border text-[10px] uppercase tracking-wide ${getTagStyle(tag)}`}
                                onMouseEnter={(event) => showInfoPanel(event, buildTagDescription(tag, row))}
                                onMouseLeave={hideInfoPanel}
                                onFocus={(event) => showInfoPanel(event, buildTagDescription(tag, row))}
                                onBlur={hideInfoPanel}
                              >
                                {tag}
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-400">
                        {row.cost.R}/{row.cost.B}/{row.cost.G}
                      </td>
                      {analysisDeckType === "weapons" ? (
                        <>
                          <td className="px-3 py-2 whitespace-nowrap">{row.details.uses}</td>
                          <td className="px-3 py-2 whitespace-nowrap">{row.details.output?.toFixed(1)}</td>
                          <td className="px-3 py-2 whitespace-nowrap">{row.details.flex?.toFixed(2)}</td>
                          <td className="px-3 py-2 whitespace-nowrap">{row.details.efficiency?.toFixed(2)}</td>
                        </>
                      ) : (
                        <>
                          <td className="px-3 py-2 whitespace-nowrap">{row.details.prod?.toFixed(1)}</td>
                          <td className="px-3 py-2 whitespace-nowrap">{row.details.payback?.toFixed(1)}</td>
                          <td className="px-3 py-2 whitespace-nowrap">{row.details.lifetime?.toFixed(1)}</td>
                        </>
                      )}
                      <td className="px-3 py-2 whitespace-nowrap">
                        {simResult ? formatPercent(row.winRateOwned) : "--"}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {simResult ? formatSignedPercent(row.winRateAdded) : "--"}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {simResult && (row.deltaVPAvg !== null || row.deltaVPNormAvg !== null) ? (
                          <button
                            type="button"
                            onClick={() => openDeltaVPPanel(row)}
                            className="text-left w-full rounded-md p-1 hover:bg-slate-900/60"
                          >
                            <div className="text-gray-100">
                              {formatSignedNumber(row.deltaVPAvg, 2)}
                              <span className="text-[10px] text-slate-500 ml-2">
                                n={row.deltaVPEarlySamples + row.deltaVPMidSamples + row.deltaVPLateSamples}
                              </span>
                            </div>
                            <div className="text-[10px] text-slate-500">
                              /turn {formatSignedNumber(row.deltaVPNormAvg, 2)}
                            </div>
                            {row.deltaVPDiagnosis ? (
                              <div className="text-[10px] text-slate-400">{row.deltaVPDiagnosis}</div>
                            ) : null}
                          </button>
                        ) : (
                          "--"
                        )}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {simResult && row.pickRate !== null ? formatPercent(row.pickRate) : "--"}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {simResult && (row.buyTurnDayBins?.length || row.buyTurnNightBins?.length) ? (
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-slate-500 w-3">D</span>
                              <div className="flex items-end gap-1 h-4">
                                {row.buyTurnDayBins.map((bin) => {
                                  const height = row.buyTurnDayMax
                                    ? Math.max(2, (bin.count / row.buyTurnDayMax) * 100)
                                    : 2;
                                  return (
                                    <div
                                      key={`${row.name}-day-${bin.label}`}
                                      className="w-2 rounded-sm bg-slate-500/70"
                                      style={{ height: `${height}%` }}
                                      title={`Day turns ${bin.label}: ${bin.count}`}
                                    />
                                  );
                                })}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] text-slate-500 w-3">N</span>
                              <div className="flex items-end gap-1 h-4">
                                {row.buyTurnNightBins.map((bin) => {
                                  const height = row.buyTurnNightMax
                                    ? Math.max(2, (bin.count / row.buyTurnNightMax) * 100)
                                    : 2;
                                  return (
                                    <div
                                      key={`${row.name}-night-${bin.label}`}
                                      className="w-2 rounded-sm bg-slate-500/70"
                                      style={{ height: `${height}%` }}
                                      title={`Night turns ${bin.label}: ${bin.count}`}
                                    />
                                  );
                                })}
                              </div>
                            </div>
                          </div>
                        ) : (
                          "--"
                        )}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {simResult ? (
                          <div className="space-y-1 text-xs">
                            <div className="flex items-center gap-2">
                              <span className="text-slate-500">D</span>
                              <span>
                                {row.eraDayWra !== null ? formatSignedPercent(row.eraDayWra) : "--"}
                              </span>
                              <span className="text-[10px] text-slate-500">n={row.eraDayBuyers || 0}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-slate-500">N</span>
                              <span>
                                {row.eraNightWra !== null ? formatSignedPercent(row.eraNightWra) : "--"}
                              </span>
                              <span className="text-[10px] text-slate-500">n={row.eraNightBuyers || 0}</span>
                            </div>
                          </div>
                        ) : (
                          "--"
                        )}
                      </td>
                      <td className="px-3 py-2" colSpan={2}>
                        {simResult ? (
                          <button
                            type="button"
                            onClick={() => openSynergyPanel(row)}
                            disabled={
                              !(row.synergyEntries?.length || row.antiSynergyEntries?.length)
                            }
                            className={`w-full rounded-md p-1 text-left ${
                              row.synergyEntries?.length || row.antiSynergyEntries?.length
                                ? "hover:bg-slate-900/60"
                                : "cursor-default"
                            }`}
                          >
                            <div className="grid grid-cols-2 gap-3 text-xs">
                              <div className="pr-2 border-r border-slate-800">
                                <div className="text-[10px] uppercase tracking-wide text-slate-500">Synergy</div>
                                {row.synergyTop ? (
                                  <>
                                    <div className="text-gray-100">{row.synergyTop.partner}</div>
                                    <div className="text-emerald-300">
                                      {formatSignedPercent(row.synergyTop.delta)}{" "}
                                      <span className="text-[10px] text-slate-500">
                                        n={row.synergyTop.games}
                                      </span>
                                    </div>
                                  </>
                                ) : (
                                  <div className="text-slate-500">--</div>
                                )}
                              </div>
                              <div className="pl-2">
                                <div className="text-[10px] uppercase tracking-wide text-slate-500">Anti</div>
                                {row.antiSynergyTop ? (
                                  <>
                                    <div className="text-gray-100">{row.antiSynergyTop.partner}</div>
                                    <div className="text-rose-300">
                                      {formatSignedPercent(row.antiSynergyTop.delta)}{" "}
                                      <span className="text-[10px] text-slate-500">
                                        n={row.antiSynergyTop.games}
                                      </span>
                                    </div>
                                  </>
                                ) : (
                                  <div className="text-slate-500">--</div>
                                )}
                              </div>
                            </div>
                          </button>
                        ) : (
                          "--"
                        )}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {simResult && row.realizedPower !== null ? row.realizedPower.toFixed(2) : "--"}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        {simResult && row.rankDelta !== undefined ? row.rankDelta : "--"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <BotSimulationResultsPanel autoLoadResultId={jobStatus?.stored_result_id} />
      )}
      {synergyPanel && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-4xl shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
              <div>
                <h3 className="text-lg font-semibold text-gray-100">
                  {synergyPanel.name} Synergies
                </h3>
                <p className="text-xs text-gray-400">
                  Base win rate {formatPercent(synergyPanel.baseWinRate)} - WRA{" "}
                  {formatSignedPercent(synergyPanel.winRateAdded)}
                </p>
              </div>
              <button
                type="button"
                onClick={closeSynergyPanel}
                className="px-3 py-1 rounded-md border border-gray-600 text-gray-200 hover:border-orange-400 text-sm"
              >
                Close
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 px-5 py-4 max-h-[70vh] overflow-auto">
              <div className="space-y-2">
                <div>
                  <h4 className="text-sm font-semibold text-emerald-200">Synergies</h4>
                  <p className="text-[11px] text-slate-500">Positive win rate deltas, min sample 3.</p>
                </div>
                {synergyPanel.entries.length ? (
                  synergyPanel.entries.map((entry) => (
                    <div
                      key={`${synergyPanel.name}-pos-${entry.partner}`}
                      className="border border-slate-800 rounded-md px-3 py-2 bg-slate-950/40 text-xs flex items-center justify-between"
                    >
                      <div>
                        <div className="text-gray-100">{entry.partner}</div>
                        <div className="text-slate-500">Win % {formatPercent(entry.winRate)}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-emerald-300">{formatSignedPercent(entry.delta)}</div>
                        <div className="text-[10px] text-slate-500">n={entry.games}</div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-xs text-slate-500 border border-slate-800 rounded-md px-3 py-2 bg-slate-950/40">
                    No positive synergies yet.
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <div>
                  <h4 className="text-sm font-semibold text-rose-200">Anti-synergies</h4>
                  <p className="text-[11px] text-slate-500">Negative win rate deltas, min sample 3.</p>
                </div>
                {synergyPanel.antiEntries.length ? (
                  synergyPanel.antiEntries.map((entry) => (
                    <div
                      key={`${synergyPanel.name}-neg-${entry.partner}`}
                      className="border border-slate-800 rounded-md px-3 py-2 bg-slate-950/40 text-xs flex items-center justify-between"
                    >
                      <div>
                        <div className="text-gray-100">{entry.partner}</div>
                        <div className="text-slate-500">Win % {formatPercent(entry.winRate)}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-rose-300">{formatSignedPercent(entry.delta)}</div>
                        <div className="text-[10px] text-slate-500">n={entry.games}</div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-xs text-slate-500 border border-slate-800 rounded-md px-3 py-2 bg-slate-950/40">
                    No negative synergies yet.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      {deltaVPPanel && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-3xl shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-700">
              <div>
                <h3 className="text-lg font-semibold text-gray-100">{deltaVPPanel.name} Delta VP</h3>
                <p className="text-xs text-gray-400">
                  Avg {formatSignedNumber(deltaVPPanel.avg, 2)} - /turn{" "}
                  {formatSignedNumber(deltaVPPanel.normAvg, 2)}
                </p>
              </div>
              <button
                type="button"
                onClick={closeDeltaVPPanel}
                className="px-3 py-1 rounded-md border border-gray-600 text-gray-200 hover:border-orange-400 text-sm"
              >
                Close
              </button>
            </div>
            <div className="px-5 py-4 space-y-4 max-h-[70vh] overflow-auto">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs text-slate-300">
                <div className="bg-slate-950/40 border border-slate-800 rounded-md px-3 py-2">
                  <div className="text-[10px] uppercase tracking-wide text-slate-500">Avg Turn</div>
                  <div className="text-gray-100">
                    {Number.isFinite(deltaVPPanel.avgTurn) ? deltaVPPanel.avgTurn.toFixed(1) : "--"}
                  </div>
                </div>
                <div className="bg-slate-950/40 border border-slate-800 rounded-md px-3 py-2">
                  <div className="text-[10px] uppercase tracking-wide text-slate-500">Power Score</div>
                  <div className="text-gray-100">
                    {Number.isFinite(deltaVPPanel.powerScore)
                      ? formatSignedNumber(deltaVPPanel.powerScore, 2)
                      : "--"}
                  </div>
                </div>
                <div className="bg-slate-950/40 border border-slate-800 rounded-md px-3 py-2">
                  <div className="text-[10px] uppercase tracking-wide text-slate-500">Diagnosis</div>
                  <div className="text-gray-100">{deltaVPPanel.diagnosis || "--"}</div>
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-xs text-slate-400">
                  Early (1-4), Mid (5-8), Late (9-12) acquisition bins.
                </div>
                {(() => {
                  const values = [
                    { label: "Early", value: deltaVPPanel.earlyAvg, count: deltaVPPanel.earlyCount },
                    { label: "Mid", value: deltaVPPanel.midAvg, count: deltaVPPanel.midCount },
                    { label: "Late", value: deltaVPPanel.lateAvg, count: deltaVPPanel.lateCount },
                  ];
                  const maxAbs = Math.max(
                    1,
                    ...values.map((entry) => (Number.isFinite(entry.value) ? Math.abs(entry.value) : 0))
                  );
                  return (
                    <div className="space-y-2">
                      {values.map((entry) => (
                        <div key={`delta-${entry.label}`} className="flex items-center gap-3 text-xs">
                          <div className="w-12 text-slate-400">{entry.label}</div>
                          <div className="flex-1 h-2 rounded-full bg-slate-800">
                            <div
                              className={`h-2 rounded-full ${
                                Number.isFinite(entry.value) && entry.value < 0
                                  ? "bg-rose-400"
                                  : "bg-emerald-400"
                              }`}
                              style={{
                                width: `${Math.min(
                                  100,
                                  (Math.abs(entry.value || 0) / maxAbs) * 100
                                )}%`,
                              }}
                            />
                          </div>
                          <div className="w-16 text-right text-gray-100">
                            {formatSignedNumber(entry.value, 2)}
                          </div>
                          <div className="w-10 text-[10px] text-slate-500 text-right">
                            n={entry.count || 0}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>
      )}
      {infoPanel && infoPanelStyle && (
        <div
          className="fixed z-50 rounded-md border border-slate-700 bg-slate-950/95 p-3 text-xs text-slate-200 shadow-xl pointer-events-none"
          style={infoPanelStyle}
        >
          {infoPanel.description}
        </div>
      )}
      <HoverPreviewPortal />
    </div>
  );
};

export default BalanceLabPage;
