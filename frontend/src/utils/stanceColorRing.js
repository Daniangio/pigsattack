// src/utils/stanceColorRing.js
export function stanceColorRing(stance) {
  const normalized = (stance || "").toUpperCase();
  switch (normalized) {
    case "AGGRESSIVE":
      return "border-red-500 shadow-red-500/40";
    case "TACTICAL":
      return "border-blue-500 shadow-blue-500/40";
    case "HUNKERED":
      return "border-green-500 shadow-green-500/40";
    case "BALANCED":
    default:
      return "border-amber-400 shadow-amber-400/40";
  }
}
