Perfect 🌞➡️🌙 — I’ll keep the clean **Day vs Night table** for clarity, but add a **flavorful ASCII transition diagram** that feels thematic and dramatic. Here’s the final flavored README:

````markdown
# 🐗 Wild Pigs Will Attack
### A Game of Survival, Suspicion, and Sudden Swine

This repository contains the Python implementation of the card game **"Wild Pigs Will Attack,"** a tense, multiplayer survival game for **4–8 players**. This version is playable on the command line.

---

## ⚙️ Installation
Clone the repository and install in editable mode (recommended for development):

```bash
git clone https://github.com/Daniangio/pigsattack.git 
cd pigsattack
pip install -e .
````

This installs the package, dependencies (e.g. `numpy`), and makes the command-line script available.

---

## ▶️ How to Play

Run the game from your terminal:

```bash
pigsattack-play
```

Currently supports **4 human players** sharing the same terminal. Follow on-screen prompts to play.

---

## 📜 Rules

### 🌲 Game Overview

You are survivors in a makeshift camp, but the wilderness is closing in. Each turn, there's a chance a **wild pig will attack**.

You must:

* Defend yourself with cards
* Forge fragile alliances
* Survive the encroaching night... 🌙

**Goal:** Be the last survivor. If all fall, the pigs win.

---

### 🎴 Components

* A standard 52-card deck = **The Wilderness Deck**

| Card Type  | Value      | Role / Ability                                              |
| ---------- | ---------- | ----------------------------------------------------------- |
| 2–10       | Face value | **Basic Tools & Defenses**                                  |
| Jack (11)  | 11         | **Barricade** (−3 Strength vs pigs)                         |
| Queen (12) | 12         | **Sabotage** (steal a card)                                 |
| King (13)  | 13         | **King’s Feast** (everyone draws)                           |
| Ace (14)   | 14         | **Tranquilizer Dart** (auto-success, may trigger Nightfall) |

---

### 🛠️ Setup

1. Shuffle deck, place face-down (Draw Pile).
2. Deal 3 cards to each player.
3. Choose a starting player.

---

### 🔄 Turn Structure

```
┌─────────────┐
│ Start Turn  │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ 1. Event    │  → Reveal top card (attack / safe / find / stampede)
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ 2. Action   │  → Scrounge / Scout Ahead / Use Gear
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ 3. End Turn │  → Discard down to 6 cards
└─────────────┘
```

---

### 🌪️ Event Cards

| Drawn Card        | Event Name        | Effect |
|-------------------|------------------|--------|
| 2–7               | **Wild Pig Attack!** | Pig of that strength attacks. (Night: +2 Strength) |
| 8–10              | **Rustling Leaves** | **Day:** You are safe. <br> **Night:** **Stray Piglet Attack!** Pig of Strength 5 attacks you. ⚠️ *No help can be asked during a piglet attack.* |
| Jack / Queen      | **Wilderness Find** | **Day:** Discard 1 → draw 1. <br> **Night:** **Ambush!** Discard one random card from your hand. |
| Ace               | **Alpha Pig Attack!** | Nightfall triggered. Strength 14 pig attacks you. |
| King              | **The Stampede!** | Nightfall triggered. Strength 13 pig attacks all players. |

---

### 🎭 Actions

After the Event, you must choose **one**:

* **Scrounge** 🪓 → draw top card.
* **Scout Ahead** 🔭 → peek top card:

  * If 2–7 → keep it + bonus card
  * If 8–Ace → discard it, gain nothing
* **Use Special Gear** 🎖️ → play J/Q/K for its ability

---

### 💎 Special Gear Abilities

* **Jack (Barricade):** Play face-up. Permanently −3 Strength vs pigs attacking you.
* **Queen (Sabotage):** Peek at a player’s hand, steal 1 card.
* **King (Feast):** Draw 3 cards; all others draw 1.

---

### 🤝 Alliances & Helping

Before defending, you may **ask for help**:

* Other players may each offer 1 card face-down.
* You **must accept one** offer if you asked.
* Defense = your cards + helper’s card.

⚠️ Exception: During a **Stray Piglet Attack** (from Rustling Leaves at Night), no help may be asked.  
Piglets strike swiftly, and you must face them alone.

💰 **Rewards (Savior’s Spoils):**

* If you help another defend:

  * Standard Attack → you keep the pig card
  * Stampede → you draw 1 card immediately

---

### 🌞➡️🌙 Day vs Night

The game starts in **Daylight**. When Nightfall triggers, the rules shift dramatically:

| Aspect            | 🌞 Day                                                   | 🌙 Night                              |
| ----------------- | -------------------------------------------------------- | ------------------------------------- |
| Pig Attacks (2–7) | Pig attacks with shown strength                          | Pig strength = value + 2              |
| 8–10 Events       | Safe (no effect)                                         | Stray Piglet (Strength 5) attacks you |
| Jack/Queen Events | Wilderness Find: Discard 1 → draw 1                      | Ambush! Discard 1 random card         |
| Ace Event         | Alpha Pig Attack (Strength 14) + triggers Nightfall      | Same, but night is permanent          |
| King Event        | Stampede (Strength 13, all players) + triggers Nightfall | Same, but night is permanent          |

---

### 🌌 Nightfall Transition

```
         🌞 Daylight Camp
   ─────────────────────────
   Safe turns, cautious draws,
   whispers of pigs in the brush...

                 │
                 ▼
        🌒 Nightfall Triggered!
    (Ace Event, King Event, Ace Defense,
     First Elimination, or Deck Exhausted)

                 │
                 ▼
         🌙 The Night Has Fallen
   ─────────────────────────
   Pig attacks grow stronger.
   Stray piglets swarm.
   Ambushes erupt from the dark.
   The wilderness will not relent.
```

Once Night falls, it is **forever**.

---

### ☠️ Winning & Losing

* If you fail to defend → you’re **eliminated**.
* Last survivor = **winner**.
* If final player dies to pigs → **no winners**. The wilderness claims all. 🌲🐗

---

## 🐖 Survival Tip

* Trust no one completely.
* Sometimes the pigs aren’t the biggest threat…