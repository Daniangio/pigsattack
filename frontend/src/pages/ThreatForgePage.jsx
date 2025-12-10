import React, { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useStore } from "../store";

const apiBase = import.meta.env.VITE_API_URL || "http://localhost:8000";

export default function ThreatForgePage() {
  const token = useStore((state) => state.token);
  const navigate = useNavigate();
  const [decks, setDecks] = useState([]);
  const [activeDeck, setActiveDeck] = useState("default");
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState(null);

  const headers = token ? { Authorization: `Bearer ${token}` } : {};

  const fetchData = async () => {
    try {
      setLoading(true);
      const [deckRes, activeRes] = await Promise.all([
        fetch(`${apiBase}/api/custom/threat-decks`, { headers }),
        fetch(`${apiBase}/api/custom/active-threat-deck`, { headers }),
      ]);
      const deckJson = await deckRes.json();
      const activeJson = await activeRes.json();
      setDecks(deckJson.decks || []);
      setActiveDeck(activeJson.name || "default");
    } catch (e) {
      setError("Failed to load decks");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const setActive = async (name) => {
    try {
      await fetch(`${apiBase}/api/custom/active-threat-deck`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ name }),
      });
      setActiveDeck(name);
    } catch (e) {
      setError("Failed to set active deck");
    }
  };

  const cloneDeck = async (sourceName) => {
    if (!newName.trim()) return;
    try {
      const target = newName.trim();
      await fetch(`${apiBase}/api/custom/threat-decks/${sourceName}/clone`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ target }),
      });
      setNewName("");
      fetchData();
    } catch (e) {
      setError("Failed to clone deck");
    }
  };

  if (loading) return <div className="text-slate-300">Loading...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-orange-400">Threat Forge</h1>
        <button
          onClick={() => navigate("/lobby")}
          className="px-3 py-2 rounded-md border border-slate-700 text-slate-200 hover:border-amber-400 text-sm"
        >
          Back to Lobby
        </button>
      </div>
      {error && <div className="text-rose-400 text-sm">{error}</div>}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-3">
        <div className="grid gap-2">
          {decks.map((deck) => (
            <div
              key={deck.name}
              className="flex items-center justify-between bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <span className="text-slate-100 font-semibold">{deck.name}</span>
                {!deck.editable && <span className="text-[10px] uppercase text-slate-400">Default</span>}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  id={`clone-${deck.name}`}
                  name={`clone-${deck.name}`}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Clone as..."
                  className="px-2 py-1 rounded-md bg-slate-800 border border-slate-700 text-slate-200 text-[12px]"
                />
                <button
                  onClick={() => cloneDeck(deck.name)}
                  className="px-2 py-1 rounded-md border border-amber-400 text-amber-200 text-[11px] uppercase tracking-[0.12em] hover:bg-amber-400/10"
                >
                  Clone
                </button>
                <button
                  onClick={() => setActive(deck.name)}
                  className={`px-2 py-1 rounded-md text-[11px] uppercase tracking-[0.12em] border ${
                    activeDeck === deck.name
                      ? "border-emerald-400 text-emerald-200"
                      : "border-slate-600 text-slate-200 hover:border-amber-400"
                  }`}
                >
                  {activeDeck === deck.name ? "Active" : "Use"}
                </button>
                <Link
                  to={`/forge/threats/${deck.name}`}
                  className="px-2 py-1 rounded-md border border-blue-400 text-blue-200 text-[11px] uppercase tracking-[0.12em] hover:bg-blue-400/10"
                >
                  Edit
                </Link>
                {deck.editable && (
                  <button
                    onClick={async () => {
                      try {
                        await fetch(`${apiBase}/api/custom/threat-decks/${deck.name}`, {
                          method: "DELETE",
                          headers,
                        });
                        if (activeDeck === deck.name) {
                          await setActive("default");
                        }
                        fetchData();
                      } catch (e) {
                        setError("Failed to delete deck");
                      }
                    }}
                    className="px-2 py-1 rounded-md border border-rose-400 text-rose-200 text-[11px] uppercase tracking-[0.12em] hover:bg-rose-400/10"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
