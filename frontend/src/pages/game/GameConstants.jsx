// --- ORIGINAL IMAGE IMPORTS ---
import gameBackground from "../../images/game-background.png"; // Load the background image

// --- CARD IMAGES ---
import bloodyRagsCard from "../../images/cards/lure-bloody-rags.png";
import strangeNoisesCard from "../../images/cards/lure-strange-noises.png";
import fallenFruitCard from "../../images/cards/lure-fallen-fruit.png";
import unknownLureCard from "../../images/cards/lure-unknown.png";
import scavengeCard from "../../images/cards/action-scavenge.png";
import fortifyCard from "../../images/cards/action-fortify.png";
import armoryRunCard from "../../images/cards/action-armory-run.png";
import schemeCard from "../../images/cards/action-scheme.png";
import unknownCard from "../../images/cards/action-unknown.png";

// --- UI COMPONENTS ---
import playerFrame from "../../images/player-frame.png";
import scrapsParts from "../../images/icons/scraps-parts.png";
import scrapsWiring from "../../images/icons/scraps-wiring.png";
import scrapsPlates from "../../images/icons/scraps-plates.png";
import playerIcon1 from "../../images/player-icon-1.png";
import playerIcon2 from "../../images/player-icon-2.png";
import playerIcon3 from "../../images/player-icon-3.png";
import playerIcon4 from "../../images/player-icon-4.png";
import playerIcon5 from "../../images/player-icon-5.png";

// --- NEW V1.1 ICON IMPORTS ---
import ferocityIcon from "../../images/icons/ferocity-icon.png";
import cunningIcon from "../../images/icons/cunning-icon.png";
import massIcon from "../../images/icons/mass-icon.png";
import lureRagsIcon from "../../images/icons/lure-bloody-rags-icon.png";
import lureNoisesIcon from "../../images/icons/lure-strange-noises-icon.png";
import lureFruitIcon from "../../images/icons/lure-fallen-fruit-icon.png";

// --- END ORIGINAL IMAGE IMPORTS ---

// --- EXPORT IMAGES ---
// This makes them available to all other game components
export {
  gameBackground,
  bloodyRagsCard,
  strangeNoisesCard,
  fallenFruitCard,
  unknownLureCard,
  scavengeCard,
  fortifyCard,
  armoryRunCard,
  schemeCard,
  unknownCard,
  playerFrame,
  scrapsParts,
  scrapsWiring,
  scrapsPlates,
  playerIcon1,
  playerIcon2,
  playerIcon3,
  playerIcon4,
  playerIcon5,
  // NEW ICONS
  ferocityIcon,
  cunningIcon,
  massIcon,
  lureRagsIcon,
  lureNoisesIcon,
  lureFruitIcon,
};
// --- END EXPORT IMAGES ---

export const BASE_DEFENSE_FROM_ACTION = {
  SCAVENGE: { PARTS: 0, WIRING: 2, PLATES: 0 },
  FORTIFY: { PARTS: 0, WIRING: 0, PLATES: 2 },
  ARMORY_RUN: { PARTS: 2, WIRING: 0, PLATES: 0 },
  SCHEME: { PARTS: 1, WIRING: 1, PLATES: 1 },
};

export const LURE_CARDS = [
  { id: "BLOODY_RAGS", name: "Bloody Rags", image: bloodyRagsCard },
  { id: "STRANGE_NOISES", name: "Strange Noises", image: strangeNoisesCard },
  { id: "FALLEN_FRUIT", name: "Fallen Fruit", image: fallenFruitCard },
];

export const ACTION_CARDS = [
  { id: "SCAVENGE", name: "Scavenge", image: scavengeCard },
  { id: "FORTIFY", name: "Fortify", image: fortifyCard },
  { id: "ARMORY_RUN", name: "Armory Run", image: armoryRunCard },
  { id: "SCHEME", name: "Scheme", image: schemeCard },
];

export const SCRAP_TYPES = {
  PARTS: {
    name: "Parts",
    color: "text-red-400",
    bg: "bg-red-900",
    img: scrapsParts,
    statIcon: ferocityIcon, // Ferocity is Red (Parts)
  },
  WIRING: {
    name: "Wiring",
    color: "text-blue-400",
    bg: "bg-blue-900",
    img: scrapsWiring,
    statIcon: cunningIcon, // Cunning is Blue (Wiring)
  },
  PLATES: {
    name: "Plates",
    color: "text-green-400",
    bg: "bg-green-900",
    img: scrapsPlates,
    statIcon: massIcon, // Mass is Green (Plates)
  },
};

// NEW LURE ICON MAP
export const LURE_ICON_MAP = {
  RAGS: lureRagsIcon,
  NOISES: lureNoisesIcon,
  FRUIT: lureFruitIcon,
  "BLOODY RAGS": lureRagsIcon,
  "STRANGE NOISES": lureNoisesIcon,
  "FALLEN FRUIT": lureFruitIcon,
  UNKNOWN: unknownLureCard, // Fallback
};
