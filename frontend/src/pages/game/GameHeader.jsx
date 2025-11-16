import React from "react";

// This component is now simplified to only show game state.
// All buttons and options have been moved to GameMenu.jsx.
const GameHeader = ({ round, era, phase }) => (
  <div className="flex-shrink-0 flex flex-col items-center gap-2">
    <h1 className="text-2xl font-bold text-indigo-300 [text-shadow:_0_2px_4px_rgb(0_0_0_/_50%)] text-center">
      Wild Pigs Will Attack!
    </h1>
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
        <span className="text-xl font-bold text-white uppercase">{phase}</span>
      </div>
    </div>
  </div>
);

export default GameHeader;
