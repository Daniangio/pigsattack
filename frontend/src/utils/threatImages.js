import { buildApiUrl } from "./connection";

const threatGlobs = import.meta.glob("../images/cards/threats/*.{jpg,jpeg,png,webp}", { eager: true });

const threatImageMap = Object.fromEntries(
  Object.entries(threatGlobs).map(([path, mod]) => {
    const filename = path.split("/").pop();
    return [filename.toLowerCase(), mod.default];
  })
);

export const getThreatImage = (imageName) => {
  if (!imageName) return null;
  const key = imageName.toLowerCase();
  if (threatImageMap[key]) return threatImageMap[key];
  const base = key.replace(/\.(jpg|jpeg|png|webp)$/i, "");
  const found = Object.entries(threatImageMap).find(([k]) => k.startsWith(base));
  if (found) return found[1];
  // Fallback: fetch from custom uploads served by the backend
  return buildApiUrl(`/api/custom/threat-images/file/${encodeURIComponent(imageName)}`);
};
