import React, { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useStore } from "../store";
import { apiBaseUrl } from "../utils/connection";

const apiBase = apiBaseUrl;

export default function WeaponForgePage() {
  const token = useStore((state) => state.token);
  const navigate = useNavigate();
  const [decks, setDecks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [newEmptyName, setNewEmptyName] = useState("");
  const [error, setError] = useState(null);
  const [cloneModal, setCloneModal] = useState({ open: false, source: "", value: "" });
  const [renameModal, setRenameModal] = useState({ open: false, source: "", value: "" });

  const headers = token ? { Authorization: `Bearer ${token}` } : {};

  const fetchData = async () => {
    try {
      setLoading(true);
      const deckRes = await fetch(`${apiBase}/api/custom/weapon-decks`, { headers });
      const deckJson = await deckRes.json();
      setDecks((deckJson.decks || []).filter((deck) => !deck.empty));
    } catch (e) {
      setError("Failed to load decks");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const cloneDeck = async (sourceName) => {
    if (!cloneModal.value.trim()) return;
    try {
      const target = cloneModal.value.trim();
      await fetch(`${apiBase}/api/custom/weapon-decks/${sourceName}/clone`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ target }),
      });
      setCloneModal({ open: false, source: "", value: "" });
      fetchData();
    } catch (e) {
      setError("Failed to clone deck");
    }
  };

  const renameDeck = async (sourceName) => {
    if (!renameModal.value.trim()) return;
    try {
      const target = renameModal.value.trim();
      await fetch(`${apiBase}/api/custom/weapon-decks/${sourceName}/rename`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify({ target }),
      });
      setRenameModal({ open: false, source: "", value: "" });
      fetchData();
    } catch (e) {
      setError("Failed to rename deck");
    }
  };

  const createEmptyDeck = async () => {
    if (!newEmptyName.trim()) return;
    try {
      const target = newEmptyName.trim();
      const template = {
        weapons: [],
      };
      await fetch(`${apiBase}/api/custom/weapon-decks/${target}`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify(template),
      });
      setNewEmptyName("");
      fetchData();
    } catch (e) {
      setError("Failed to create deck");
    }
  };

  if (loading) return <div className="text-slate-300">Loading...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-amber-300">Weapon Forge</h1>
        <button
          onClick={() => navigate("/forge/market")}
          className="px-3 py-2 rounded-md border border-slate-700 text-slate-200 hover:border-amber-400 text-sm"
        >
          Back to Market Hub
        </button>
      </div>
      {error && <div className="text-rose-400 text-sm">{error}</div>}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-3">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newEmptyName}
              onChange={(e) => setNewEmptyName(e.target.value)}
              placeholder="New empty deck name"
              className="px-3 py-2 rounded-md bg-slate-800 border border-slate-700 text-slate-200 text-sm"
            />
            <button
              onClick={createEmptyDeck}
              className="px-3 py-2 rounded-md border border-emerald-400 text-emerald-200 text-[12px] uppercase tracking-[0.12em] hover:bg-emerald-400/10"
            >
              Create Empty Deck
            </button>
          </div>
          <div className="text-xs text-slate-400">Default deck is read-only</div>
        </div>
        <div className="grid gap-2">
          {decks.map((deck) => (
            <div
              key={deck.name}
              className="flex items-center justify-between bg-slate-800/60 border border-slate-700 rounded-lg px-3 py-2"
            >
              <div className="flex items-center gap-2">
                <span className="text-slate-100 font-semibold">{deck.label || deck.name}</span>
                {!deck.editable && <span className="text-[10px] uppercase text-slate-400">Default</span>}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCloneModal({ open: true, source: deck.name, value: "" })}
                  className="px-2 py-1 rounded-md border border-amber-400 text-amber-200 text-[11px] uppercase tracking-[0.12em] hover:bg-amber-400/10"
                >
                  Clone
                </button>
                {deck.editable && (
                  <button
                    onClick={() => setRenameModal({ open: true, source: deck.name, value: deck.name })}
                    className="p-2 rounded-md border border-slate-600 text-slate-200 hover:border-amber-400"
                    title="Rename deck"
                    aria-label={`Rename deck ${deck.name}`}
                  >
                    <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.6">
                      <path d="M4 13.5V16h2.5l7.2-7.2-2.5-2.5L4 13.5z" />
                      <path d="M12 4l2.5 2.5" />
                    </svg>
                  </button>
                )}
                {deck.editable ? (
                  <Link
                    to={`/forge/weapons/${deck.name}`}
                    className="px-2 py-1 rounded-md border border-blue-400 text-blue-200 text-[11px] uppercase tracking-[0.12em] hover:bg-blue-400/10"
                  >
                    Edit
                  </Link>
                ) : (
                  <span className="px-2 py-1 rounded-md border border-slate-700 text-slate-400 text-[11px] uppercase tracking-[0.12em] cursor-not-allowed">
                    Locked
                  </span>
                )}
                {deck.editable && (
                  <button
                    onClick={async () => {
                      try {
                        await fetch(`${apiBase}/api/custom/weapon-decks/${deck.name}`, {
                          method: "DELETE",
                          headers,
                        });
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
      {cloneModal.open && (
        <div className="fixed inset-0 bg-slate-950/70 flex items-center justify-center z-40">
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 w-full max-w-md space-y-3">
            <div>
              <h3 className="text-lg font-semibold text-amber-200">Clone deck</h3>
              <p className="text-xs text-slate-400">Create a new deck from {cloneModal.source}.</p>
            </div>
            <input
              type="text"
              value={cloneModal.value}
              onChange={(e) => setCloneModal((prev) => ({ ...prev, value: e.target.value }))}
              placeholder="New deck name"
              className="w-full px-3 py-2 rounded-md bg-slate-800 border border-slate-700 text-slate-200 text-sm"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setCloneModal({ open: false, source: "", value: "" })}
                className="px-3 py-2 rounded-md border border-slate-700 text-slate-200 text-sm hover:border-rose-400"
              >
                Cancel
              </button>
              <button
                onClick={() => cloneDeck(cloneModal.source)}
                className="px-3 py-2 rounded-md border border-amber-400 text-amber-200 text-sm hover:bg-amber-400/10"
              >
                Clone
              </button>
            </div>
          </div>
        </div>
      )}
      {renameModal.open && (
        <div className="fixed inset-0 bg-slate-950/70 flex items-center justify-center z-40">
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 w-full max-w-md space-y-3">
            <div>
              <h3 className="text-lg font-semibold text-amber-200">Rename deck</h3>
              <p className="text-xs text-slate-400">Update the deck name and save.</p>
            </div>
            <input
              type="text"
              value={renameModal.value}
              onChange={(e) => setRenameModal((prev) => ({ ...prev, value: e.target.value }))}
              placeholder="Deck name"
              className="w-full px-3 py-2 rounded-md bg-slate-800 border border-slate-700 text-slate-200 text-sm"
            />
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setRenameModal({ open: false, source: "", value: "" })}
                className="px-3 py-2 rounded-md border border-slate-700 text-slate-200 text-sm hover:border-rose-400"
              >
                Cancel
              </button>
              <button
                onClick={() => renameDeck(renameModal.source)}
                className="px-3 py-2 rounded-md border border-amber-400 text-amber-200 text-sm hover:bg-amber-400/10"
              >
                Rename
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
