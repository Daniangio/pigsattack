export function formatCost(cost) {
  if (!cost && cost !== 0) return "-";
  if (typeof cost === "string") return cost;
  const asNumber = (val) => (typeof val === "number" ? val : parseInt(val, 10) || 0);
  const normalize = (obj, key) =>
    obj?.[key] ??
    obj?.[key.toUpperCase()] ??
    obj?.[key.toLowerCase()] ??
    obj?.[key === "R" ? "RED" : key === "B" ? "BLUE" : "GREEN"] ??
    obj?.[key === "R" ? "Red" : key === "B" ? "Blue" : "Green"];

  const parts = [];
  const map = { R: "R", B: "B", G: "G" };
  Object.entries(map).forEach(([key, label]) => {
    const val = normalize(cost, key);
    if (val && asNumber(val) > 0) {
      parts.push(`${asNumber(val)}${label}`);
    }
  });
  return parts.length ? parts.join(" + ") : "0";
}

export function formatCostParts(cost) {
  if (!cost) return [];
  const normalize = (obj, key) =>
    obj?.[key] ??
    obj?.[key.toUpperCase()] ??
    obj?.[key.toLowerCase()] ??
    obj?.[key === "R" ? "RED" : key === "B" ? "BLUE" : "GREEN"] ??
    obj?.[key === "R" ? "Red" : key === "B" ? "Blue" : "Green"];
  const map = {
    R: "text-red-300",
    B: "text-blue-300",
    G: "text-green-300",
  };
  return Object.keys(map)
    .map((key) => ({ key, val: normalize(cost, key) || 0, className: map[key] }))
    .filter((p) => p.val > 0);
}

export function normalizeStance(stance) {
  if (!stance) return "Balanced";
  const upper = stance.toUpperCase();
  const map = {
    AGGRESSIVE: "Aggressive",
    TACTICAL: "Tactical",
    HUNKERED: "Hunkered",
    BALANCED: "Balanced",
  };
  return map[upper] || stance;
}
