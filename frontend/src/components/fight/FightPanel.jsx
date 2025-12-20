import React, { useEffect, useMemo, useState } from "react";
import { X, Swords, Flame, Zap, Shield } from "lucide-react";
import ferocityToken from "../../images/icons/ferocity-token.png";
import conversionToken from "../../images/icons/conversion-token.png";
import massToken from "../../images/icons/mass-token.png";
import wildToken from "../../images/icons/wild-token.png";
import { useStore } from "../../store";
import { getThreatImage } from "../../utils/threatImages";

const RESOURCE_KEYS = ["R", "B", "G"];

const normalizeResourceMap = (cost = {}) => ({
  R: Number(
    cost.R ??
      cost.r ??
      cost.RED ??
      cost.red ??
      cost.Red ??
      0
  ) || 0,
  B: Number(cost.B ?? cost.b ?? cost.BLUE ?? cost.blue ?? cost.Blue ?? 0) || 0,
  G: Number(cost.G ?? cost.g ?? cost.GREEN ?? cost.green ?? cost.Green ?? 0) || 0,
});

const sumValues = (obj) => RESOURCE_KEYS.reduce((acc, key) => acc + (obj[key] || 0), 0);
const shallowEqualResources = (a = {}, b = {}) =>
  RESOURCE_KEYS.every((k) => Number(a[k] || 0) === Number(b[k] || 0));

const cardId = (card) => card?.id || card?.name || "unknown";
const iconFor = (k) => {
  if (k === "R") return <Flame size={14} className="text-red-400" />;
  if (k === "B") return <Zap size={14} className="text-blue-400" />;
  if (k === "G") return <Shield size={14} className="text-green-400" />;
  return k;
};

export default function FightPanel({
  threat,
  rowIndex,
  player,
  gameId,
  onClose,
  onSubmit,
  attackUsed,
  setAttackUsed,
  wildAllocation,
  setWildAllocation,
  playedUpgrades,
  setPlayedUpgrades,
  playedWeapons,
  setPlayedWeapons,
  onResourcePreview,
  onMissingPreview,
}) {
  const httpGameRequest = useStore((state) => state.httpGameRequest);

  const [preview, setPreview] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [precisionChoice, setPrecisionChoice] = useState(null);
  const isBossFight = !!(threat && (threat.boss_threshold !== undefined && threat.boss_threshold !== null));

  const tokenCount = (type) => {
    if (!player?.tokens) return 0;
    return (
      player.tokens[type] ??
      player.tokens[type?.toUpperCase?.()] ??
      player.tokens[type?.toLowerCase?.()] ??
      0
    );
  };

  const availableAttack = tokenCount("attack");
  const availableWild = tokenCount("wild");
  const availableMass = tokenCount("mass");
  const attackValue = attackUsed || 0;
  const wildAlloc = wildAllocation || { R: 0, B: 0, G: 0 };
  const threatWeight = Number(threat?.weight || 0);
  const enrageTokens = Number(threat?.enrage_tokens || 0);
  const tokenImages = {
    attack: ferocityToken,
    conversion: conversionToken,
    mass: massToken,
    wild: wildToken,
  };
  const threatImage = getThreatImage(threat?.image);

  useEffect(() => {
    if (!setAttackUsed || !setWildAllocation) return;
    setAttackUsed((prev) => {
      const next = Math.min(prev || 0, availableAttack);
      return next === prev ? prev : next;
    });
    const allocated = sumValues(wildAlloc);
    if (allocated > availableWild) {
      let toRemove = allocated - availableWild;
      const next = { ...(wildAlloc || {}) };
      RESOURCE_KEYS.forEach((key) => {
        if (toRemove > 0 && next[key] > 0) {
          const remove = Math.min(next[key], toRemove);
          next[key] -= remove;
          toRemove -= remove;
        }
      });
      if (JSON.stringify(next) !== JSON.stringify(wildAlloc)) {
        setWildAllocation(next);
      }
    }
  }, [availableAttack, availableWild, wildAlloc, setAttackUsed, setWildAllocation]);

  const baseCost = useMemo(() => {
    const base = normalizeResourceMap(threat?.cost);
    if (threatWeight > 0) {
      base.G = (base.G || 0) + threatWeight;
    }
    return base;
  }, [threat?.cost, threatWeight]);
  const playerResources = useMemo(
    () => normalizeResourceMap(player?.resources),
    [player?.resources]
  );

  const safePlayedUpgrades = playedUpgrades || new Set();
  const safePlayedWeapons = playedWeapons || new Set();

  const playedUpgradesKey = useMemo(
    () => Array.from(safePlayedUpgrades).sort().join("|"),
    [safePlayedUpgrades]
  );
  const playedWeaponsKey = useMemo(
    () => Array.from(safePlayedWeapons).sort().join("|"),
    [safePlayedWeapons]
  );

  const resolveCard = (entry) => {
    if (!entry) return null;
    if (typeof entry === "string") return { id: entry, name: entry };
    return entry;
  };

  const upgradeCards = (player?.upgrades || []).map(resolveCard).filter(Boolean);
  const weaponCards = (player?.weapons || []).map(resolveCard).filter(Boolean);
  const hasPrecisionChoice = useMemo(() => {
    if (!player || player.stance !== "BALANCED") return false;
    return (upgradeCards || []).some((card) =>
      (card?.tags || []).some((t) => String(t || "").startsWith("fight:cost_reduction:stance"))
    );
  }, [player, upgradeCards]);

  useEffect(() => {
    if (!hasPrecisionChoice) {
      setPrecisionChoice(null);
      return;
    }
    if (!precisionChoice) {
      const ranked = Object.entries(baseCost).sort((a, b) => (b[1] || 0) - (a[1] || 0));
      setPrecisionChoice(ranked[0]?.[0] || "R");
    }
  }, [hasPrecisionChoice, baseCost, precisionChoice]);

  useEffect(() => {
    if (!gameId || !threat || !httpGameRequest) return;
    let cancelled = false;
    setIsLoading(true);
    setError(null);

    const payload = {
      row: rowIndex,
      threat_id: threat?.id,
      use_tokens: {
        attack: attackValue,
        wild_allocation: wildAlloc,
      },
      played_upgrades: Array.from(safePlayedUpgrades),
      played_weapons: Array.from(safePlayedWeapons),
    };
    if (isBossFight && threat?.boss_threshold !== undefined) {
      payload.boss_threshold = threat.boss_threshold;
    }
    if (hasPrecisionChoice && precisionChoice) {
      payload.stance_choice = precisionChoice;
    }

    httpGameRequest(gameId, "preview_fight", "POST", payload)
      .then((res) => {
        if (cancelled) return;
        if (!res || res.error) {
          setError(res?.error || "Preview failed.");
          setPreview(null);
        } else {
          setPreview(res);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err?.message || "Preview failed.");
          setPreview(null);
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    attackValue,
    gameId,
    httpGameRequest,
    playedUpgradesKey,
    playedWeaponsKey,
    rowIndex,
    threat?.id,
    threat?.boss_threshold,
    wildAlloc,
    hasPrecisionChoice,
    precisionChoice,
  ]);

  const adjustedCost = useMemo(
    () => normalizeResourceMap(preview?.adjusted_cost || baseCost),
    [preview?.adjusted_cost, baseCost]
  );

  const autoPayment = useMemo(() => {
    const payment = { R: 0, B: 0, G: 0 };
    RESOURCE_KEYS.forEach((key) => {
      const need = Math.max(0, adjustedCost[key] || 0);
      const available = Math.max(0, playerResources[key] || 0);
      payment[key] = Math.min(need, available);
    });
    return payment;
  }, [adjustedCost, playerResources]);

  const lastPaymentRef = React.useRef(autoPayment);
  useEffect(() => {
    if (!onResourcePreview) return;
    if (shallowEqualResources(lastPaymentRef.current, autoPayment)) return;
    lastPaymentRef.current = autoPayment;
    onResourcePreview(autoPayment);
  }, [autoPayment, onResourcePreview]);

  const missingCost = useMemo(() => {
    const missing = { R: 0, B: 0, G: 0 };
    RESOURCE_KEYS.forEach((key) => {
      const need = Math.max(0, adjustedCost[key] || 0);
      const staged = autoPayment[key] || 0;
      missing[key] = Math.max(0, need - staged);
    });
    return missing;
  }, [adjustedCost, autoPayment]);

  const fullyPaid = useMemo(
    () => RESOURCE_KEYS.every((key) => (missingCost[key] || 0) === 0),
    [missingCost]
  );
  const canConfirm = fullyPaid && !isLoading && !error;

  const wildRemaining = Math.max(0, availableWild - sumValues(wildAlloc));

  const toggleUpgrade = (id) => {
    setPlayedUpgrades((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleWeapon = (id) => {
    setPlayedWeapons((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const adjustWild = (key, delta) => {
    setWildAllocation((prev) => {
      const base = prev || { R: 0, B: 0, G: 0 };
      const next = { ...base };
      const total = sumValues(base);
      if (delta > 0 && total >= availableWild) return prev;
      next[key] = Math.max(0, (next[key] || 0) + delta);
      if (sumValues(next) > availableWild) return prev;
      return next;
    });
  };

  const handleSubmit = () => {
    const payload = {
      row: rowIndex,
      threat_id: threat?.id,
      use_tokens: {
        attack: attackValue,
        wild_allocation: wildAlloc,
      },
      played_upgrades: Array.from(safePlayedUpgrades),
      played_weapons: Array.from(safePlayedWeapons),
    };
    if (isBossFight && threat?.boss_threshold !== undefined) {
      payload.boss_threshold = threat.boss_threshold;
    }
    if (hasPrecisionChoice && precisionChoice) {
      payload.stance_choice = precisionChoice;
    }
    onSubmit?.(payload);
  };

  const renderCostLine = (label, cost, extraClass = "") => (
    <div className={`flex justify-between text-sm ${extraClass}`}>
      <span className="text-slate-300">{label}</span>
      <span className="font-semibold text-slate-100 flex gap-2 items-center">
        {RESOURCE_KEYS.filter((k) => (cost?.[k] || 0) > 0).map((k) => (
          <span key={k} className="flex items-center gap-1">
            {iconFor(k)}
            <span>{cost?.[k]}</span>
          </span>
        ))}
        {(!cost || Object.values(cost).every((v) => !v)) && <span>0</span>}
      </span>
    </div>
  );

  const remainingResources = useMemo(() => {
    const result = { R: 0, B: 0, G: 0 };
    RESOURCE_KEYS.forEach((key) => {
      const available = playerResources[key] || 0;
      const spent = autoPayment[key] || 0;
      result[key] = Math.max(0, available - spent);
    });
    return result;
  }, [autoPayment, playerResources]);

  const lastMissingRef = React.useRef(missingCost);
  useEffect(() => {
    if (!onMissingPreview) return;
    if (shallowEqualResources(lastMissingRef.current, missingCost)) return;
    lastMissingRef.current = missingCost;
    onMissingPreview(missingCost);
  }, [missingCost, onMissingPreview]);

  const tokenIcon = (colorClass = "bg-slate-300") => (
    <span className={`inline-block w-4 h-4 rounded-full ${colorClass} border border-slate-900`} />
  );
  const chipClass = "px-2 py-1 text-[11px] rounded-md border border-amber-400 text-amber-200 bg-amber-400/10 cursor-grab";

  const TokenRow = ({ label, count, maxCount, chipLabel, onAdd, onRemove, disabled, labelClass = "" }) => {
    const canAdd = !disabled && count < maxCount;
    const img = tokenImages[chipLabel];
    const chipTint =
      chipLabel === "attack"
        ? "border-red-400 text-red-100 bg-red-400/10"
        : chipLabel === "mass"
          ? "border-green-400 text-green-100 bg-green-400/10"
          : "";
    return (
      <div
        className="p-2 rounded-lg border border-slate-800 bg-slate-900/60 flex flex-col gap-1"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          if (disabled) return;
          const type = e.dataTransfer.getData("token_type");
          if (type === chipLabel.toLowerCase()) onAdd?.();
        }}
      >
        <div className="flex items-center gap-2 text-[11px] text-slate-400">
          <span className={labelClass}>{label}</span>
          <span className="text-slate-300">{count} / {maxCount}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            {Array.from({ length: Math.min(count, 3) }).map((_, idx) => (
              <button
                key={`${label}-chip-${idx}`}
                type="button"
                onClick={disabled ? undefined : onRemove}
                className={`px-2 py-1 rounded-md border cursor-grab ${chipTint}`}
                title={disabled ? undefined : "Click to remove"}
              >
                {img ? (
                  <img
                    src={img}
                    alt={`${chipLabel} token`}
                    className="w-6 h-6 rounded-full border border-slate-700"
                  />
                ) : (
                  chipLabel.charAt(0).toUpperCase() + chipLabel.slice(1)
                )}
              </button>
            ))}
          </div>
          {canAdd && (
            <button
              type="button"
              onClick={onAdd}
              className="px-3 py-1 rounded-md border border-slate-700 text-slate-200 hover:bg-slate-800 disabled:opacity-50 text-[11px]"
            >
              +
            </button>
          )}
        </div>
      </div>
    );
  };

  const WildRow = ({ resource }) => {
    const assigned = wildAlloc[resource] || 0;
    const totalAssigned = sumValues(wildAlloc);
    const canAdd = totalAssigned < availableWild && assigned < availableWild;
    const iconMap = {
      R: { Icon: Flame, className: "text-red-400" },
      B: { Icon: Zap, className: "text-blue-400" },
      G: { Icon: Shield, className: "text-green-400" },
    };
    const growth = Math.max(1, 0.8 + assigned * 0.2);
    const { Icon, className } = iconMap[resource] || {};
    return (
      <div
        className="p-2 rounded-lg border border-slate-800 bg-slate-950/60 flex items-center justify-between gap-2"
        style={{ flex: growth }}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (e.dataTransfer.getData("token_type") === "wild") {
            const from = e.dataTransfer.getData("wild_from");
            if (from && from !== resource) {
              moveWild(from, resource);
            } else {
              addWildTo(resource);
            }
          }
        }}
      >
        <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2 text-[11px] text-slate-300">
        <span className="flex items-center gap-1">
          {resource === "R" && tokenImages.attack ? (
            <img src={tokenImages.attack} alt="Wild to Red" className="w-6 h-6 rounded-full border border-slate-700" />
          ) : resource === "B" && tokenImages.conversion ? (
            <img src={tokenImages.conversion} alt="Wild to Blue" className="w-6 h-6 rounded-full border border-slate-700" />
          ) : resource === "G" && tokenImages.mass ? (
            <img src={tokenImages.mass} alt="Wild to Green" className="w-6 h-6 rounded-full border border-slate-700" />
          ) : Icon ? (
            <Icon size={14} className={className} />
          ) : (
            tokenIcon("bg-slate-400")
          )}
        </span>
        <span className="text-slate-200">{assigned} / {availableWild}</span>
      </div>
          <div className="flex gap-1 flex-wrap min-h-[30px]">
            {Array.from({ length: assigned }).map((_, idx) => (
              <div
                key={`${resource}-wild-${idx}`}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData("token_type", "wild");
                  e.dataTransfer.setData("wild_from", resource);
                }}
                onClick={() => removeWildFrom(resource)}
                className={chipClass}
                title="Click or drag to move/remove"
              >
                Wild
              </div>
            ))}
            {canAdd && (
          <button
            type="button"
            onClick={() => addWildTo(resource)}
            className="px-3 py-1 rounded-md border border-slate-700 hover:bg-slate-800 disabled:opacity-50 text-[11px]"
          >
            +
          </button>
        )}
          </div>
        </div>
      </div>
    );
  };

  const addAttack = () => {
    if (attackValue >= availableAttack) return;
    setAttackUsed((v) => Math.min((v || 0) + 1, availableAttack));
  };

  const removeAttack = () => {
    setAttackUsed((v) => Math.max(0, (v || 0) - 1));
  };

  const addWildTo = (key) => {
    setWildAllocation((prevRaw) => {
      const prev = prevRaw || { R: 0, B: 0, G: 0 };
      const total = sumValues(prev);
      if (total >= availableWild) return prev;
      return { ...prev, [key]: (prev[key] || 0) + 1 };
    });
  };

  const removeWildFrom = (key) => {
    setWildAllocation((prevRaw) => {
      const prev = prevRaw || { R: 0, B: 0, G: 0 };
      if ((prev[key] || 0) <= 0) return prev;
      return { ...prev, [key]: Math.max(0, (prev[key] || 0) - 1) };
    });
  };

  const moveWild = (from, to) => {
    if (!from || !to || from === to) return;
    setWildAllocation((prevRaw) => {
      const prev = prevRaw || { R: 0, B: 0, G: 0 };
      if ((prev[from] || 0) <= 0) return prev;
      const next = { ...prev };
      next[from] = Math.max(0, (next[from] || 0) - 1);
      const totalAfterRemoval = sumValues(next);
      if (totalAfterRemoval >= availableWild) {
        // if already at cap, don't add to target
        return next;
      }
      next[to] = (next[to] || 0) + 1;
      return next;
    });
  };

  const defaultWildTarget = () =>
    ["R", "B", "G"].sort((a, b) => (missingCost[b] || 0) - (missingCost[a] || 0))[0] || "R";

  return (
    <div className="w-full h-full bg-slate-950/70 border border-slate-800 rounded-3xl p-4 ">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          {threatImage && (
            <div className="w-12 h-12 rounded-xl overflow-hidden border border-slate-800 bg-slate-900/70">
              <img src={threatImage} alt={threat?.name} className="w-full h-full object-cover" />
            </div>
          )}
          <div>
            <div className="text-[11px] uppercase tracking-[0.3em] text-slate-500">Fight</div>
            <div className="text-xl font-bold text-slate-50 flex items-center gap-2">
              <Swords size={18} className="text-amber-300" />
              {threat?.name}
              <span className="text-sm text-amber-300 font-semibold">{threat?.vp} VP</span>
            </div>
            <div className="text-xs text-slate-400">{threat?.type} • Reward: {threat?.reward}</div>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-2 rounded-full border border-slate-700 text-slate-300 hover:bg-slate-800"
          aria-label="Close fight panel"
        >
          <X size={16} />
        </button>
      </div>

      <div className="mt-4 grid grid-cols-[1fr_1.5fr_0.8fr] gap-4 h-[calc(100%-70px)]">
        <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-3 flex flex-col gap-2 overflow-auto">
            {threatWeight > 0 && (
              <div className="text-[11px] text-amber-200">
                <span className="inline-flex items-center gap-1">
                  Weight +{threatWeight}
                  {iconFor("G")}
                </span>
                : added to Green cost.
              </div>
            )}
            {enrageTokens > 0 && (
              <div className="text-[11px] text-rose-300">
                <span className="inline-flex items-center gap-1">
                  Enraged +{2 * enrageTokens}
                  {iconFor("R")}
                </span>
                : added to Red cost.
              </div>
            )}
            {hasPrecisionChoice && (
              <div className="text-[11px] text-slate-200">
                Precision Optics: choose a color to reduce.
                <div className="flex gap-2 mt-1">
                  {RESOURCE_KEYS.map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setPrecisionChoice(key)}
                      className={`px-2 py-1 rounded-md border text-[11px] flex items-center gap-1 transition ${
                        precisionChoice === key
                          ? "border-emerald-400 text-emerald-200 bg-emerald-900/40"
                          : "border-slate-700 text-slate-300 bg-slate-900/60 hover:border-emerald-300"
                      }`}
                    >
                      {iconFor(key)}
                      <span className="sr-only">{key}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {renderCostLine("Original cost", baseCost, "text-slate-400")}
            {renderCostLine("Adjusted cost", adjustedCost, "text-emerald-300")}
            {Array.isArray(preview?.applied_effects) && preview.applied_effects.length > 0 && (
              <div className="flex flex-wrap gap-2 text-[11px] text-slate-200 mt-1">
                {preview.applied_effects.map((eff, idx) => (
                  <span
                    key={`${eff.kind}-${eff.value}-${eff.context || "any"}-${idx}`}
                    className="px-2 py-1 rounded-lg bg-slate-800 border border-slate-700 flex items-center gap-1"
                  >
                    <span className="text-slate-400">{eff.kind}</span>
                    {eff.value && <span className="font-semibold">{eff.value}</span>}
                    {eff.amount ? <span>-{eff.amount}</span> : null}
                    {eff.context && <span className="text-amber-300 uppercase">{eff.context}</span>}
                    {(eff.source_name || eff.source_id) && (
                      <span className="text-[10px] text-slate-500">(from {eff.source_name || eff.source_id})</span>
                    )}
                  </span>
                ))}
              </div>
            )}
            <div className="pt-1">
              <div className="text-xs text-slate-400 mb-1">Auto-spent from resources</div>
              <div className="flex gap-2">
                {RESOURCE_KEYS.map((key) => (
                  <div
                    key={key}
                    className="flex-1 bg-slate-800/50 border border-slate-700 rounded-lg p-2 text-center"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={(e) => {
                      e.preventDefault();
                      if (e.dataTransfer.getData("token_type") === "wild") {
                        adjustWild(key, 1);
                      }
                    }}
                  >
                    <div className="text-[11px] text-slate-400 flex items-center gap-1 justify-center">
                      {iconFor(key)}
                    </div>
                    <div className="text-sm text-slate-100 font-semibold flex items-center gap-1 justify-center">
                      {autoPayment[key]} / {adjustedCost[key] || 0}
                    </div>
                    {missingCost[key] > 0 && (
                      <div className="text-[11px] text-amber-300 flex items-center gap-1 justify-center">
                        Missing {missingCost[key]}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              {error && <div className="text-xs text-amber-300 mt-2">Preview error: {error}</div>}
              {isLoading && <div className="text-xs text-slate-400 mt-2">Updating preview…</div>}
              {!isLoading && preview?.message && (
                <div className="text-xs text-slate-400 mt-2">{preview.message}</div>
              )}
              {canConfirm && (
                <button
                  type="button"
                  onClick={handleSubmit}
                  className="mt-3 w-full px-3 py-2 rounded-lg border border-emerald-400 bg-emerald-400/10 text-emerald-200 text-[11px] uppercase tracking-[0.15em] hover:bg-emerald-400/20"
                >
                  Confirm Fight
                </button>
              )}
            </div>
        </div>

        <div
          className="bg-slate-950/60 border border-slate-800 rounded-2xl p-3 flex flex-col gap-3 overflow-auto"
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            const type = e.dataTransfer.getData("token_type");
            if (type === "wild") {
              addWildTo(defaultWildTarget());
            } else if (type === "attack") {
              addAttack();
            }
          }}
        >
         <div className="flex justify-between items-center">
            <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Tokens</div>
          </div>

          <div className="grid grid-cols-[1.2fr,0.8fr] gap-2">
            <TokenRow
              label="Ferocity"
              count={attackValue}
              maxCount={availableAttack}
              chipLabel="attack"
              onAdd={addAttack}
              onRemove={removeAttack}
              disabled={false}
              labelClass="text-red-300"
            />
            <TokenRow
              label="Mass"
              count={availableMass}
              maxCount={availableMass}
              chipLabel="mass"
              onAdd={() => {}}
              onRemove={() => {}}
              disabled
              labelClass="text-green-300"
            />
          </div>

          <div className="p-2 rounded-lg border border-slate-800 bg-slate-900/60">
            <div className="flex items-center gap-2 text-[11px] text-slate-400 text-yellow-300">
              <span>Wild</span>
              <span className="text-slate-300">{sumValues(wildAlloc)} / {availableWild}</span>
            </div>
            <div className="mt-2 flex gap-2">
              {RESOURCE_KEYS.map((key) => (
                <WildRow key={key} resource={key} />
              ))}
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              Drag wild chips between rows or from your board; click chip to return it.
            </div>
          </div>
        </div>

        <div className="bg-slate-950/60 border border-slate-800 rounded-2xl p-3 flex flex-col gap-2 overflow-auto">
          <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Play cards</div>
          <div className="flex flex-col gap-2 mt-1">
            <div className="text-[11px] text-slate-400">Weapons</div>
            <div
              className="grid grid-cols-2 gap-2"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const cardType = e.dataTransfer.getData("card_type");
                const cardId = e.dataTransfer.getData("card_id");
                if (cardType === "weapon" && cardId) {
                  toggleWeapon(cardId);
                }
              }}
            >
              {weaponCards.length === 0 && (
                <div className="text-[11px] text-slate-500 col-span-2">No weapons owned.</div>
              )}
              {weaponCards.map((card) => {
                const id = cardId(card);
                const isPlayed = playedWeapons.has(id);
                return (
                  <button
                    key={id}
                    type="button"
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData("card_type", "weapon");
                      e.dataTransfer.setData("card_id", id);
                    }}
                    onClick={() => toggleWeapon(id)}
                    className={`text-left p-2 rounded-lg border ${
                      isPlayed
                        ? "border-emerald-400 bg-emerald-400/10"
                        : "border-slate-800 bg-slate-900/60 hover:border-slate-700"
                    }`}
                  >
                    <div className="text-sm text-slate-100">{card.name}</div>
                    <div className="text-[11px] text-slate-400">{card.effect}</div>
                    {card.uses && (
                      <div className="text-[10px] text-slate-500 mt-1">Uses: {card.uses}</div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        <div className="flex justify-between items-center">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-slate-700 text-slate-200 hover:bg-slate-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canConfirm}
            className={`px-4 py-2 rounded-lg border text-slate-900 font-semibold ${
              canConfirm
                ? "border-emerald-400 bg-emerald-300 hover:bg-emerald-200"
                : "border-slate-700 bg-slate-800 text-slate-300 cursor-not-allowed"
            }`}
          >
            {canConfirm ? "Confirm Fight" : "Pay full cost to confirm"}
          </button>
        </div>
      </div>
      </div>
    </div>
  );
}
