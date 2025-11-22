import React from "react";
import { Trophy, Flame, Zap, Shield, Sword } from "lucide-react";
import ResourcePip from "../ui/ResourcePip";
import { stanceColorRing } from "../../utils/stanceColorRing";
import { STANCE_CONFIG } from "../../utils/stanceConfig";

export default function PlayerBoardBottom({ player, onOpenStance }) {
  if (!player) return null;

  const stanceInfo = STANCE_CONFIG[player.stance];

  return (
    <div className="bg-slate-950/90 border-t border-slate-800 
                    px-8 py-5 backdrop-blur-xl">
      
      <div className="flex flex-wrap items-center justify-between gap-6">

        {/* Left: Portrait + stance */}
        <div className="flex items-center gap-4">
          <div
            className={`w-16 h-16 rounded-full border-4 
                        ${stanceColorRing(player.stance)}
                        bg-slate-900 flex items-center justify-center 
                        text-xs uppercase tracking-[0.2em] text-slate-200`}
          >
            {player.stance}
          </div>

          <div>
            <div className="text-[11px] uppercase tracking-[0.3em] text-slate-500">
              Active Player
            </div>
            <div className="text-xl font-bold text-slate-50">
              {player.name}
            </div>
            <div className="flex items-center gap-1 text-sm text-slate-300">
              <Trophy size={14} className="text-amber-300" />
              <span>VP: {player.vp}</span>
            </div>
          </div>
        </div>


        {/* Middle: Resources */}
        <div className="flex gap-2">
          <ResourcePip
            label="R"
            icon={Flame}
            value={player.resources.R}
            color={{
              border: "border-red-900",
              bg: "bg-red-950/40",
              icon: "text-red-400",
            }}
          />
          <ResourcePip
            label="B"
            icon={Zap}
            value={player.resources.B}
            color={{
              border: "border-blue-900",
              bg: "bg-blue-950/40",
              icon: "text-blue-400",
            }}
          />
          <ResourcePip
            label="G"
            icon={Shield}
            value={player.resources.G}
            color={{
              border: "border-green-900",
              bg: "bg-green-950/40",
              icon: "text-green-400",
            }}
          />
        </div>


        {/* Right: Stance Button */}
        <div className="flex flex-col items-end gap-2">
          <button
            onClick={onOpenStance}
            className="px-3 py-2 rounded-full border border-slate-600 
                       text-[11px] uppercase tracking-[0.16em] 
                       text-slate-200 hover:bg-slate-800"
          >
            Change Stance
          </button>

          <div className="text-[10px] text-slate-300 text-right">
            <div>
              Production: {stanceInfo.production.R}R / {stanceInfo.production.B}B /{" "}
              {stanceInfo.production.G}G
            </div>
            <div>Discount: {stanceInfo.discount}</div>
          </div>
        </div>
      </div>


      {/* Upgrades & Weapons */}
      <div className="mt-4 flex flex-wrap gap-6 text-[11px] text-slate-200">

        <div>
          <div className="uppercase text-[10px] tracking-[0.2em] text-slate-500 mb-1">
            Upgrades
          </div>
          <div className="flex flex-wrap gap-2">
            {player.upgrades.length ? (
              player.upgrades.map((u) => (
                <span
                  key={u}
                  className="px-2 py-1 rounded-full bg-slate-900 border border-slate-700"
                >
                  {u}
                </span>
              ))
            ) : (
              <span className="text-slate-500">—</span>
            )}
          </div>
        </div>

        <div>
          <div className="uppercase text-[10px] tracking-[0.2em] text-slate-500 mb-1">
            Weapons
          </div>
          <div className="flex flex-wrap gap-2">
            {player.weapons.length ? (
              player.weapons.map((w) => (
                <span
                  key={w}
                  className="px-2 py-1 rounded-full bg-slate-900 border border-slate-700 flex items-center gap-1"
                >
                  <Sword size={12} className="text-sky-300" />
                  {w}
                </span>
              ))
            ) : (
              <span className="text-slate-500">—</span>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
