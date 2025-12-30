import React, { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../../store";
import { buildApiUrl } from "../../utils/connection";

const formatPercent = (value) => {
  if (!Number.isFinite(value)) return "0.0%";
  return `${(value * 100).toFixed(1)}%`;
};

const formatSignedPercent = (value) => {
  if (!Number.isFinite(value)) return "0.0%";
  const pct = value * 100;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
};

const medianValue = (values) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
};

const clampValue = (value, min, max) => Math.min(max, Math.max(min, value));

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const computeBinSize = (maxValue) => {
  if (maxValue <= 10) return 1;
  if (maxValue <= 20) return 2;
  if (maxValue <= 40) return 5;
  if (maxValue <= 80) return 10;
  return 20;
};

const buildBins = (values) => {
  let maxValue = 0;
  values.forEach((value) => {
    const numeric = toNumber(value, 0);
    if (numeric > maxValue) maxValue = numeric;
  });
  const binSize = computeBinSize(maxValue);
  const bins = [];
  if (maxValue === 0) {
    return { bins: [{ start: 0, end: 0, label: "0" }], binSize, maxValue };
  }
  for (let start = 0; start <= maxValue; start += binSize) {
    const end = start + binSize - 1;
    const label = binSize === 1 ? `${start}` : `${start}-${end}`;
    bins.push({ start, end, label });
  }
  return { bins, binSize, maxValue };
};

const countByBins = (values, bins, binSize) => {
  const counts = {};
  bins.forEach((bin) => {
    counts[bin.label] = 0;
  });
  values.forEach((value) => {
    const numeric = toNumber(value, 0);
    const idx = Math.min(bins.length - 1, Math.max(0, Math.floor(numeric / binSize)));
    const label = bins[idx]?.label;
    if (label !== undefined) {
      counts[label] = (counts[label] || 0) + 1;
    }
  });
  return counts;
};

const ERA_ROUND_COUNT = 7;

const getAbsoluteRound = (round, era) => {
  const numeric = toNumber(round, 0);
  if (!numeric) return 0;
  const eraLabel = String(era || "").toLowerCase();
  if (eraLabel.includes("night")) return numeric + ERA_ROUND_COUNT;
  return numeric;
};

const formatRoundLabel = (round) => {
  const numeric = toNumber(round, 0);
  if (!numeric) return { label: "--", isNight: false };
  const isNight = numeric > ERA_ROUND_COUNT;
  const eraRound = isNight ? numeric - ERA_ROUND_COUNT : numeric;
  const isBoss = eraRound === ERA_ROUND_COUNT;
  const label = isBoss ? `${isNight ? "N" : "D"}B` : `${isNight ? "N" : "D"}${eraRound}`;
  return { label, isNight, isBoss };
};

const colorForIndex = (index, total, hueOffset = 0) => {
  if (!total) return "hsl(210, 65%, 45%)";
  const hue = (hueOffset + (index * 360) / total) % 360;
  return `hsl(${hue}, 65%, 45%)`;
};

const formatPayload = (payload) => {
  if (!payload || Object.keys(payload).length === 0) return "";
  const text = JSON.stringify(payload);
  if (text.length <= 120) return text;
  return `${text.slice(0, 117)}...`;
};

const LoadingIndicator = ({ label }) => (
  <span className="inline-flex items-center gap-2 text-xs text-gray-400">
    <span className="h-3 w-3 animate-spin rounded-full border-2 border-gray-400 border-t-transparent" />
    <span>{label}</span>
  </span>
);

const escapeCsvValue = (value) => {
  if (value === null || value === undefined) return "";
  const text = String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
};

const parseCsvRows = (text) => {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (char === "\r") {
      // ignore CR
    } else {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => String(cell || "").trim() !== ""));
};

const buildCsvFromResult = (result) => {
  if (!result) return "";
  const headers = [
    "run_id",
    "winner_id",
    "winner_name",
    "ended_reason",
    "total_actions",
    "bot_count",
    "simulations",
    "action_index",
    "action_type",
    "player_id",
    "player_name",
    "round",
    "era",
    "status",
    "error",
    "cards",
    "payload",
    "forced",
  ];
  const rows = [headers.join(",")];
  (result.runs || []).forEach((run) => {
    const actions = run.actions || [];
    if (!actions.length) {
      const row = [
        run.id ?? "",
        run.winner_id ?? "",
        run.winner_name ?? "",
        run.ended_reason ?? "",
        run.total_actions ?? actions.length,
        result.bot_count ?? "",
        result.simulations ?? "",
        "",
        "",
        "",
        "",
        run.round ?? "",
        run.era ?? "",
        "",
        "",
        "",
        "",
        "",
      ];
      rows.push(row.map(escapeCsvValue).join(","));
      return;
    }
    actions.forEach((action) => {
      const cards = (action.cards || [])
        .map((card) => (card.kind ? `${card.name}|${card.kind}` : card.name))
        .join(";");
      const row = [
        run.id ?? "",
        run.winner_id ?? "",
        run.winner_name ?? "",
        run.ended_reason ?? "",
        run.total_actions ?? actions.length,
        result.bot_count ?? "",
        result.simulations ?? "",
        action.index ?? "",
        action.type ?? "",
        action.player_id ?? "",
        action.player_name ?? "",
        action.round ?? "",
        action.era ?? "",
        action.status ?? "",
        action.error ?? "",
        cards,
        action.payload ? JSON.stringify(action.payload) : "",
        action.forced ? "true" : "false",
      ];
      rows.push(row.map(escapeCsvValue).join(","));
    });
  });
  return rows.join("\n");
};

const buildResultFromCsv = (text, filename = "upload.csv") => {
  const rows = parseCsvRows(text);
  if (!rows.length) {
    throw new Error("CSV file is empty.");
  }
  const headers = rows[0].map((h) => String(h || "").trim().toLowerCase());
  const findIndex = (names) => headers.findIndex((h) => names.includes(h));
  const idxRun = findIndex(["run_id", "run", "simulation_id"]);
  const idxActionType = findIndex(["action_type", "type", "action"]);
  if (idxRun === -1 || idxActionType === -1) {
    throw new Error("CSV must include run_id and action_type columns.");
  }
  const idxWinnerId = findIndex(["winner_id"]);
  const idxWinnerName = findIndex(["winner_name"]);
  const idxEnded = findIndex(["ended_reason"]);
  const idxTotalActions = findIndex(["total_actions"]);
  const idxActionIndex = findIndex(["action_index"]);
  const idxPlayerId = findIndex(["player_id"]);
  const idxPlayerName = findIndex(["player_name"]);
  const idxRound = findIndex(["round"]);
  const idxEra = findIndex(["era"]);
  const idxStatus = findIndex(["status"]);
  const idxError = findIndex(["error"]);
  const idxCards = findIndex(["cards"]);
  const idxPayload = findIndex(["payload"]);
  const idxForced = findIndex(["forced"]);
  const idxBotCount = findIndex(["bot_count"]);
  const idxSimulations = findIndex(["simulations", "simulation_count"]);

  const runsMap = new Map();
  const playersMap = new Map();

  rows.slice(1).forEach((row) => {
    const runRaw = row[idxRun];
    if (!runRaw) return;
    const runKey = String(runRaw);
    const runId = Number.isFinite(Number(runRaw)) ? Number(runRaw) : runRaw;
    if (!runsMap.has(runKey)) {
      runsMap.set(runKey, {
        id: runId,
        winner_id: idxWinnerId >= 0 ? row[idxWinnerId] || null : null,
        winner_name: idxWinnerName >= 0 ? row[idxWinnerName] || null : null,
        ended_reason: idxEnded >= 0 ? row[idxEnded] || "game_over" : "game_over",
        total_actions: idxTotalActions >= 0 ? Number(row[idxTotalActions] || 0) : 0,
        actions: [],
        action_types: [],
        cards_used: [],
        round: idxRound >= 0 ? Number(row[idxRound] || 0) : 0,
        era: idxEra >= 0 ? row[idxEra] || "" : "",
      });
    }
    const run = runsMap.get(runKey);
    if (idxWinnerId >= 0 && row[idxWinnerId]) run.winner_id = row[idxWinnerId];
    if (idxWinnerName >= 0 && row[idxWinnerName]) run.winner_name = row[idxWinnerName];
    if (idxEnded >= 0 && row[idxEnded]) run.ended_reason = row[idxEnded];
    if (idxTotalActions >= 0 && row[idxTotalActions]) run.total_actions = Number(row[idxTotalActions] || 0);
    if (idxRound >= 0 && row[idxRound]) run.round = Number(row[idxRound] || 0);
    if (idxEra >= 0 && row[idxEra]) run.era = row[idxEra];

    const actionType = row[idxActionType];
    if (!actionType) return;
    const payloadRaw = idxPayload >= 0 ? row[idxPayload] : "";
    let payload = {};
    if (payloadRaw) {
      try {
        payload = JSON.parse(payloadRaw);
      } catch (err) {
        payload = { raw: payloadRaw };
      }
    }
    const cardsRaw = idxCards >= 0 ? row[idxCards] : "";
    const cards = cardsRaw
      ? cardsRaw.split(";").map((entry) => {
        const [name, kind] = entry.split("|");
        return { name: name || entry, kind: kind || undefined };
      })
      : [];
    const action = {
      index: idxActionIndex >= 0 ? Number(row[idxActionIndex] || 0) : 0,
      type: actionType,
      player_id: idxPlayerId >= 0 ? row[idxPlayerId] || "" : "",
      player_name: idxPlayerName >= 0 ? row[idxPlayerName] || "" : "",
      payload,
      round: idxRound >= 0 ? Number(row[idxRound] || 0) : 0,
      era: idxEra >= 0 ? row[idxEra] || "" : "",
      status: idxStatus >= 0 ? row[idxStatus] || "" : "",
      error: idxError >= 0 ? row[idxError] || "" : "",
      cards,
      forced: idxForced >= 0 ? row[idxForced] === "true" : false,
    };
    run.actions.push(action);
    if (action.player_id) {
      playersMap.set(action.player_id, {
        id: action.player_id,
        name: action.player_name || action.player_id,
      });
    }
  });

  const runs = Array.from(runsMap.values()).sort((a, b) => {
    const aNum = Number(a.id);
    const bNum = Number(b.id);
    if (Number.isFinite(aNum) && Number.isFinite(bNum)) {
      return aNum - bNum;
    }
    return String(a.id).localeCompare(String(b.id));
  });
  const wins = {};
  const actionCounts = {};
  const cardUsage = {};
  const cardIndex = {};
  runs.forEach((run) => {
    if (run.winner_id) {
      wins[run.winner_id] = (wins[run.winner_id] || 0) + 1;
      if (!playersMap.has(run.winner_id)) {
        playersMap.set(run.winner_id, {
          id: run.winner_id,
          name: run.winner_name || run.winner_id,
        });
      }
    }
    const actionTypes = new Set();
    const cardsUsed = new Map();
    run.actions.forEach((action) => {
      actionCounts[action.type] = (actionCounts[action.type] || 0) + 1;
      actionTypes.add(action.type);
      (action.cards || []).forEach((card) => {
        if (!card?.name) return;
        cardUsage[card.name] = (cardUsage[card.name] || 0) + 1;
        if (card.kind && !cardIndex[card.name]) {
          cardIndex[card.name] = card.kind;
        }
        cardsUsed.set(card.name, card);
      });
    });
    run.action_types = Array.from(actionTypes);
    run.cards_used = Array.from(cardsUsed.values());
    run.total_actions = run.actions.length || run.total_actions;
  });

  const botCount = idxBotCount >= 0 ? Number(rows[1]?.[idxBotCount] || 0) : playersMap.size;
  const simulations = idxSimulations >= 0 ? Number(rows[1]?.[idxSimulations] || 0) : runs.length;
  const winRates = {};
  const totalRuns = runs.length || 1;
  Object.keys(wins).forEach((playerId) => {
    winRates[playerId] = wins[playerId] / totalRuns;
  });
  return {
    simulations: simulations || runs.length,
    bot_count: botCount || playersMap.size,
    players: Array.from(playersMap.values()),
    wins,
    win_rates: winRates,
    action_counts: actionCounts,
    card_usage: cardUsage,
    card_index: cardIndex,
    runs,
    config: { source: "csv", filename },
    duration_ms: 0,
  };
};

const BotSimulationResultsPanel = ({
  autoLoadResultId = "",
  autoLoadWhenEmpty = true,
  externalResult = null,
  hideLibrary = false,
}) => {
  const token = useStore((state) => state.token);
  const [activeTab, setActiveTab] = useState("overview");
  const [activeResult, setActiveResult] = useState(null);
  const [activeResultId, setActiveResultId] = useState("");
  const [activeResultSource, setActiveResultSource] = useState("none");
  const [resultsLibrary, setResultsLibrary] = useState([]);
  const [libraryError, setLibraryError] = useState("");
  const [isLibraryLoading, setIsLibraryLoading] = useState(false);
  const [isResultLoading, setIsResultLoading] = useState(false);
  const [uploadError, setUploadError] = useState("");
  const [uploadName, setUploadName] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [cardFilter, setCardFilter] = useState("");
  const [threatFilter, setThreatFilter] = useState("");
  const [roundView, setRoundView] = useState("all");
  const [selectedRunId, setSelectedRunId] = useState(null);
  const [fullLogOpen, setFullLogOpen] = useState(false);
  const [fullLogQuery, setFullLogQuery] = useState("");
  const [hoveredCard, setHoveredCard] = useState(null);
  const lastAutoLoadRef = useRef("");

  const resetFilters = () => {
    setActionFilter("");
    setCardFilter("");
    setThreatFilter("");
  };

  useEffect(() => {
    if (!externalResult) return;
    setActiveResult(externalResult);
    setActiveResultId(externalResult?.stored_result_id || externalResult?.id || "external");
    setActiveResultSource("external");
    setLibraryError("");
    setUploadName("");
    setUploadError("");
    resetFilters();
    setSelectedRunId(externalResult?.runs?.[0]?.id ?? null);
  }, [externalResult]);

  useEffect(() => {
    setActiveTab("overview");
    setHoveredCard(null);
  }, [activeResultId, activeResultSource]);

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
    setIsLibraryLoading(true);
    try {
      const data = await fetchResultsLibrary();
      setResultsLibrary(data?.results || []);
      setLibraryError("");
      return data;
    } finally {
      setIsLibraryLoading(false);
    }
  };

  const loadStoredResult = async (resultId, source = "stored") => {
    if (!resultId) return;
    setIsResultLoading(true);
    try {
      const response = await fetch(buildApiUrl(`/api/simulations/bots/results/${resultId}`), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!response.ok) {
        let detail = "Failed to load saved result.";
        try {
          const err = await response.json();
          detail = err?.detail || err?.message || detail;
        } catch (parseError) {
          detail = response.statusText || detail;
        }
        throw new Error(detail);
      }
      const data = await response.json();
      setActiveResult(data);
      setActiveResultId(resultId);
      setActiveResultSource(source);
      setLibraryError("");
      setUploadName("");
      setUploadError("");
      resetFilters();
      setSelectedRunId(data?.runs?.[0]?.id ?? null);
    } finally {
      setIsResultLoading(false);
    }
  };

  const handleDownloadStored = async () => {
    if (!activeResultId || activeResultSource !== "stored") return;
    const response = await fetch(
      buildApiUrl(`/api/simulations/bots/results/${activeResultId}/download`),
      {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      }
    );
    if (!response.ok) {
      setLibraryError("Failed to download the stored result.");
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const slug = String(activeResultId).replace(/[^a-z0-9_-]+/gi, "_");
    link.href = url;
    link.download = `bot_simulation_${slug || "result"}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const handleDeleteStoredResult = async () => {
    if (!activeResultId || activeResultSource !== "stored") return;
    if (!window.confirm(`Delete stored simulation ${activeResultId}?`)) return;
    try {
      const response = await fetch(
        buildApiUrl(`/api/simulations/bots/results/${activeResultId}`),
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
      setActiveResult(null);
      setActiveResultId("");
      setActiveResultSource("none");
      setUploadName("");
      setUploadError("");
      resetFilters();
      setSelectedRunId(null);
      await refreshResultsLibrary();
    } catch (err) {
      setLibraryError(err?.message || "Failed to delete the stored result.");
    }
  };

  const handleExportCsv = () => {
    if (!activeResult) return;
    const csv = buildCsvFromResult(activeResult);
    if (!csv) return;
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const slugBase =
      activeResultId ||
      activeResult?.stored_result_id ||
      activeResult?.storedResultId ||
      "result";
    const slug = String(slugBase).replace(/[^a-z0-9_-]+/gi, "_");
    link.href = url;
    link.download = `bot_simulation_${slug}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const handleCsvUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploadError("");
    setLibraryError("");
    try {
      const text = await file.text();
      const parsed = buildResultFromCsv(text, file.name);
      setActiveResult(parsed);
      setActiveResultId(`upload:${file.name}:${Date.now()}`);
      setActiveResultSource("upload");
      setUploadName(file.name);
      resetFilters();
      setSelectedRunId(parsed?.runs?.[0]?.id ?? null);
    } catch (err) {
      setUploadError(err?.message || "Failed to parse CSV.");
    } finally {
      event.target.value = "";
    }
  };

  useEffect(() => {
    if (hideLibrary || externalResult) return;
    let cancelled = false;
    refreshResultsLibrary().catch((err) => {
      if (cancelled) return;
      setLibraryError(err?.message || "Failed to load saved results.");
    });
    return () => {
      cancelled = true;
    };
  }, [token, externalResult, hideLibrary]);

  useEffect(() => {
    if (externalResult || hideLibrary) return;
    if (!autoLoadResultId) return;
    if (autoLoadWhenEmpty && activeResultId) return;
    if (lastAutoLoadRef.current === autoLoadResultId) return;
    lastAutoLoadRef.current = autoLoadResultId;
    (async () => {
      try {
        await refreshResultsLibrary();
        await loadStoredResult(autoLoadResultId, "stored");
      } catch (err) {
        setLibraryError(err?.message || "Failed to load saved result.");
      }
    })();
  }, [autoLoadResultId, autoLoadWhenEmpty, activeResultId, externalResult, hideLibrary]);

  const playerCount = useMemo(() => {
    if (!activeResult) return 0;
    const configCount = Number(activeResult?.config?.player_count || 0);
    if (configCount) return configCount;
    return Number(activeResult?.bot_count || activeResult?.players?.length || 0);
  }, [activeResult]);
  const botCountLabel =
    activeResult?.config?.source === "live_game" ? "Players" : "Bots";
  const baselineCount = playerCount || Number(activeResult?.bot_count || 0);
  const baselineRate = baselineCount ? 1 / baselineCount : 0;

  const actionOptions = useMemo(() => {
    if (!activeResult?.action_counts) return [];
    return Object.keys(activeResult.action_counts).sort();
  }, [activeResult]);

  const cardOptions = useMemo(() => {
    const kindIndex = activeResult?.card_index || {};
    const balance = activeResult?.card_balance_data || {};
    const balanceNames = Object.keys(balance);
    if (balanceNames.length) {
      return balanceNames
        .map((name) => {
          const stats = balance[name] || {};
          return {
            name,
            kind: stats.kind || kindIndex[name] || "",
            count: toNumber(stats.times_bought, 0),
          };
        })
        .sort((a, b) => {
          if (a.kind !== b.kind) return a.kind.localeCompare(b.kind);
          return a.name.localeCompare(b.name);
        });
    }
    const usage = activeResult?.card_usage || {};
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
  }, [activeResult]);

  const normalizeFilter = (value) => value.trim().toLowerCase();
  const hiddenActionTypes = new Set(["end_turn"]);
  const shouldHideActionType = (actionType) =>
    hiddenActionTypes.has(normalizeFilter(String(actionType || "")));
  const filterByRoundView = (rows) => {
    if (!rows?.length || roundView === "all") return rows;
    if (roundView === "day") return rows.filter((row) => row.round <= ERA_ROUND_COUNT);
    return rows.filter((row) => row.round > ERA_ROUND_COUNT);
  };
  const actionFilterValue = normalizeFilter(actionFilter);
  const cardFilterValue = normalizeFilter(cardFilter);

  const balanceCards = useMemo(() => {
    const balance = activeResult?.card_balance_data || {};
    const kindIndex = activeResult?.card_index || {};
    const baselineDenom = playerCount || activeResult?.bot_count || 0;
    const baseline = baselineDenom ? 1 / baselineDenom : 0;
    return Object.entries(balance)
      .map(([key, stats]) => {
        const name = stats?.name || key;
        const kind = stats?.kind || kindIndex[name] || "";
        const timesOffered = toNumber(stats?.times_offered, 0);
        const timesBought = toNumber(stats?.times_bought, 0);
        const timesActivated = toNumber(stats?.times_activated, 0);
        const timesUsed = toNumber(stats?.times_used, 0);
        const winsWithCard = toNumber(stats?.wins_with_card, 0);
        const gamesWithCard = toNumber(stats?.games_with_card, 0);
        const buyTurnTotal = toNumber(stats?.buy_turns_total, 0);
        const buyTurnSamples = toNumber(stats?.buy_turns_samples, 0);
        const buyTurnRatioTotal = toNumber(stats?.buy_turns_ratio_total, 0);
        const buyTurnRatioSamples = toNumber(stats?.buy_turns_ratio_samples, 0);
        const retentionTotal = toNumber(stats?.retention_turns_total, 0);
        const retentionSamples = toNumber(stats?.retention_samples, 0);
        const retentionRatioTotal = toNumber(stats?.retention_turns_ratio_total, 0);
        const retentionRatioSamples = toNumber(stats?.retention_turns_ratio_samples, 0);
        const avgBuyTurn = buyTurnSamples ? buyTurnTotal / buyTurnSamples : null;
        const avgBuyRatio = buyTurnRatioSamples ? buyTurnRatioTotal / buyTurnRatioSamples : null;
        const avgRetention = retentionSamples ? retentionTotal / retentionSamples : null;
        const avgRetentionRatio = retentionRatioSamples ? retentionRatioTotal / retentionRatioSamples : null;
        const winRateOwned = Number.isFinite(stats?.win_rate_when_owned)
          ? stats.win_rate_when_owned
          : gamesWithCard
            ? winsWithCard / gamesWithCard
            : 0;
        const winRateAdded = Number.isFinite(stats?.win_rate_added)
          ? stats.win_rate_added
          : winRateOwned - baseline;
        const winRateAddedWeighted = Number.isFinite(stats?.win_rate_added_weighted)
          ? stats.win_rate_added_weighted
          : avgBuyRatio !== null
            ? winRateAdded * Math.max(0, 1 - avgBuyRatio)
            : winRateAdded;
        const activationEfficiency = timesBought
          ? (kind === "weapon" ? timesUsed : timesActivated) / timesBought
          : 0;
        const pickRate = timesOffered ? timesBought / timesOffered : 0;
        return {
          name,
          kind,
          timesOffered,
          timesBought,
          timesActivated,
          timesUsed,
          winsWithCard,
          gamesWithCard,
          avgBuyTurn,
          avgBuyRatio,
          avgRetention,
          avgRetentionRatio,
          winRateOwned,
          winRateAdded,
          winRateAddedWeighted,
          activationEfficiency,
          pickRate,
        };
      })
      .sort((a, b) => b.winRateAdded - a.winRateAdded);
  }, [activeResult, playerCount]);

  const filteredBalanceCards = useMemo(() => {
    if (!balanceCards.length) return [];
    if (!cardFilterValue) return balanceCards;
    return balanceCards.filter((card) => normalizeFilter(card.name).includes(cardFilterValue));
  }, [balanceCards, cardFilterValue]);

  const filteredRuns = useMemo(() => {
    if (!activeResult?.runs) return [];
    return activeResult.runs.filter((run) => {
      const matchesAction =
        !actionFilterValue || (run.action_types || []).some((action) => normalizeFilter(action) === actionFilterValue);
      const matchesCard =
        !cardFilterValue ||
        (run.cards_used || []).some((card) => normalizeFilter(card.name).includes(cardFilterValue));
      return matchesAction && matchesCard;
    });
  }, [activeResult, actionFilterValue, cardFilterValue]);

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
    return (activeResult?.runs || []).find((run) => run.id === selectedRunId) || null;
  }, [activeResult, selectedRunId]);

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

  const roundSnapshotData = useMemo(() => {
    const roundMap = new Map();
    filteredRuns.forEach((run) => {
      (run.round_snapshots || []).forEach((snapshot) => {
        const absoluteRound = getAbsoluteRound(snapshot.round, snapshot.era);
        if (!absoluteRound) return;
        const entry = roundMap.get(absoluteRound) || {
          round: absoluteRound,
          vpValues: [],
          woundValues: [],
          stanceCounts: {},
        };
        (snapshot.players || []).forEach((player) => {
          entry.vpValues.push(toNumber(player.vp, 0));
          entry.woundValues.push(toNumber(player.wounds, 0));
          const stanceKey = String(player.stance || "UNKNOWN");
          entry.stanceCounts[stanceKey] = (entry.stanceCounts[stanceKey] || 0) + 1;
        });
        roundMap.set(absoluteRound, entry);
      });
    });
    return Array.from(roundMap.values()).sort((a, b) => a.round - b.round);
  }, [filteredRuns]);

  const vpBins = useMemo(() => buildBins(roundSnapshotData.flatMap((entry) => entry.vpValues)), [roundSnapshotData]);
  const woundBins = useMemo(() => buildBins(roundSnapshotData.flatMap((entry) => entry.woundValues)), [roundSnapshotData]);

  const vpRoundRows = useMemo(
    () =>
      roundSnapshotData.map((entry) => {
        const counts = countByBins(entry.vpValues, vpBins.bins, vpBins.binSize);
        return { round: entry.round, counts, total: entry.vpValues.length };
      }),
    [roundSnapshotData, vpBins]
  );

  const vpDayRows = useMemo(() => vpRoundRows.filter((row) => row.round <= ERA_ROUND_COUNT), [vpRoundRows]);
  const vpNightRows = useMemo(
    () => vpRoundRows.filter((row) => row.round > ERA_ROUND_COUNT),
    [vpRoundRows]
  );
  const vpRoundRowsFiltered = useMemo(() => filterByRoundView(vpRoundRows), [vpRoundRows, roundView]);

  const woundRoundRows = useMemo(
    () =>
      roundSnapshotData.map((entry) => {
        const counts = countByBins(entry.woundValues, woundBins.bins, woundBins.binSize);
        return { round: entry.round, counts, total: entry.woundValues.length };
      }),
    [roundSnapshotData, woundBins]
  );
  const woundRoundRowsFiltered = useMemo(
    () => filterByRoundView(woundRoundRows),
    [woundRoundRows, roundView]
  );

  const stanceOrder = ["AGGRESSIVE", "TACTICAL", "HUNKERED", "BALANCED", "UNKNOWN"];
  const stanceCategories = useMemo(() => {
    const seen = new Set();
    roundSnapshotData.forEach((entry) => {
      Object.keys(entry.stanceCounts || {}).forEach((key) => {
        if (key) seen.add(key);
      });
    });
    const ordered = stanceOrder.filter((key) => seen.has(key));
    const extras = Array.from(seen).filter((key) => !stanceOrder.includes(key)).sort();
    return [...ordered, ...extras];
  }, [roundSnapshotData]);

  const stanceRoundRows = useMemo(
    () =>
      roundSnapshotData.map((entry) => {
        const counts = {};
        stanceCategories.forEach((stance) => {
          counts[stance] = entry.stanceCounts[stance] || 0;
        });
        const total = Object.values(counts).reduce((sum, val) => sum + val, 0);
        return { round: entry.round, counts, total };
      }),
    [roundSnapshotData, stanceCategories]
  );

  const actionCategories = useMemo(() => {
    if (actionOptions.length) return actionOptions.filter((action) => !shouldHideActionType(action));
    const actionSet = new Set();
    filteredRuns.forEach((run) => {
      (run.actions || []).forEach((action) => {
        if (action.type && !shouldHideActionType(action.type)) actionSet.add(action.type);
      });
    });
    return Array.from(actionSet).sort();
  }, [actionOptions, filteredRuns]);

  const actionRoundRows = useMemo(() => {
    const roundMap = new Map();
    filteredRuns.forEach((run) => {
      (run.actions || []).forEach((action) => {
        if (shouldHideActionType(action.type)) return;
        const absoluteRound = getAbsoluteRound(action.round, action.era);
        if (!absoluteRound) return;
        const entry = roundMap.get(absoluteRound) || { round: absoluteRound, counts: {} };
        const actionType = action.type || "unknown";
        entry.counts[actionType] = (entry.counts[actionType] || 0) + 1;
        roundMap.set(absoluteRound, entry);
      });
    });
    return Array.from(roundMap.values())
      .sort((a, b) => a.round - b.round)
      .map((entry) => {
        const counts = {};
        actionCategories.forEach((action) => {
          counts[action] = entry.counts[action] || 0;
        });
        const total = Object.values(counts).reduce((sum, val) => sum + val, 0);
        return { round: entry.round, counts, total };
      });
  }, [filteredRuns, actionCategories]);
  const actionRoundRowsFiltered = useMemo(
    () => filterByRoundView(actionRoundRows),
    [actionRoundRows, roundView]
  );

  const threatDefeatData = useMemo(() => {
    const roundMap = new Map();
    const totals = {};
    const roundRunCounts = {};
    filteredRuns.forEach((run) => {
      let maxRound = 0;
      (run.actions || []).forEach((action) => {
        const actionRound = getAbsoluteRound(action.round, action.era);
        if (actionRound > maxRound) maxRound = actionRound;
        if (action.type !== "fight") return;
        const status = action.status || "ok";
        if (status !== "ok") return;
        const payload = action.payload && typeof action.payload === "object" ? action.payload : {};
        const threatId = payload?.threat_id;
        if (!threatId) return;
        const round = actionRound;
        if (!round) return;
        const entry = roundMap.get(round) || { round, counts: {} };
        entry.counts[threatId] = (entry.counts[threatId] || 0) + 1;
        roundMap.set(round, entry);
        totals[threatId] = (totals[threatId] || 0) + 1;
      });
      if (maxRound) {
        for (let round = 1; round <= maxRound; round += 1) {
          roundRunCounts[round] = (roundRunCounts[round] || 0) + 1;
        }
      }
    });
    const rounds = Array.from(roundMap.values()).sort((a, b) => a.round - b.round);
    const threatIds = Object.keys(totals).sort((a, b) => (totals[b] || 0) - (totals[a] || 0));
    return { rounds, totals, threatIds, roundRunCounts };
  }, [filteredRuns]);

  const balancePlot = useMemo(() => {
    const plotCards = filteredBalanceCards.filter(
      (card) => card.timesOffered > 0 && Number.isFinite(card.winRateAdded)
    );
    const pickRates = plotCards.map((card) => card.pickRate);
    const medianPickRate = medianValue(pickRates);
    const maxAbsWra = plotCards.reduce(
      (acc, card) => Math.max(acc, Math.abs(card.winRateAdded)),
      0
    );
    return {
      plotCards,
      medianPickRate,
      maxAbsWra: Math.max(0.05, maxAbsWra || 0),
    };
  }, [filteredBalanceCards]);

  const threatIndex = activeResult?.threat_index || {};
  const threatOptions = useMemo(
    () =>
      (threatDefeatData.threatIds || []).map((id) => ({
        id,
        label: threatIndex[id] || id,
        total: threatDefeatData.totals?.[id] || 0,
      })),
    [threatDefeatData, threatIndex]
  );

  useEffect(() => {
    if (!threatFilter) return;
    if (!threatOptions.some((entry) => entry.id === threatFilter)) {
      setThreatFilter("");
    }
  }, [threatFilter, threatOptions]);

  const threatRoundRows = useMemo(() => {
    const rows = (threatDefeatData.rounds || []).map((entry) => {
      const runsInRound =
        threatDefeatData.roundRunCounts?.[entry.round] || filteredRuns.length || 1;
      if (!threatFilter) {
        const count = Object.values(entry.counts || {}).reduce((sum, val) => sum + val, 0);
        const avgCount = runsInRound ? count / runsInRound : 0;
        return { round: entry.round, count: avgCount, rawCount: count, runsInRound };
      }
      const count = entry.counts?.[threatFilter] || 0;
      const avgCount = runsInRound ? count / runsInRound : 0;
      return { round: entry.round, count: avgCount, rawCount: count, runsInRound };
    });
    const total = rows.reduce((sum, row) => sum + row.count, 0);
    return { total, rows };
  }, [filteredRuns.length, threatDefeatData, threatFilter]);
  const threatRoundRowsFiltered = useMemo(() => {
    const rows = filterByRoundView(threatRoundRows.rows);
    const total = rows.reduce((sum, row) => sum + row.count, 0);
    return { rows, total };
  }, [roundView, threatRoundRows]);

  const stanceRoundRowsFiltered = useMemo(
    () => filterByRoundView(stanceRoundRows),
    [stanceRoundRows, roundView]
  );

  const roundViewCount = useMemo(
    () => filterByRoundView(roundSnapshotData).length,
    [roundSnapshotData, roundView]
  );

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

  const players = activeResult?.players || [];
  const filteredRunCount = filteredRuns.length;
  const activeStoredMeta = useMemo(
    () => resultsLibrary.find((entry) => entry.id === activeResultId) || null,
    [resultsLibrary, activeResultId]
  );
  const chartWidth = 720;
  const chartHeight = 360;
  const chartPadding = { top: 24, right: 24, bottom: 40, left: 56 };
  const plotWidth = chartWidth - chartPadding.left - chartPadding.right;
  const plotHeight = chartHeight - chartPadding.top - chartPadding.bottom;
  const wraRange = balancePlot.maxAbsWra || 0.05;
  const xScale = (value) => chartPadding.left + clampValue(value, 0, 1) * plotWidth;
  const yScale = (value) => {
    const clamped = clampValue(value, -wraRange, wraRange);
    return chartPadding.top + ((wraRange - clamped) / (wraRange * 2)) * plotHeight;
  };

  const renderLegend = (items, colorFn) => (
    <div className="flex flex-wrap gap-3 text-[11px] text-gray-400">
      {items.map((item, idx) => (
        <div key={item} className="flex items-center gap-1">
          <span
            className="h-2 w-2 rounded-sm"
            style={{ backgroundColor: colorFn(item, idx) }}
          />
          <span>{item}</span>
        </div>
      ))}
    </div>
  );

  const renderStackedRows = (rows, categories, colorFn) => (
    <div className="space-y-2">
      {rows.map((row) => {
        const total = row.total ?? Object.values(row.counts || {}).reduce((sum, val) => sum + val, 0);
        const { label, isNight, isBoss } = formatRoundLabel(row.round);
        const labelClass = isBoss
          ? "text-amber-300"
          : isNight
            ? "text-fuchsia-300"
            : "text-sky-300";
        return (
          <div key={row.round} className="grid grid-cols-[42px_1fr_auto] items-center gap-2">
            <div className={`text-[11px] ${labelClass}`}>{label}</div>
            <div className="flex h-3 w-full overflow-hidden rounded bg-gray-900/60 border border-gray-800">
              {categories.map((cat, idx) => {
                const count = row.counts?.[cat] || 0;
                if (!count || !total) return null;
                const pct = (count / total) * 100;
                return (
                  <div
                    key={`${row.round}-${cat}`}
                    className="h-full"
                    style={{ width: `${pct}%`, backgroundColor: colorFn(cat, idx) }}
                    title={`${cat}: ${count} (${formatPercent(count / total)})`}
                  />
                );
              })}
            </div>
            <div className="text-[10px] text-gray-500">{total}</div>
          </div>
        );
      })}
    </div>
  );

  const renderSingleRows = (rows, total, color, options = {}) => (
    <div className="space-y-2">
      {rows.map((row) => {
        const pct = total ? row.count / total : 0;
        const { label, isNight, isBoss } = formatRoundLabel(row.round);
        const labelClass = isBoss
          ? "text-amber-300"
          : isNight
            ? "text-fuchsia-300"
            : "text-sky-300";
        const valueText = options.valueFormatter ? options.valueFormatter(row) : row.count;
        const titleText = options.titleFormatter
          ? options.titleFormatter(row, pct)
          : `${row.count} (${formatPercent(pct)})`;
        return (
          <div key={row.round} className="grid grid-cols-[42px_1fr_auto] items-center gap-2">
            <div className={`text-[11px] ${labelClass}`}>{label}</div>
            <div className="flex h-3 w-full overflow-hidden rounded bg-gray-900/60 border border-gray-800">
              <div
                className="h-full"
                style={{ width: `${pct * 100}%`, backgroundColor: color }}
                title={titleText}
              />
            </div>
            <div className="text-[10px] text-gray-500">{valueText}</div>
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="space-y-6">
      {!hideLibrary && (
        <div className="bg-gray-800 border border-gray-700 rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-gray-100">Results Library</h2>
            <div className="flex items-center gap-3">
              {isLibraryLoading && <LoadingIndicator label="Loading..." />}
              <span className="text-xs text-gray-400">Saved: {resultsLibrary.length}</span>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-gray-300">
            <label className="flex flex-col gap-2">
              Saved results
              <select
                value={activeResultSource === "stored" ? activeResultId : ""}
                onChange={(event) => {
                  const value = event.target.value;
                  if (!value) {
                    setActiveResult(null);
                    setActiveResultId("");
                    setActiveResultSource("none");
                    return;
                  }
                  setActiveResult(null);
                  setActiveResultId(value);
                  setActiveResultSource("stored");
                  loadStoredResult(value, "stored").catch((err) =>
                    setLibraryError(err?.message || "Failed to load saved result.")
                  );
                }}
                className="px-3 py-2 rounded-md bg-gray-900 border border-gray-700 text-gray-100"
              >
                <option value="">Select a saved run</option>
                {resultsLibrary.map((entry) => (
                  <option key={entry.id} value={entry.id}>
                    {entry.created_at} - {entry.label || entry.id}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex items-end gap-2">
              <button
                type="button"
                onClick={() => {
                  refreshResultsLibrary().catch((err) => {
                    setLibraryError(err?.message || "Failed to refresh saved results.");
                  });
                }}
                className="px-3 py-2 rounded-md border border-gray-600 text-gray-200 hover:border-orange-400 text-sm"
              >
                Refresh
              </button>
              <button
                type="button"
                disabled={!activeResult || activeResultSource !== "stored"}
                onClick={handleDownloadStored}
                className="px-3 py-2 rounded-md border border-gray-600 text-gray-200 hover:border-orange-400 text-sm disabled:opacity-60"
              >
                Download JSON
              </button>
              <button
                type="button"
                disabled={!activeResult || activeResultSource !== "stored"}
                onClick={handleDeleteStoredResult}
                className="px-3 py-2 rounded-md border border-rose-500/70 text-rose-200 hover:border-rose-400 text-sm disabled:opacity-60"
              >
                Delete
              </button>
              <button
                type="button"
                disabled={!activeResult}
                onClick={handleExportCsv}
                className="px-3 py-2 rounded-md border border-gray-600 text-gray-200 hover:border-orange-400 text-sm disabled:opacity-60"
              >
                Export CSV
              </button>
            </div>
            <label className="flex flex-col gap-2">
              Upload CSV
              <input
                type="file"
                accept=".csv"
                onChange={handleCsvUpload}
                className="px-3 py-2 rounded-md bg-gray-900 border border-gray-700 text-gray-100"
              />
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-xs text-gray-400">
            <span>
              Active:{" "}
              {activeResultSource === "upload"
                ? `CSV (${uploadName || "uploaded"})`
                : activeResultSource === "stored"
                  ? `Saved result ${activeStoredMeta?.label || activeResultId}`
                  : "None"}
            </span>
            {isResultLoading && <LoadingIndicator label="Loading simulation..." />}
            {libraryError && <span className="text-rose-300">{libraryError}</span>}
            {uploadError && <span className="text-rose-300">{uploadError}</span>}
          </div>
        </div>
      )}

      {activeResult && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setActiveTab("overview")}
              className={`px-3 py-2 rounded-md border text-sm ${
                activeTab === "overview"
                  ? "border-orange-400 bg-orange-500/10 text-gray-100"
                  : "border-gray-700 text-gray-300 hover:border-gray-500"
              }`}
            >
              Overview
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("balance")}
              className={`px-3 py-2 rounded-md border text-sm ${
                activeTab === "balance"
                  ? "border-orange-400 bg-orange-500/10 text-gray-100"
                  : "border-gray-700 text-gray-300 hover:border-gray-500"
              }`}
            >
              Balance Matrix
            </button>
            <span className="text-xs text-gray-500">
              Baseline win rate: {formatPercent(baselineRate)}
            </span>
          </div>

          {activeTab === "overview" ? (
            <div className="space-y-6">
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
              <section className="xl:col-span-1 space-y-4">
                <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-gray-100">Summary</h2>
                    <span className="text-xs text-gray-400">
                      {activeResult.duration_ms ? `${activeResult.duration_ms}ms` : ""}
                    </span>
                  </div>
                  <div className="text-sm text-gray-300 space-y-1">
                    <div>Runs: {activeResult.simulations}</div>
                    <div>Filtered: {filteredRunCount}</div>
                    <div>
                      {botCountLabel}: {playerCount || activeResult.bot_count}
                    </div>
                  </div>
                </div>

                <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 space-y-3">
                  <h3 className="text-sm font-semibold text-gray-200 uppercase tracking-wide">Wins</h3>
                  <div className="space-y-2 text-sm text-gray-300">
                    {players.length ? (
                      players.map((player) => {
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
                      })
                    ) : (
                      <div className="text-gray-500">No player data.</div>
                    )}
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
                  <h3 className="text-sm font-semibold text-gray-200 uppercase tracking-wide">Card Activity</h3>
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
                        {filteredRunCount} / {activeResult.runs?.length || 0}
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
                              Actions {run.total_actions} - {run.ended_reason}
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
                                  #{action.index} {action.player_name} - {action.type}
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
                                <div className="text-xs text-gray-500 mt-1">
                                  Payload: {formatPayload(action.payload)}
                                </div>
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

              <section className="bg-gray-800 border border-gray-700 rounded-lg p-5 space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-gray-100">Round Distributions</h2>
                    <p className="text-xs text-gray-400">Normalized per round across filtered runs.</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-gray-400">
                    <div className="flex items-center gap-2">
                      <span>Round view</span>
                      <div className="flex rounded-md border border-gray-700 overflow-hidden">
                        {[
                          { value: "all", label: "All" },
                          { value: "day", label: "Day" },
                          { value: "night", label: "Night" },
                        ].map((option) => (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => setRoundView(option.value)}
                            className={`px-2 py-1 text-[10px] uppercase tracking-wide ${
                              roundView === option.value
                                ? "bg-orange-500/20 text-orange-200"
                                : "text-gray-400 hover:text-gray-200"
                            }`}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      Rounds tracked: {roundViewCount} / {roundSnapshotData.length || 0}
                    </div>
                    <div className="text-[10px] text-gray-500">DB/NB = boss round.</div>
                  </div>
                </div>

                {roundSnapshotData.length ? (
                  <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                    <div className="bg-gray-900/40 border border-gray-700 rounded-lg p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-gray-200 uppercase tracking-wide">
                          VP Distribution
                        </h3>
                        <span className="text-[10px] text-gray-500">Bin size {vpBins.binSize}</span>
                      </div>
                      {vpBins.bins.length ? renderLegend(vpBins.bins.map((bin) => bin.label), (_, idx) => colorForIndex(idx, vpBins.bins.length, 20)) : null}
                      {roundView === "all" ? (
                        <div className="space-y-3">
                          {vpDayRows.length ? (
                            <div className="space-y-2">
                              <div className="text-[10px] uppercase tracking-wide text-sky-300">Day Rounds</div>
                              {renderStackedRows(
                                vpDayRows,
                                vpBins.bins.map((bin) => bin.label),
                                (_, idx) => colorForIndex(idx, vpBins.bins.length, 20)
                              )}
                            </div>
                          ) : null}
                          {vpNightRows.length ? (
                            <div className="space-y-2">
                              <div className="text-[10px] uppercase tracking-wide text-fuchsia-300">
                                Night Rounds
                              </div>
                              {renderStackedRows(
                                vpNightRows,
                                vpBins.bins.map((bin) => bin.label),
                                (_, idx) => colorForIndex(idx, vpBins.bins.length, 20)
                              )}
                            </div>
                          ) : null}
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div
                            className={`text-[10px] uppercase tracking-wide ${
                              roundView === "day" ? "text-sky-300" : "text-fuchsia-300"
                            }`}
                          >
                            {roundView === "day" ? "Day Rounds" : "Night Rounds"}
                          </div>
                          {renderStackedRows(
                            vpRoundRowsFiltered,
                            vpBins.bins.map((bin) => bin.label),
                            (_, idx) => colorForIndex(idx, vpBins.bins.length, 20)
                          )}
                        </div>
                      )}
                    </div>

                    <div className="bg-gray-900/40 border border-gray-700 rounded-lg p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold text-gray-200 uppercase tracking-wide">
                          Wounds Distribution
                        </h3>
                        <span className="text-[10px] text-gray-500">Bin size {woundBins.binSize}</span>
                      </div>
                      {woundBins.bins.length ? renderLegend(woundBins.bins.map((bin) => bin.label), (_, idx) => colorForIndex(idx, woundBins.bins.length, 200)) : null}
                      {renderStackedRows(
                        woundRoundRowsFiltered,
                        woundBins.bins.map((bin) => bin.label),
                        (_, idx) => colorForIndex(idx, woundBins.bins.length, 200)
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-gray-400">
                    Round snapshots are not available for this result. Re-run simulations to enable per-round stats.
                  </div>
                )}

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  <div className="bg-gray-900/40 border border-gray-700 rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-gray-200 uppercase tracking-wide">
                        Action Distribution per Round
                      </h3>
                      <span className="text-[10px] text-gray-500">Normalized</span>
                    </div>
                    <p className="text-[10px] text-gray-500">End turn is excluded.</p>
                    {actionRoundRowsFiltered.length ? (
                      <>
                        {renderLegend(actionCategories, (_, idx) => colorForIndex(idx, actionCategories.length, 140))}
                        {renderStackedRows(
                          actionRoundRowsFiltered,
                          actionCategories,
                          (_, idx) => colorForIndex(idx, actionCategories.length, 140)
                        )}
                      </>
                    ) : (
                      <div className="text-sm text-gray-400">No actions recorded for current filters.</div>
                    )}
                  </div>

                  <div className="bg-gray-900/40 border border-gray-700 rounded-lg p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold text-gray-200 uppercase tracking-wide">
                        Stance Distribution per Round
                      </h3>
                      <span className="text-[10px] text-gray-500">Normalized</span>
                    </div>
                    {stanceRoundRowsFiltered.length ? (
                      <>
                        {renderLegend(stanceCategories, (_, idx) => colorForIndex(idx, stanceCategories.length, 300))}
                        {renderStackedRows(
                          stanceRoundRowsFiltered,
                          stanceCategories,
                          (_, idx) => colorForIndex(idx, stanceCategories.length, 300)
                        )}
                      </>
                    ) : (
                      <div className="text-sm text-gray-400">
                        No stance snapshots available for current filters.
                      </div>
                    )}
                  </div>
                </div>

                <div className="bg-gray-900/40 border border-gray-700 rounded-lg p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-gray-200 uppercase tracking-wide">
                        Threat Defeats per Round
                      </h3>
                      <p className="text-xs text-gray-500">
                        Filter to view the marginal distribution for a specific threat. Values show average
                        defeats per run.
                      </p>
                    </div>
                    <label className="text-xs text-gray-400 flex flex-col gap-1">
                      Threat
                      <select
                        value={threatFilter}
                        onChange={(event) => setThreatFilter(event.target.value)}
                        className="px-2 py-1 rounded-md bg-gray-900 border border-gray-700 text-gray-100 text-xs"
                      >
                        <option value="">All threats</option>
                        {threatOptions.map((threat) => (
                          <option key={threat.id} value={threat.id}>
                            {threat.label} ({threat.total})
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {threatRoundRowsFiltered.rows.length ? (
                    renderSingleRows(threatRoundRowsFiltered.rows, threatRoundRowsFiltered.total, "hsl(18, 80%, 50%)", {
                      valueFormatter: (row) => row.count.toFixed(1),
                      titleFormatter: (row, pct) =>
                        `Avg ${row.count.toFixed(1)} (${row.rawCount} total / ${row.runsInRound} runs, ${formatPercent(pct)})`,
                    })
                  ) : (
                    <div className="text-sm text-gray-400">
                      No threat defeats recorded for current filters.
                    </div>
                  )}
                </div>
              </section>
            </div>
          ) : (
            <section className="bg-gray-800 border border-gray-700 rounded-lg p-5 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-gray-100">Balance Matrix</h2>
                  <p className="text-xs text-gray-400">
                    Pick rate vs win rate added, normalized by market appearances and ownership.
                  </p>
                </div>
                <div className="text-xs text-gray-400">
                  Cards tracked: {filteredBalanceCards.length || 0}
                </div>
              </div>

              {!filteredBalanceCards.length ? (
                <div className="text-sm text-gray-400">
                  No balance data available yet. Run a new simulation to populate card stats.
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    <div className="lg:col-span-2 bg-gray-900/40 border border-gray-700 rounded-lg p-3">
                      <svg
                        viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                        className="w-full h-auto"
                        role="img"
                        aria-label="Balance matrix scatter plot"
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
                          x1={xScale(balancePlot.medianPickRate)}
                          x2={xScale(balancePlot.medianPickRate)}
                          y1={chartPadding.top}
                          y2={chartPadding.top + plotHeight}
                          stroke="rgba(148, 163, 184, 0.5)"
                          strokeDasharray="4 4"
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
                          Pick Rate ->
                        </text>
                        <text
                          x={chartPadding.left - 36}
                          y={chartPadding.top - 8}
                          fill="rgba(156, 163, 175, 1)"
                          fontSize="12"
                        >
                          Win Rate Added
                        </text>
                        {balancePlot.plotCards.map((card) => {
                          const highPick = card.pickRate >= balancePlot.medianPickRate;
                          const highWin = card.winRateAdded >= 0;
                          let color = "#94a3b8";
                          if (highPick && highWin) color = "#f97316";
                          if (!highPick && highWin) color = "#22c55e";
                          if (highPick && !highWin) color = "#facc15";
                          if (!highPick && !highWin) color = "#64748b";
                          return (
                            <circle
                              key={card.name}
                              cx={xScale(card.pickRate)}
                              cy={yScale(card.winRateAdded)}
                              r={hoveredCard?.name === card.name ? 6 : 4}
                              fill={color}
                              opacity="0.9"
                              onMouseEnter={() => setHoveredCard(card)}
                              onMouseLeave={() => setHoveredCard(null)}
                            />
                          );
                        })}
                      </svg>
                    </div>
                    <div className="space-y-3 text-sm text-gray-300">
                      <div className="space-y-1">
                        <div className="text-xs uppercase tracking-wide text-gray-400">Quadrants</div>
                        <div className="flex items-center justify-between">
                          <span className="text-orange-400">Overpowered</span>
                          <span className="text-xs text-gray-400">High pick / High win</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-emerald-400">Sleeper</span>
                          <span className="text-xs text-gray-400">Low pick / High win</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-yellow-300">Trap</span>
                          <span className="text-xs text-gray-400">High pick / Low win</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-slate-400">Underpowered</span>
                          <span className="text-xs text-gray-400">Low pick / Low win</span>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="text-xs uppercase tracking-wide text-gray-400">Hover details</div>
                        {hoveredCard ? (
                          <div className="border border-gray-700 rounded-md p-3 bg-gray-900/60">
                            <div className="font-semibold text-gray-100">
                              {hoveredCard.kind ? `${hoveredCard.kind} - ` : ""}
                              {hoveredCard.name}
                            </div>
                            <div className="text-xs text-gray-400 mt-1">
                              Pick rate {formatPercent(hoveredCard.pickRate)}
                            </div>
                            <div className="text-xs text-gray-400">
                              Win rate added {formatSignedPercent(hoveredCard.winRateAdded)}
                            </div>
                            <div className="text-xs text-gray-400">
                              Timing-weighted {formatSignedPercent(hoveredCard.winRateAddedWeighted)}
                            </div>
                            <div className="text-xs text-gray-400">
                              Win rate when owned {formatPercent(hoveredCard.winRateOwned)}
                            </div>
                            <div className="text-xs text-gray-400">
                              Bought {hoveredCard.timesBought} / Offered {hoveredCard.timesOffered}
                            </div>
                          </div>
                        ) : (
                          <div className="text-xs text-gray-500">Hover a dot to inspect a card.</div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="border border-gray-700 rounded-lg overflow-auto">
                    <table className="min-w-full text-sm text-gray-300">
                      <thead className="bg-gray-900/60 text-xs uppercase tracking-wide text-gray-400">
                        <tr>
                          <th className="px-3 py-2 text-left">Card</th>
                          <th className="px-3 py-2 text-left">Pick Rate</th>
                          <th className="px-3 py-2 text-left">Win Rate Added</th>
                          <th className="px-3 py-2 text-left">Timed WRA</th>
                          <th className="px-3 py-2 text-left">Activation Eff.</th>
                          <th className="px-3 py-2 text-left">Avg Buy Turn</th>
                          <th className="px-3 py-2 text-left">Avg Retention</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredBalanceCards.map((card) => (
                          <tr key={`row-${card.name}`} className="border-t border-gray-800">
                            <td className="px-3 py-2 whitespace-nowrap">
                              <span className="text-gray-100">{card.name}</span>
                              {card.kind && <span className="text-xs text-gray-500 ml-2">{card.kind}</span>}
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap">
                              {formatPercent(card.pickRate)}
                              <span className="text-xs text-gray-500 ml-2">
                                {card.timesBought}/{card.timesOffered}
                              </span>
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap">{formatSignedPercent(card.winRateAdded)}</td>
                            <td className="px-3 py-2 whitespace-nowrap">
                              {formatSignedPercent(card.winRateAddedWeighted)}
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap">{formatPercent(card.activationEfficiency)}</td>
                            <td className="px-3 py-2 whitespace-nowrap">
                              {card.avgBuyTurn !== null ? card.avgBuyTurn.toFixed(1) : "--"}
                            </td>
                            <td className="px-3 py-2 whitespace-nowrap">
                              {card.avgRetention !== null ? card.avgRetention.toFixed(1) : "--"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </section>
          )}
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
                        #{action.index} {action.player_name} - {action.type}
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
                      <div className="text-xs text-gray-500 mt-1">
                        Payload: {formatPayload(action.payload)}
                      </div>
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

export default BotSimulationResultsPanel;
