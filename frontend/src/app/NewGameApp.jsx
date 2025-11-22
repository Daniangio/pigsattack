import React, { useState } from 'react';
import { VIEW_MODES } from '../state/uiState';
import { INITIAL_PLAYERS } from '../state/players';

import InitiativeRail from '../components/navigation/InitiativeRail';
import TopNavigation from '../components/navigation/TopNavigation';

import ThreatsPanel from '../components/threats/ThreatsPanel';
import MarketPanel from '../components/market/MarketPanel';
import PlayerBoardBottom from '../components/player/PlayerBoardBottom';
import PlayerActionPanel from '../components/player/PlayerActionPanel';
import PlayerMiniBoard from '../components/player/PlayerMiniBoard';
import HoverPreviewPortal from '../components/hover/HoverPreviewPortal';

export default function App() {
  const [players, setPlayers] = useState(INITIAL_PLAYERS);
  const [activePlayerId, setActivePlayerId] = useState(INITIAL_PLAYERS[0].id);
  const [viewMode, setViewMode] = useState(VIEW_MODES.GLOBAL);
  const [stanceMenuOpen, setStanceMenuOpen] = useState(false);

  const activePlayer = players.find(p => p.id === activePlayerId);

  return (
    <div className="w-full h-screen bg-slate-950 text-slate-100 flex overflow-hidden">
      
      <InitiativeRail
        players={players}
        activePlayerId={activePlayerId}
        onSelect={setActivePlayerId}
      />

      <div className="flex-1 flex flex-col min-w-0">

        <TopNavigation viewMode={viewMode} onChange={setViewMode} />

        {/* Main content area */}
        <div className="flex-1 min-h-0 px-6 py-4 overflow-hidden">
          {viewMode === VIEW_MODES.GLOBAL && (
            <div className="w-full h-full flex flex-col gap-3 overflow-hidden">
              <div className="flex-1 min-h-0 grid grid-cols-2 gap-3 overflow-hidden">
                <ThreatsPanel compact playersCount={players.length} />
                <MarketPanel compact />
              </div>

              <div className="h-28 bg-slate-950/70 border border-slate-800 rounded-2xl p-2 flex gap-2 overflow-x-auto">
                {players.map(p => (
                  <PlayerMiniBoard
                    key={p.id}
                    player={p}
                    isActive={p.id === activePlayerId}
                    onSelect={setActivePlayerId}
                  />
                ))}
              </div>
            </div>
          )}

          {viewMode === VIEW_MODES.THREATS && (
            <div className="w-full h-full grid grid-cols-12 gap-4">
              <div className="col-span-4">
                <PlayerActionPanel />
              </div>
              <div className="col-span-8">
                <ThreatsPanel />
              </div>
            </div>
          )}

          {viewMode === VIEW_MODES.MARKET && (
            <div className="w-full h-full grid grid-cols-12 gap-4">
              <div className="col-span-4">
                <PlayerActionPanel />
              </div>
              <div className="col-span-8">
                <MarketPanel />
              </div>
            </div>
          )}
        </div>

        {viewMode !== VIEW_MODES.GLOBAL && (
          <PlayerBoardBottom
            player={activePlayer}
            players={players}
            setPlayers={setPlayers}
            activePlayerId={activePlayerId}
            stanceMenuOpen={stanceMenuOpen}
            onToggleStance={() => setStanceMenuOpen((v) => !v)}
            onCloseStance={() => setStanceMenuOpen(false)}
          />
        )}
      </div>

      <HoverPreviewPortal />
    </div>
  );
}
