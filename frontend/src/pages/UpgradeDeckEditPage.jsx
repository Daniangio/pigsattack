import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useStore } from "../store";
import EffectTagBuilder, { buildEffectTextFromTags } from "../components/market/EffectTagBuilder";

const apiBase = import.meta.env.VITE_API_URL || "http://localhost:8000";

const numberOrZero = (val) => {
  const parsed = parseInt(val ?? 0, 10);
  return Number.isNaN(parsed) ? 0 : parsed;
};

const makeLocalId = () => `upgrade-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

export default function UpgradeDeckEditPage() {
  const { deckName } = useParams();
  const token = useStore((state) => state.token);
  const navigate = useNavigate();
  const [upgrades, setUpgrades] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const isDefault = deckName === "default";

  const authHeaders = useMemo(
    () => (token ? { Authorization: `Bearer ${token}` } : {}),
    [token]
  );
  const jsonHeaders = useMemo(
    () => ({ ...authHeaders, "Content-Type": "application/json" }),
    [authHeaders]
  );

  useEffect(() => {
    let cancelled = false;
    const loadDeck = async () => {
      try {
        setLoading(true);
        const res = await fetch(`${apiBase}/api/custom/upgrade-decks/${deckName}`, { headers: authHeaders });
        if (!res.ok) throw new Error("Failed to load deck");
        const data = await res.json();
        if (cancelled) return;
        const parseTags = (entry) => {
          if (Array.isArray(entry?.tags)) return entry.tags.filter(Boolean).map((t) => String(t).trim()).filter(Boolean);
          if (typeof entry?.tags === "string") {
            return entry.tags
              .split(",")
              .map((t) => t.trim())
              .filter(Boolean);
          }
          return [];
        };
        setUpgrades((data.upgrades || []).map((c) => ({ ...c, tags: parseTags(c), localId: c.localId || makeLocalId() })));
      } catch (e) {
        if (!cancelled) setError("Unable to load deck");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    loadDeck();
    return () => {
      cancelled = true;
    };
  }, [deckName, authHeaders]);

  const updateUpgrade = (idx, changes) => {
    setUpgrades((prev) => {
      const next = [...prev];
      next[idx] = { ...(next[idx] || {}), ...changes };
      return next;
    });
  };

  const addUpgrade = () => {
    setUpgrades((prev) => [
      ...prev,
      {
        type: "Upgrade",
        name: "New Upgrade",
        cost: { R: 0, B: 0, G: 0 },
        vp: 0,
        effect: "",
        tags: [],
        copies: 1,
        localId: makeLocalId(),
      },
    ]);
  };

  const removeUpgrade = (idx) => {
    setUpgrades((prev) => prev.filter((_, i) => i !== idx));
  };

  const normalizeCard = (card) => {
    const tags = Array.isArray(card.tags)
      ? card.tags.map((t) => String(t || "").trim()).filter(Boolean)
      : [];
    const cost = {
      R: numberOrZero(card.cost?.R),
      B: numberOrZero(card.cost?.B),
      G: numberOrZero(card.cost?.G),
    };
    const effect = buildEffectTextFromTags(tags);
    return {
      type: "Upgrade",
      name: card.name || "",
      cost,
      vp: numberOrZero(card.vp),
      effect,
      tags,
      copies: Math.max(1, numberOrZero(card.copies || 1)),
    };
  };

  const addTagToCard = (idx, tag) => {
    if (!tag) return;
    setUpgrades((prev) => {
      const updated = [...prev];
      const currentCard = { ...(updated[idx] || {}) };
      const tags = Array.isArray(currentCard.tags) ? [...currentCard.tags] : [];
      if (!tags.includes(tag)) {
        tags.push(tag);
      }
      currentCard.tags = tags;
      updated[idx] = currentCard;
      return updated;
    });
  };

  const removeTagFromCard = (idx, tag) => {
    setUpgrades((prev) => {
      const next = [...prev];
      const card = { ...(next[idx] || {}) };
      card.tags = (card.tags || []).filter((t) => t !== tag);
      next[idx] = card;
      return next;
    });
  };

  const handleSave = async () => {
    if (isDefault) {
      setError("Default deck is read-only. Clone it first.");
      return;
    }
    try {
      setSaving(true);
      setError(null);
      const payload = {
        upgrades: upgrades.map((c) => normalizeCard(c)),
      };
      const res = await fetch(`${apiBase}/api/custom/upgrade-decks/${deckName}`, {
        method: "POST",
        headers: jsonHeaders,
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Failed to save deck");
      navigate("/forge/upgrades");
    } catch (e) {
      setError("Failed to save deck");
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = () => {
    const shouldDiscard = window.confirm("Discard all unsaved changes and go back?");
    if (shouldDiscard) {
      navigate("/forge/upgrades");
    }
  };

  if (loading) return <div className="text-slate-300">Loading deck...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-blue-300">Editing Upgrade Deck: {deckName}</h1>
          <p className="text-slate-400 text-sm">Edit upgrades, then save the deck.</p>
          {isDefault && <p className="text-rose-300 text-xs mt-1">The default deck is read-only: clone it to edit.</p>}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleDiscard}
            className="px-3 py-2 rounded-md border border-slate-700 text-slate-200 hover:border-rose-400 text-sm"
          >
            Discard &amp; Back
          </button>
          <button
            onClick={addUpgrade}
            className="px-3 py-2 rounded-md border border-blue-400 text-blue-200 hover:bg-blue-400/10 text-sm"
            disabled={isDefault}
          >
            Add Upgrade
          </button>
          <button
            onClick={handleSave}
            disabled={saving || isDefault}
            className="px-3 py-2 rounded-md border border-amber-400 text-amber-200 hover:bg-amber-400/10 text-sm disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Deck"}
          </button>
        </div>
      </div>

      {error && <div className="text-rose-400 text-sm">{error}</div>}

      <section className="bg-slate-900/70 border border-slate-800 rounded-xl p-3 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-blue-200">Upgrades</h2>
          <span className="text-xs text-slate-400">{upgrades.length} cards</span>
        </div>
        <div className="grid md:grid-cols-2 gap-3">
          {upgrades.map((u, idx) => (
            <div key={u.localId || idx} className="bg-slate-900 border border-slate-800 rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-end">
                <button
                  type="button"
                  onClick={() => removeUpgrade(idx)}
                  disabled={isDefault}
                  className="text-rose-300 text-xs px-2 py-1 border border-rose-400 rounded hover:bg-rose-400/10 disabled:opacity-40"
                  title="Remove card"
                >
                  Delete
                </button>
              </div>
              <div>
                <label className="text-[11px] uppercase tracking-[0.12em] text-slate-400">Name</label>
                <input
                  type="text"
                  className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-200 text-sm"
                  value={u.name || ""}
                  onChange={(e) => updateUpgrade(idx, { name: e.target.value })}
                  disabled={isDefault}
                />
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {["R", "B", "G"].map((k) => (
                  <label key={k} className="flex items-center gap-1 text-slate-300">
                    {k}
                    <input
                      type="number"
                      className="w-16 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-200"
                      value={u.cost?.[k] ?? 0}
                      onChange={(e) =>
                        updateUpgrade(idx, { cost: { ...(u.cost || {}), [k]: numberOrZero(e.target.value) } })
                      }
                      disabled={isDefault}
                    />
                  </label>
                ))}
                <label className="flex items-center gap-1 text-slate-300">
                  VP
                  <input
                    type="number"
                    className="w-16 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-200"
                    value={u.vp ?? 0}
                    onChange={(e) => updateUpgrade(idx, { vp: numberOrZero(e.target.value) })}
                    disabled={isDefault}
                  />
                </label>
                <label className="flex items-center gap-1 text-slate-300">
                  Copies
                  <input
                    type="number"
                    className="w-16 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-200"
                    value={u.copies ?? 1}
                    min={1}
                    onChange={(e) => updateUpgrade(idx, { copies: numberOrZero(e.target.value) })}
                    disabled={isDefault}
                  />
                </label>
              </div>
              <EffectTagBuilder
                cardType="upgrade"
                tags={u.tags || []}
                disabled={isDefault}
                label="Effects"
                onAddTag={(tag) => addTagToCard(idx, tag)}
                onRemoveTag={(tag) => removeTagFromCard(idx, tag)}
              />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
