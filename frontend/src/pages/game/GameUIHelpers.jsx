import React, { useEffect, useRef } from "react";
import { LURE_ICON_MAP } from "./GameConstants.jsx";

export const InjuryIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    className="h-full w-full"
    viewBox="0 0 20 20"
    fill="currentColor"
  >
    <path
      fillRule="evenodd"
      d="M10 18a8 8 0 100-16 8 8 0 000 16zM7 9a1 1 0 000 2h6a1 1 0 100-2H7z"
      clipRule="evenodd"
    />
  </svg>
);

export const TurnStatusIcon = ({ turnStatus, size = "h-4 w-4" }) => {
  const iconStyles = {
    ACTIVE: "text-blue-300 animate-pulse",
    WAITING: "text-green-400",
    PENDING: "text-gray-500",
    NONE: "text-gray-700",
  };
  const title = {
    ACTIVE: "Currently Deciding",
    WAITING: "Turn Complete",
    PENDING: "Waiting for turn",
    NONE: "N/A",
  };
  const path = {
    ACTIVE: "M15 13l-3 3m0 0l-3-3m3 3V8m0 13a9 9 0 110-18 9 9 0 010 18z",
    WAITING: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z",
    PENDING: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z",
    NONE: "M18 12H6",
  };
  if (!path[turnStatus]) return null;
  return (
    <span
      title={title[turnStatus]}
      className={`inline-block ${size} ${iconStyles[turnStatus]}`}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="h-full w-full"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d={path[turnStatus]}
        />
      </svg>
    </span>
  );
};

export const PlayerStatusPill = ({ status }) => {
  const baseClasses = "px-2 py-0.5 text-xs font-semibold rounded-full";
  const statusStyles = {
    ACTIVE: "bg-green-600 text-white",
    SURRENDERED: "bg-yellow-500 text-black",
    DISCONNECTED: "bg-gray-500 text-white",
  };
  return (
    <span className={`${baseClasses} ${statusStyles[status] || "bg-gray-400"}`}>
      {status}
    </span>
  );
};

// Added className prop to allow passing styles
export const GameLog = ({ logs, className = "" }) => {
  const logEndRef = useRef(null);
  const gameLogs = logs || [];
  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [gameLogs]);

  return (
    <div
      className={`w-full h-full bg-gray-900 bg-opacity-80 rounded-lg p-3 font-mono text-xs text-white overflow-y-auto shadow-inner flex flex-col ${className}`}
    >
      {gameLogs.length > 0 ? (
        gameLogs.map((log, index) => (
          <p key={index} className="text-green-400">
            <span className="text-gray-500 mr-2">&gt;</span>
            {log}
          </p>
        ))
      ) : (
        <p className="text-gray-500 m-auto">Game log is empty.</p>
      )}
      <div ref={logEndRef} />
    </div>
  );
};

// --- UPDATED LURE ICON ---
// Now renders an image instead of a text pill
export const LureIcon = ({ lure, size = "w-8 h-8" }) => {
  const primaryLure = lure ? lure.split("/")[0].toUpperCase() : "UNKNOWN";
  const iconSrc = LURE_ICON_MAP[primaryLure] || LURE_ICON_MAP.UNKNOWN;

  const lureText = {
    RAGS: "Rags",
    NOISES: "Noises",
    FRUIT: "Fruit",
    "BLOODY RAGS": "Bloody Rags",
    "STRANGE NOISES": "Strange Noises",
    "FALLEN FRUIT": "Fallen Fruit",
  };

  return (
    <img
      src={iconSrc}
      alt={lureText[primaryLure] || "Lure"}
      title={lureText[primaryLure] || "Unknown Lure"}
      className={`${size} object-contain`}
      onError={(e) => (e.target.style.display = "none")}
    />
  );
};

export const PlayerTag = ({ username }) => {
  return (
    <div className="absolute -top-3 -right-3 bg-indigo-600 text-white text-xs font-bold px-2 py-1 rounded-full shadow-lg border-2 border-gray-800 z-10">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="h-4 w-4 inline-block mr-1"
        viewBox="0 0 20 20"
        fill="currentColor"
      >
        <path
          fillRule="evenodd"
          d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z"
          clipRule="evenodd"
        />
      </svg>
      {username}
    </div>
  );
};

export const ScrapIcon = ({
  image,
  icon,
  count,
  textColor = "text-white",
  size = "w-8 h-8",
  onClick,
}) => (
  <div
    className={`relative ${size} ${onClick ? "cursor-pointer" : ""}`}
    onClick={onClick}
  >
    {image && (
      <img
        src={image}
        alt="scrap icon"
        className="w-full h-full object-contain"
      />
    )}
    {!image && icon && <div className="w-full h-full p-0.5">{icon}</div>}
    <div className="absolute -top-1 -right-1 bg-black bg-opacity-70 rounded-full w-5 h-5 flex items-center justify-center">
      <span
        className={`${textColor} font-bold text-xs`}
        style={{ textShadow: "1px 1px 1px black" }}
      >
        {count}
      </span>
    </div>
  </div>
);
