import React, { useEffect, useState, useCallback, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useStore } from "../store";
import { getThreatImage } from "../utils/threatImages";
import { apiBaseUrl } from "../utils/connection";

const apiBase = apiBaseUrl;

const emptyThreat = () => ({
  id: `t-${Date.now()}`,
  name: "New Threat",
  type: "Feral",
  cost: { R: 0, B: 0, G: 0 },
  vp: 0,
  reward: "",
  spoils: [],
  copies: 1,
  image: "",
});

export default function ThreatDeckEditPage() {
  const { deckName } = useParams();
  const token = useStore((state) => state.token);
  const navigate = useNavigate();
  const [deck, setDeck] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [images, setImages] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [uploadSuccess, setUploadSuccess] = useState(null);
  const headers = useMemo(
    () => (token ? { Authorization: `Bearer ${token}` } : {}),
    [token]
  );
  const isDefault = deckName === "default";

  const fetchImages = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/api/custom/threat-images`, {
        headers,
      });
      const data = await res.json();
      setImages(data.images || []);
    } catch (e) {
      setUploadError("Failed to load images");
    }
  }, [headers]);

  useEffect(() => {
    if (isDefault) {
      setError("Default deck is read-only. Clone it or create a new deck to edit.");
      return;
    }
    (async () => {
      try {
        const res = await fetch(`${apiBase}/api/custom/threat-decks/${deckName}`, { headers });
        if (!res.ok) throw new Error("Failed to load deck");
        const data = await res.json();
        setDeck(data);
      } catch (e) {
        setError("Unable to load deck");
      }
    })();
  }, [deckName, headers, isDefault]);

  useEffect(() => {
    fetchImages();
  }, [fetchImages]);

  const threats = deck?.day_threats || deck?.threats || [];

  const updateThreat = (index, patch) => {
    setDeck((prev) => {
      const list = [...(prev.day_threats || prev.threats || [])];
      list[index] = { ...list[index], ...patch };
      return { ...prev, day_threats: list, night_threats: prev?.night_threats || [] };
    });
  };

  const addThreat = () => {
    setDeck((prev) => {
      const list = [...(prev?.day_threats || prev?.threats || [])];
      list.push(emptyThreat());
      return { ...prev, day_threats: list, night_threats: prev?.night_threats || [] };
    });
  };

  const removeThreat = (index) => {
    setDeck((prev) => {
      const list = [...(prev?.day_threats || prev?.threats || [])];
      list.splice(index, 1);
      return { ...prev, day_threats: list, night_threats: prev?.night_threats || [] };
    });
  };

  const handleSave = async () => {
    if (!deck || isDefault) return;
    setSaving(true);
    try {
      // Clean spoils: remove empty resources on token spoils, drop empty fields
      const cleaned = {
        ...deck,
        day_threats: (deck.day_threats || []).map((t) => ({
          ...t,
          spoils: (t.spoils || []).map((s) => {
            const next = { ...s };
            if (next.kind !== "resource") {
              delete next.resources;
            } else if (next.resources) {
              ["R", "B", "G"].forEach((k) => {
                if (next.resources[k] === 0) delete next.resources[k];
              });
              if (!Object.keys(next.resources).length) delete next.resources;
            }
            if (!next.slot_type) delete next.slot_type;
            // Normalize token casing
            if (next.token) next.token = String(next.token).toUpperCase();
            return next;
          }),
        })),
      };
      await fetch(`${apiBase}/api/custom/threat-decks/${deckName}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify(cleaned),
      });
      navigate("/forge/threats");
    } catch (e) {
      setError("Failed to save deck");
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = () => {
    const shouldDiscard = window.confirm(
      "Discard all unsaved changes and go back?"
    );
    if (shouldDiscard) {
      navigate("/forge/threats");
    }
  };

  const handleImageUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    setUploadSuccess(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch(`${apiBase}/api/custom/threat-images/upload`, {
        method: "POST",
        headers,
        body: formData,
      });
      if (!res.ok) {
        throw new Error("upload failed");
      }
      setUploadSuccess("Image uploaded. You can now pick it from the list.");
      event.target.value = "";
      await fetchImages();
    } catch (e) {
      setUploadError("Failed to upload image");
    } finally {
      setUploading(false);
    }
  };

  if (error) return <div className="text-rose-400">{error}</div>;
  if (!deck) return <div className="text-slate-300">Loading deck...</div>;

  const updateSpoils = (index, updater) => {
    setDeck((prev) => {
      const list = [...(prev.day_threats || prev.threats || [])];
      const current = list[index];
      const nextSpoils = updater(current.spoils || []);
      list[index] = { ...current, spoils: nextSpoils };
      return { ...prev, day_threats: list, night_threats: prev?.night_threats || [] };
    });
  };

  const addSpoil = (index, kind, payload = {}) => {
    updateSpoils(index, (prev) => {
      const next = [...prev];
      if (kind === "token") {
        next.push({ kind: "token", token: payload.token || "ATTACK", amount: payload.amount || 1 });
      } else if (kind === "resource") {
        next.push({ kind: "resource", resources: payload.resources || { R: 0, B: 0, G: 0 } });
      } else if (kind === "stance_change") {
        next.push({ kind: "stance_change", amount: payload.amount || 1 });
      }
      return next;
    });
  };

  const updateResourceSpoil = (tIdx, sIdx, resKey, val) => {
    updateSpoils(tIdx, (prev) => {
      const next = [...prev];
      const entry = { ...(next[sIdx] || {}) };
      const resources = { ...(entry.resources || {}) };
      resources[resKey] = val;
      entry.resources = resources;
      next[sIdx] = entry;
      return next;
    });
  };

  const updateTokenSpoil = (tIdx, sIdx, field, val) => {
    updateSpoils(tIdx, (prev) => {
      const next = [...prev];
      const entry = { ...(next[sIdx] || {}) };
      entry[field] = val;
      next[sIdx] = entry;
      return next;
    });
  };

  const removeSpoil = (tIdx, sIdx) => {
    updateSpoils(tIdx, (prev) => {
      const next = [...prev];
      next.splice(sIdx, 1);
      return next;
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-orange-400">Editing Deck: {deckName}</h1>
          <p className="text-slate-400 text-sm">Inline edit threats, then save.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleDiscard}
            className="px-3 py-2 rounded-md border border-slate-700 text-slate-200 hover:border-rose-400 text-sm"
          >
            Discard &amp; Back
          </button>
          <button
            onClick={addThreat}
            className="px-3 py-2 rounded-md border border-emerald-400 text-emerald-200 hover:bg-emerald-400/10 text-sm"
          >
            Add Threat
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-3 py-2 rounded-md border border-amber-400 text-amber-200 hover:bg-amber-400/10 text-sm disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Deck"}
          </button>
        </div>
      </div>

      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 flex flex-col md:flex-row md:items-center gap-3">
        <div className="flex-1">
          <p className="text-slate-200 text-sm font-semibold">Upload custom image</p>
          <p className="text-slate-400 text-xs">
            Upload a .png/.jpg/.jpeg/.webp file to make it available in the image dropdown.
          </p>
          {(uploadError || uploadSuccess) && (
            <div className={`text-xs mt-1 ${uploadError ? "text-rose-300" : "text-emerald-300"}`}>
              {uploadError || uploadSuccess}
            </div>
          )}
        </div>
        <label className="px-3 py-2 rounded-md border border-blue-400 text-blue-200 text-sm cursor-pointer hover:bg-blue-400/10">
          {uploading ? "Uploading..." : "Choose Image"}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/jpg"
            className="hidden"
            onChange={handleImageUpload}
            disabled={uploading}
          />
        </label>
      </div>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
        {threats.map((t, idx) => (
          <div key={t.id || idx} className="bg-slate-900/70 border border-slate-800 rounded-xl p-3 flex flex-col gap-2">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 flex flex-col gap-1">
                <label className="text-[11px] uppercase tracking-[0.12em] text-slate-400">Name</label>
                <input
                  type="text"
                  className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-200 text-sm"
                  value={t.name || ""}
                  onChange={(e) => updateThreat(idx, { name: e.target.value })}
                  placeholder="Name"
                />
              </div>
              <div className="flex flex-col items-start gap-1">
                <label className="text-[11px] uppercase tracking-[0.12em] text-slate-400">VP</label>
                <input
                  type="number"
                  className="w-20 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-200 text-sm"
                  value={t.vp || 0}
                  onChange={(e) => updateThreat(idx, { vp: parseInt(e.target.value || 0, 10) })}
                  min="0"
                />
              </div>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <select
                className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-200 flex-1"
                value={t.type || "Feral"}
                onChange={(e) => updateThreat(idx, { type: e.target.value })}
              >
                <option>Feral</option>
                <option>Cunning</option>
                <option>Massive</option>
                <option>Hybrid</option>
              </select>
              <input
                type="number"
                className="w-16 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-200"
                value={t.copies || 1}
                onChange={(e) => updateThreat(idx, { copies: parseInt(e.target.value || 0, 10) })}
                title="Copies in deck"
              />
            </div>
            <div className="flex items-center gap-2 text-xs">
              {["R", "B", "G"].map((k) => (
                <label key={k} className="flex items-center gap-1 text-slate-300">
                  {k}
                  <input
                    type="number"
                    className="w-16 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-200"
                    value={t.cost?.[k] ?? 0}
                    onChange={(e) =>
                      updateThreat(idx, {
                        cost: { ...(t.cost || {}), [k]: parseInt(e.target.value || 0, 10) },
                      })
                    }
                  />
                </label>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <select
                className="flex-1 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-200 text-sm"
                value={t.image || ""}
                onChange={(e) => updateThreat(idx, { image: e.target.value })}
              >
                <option value="">Select image</option>
                {images.map((img) => (
                  <option key={img.name} value={img.name}>
                    {img.name}
                  </option>
                ))}
              </select>
              {t.image && (
                <div className="w-12 h-12 rounded border border-slate-700 overflow-hidden">
                  <img
                    src={getThreatImage(t.image)}
                    alt={t.name}
                    className="w-full h-full object-cover"
                  />
                </div>
              )}
            </div>

            <div className="bg-slate-800/60 border border-slate-700 rounded-md p-2 text-[12px] text-slate-200 space-y-2">
              <div className="flex items-center justify-between">
                <span className="uppercase tracking-[0.12em] text-slate-400 text-[10px]">Spoils (rewards)</span>
                <div className="flex gap-1">
                  <button
                    onClick={() => addSpoil(idx, "token", { token: "ATTACK", amount: 1 })}
                    className="px-2 py-1 rounded border border-amber-400 text-amber-200 text-[10px] hover:bg-amber-400/10"
                  >
                    + Token
                  </button>
                  <button
                    onClick={() => addSpoil(idx, "resource", { resources: { R: 1, B: 0, G: 0 } })}
                    className="px-2 py-1 rounded border border-emerald-400 text-emerald-200 text-[10px] hover:bg-emerald-400/10"
                  >
                    + Resources
                  </button>
                  <button
                    onClick={() => addSpoil(idx, "stance_change", { amount: 1 })}
                    className="px-2 py-1 rounded border border-sky-400 text-sky-200 text-[10px] hover:bg-sky-400/10"
                  >
                    + Stance
                  </button>
                </div>
              </div>
              <div className="space-y-1">
                {(t.spoils || []).map((s, sIdx) => {
                  if (s.kind === "token") {
                    return (
                      <div key={sIdx} className="flex items-center gap-2 bg-slate-900/60 rounded px-2 py-1">
                        <select
                          className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-200 text-[11px]"
                          value={s.token || "ATTACK"}
                          onChange={(e) => updateTokenSpoil(idx, sIdx, "token", e.target.value)}
                        >
                          <option value="ATTACK">Attack</option>
                          <option value="CONVERSION">Conversion</option>
                          <option value="MASS">Mass</option>
                          <option value="WILD">Wild</option>
                        </select>
                        <input
                          type="number"
                          className="w-16 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-200 text-[11px]"
                          value={s.amount || 1}
                          onChange={(e) => updateTokenSpoil(idx, sIdx, "amount", parseInt(e.target.value || 0, 10))}
                        />
                        <button
                          onClick={() => removeSpoil(idx, sIdx)}
                          className="ml-auto px-2 py-1 text-[10px] rounded border border-rose-400 text-rose-200 hover:bg-rose-400/10"
                        >
                          Remove
                        </button>
                      </div>
                    );
                  }
                  if (s.kind === "resource") {
                    return (
                      <div key={sIdx} className="flex items-center gap-2 bg-slate-900/60 rounded px-2 py-1">
                        {["R", "B", "G"].map((rk) => (
                          <label key={rk} className="flex items-center gap-1 text-[11px] text-slate-200">
                            {rk}
                            <input
                              type="number"
                              className="w-14 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-200 text-[11px]"
                              value={s.resources?.[rk] ?? 0}
                              onChange={(e) =>
                                updateResourceSpoil(idx, sIdx, rk, parseInt(e.target.value || 0, 10))
                              }
                            />
                          </label>
                        ))}
                        <button
                          onClick={() => removeSpoil(idx, sIdx)}
                          className="ml-auto px-2 py-1 text-[10px] rounded border border-rose-400 text-rose-200 hover:bg-rose-400/10"
                        >
                          Remove
                        </button>
                      </div>
                    );
                  }
                  if (s.kind === "stance_change") {
                    return (
                      <div key={sIdx} className="flex items-center gap-2 bg-slate-900/60 rounded px-2 py-1">
                        <span className="text-[11px] text-slate-200">Free stance change</span>
                        <input
                          type="number"
                          className="w-16 bg-slate-800 border border-slate-700 rounded px-2 py-1 text-slate-200 text-[11px]"
                          value={s.amount || 1}
                          onChange={(e) => updateTokenSpoil(idx, sIdx, "amount", parseInt(e.target.value || 0, 10))}
                        />
                        <button
                          onClick={() => removeSpoil(idx, sIdx)}
                          className="ml-auto px-2 py-1 text-[10px] rounded border border-rose-400 text-rose-200 hover:bg-rose-400/10"
                        >
                          Remove
                        </button>
                      </div>
                    );
                  }
                  return null;
                })}
              </div>
            </div>

            <button
              onClick={() => removeThreat(idx)}
              className="mt-1 px-2 py-1 rounded-md border border-rose-400 text-rose-200 text-[11px] uppercase tracking-[0.12em] hover:bg-rose-400/10"
            >
              Remove
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
