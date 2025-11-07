import React from "react";

const GameHeader = ({
  round,
  era,
  phase,
  onSurrender,
  isSpectator,
  hasLeft,
  onReturnToLobby,
}) => (
  <div className="flex-shrink-0 flex justify-between items-center p-2 bg-black bg-opacity-40 w-full">
    <div>
      <h1 className="text-2xl sm:text-3xl font-bold text-indigo-300 [text-shadow:_0_2px_4px_rgb(0_0_0_/_50%)]">
        Wild Pigs Will Attack!
      </h1>
    </div>
    <div className="flex items-center space-x-4">
      <div className="p-2 bg-gray-900 bg-opacity-70 rounded-lg text-center">
        <span className="text-xs text-gray-400 block">ROUND</span>
        <span className="text-2xl font-bold text-white">
          {round} / {15}
        </span>
      </div>
      <div className="p-2 bg-gray-900 bg-opacity-70 rounded-lg text-center">
        <span className="text-xs text-gray-400 block">ERA</span>
        <span className="text-2xl font-bold text-white">{era} / 3</span>
      </div>
      <div className="p-2 bg-blue-900 bg-opacity-70 rounded-lg text-center min-w-[120px]">
        <span className="text-xs text-blue-200 block">PHASE</span>
        <span className="text-2xl font-bold text-white">{phase}</span>
      </div>
    </div>
    <div className="space-x-2">
      {!isSpectator && !hasLeft && phase !== "GAME_OVER" && (
        <button onClick={onSurrender} className="btn btn-warning btn-sm">
          Surrender
        </button>
      )}
      {(phase === "GAME_OVER" || isSpectator || hasLeft) && (
        <button onClick={onReturnToLobby} className="btn btn-primary btn-sm">
          Back to Lobby
        </button>
      )}
    </div>
  </div>
);

export default GameHeader;