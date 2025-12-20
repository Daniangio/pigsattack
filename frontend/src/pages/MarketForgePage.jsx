import React from "react";
import { Link, useNavigate } from "react-router-dom";

export default function MarketForgePage() {
  const navigate = useNavigate();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-amber-300">Market Forge</h1>
          <p className="text-slate-400 text-sm">Manage upgrade and weapon decks separately.</p>
        </div>
        <button
          onClick={() => navigate("/lobby")}
          className="px-3 py-2 rounded-md border border-slate-700 text-slate-200 hover:border-amber-400 text-sm"
        >
          Back to Lobby
        </button>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Link
          to="/forge/upgrades"
          className="group bg-slate-900/70 border border-slate-800 rounded-xl p-5 hover:border-blue-400 transition"
        >
          <div className="text-xs uppercase tracking-[0.22em] text-slate-400">Forge</div>
          <div className="text-2xl font-semibold text-blue-200 mt-2">Upgrade Decks</div>
          <p className="text-sm text-slate-400 mt-2">
            Build and refine upgrade-only decks with effect tags.
          </p>
          <div className="mt-4 text-xs text-blue-200 uppercase tracking-[0.2em]">Open</div>
        </Link>

        <Link
          to="/forge/weapons"
          className="group bg-slate-900/70 border border-slate-800 rounded-xl p-5 hover:border-amber-400 transition"
        >
          <div className="text-xs uppercase tracking-[0.22em] text-slate-400">Forge</div>
          <div className="text-2xl font-semibold text-amber-200 mt-2">Weapon Decks</div>
          <p className="text-sm text-slate-400 mt-2">
            Curate weapon-only decks with specialized effects.
          </p>
          <div className="mt-4 text-xs text-amber-200 uppercase tracking-[0.2em]">Open</div>
        </Link>
      </div>
    </div>
  );
}
