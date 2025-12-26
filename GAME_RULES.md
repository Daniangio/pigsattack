# 🐗 Wild Pigs Will Attack!
### Rulebook v4.8 — Tactical Survival in a World of Mutant Boars  
_A resource-engine survival board game for 2–5 players._

---

## 1. Game Overview

The world has fallen to mutated boars whose:

- **Ferocity** (Red)
- **Cunning** (Blue)
- **Mass** (Green)

grow more dangerous with every round.

You and the other survivors must endure two Eras — **Day** and **Night** — each ending in a brutal **Boss fight**.  
You win by building an efficient engine, managing risk, and earning the most **Victory Points (VP)** from:

- Defeated threats  
- Purchased upgrades  
- Boss rewards  
- Minimizing Wounds

At the end of the Night Era, the player with the highest total VP wins.

**Tiebreakers** (in order):

1. Fewest Wounds  
2. Most threats defeated  
3. Most resources remaining

---

## 2. Components

### 2.1 Player Boards

Each player board shows:

- A **Stance wheel** (Aggressive / Tactical / Hunkered / Balanced)  
- Resource tracks for:
  - Red (Ferocity)
  - Blue (Cunning)
  - Green (Mass)
- Slots for:
  - **Upgrades** (start with 1 slot, max 4)
  - **Weapons** (start with 1 slot, max 4)

---

### 2.2 Cards

- **Day Threat Deck**  
- **Night Threat Deck**  
- **Boss Deck**: 2 Boss cards (Day Boss, Night Boss)  
- **Upgrades Deck**  
- **Weapons Deck**

---

### 2.3 Tokens & Cubes

**Resource Cubes**

- Red (R) — Ferocity  
- Blue (B) — Cunning  
- Green (G) — Mass  

**Player Tokens**

- **Wild Token** ♻  
  - One use  
  - Gain +1 cube of any color

- **Attack Token** 🟥⚔  
  - One use  
  - Reduce the **Red** cost of a single fight by **2R**

- **Conversion Token** 🔄  
  - One use  
  - Convert up to **3 cubes** of the same color into another color in your pool

- **Mass Token** 🟩🛡  
  - Permanent  
  - Reduce the **Green** cost of all fights by **2G**

- **Wound Token** 💀  
  - VP penalty at game end

**Enemy Tokens**

- **Weight Token** ⏫  
  - Placed on **Massive threats**  
  - Each Weight increases that threat’s **Green cost by +1G**
  - Threats cannot have more than 3 *Weight tokens** placed on

- **Enrage Token** 🔥  
  - Placed on **any threat** that becomes Enraged  
  - Enraged threats:
    - Have **+2R** added to their cost  
    - **Cannot be avoided** by stance: *all* stances are weak to Enraged threats
  - **Bonus VP:** Defeating an enraged threat grants **+1 additional VP**

> **Token Limit:**  
> Each player may hold at most **3** of each positive token type (Wild, Attack, Conversion, Mass).

---

## 3. Core Concepts

### 3.1 Resources

Your engine is built around the three base resources:

- **Red (R)** — Ferocity  
- **Blue (B)** — Cunning  
- **Green (G)** — Mass  

You gain resources at the **start of your turn** from your stance and upgrades, then spend them to:

- Fight threats  
- Buy upgrades  
- Buy weapons

---

### 3.2 Stances

Your **stance** determines:

- Your **resource production**  
- Which threat types you are **naturally weak** to (i.e., which attacks can hurt you)

| Stance      | Start-of-Turn Production | Naturally Weak To      | Playstyle                 |
| ----------- | ------------------------ | ---------------------- | ------------------------- |
| Aggressive  | 5R / 0B / 1G            | **Feral & Hybrid**     | High tempo, high risk    |
| Tactical    | 1R / 5B / 0G            | **Cunning & Hybrid**   | Efficient, opportunistic |
| Hunkered    | 0R / 1B / 5G            | **Massive & Hybrid**   | Slow, resilient          |
| Balanced    | 2R / 2B / 2G            | **Feral, Cunning, Massive** (not Hybrid) | Flexible but exposed |

> **Balanced stance** is weak to **all basic types** (Feral, Cunning, Massive)  
> but **not** weak to **Hybrid** threats.  

**All stances are weak to Enraged threats.**

#### Re-Stance (Changing Stance)

- **Main Action:** Re-Stance  
- Choose any other stance  
- No extra benefits — purely tactical

---

### 3.3 Threat Board (Lanes & Rows)

Number of **lanes = number of players**.

Each lane has three visible positions:

```text
(Threat Deck)
|
Back
|
Mid
|
Front
```

* New threats always enter the **Back** position
* Threats move forward (Back → Mid → Front) during **End of Round**
* Threats **do not collapse** when others are removed — you always fill from the Back
* Threats already in front position gain an **Enrage Token** 🔥

---

### 3.4 Market Lanes (New Stock & Carryover)

Both the **Upgrade** and **Weapon** markets have two lanes:

* **New Stock (Top Lane)** — freshly revealed this round
* **Carryover (Bottom Lane)** — cards that survived the previous round

At the start of each round, the Carryover lane is cleared, New Stock slides down into Carryover, and New Stock is refilled.
Markets are **not** refilled immediately after purchases; availability only changes when the round advances.

---

## 4. Setup

1. **Choose Era Order**

   * The game has 2 Eras: **Day**, then **Night**

2. **Threat Decks**

   * Build the **Day Threat Deck** with:

     * `4 × N_players` Day threats
   * Build the **Night Threat Deck** similarly:

     * `4 × N_players` Night threats

3. **Boss Deck**

   * Place **Day Boss** face-up near the board (for reference)
   * Place **Night Boss** face-up nearby

4. **Player Boards**

   * Each player takes a board, stance marker, and starting slots:

     * 1 Upgrade slot
     * 1 Weapon slot
   * All players start in **Balanced** stance
   * Set all resources and tokens to zero

5. **Threat Board**

   * Reveal **N_players threats** from the **Day Threat Deck**, filling Back lane

6. **Markets**

   * Shuffle Upgrades Deck and Weapons Deck separately
   * Reveal **N_players + 1** **Upgrades** into **New Stock (Top Lane)**
   * Reveal **N_players + 1** **Weapons** into **New Stock (Top Lane)**
   * **Carryover (Bottom Lane)** starts empty

7. **Round & Turn Order**

   * Choose a starting player randomly
   * Place a Round marker at **Round 1 (Day Era)**
   * Play proceeds clockwise

---

## 5. Game Flow

The game is played in **Rounds**.
Each Round, every player takes **one turn**, then threats **advance** and the Round counter may progress toward the Boss.

### 5.1 Start of Round

At the **start of each Round** (Day or Night):

1. **Refill Markets**

   * **Discard** all cards in **Carryover (Bottom Lane)**
   * **Move** all cards from **New Stock (Top Lane)** into **Carryover**
   * **Refill New Stock** back up to `N_players + 1` cards
   * If a market deck runs out, **shuffle its discarded cards** to rebuild it

2. **(Night Only)**

   * If this is the first Round of the Night Era, set up Night Threats (as in Setup step 5)
     and reset the Round marker to **Round 1 (Night)**

> Round numbers are tracked **per Era**.
> The **Day Boss** appears after Round 6 of Day;
> the **Night Boss** appears after Round 6 of Night.

---

### 5.2 Player Turn

On your turn, perform the following steps in order.

#### 1. Start of Turn

* Gain resources from your **stance**
* Gain any additional income from **upgrades**

#### 2. Main Action (Choose ONE)

You must choose **one** of the following main actions:

1. **Fight** — Attack a threat (see Section 7.4)
2. **Re-Stance**
   * Change your stance to any other stance
3. **Prepare**
   * Gain **1 token** of your choice:
     * Attack token
     * Conversion token
     * Wild token
   * If you own an upgrade that unlocks Mass tokens:
     * You may choose a **Mass token** instead
   * You cannot choose a token for which you already possess max number of copies (which is 3 by default)

#### 3. Optional Action (Once Per Turn)

At **any time** during your turn (before or after your main action), you may:

* **Buy 1 Upgrade** *or* **1 Weapon**:
  * Pay its resource cost
  * Place it in a matching free slot
  * If you cannot afford it or have no free slot, you cannot buy

*(You may not buy more than 1 card per turn.)*

* **Extend Slot**:
   * Pay 1 Wild Token -> Gain **+1 Upgrade slot** **or** **+1 Weapon slot** (max 4 each)

#### 4. End of Turn — Threat Attacks & Massive Growth

At the end of your turn, in order:

1. **Gain 1 Wild token** (capped at 3 total)
1. **Massive Weight Growth**

   * For each **Massive threat** in **Front** row:
     * Add **1 Weight token** to that threat, only if the number of **Weight tokens** already present is smaller than 3
     * Each Weight token increases its **G** cost by **+1G**


2. **Threat Attacks**

   * Each threat in **Front** row of any lane that your stance is **weak to** attacks you
   * See **Section 7.3** for detailed attack rules

---

### 5.3 End of Round — Threat Advance & Enrage

After **all players** have taken one turn in the Round:

1. **Threat Enrage (Front)**

   * For each lane, any threat currently in **Front** row that is still alive
     receives **1 Enrage token** 🔥:
     * Its cost gains **+2R**
     * It is now **Enraged** and **cannot be avoided by stance**; every stance is weak to it. Threats can become enraged only once.

2. **Threat Advance**

   * For each lane:
     * If **Front** is empty, move **Mid → Front**
     * If **Mid** is now empty, move **Back → Mid**

3. **Threat Spawn**

   * For each lane, if **Back** is empty:
     * Reveal the top card of the current Era’s Threat Deck into the **Back** row

4. **Round Counter**

   * Increase the current Era’s **Round number by 1**
   * If the Round just completed was **Round 6** of the current Era:

     * **Immediately trigger the Boss Phase** (Section 8)
     * Any remaining threats on the board are **ignored** during the Boss Phase and **discarded** afterwards

5. **Initiative**

   * Pass the First Player token **counter-clockwise** (last player in previous round becomes the first player in next round, effectively playing two turns in a row)
   * If the Era is not over, begin the next Round

---

## 6. Player Actions — Details

### 6.1 Fight

You may fight the **frontmost visible threat** of any lane:

* “Frontmost visible” means:

  * If **Front** is occupied, you must target that card
  * If Front is empty but Mid is occupied, you may target Mid
  * If both Front & Mid are empty but Back has a card, you may target Back

To defeat a threat, you must pay:

* All **R/B/G costs**, after applying:

  * Owned Upgrades discounts
  * Played Weapons
  * Owned **Mass tokens** (−2G per Mass token on your board)
  * Played **Attack tokens** (−2R once)
  * Played **Wild tokens** (counts as 1 resource of any color)

If you cannot pay the full cost, you cannot initiate the fight.

On success:

* Gain its **Spoils** (tokens, bonuses, or other effects)
* Remove the threat from the board:

  * Place it in your **Trophies** area (some abilities may interact with trophies)
  * You will count threat’s **VP value** during end game VP count

---

* Choose:

  * +1 **Upgrade slot**
  * OR +1 **Weapon slot**
* You may never exceed **4 slots** of each type

Extending does **not** grant tokens or VP directly; it increases your capacity for future engine building.

---

### 6.2 Re-Stance

* Change your stance to any other stance
* No additional benefit
* Used to avoid or provoke certain threat types, or to change resource production

---

### 6.3 Prepare

* Gain exactly **1 token** from:
  * **Attack**
  * **Conversion**
  * **Wild**
* If you own an upgrade that **unlocks Mass tokens**:
  * You may choose a **Mass token** instead

Prepare is your “no dead turn” action: it advances your position even when you can’t or don’t want to fight or re-stance.

---

## 7. Threats & Attacks

### 7.1 Threat Anatomy

Each threat card includes:

* **Type**: Feral, Cunning, Massive, or Hybrid
* **Cost**: R / B / G resource vector (e.g., 7R + 2B + 0G)
* **VP**: Victory Points for defeating it
* **Spoils**: Reward (tokens, effects, etc.)

**Day Threats:**

* Total cost typically **9–14**

**Night Threats:**

* Total cost typically **12–20**

---

### 7.2 Threat Types

#### Feral (🟥)

* Represents raw aggression and frontal assault
* Attack effect: **Wound the victim**

#### Cunning (🟦)

* Represents raiding, sabotage, and resource theft
* Attack effect: **Steal 2 resources** of your choice

  * If you have **fewer than 2** cubes: steal what you have and take **1 Wound**

#### Massive (🟩)

* Represents heavily armored, slow-moving behemoths
* Gains **Weight tokens** after each player turn while in Front row, just before attacking. Cannot have more than 3 **Weight tokens** placed on.
* Attack effect:

  * If the Massive threat has **3 or more Weight tokens**
  * And your stance is weak to Massive (Hunkered / Balanced, or any stance if Enraged)
  * You take **1 Wound**

#### Hybrid (🟨)

* Blends traits of multiple types
* The **attack effect depends on the stance** of the victim:

  * If target stance is **Aggressive** → treat Hybrid as **Feral** (1 Wound)
  * If **Tactical** → treat as **Cunning** (Steal 2; if 0, 1 Wound)
  * If **Hunkered** → treat as **Massive**:

    * Threat gains **+1 Weight token**
    * If Weight ≥3, it also inflicts **1 Wound**
  * If **Balanced** → Hybrid **does not attack** (unless Enraged, in that case it inflicts **1 Wound**)

> **Important:**
>
> * Balanced stance is naturally **safe from Hybrid attacks**
> * Enraged Hybrid threats ignore this safety and can attack any stance.

---

### 7.3 Vulnerabilities & Enraged Threats

#### Natural Vulnerabilities (Non-Enraged)

Without Enrage, a threat can attack a player at end of turn **only if**:

* The threat is in **Front row**, and
* The player’s stance is **weak to that threat’s type**, as follows:

| Stance     | Weak to these non-Enraged types        |
| ---------- | -------------------------------------- |
| Aggressive | Feral, Hybrid                          |
| Tactical   | Cunning, Hybrid                        |
| Hunkered   | Massive, Hybrid                        |
| Balanced   | Feral, Cunning, Massive *(not Hybrid)* |

#### Enraged Threats 🔥

A threat becomes **Enraged** when:

> During **End of Round**, it is in the **Front row** of its lane.

(Conceptually: the pig wants to push further forward but is already at the front, so it goes berserk.)

**Effects of Enrage:**

* Gain **1 Enrage token** 🔥
* Its cost gains **+2R** (Ferocity) — this stacks with other effects
* The threat now **ignores stance vulnerabilities**:

  * It is considered **able to attack any stance**
  * Use its normal type attack (Feral, Cunning, Massive, Hybrid) against any stance

For **Enraged Hybrid threats**:

* They always use the **stance-based attack** as defined above
* Balanced stance is **no longer safe** — Hybrids can attack Balanced when Enraged

Enrage tokens remain on a threat until it is defeated.

---

### 7.4 Massive Threats & Weight Tokens

* Whenever a **Massive threat** is in **Front row** at the **end of a player’s turn**:

  * If the number of **Weight tokens** is < 3, it gains **+1 Weight token** ⏫

Each Weight token:

* Increases that threat’s **G cost by +1G**
* Counts toward the **Weight ≥3** threshold for Massive attack effects

Hybrid threats treated as Massive (when attacking Hunkered stance) also gain Weight tokens via their Hybrid rule.

---

## 8. Bosses & Era End

Each game has two Boss fights:

1. **Day Boss** — at end of Day Era
2. **Night Boss** — at end of Night Era

### 8.1 Boss Timing

* Track **Round number per Era** (Day: Rounds 1–6, then Night: Rounds 1–6)

* After completing **Round 6** (i.e., after End-of-Round step):

  > **Immediately start the Boss Phase** for that Era.

* When the Boss Phase begins:

  * **Ignore any remaining threats** on the board
  * They neither advance nor attack during Boss Phase
  * After Boss is resolved, remaining threats are **discarded**

### 8.2 Boss Card Structure

Each Boss card shows several **Thresholds**. Each threshold has:

* A **cost** in R/B/G
* A **reward** (VP, tokens, slots, etc.)
* A **penalty** if unpaid (Wounds, resource loss, etc.)

### 8.3 Boss Phase (Simultaneous)

During the Boss Phase:

1. Each player independently chooses **which thresholds** they will attempt to pay
2. For each chosen threshold:

   * If the player can pay the cost:
     * They gain the **reward**
   * If they do not pay that threshold:
     * They suffer the **penalty**

Players resolve all thresholds they choose (or fail) in any order they prefer.
The Boss does not occupy lanes and does not gain Weight or Enrage tokens.

### 8.4 Transition Between Eras

* After resolving the **Day Boss**:

  * Discard all remaining threats and reset the Threat board
  * Set up the **Night Threat Deck** on Back lane (draw N_Players threats)
  * Reset the Round marker to **Night, Round 1**

* After resolving the **Night Boss**:

  * The game ends
  * Proceed to **final scoring**

---

## 9. Wounds & Scoring

### 9.1 Wounds

* Each **Wound token** 💀 is **−1 VP**
* If you have **5 or more** Wounds:

  * You suffer a flat **−10 VP total** from Wounds
* If you have **10 or more** Wounds:

  * The flat Wound penalty becomes **−20 VP total**

You cannot remove Wounds unless an effect explicitly says so.

---

### 9.2 Final Scoring

At the end of the Night Boss Phase:

1. Sum VP from:

   * Owned VP tokens (e.g. from defeating Boss thresholds)
   * Threats you defeated
   * Upgrades and Weapons that provide VP
   * Any special scoring effects

2. Apply Wound penalty:

   * If Wounds ≤ 4 → subtract that number from VP
   * If 5–9 Wounds → **subtract 10 VP**
   * If ≥10 Wounds → **subtract 20 VP**

The player with the highest final VP total wins.
Use tiebreakers listed in **Section 1** if needed.

---

## 10. Quick Reference

### 10.1 Turn Summary

**Start of Turn**

* Gain resources from stance
* Apply per-turn upgrade effects

**Main Action (choose ONE)**

* Fight
* Re-Stance
* Prepare (gain 1 token)

**Optional (once)**

* Buy 1 Upgrade **or** 1 Weapon, any time during your turn
* Pay 1 Wild token -> Extend Slot, any time during your turn

**End of Turn**

* Gain 1 Wild token (max 3)
* Front Massive threats each gain **+1 Weight**
* Front threats attack (based on vulnerabilities & Enrage)

---

### 10.2 End of Round Summary

After all players have taken 1 turn:

1. Front threats become **Enraged** (gain 🔥, +2R, attack any stance)
2. Threats Advance (Mid → Front, Back → Mid where applicable)
3. Threats Spawn into Back from current Era’s Deck
4. Increase Round number

   * If Round 6 just finished:
     * Trigger Boss Phase
5. Pass First Player token counter-clockwise

---

### 10.3 Start of Round Summary

* Refill Upgrade Market to `N_players + 1` cards
* Refill Weapon Market to `N_players + 1` cards
* (If beginning the Night Era) Set up Night Threats and reset Round count

---

## 10.5 Boss Phase (Day & Night)

- After **Round 6 of each Era**, a **Boss Phase** begins.
- Clear the threat rows and reveal the current **Boss card** (Day Boss after the Day Era, Night Boss after the Night Era).
- Each Boss has multiple **thresholds**; each threshold:
  - Lists a **cost** (pay like a normal fight; tokens may reduce costs).
  - Grants its **spoil** immediately when defeated.
- On your turn during the Boss Phase:
  - You may fight any undefeated threshold; if you win, you may attempt another threshold in the same turn.
  - End your turn when done.
- When all players have taken a turn in the Boss Phase *or* all thresholds are defeated:
  - After the **Day Boss**, set up the **Night deck**, draw 3 threats, and begin **Night Round 1**.
  - After the **Night Boss**, the game ends; total VP to determine the winner.

---

## 11. Glossary

* **Front / Mid / Back Lane** — A horizontal row of threats
* **Threat** — Enemy card occupying a lane position
* **Spoils** — Rewards for defeating a threat
* **Stance** — Your current role defining production & vulnerabilities
* **Weight Token** — Increases a Massive threat’s G cost by +1G
* **Enrage Token** — Increases a threat’s R cost by +2R and makes it able to attack any stance
* **Wound** — VP penalty token (−1 VP, capped at −10 VP total)
* **Era** — Day or Night segment of the game, each followed by a Boss
* **Market** — Row of face-up Upgrades or Weapons available to buy
* **Prepare Action** — Main action that grants 1 token (Attack, Conversion, Wild, or Mass if unlocked)

---
