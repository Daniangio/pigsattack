export const ThreatData = {
  boss: {
    id: "boss-day",
    name: "Titan Boar",
    vp: 10,
    thresholds: [
      { label: "Light Strike", cost: "6R + 4B", reward: "1 Boss Token" },
      { label: "Crushing Blow", cost: "8R + 4G", reward: "2 Tokens + Slot" },
      { label: "Perfect Kill", cost: "10R + 6B + 4G", reward: "3 Tokens + 4 VP" },
    ],
  },

  rows: [
    [
      { id: "t1", name: "Razorbacks", cost: "6R + 1G", vp: 3, type: "Feral", reward: "+Attack" },
      { id: "t2", name: "Scrap Ambushers", cost: "4R + 2B", vp: 2, type: "Hybrid", reward: "+Conversion" },
    ],
    [
      { id: "t3", name: "Spine Sprinters", cost: "3R + 3B", vp: 2, type: "Cunning", reward: "+Wild" },
      { id: "t4", name: "Wall Breakers", cost: "2R + 4G", vp: 3, type: "Massive", reward: "+Mass" },
    ],
    [
      { id: "t5", name: "Night Prowlers", cost: "5R + 2B", vp: 4, type: "Feral", reward: "+Attack" },
      { id: "t6", name: "Charging Herd", cost: "2R + 5G", vp: 4, type: "Massive", reward: "+Mass" },
    ],
  ],
};
