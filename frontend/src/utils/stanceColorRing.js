// src/utils/stanceColorRing.js
export function stanceColorRing(stance) {
  switch (stance) {
    case "Aggressive":
      return "border-red-500 shadow-red-500/40";
    case "Tactical":
      return "border-blue-500 shadow-blue-500/40";
    case "Hunkered":
      return "border-green-500 shadow-green-500/40";
    case "Balanced":
    default:
      return "border-amber-400 shadow-amber-400/40";
  }
}
