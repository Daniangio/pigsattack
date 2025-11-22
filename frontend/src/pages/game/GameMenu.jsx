import React, { useState, useRef, useEffect } from "react";

// Icon for the menu button
const GearIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    className="h-6 w-6"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={2}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
    />
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
    />
  </svg>
);

// Custom hook to detect clicks outside an element
function useOutsideAlerter(ref, callback) {
  useEffect(() => {
    function handleClickOutside(event) {
      if (ref.current && !ref.current.contains(event.target)) {
        callback();
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [ref, callback]);
}

const GameMenu = ({
  onSurrender,
  onReturnToLobby,
  isSpectator,
  hasLeft,
  phase,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef(null);
  useOutsideAlerter(menuRef, () => setIsOpen(false));

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="p-2 rounded-lg bg-gray-700 bg-opacity-50 text-white hover:bg-gray-600 transition-colors"
        title="Game Menu"
      >
        <GearIcon />
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-2 w-48 bg-gray-800 rounded-lg shadow-xl border border-gray-600 z-50">
          <ul className="flex flex-col p-2">
            {/* Add more options here later */}
            <li className="p-2 text-gray-400 text-sm border-b border-gray-600">
              OPTIONS
            </li>

            {/* Surrender / Lobby Buttons */}
            {!isSpectator && !hasLeft && phase !== "GAME_OVER" && (
              <li>
                <button
                  onClick={() => {
                    onSurrender();
                    setIsOpen(false);
                  }}
                  className="w-full text-left p-2 rounded hover:bg-red-700 text-red-400 hover:text-white transition-colors"
                >
                  Surrender
                </button>
              </li>
            )}
            {(phase === "GAME_OVER" || isSpectator || hasLeft) && (
              <li>
                <button
                  onClick={() => {
                    onReturnToLobby();
                    setIsOpen(false);
                  }}
                  className="w-full text-left p-2 rounded hover:bg-blue-700 text-blue-300 hover:text-white transition-colors"
                >
                  Back to Lobby
                </button>
              </li>
            )}

            {/* Placeholder for future options */}
            <li>
              <button
                className="w-full text-left p-2 rounded text-gray-500 cursor-not-allowed"
                disabled
              >
                Settings (soon)
              </button>
            </li>
          </ul>
        </div>
      )}
    </div>
  );
};

export default GameMenu;
