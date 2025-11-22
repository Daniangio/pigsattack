export const MarketData = {
  upgrades: [
    { id: "u1", type: "Upgrade", name: "Ferocity Modulator", cost: "5B", vp: 2, effect: "+1R per round" },
    { id: "u2", type: "Upgrade", name: "Precision Optics", cost: "4B", vp: 2, effect: "Reduce highest enemy stat by 1" },
    { id: "u3", type: "Upgrade", name: "Mass Core", cost: "6G", vp: 3, effect: "+2G per round" },
    { id: "u4", type: "Upgrade", name: "Catalyst Array", cost: "4B + 2R", vp: 2, effect: "Wild → Conversion" },
  ],
  weapons: [
    { id: "w1", type: "Weapon", name: "Shockblade", cost: "4R", uses: 3, effect: "−3R in fights" },
    { id: "w2", type: "Weapon", name: "Thermal Lance", cost: "6R + 2G", uses: 1, effect: "−3 to all stats" },
    { id: "w3", type: "Weapon", name: "Snipe Scope", cost: "3B", uses: "∞", effect: "Shoot second-row" },
  ],
};
