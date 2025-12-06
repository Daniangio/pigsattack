const threatGlobs = import.meta.glob("../images/cards/threats/*.{jpg,png}", { eager: true });

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
  const base = key.replace(/\.(jpg|png)$/i, "");
  const found = Object.entries(threatImageMap).find(([k]) => k.startsWith(base));
  return found ? found[1] : null;
};
