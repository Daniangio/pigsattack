# Bot Balancing Tool

This document describes the metrics produced by bot simulations and how they are used in Balance Lab and the Simulation Results views.

## 1. Data Capture During Simulation

Card stats are tracked during each run and then aggregated into `card_balance_data`.

### Market appearances

- `times_offered` increments each time a card enters a visible market slot.
- A card is not re-counted until it leaves and re-enters a slot.

### Purchases vs utility

- `times_bought`: successful `buy_upgrade` / `buy_weapon` actions.
- `times_activated`: successful `activate_card` actions (typically upgrades).
- `times_used`: successful `fight` actions where the weapon was played.

### Buy timing

- `buy_turn_histogram`: round -> buy count.
- `buy_turn_histogram_day` and `buy_turn_histogram_night`: same, split by era.

### Retention

- `retention_turns_total`: sum of `(final_round - buy_round)` for each purchase.
- `retention_samples`: number of purchases.

### Delta VP tracking

Delta VP measures how much a card helps a buyer outscore opponents.

- `delta_vp` per player is computed as:
  - `player_score - average(opponent_scores)`
  - `score` is VP minus wound penalties from the final report.
- A card inherits the buyer's delta VP for that run.
- `turns_held = total_game_turns - turn_acquired` using absolute turns
  (Day 1-6, Night 7-12). If `turns_held` would be 0, it is clamped to 1.
- `delta_vp_norm = delta_vp / turns_held`.

Acquisition bins:

- Early: turns 1-4
- Mid: turns 5-8
- Late: turns 9-12

Each bin stores sum and count for average calculation.

## 2. Derived Metrics

### Pick rate

- `pick_rate = times_bought / times_offered`

### Win Rate Added (WRA)

- `win_rate_when_owned = wins_with_card / games_with_card`
- `baseline = 1 / bot_count`
- `win_rate_added = win_rate_when_owned - baseline`

### Timing-weighted WRA

- `avg_buy_turn_ratio = buy_turns_ratio_total / buy_turns_ratio_samples`
- `win_rate_added_weighted = win_rate_added * (1 - avg_buy_turn_ratio)`

### Delta VP averages

- `avg_delta_vp = delta_vp_total / delta_vp_samples`
- `avg_delta_vp_norm = delta_vp_norm_total / delta_vp_norm_samples`
- `avg_delta_vp_early/mid/late = delta_vp_<bin>_total / delta_vp_<bin>_samples`

### Power score

Weighted sum to emphasize early-game impact:

```
Power Score = (DeltaVP_early * 1.2) + (DeltaVP_mid * 1.0) + (DeltaVP_late * 0.8)
```

### Delta VP diagnosis patterns

- Snowball: early strongly positive, late weak or average.
- Finisher: early weak or negative, late strongly positive.
- Delta Trap: early negative, late negative.
- Panic Button: early weak, late positive.
- Anchor: early negative, late near zero.

## 3. Tag Assignment (Balance Lab)

Tags combine win-rate impact, pick rate, and Delta VP signals to avoid over-indexing on a single metric.

1. Compute medians and thresholds:
   - `pick_rate_median` across the deck.
   - `wra_strong = 0.05`, `wra_weak = 0.02`.
   - `delta_strong` from median `|avg_delta_vp|`, `delta_weak = delta_strong * 0.5`.
2. A Delta VP signal is considered only when `delta_vp_samples >= 5`.
3. Positive signal if:
   - `win_rate_added >= wra_strong`, or
   - `avg_delta_vp >= delta_strong` and `win_rate_added > -wra_weak`.
4. Negative signal if:
   - `win_rate_added <= -wra_strong`, or
   - `avg_delta_vp <= -delta_strong` and `win_rate_added < wra_weak`.
5. Tag resolution:
   - Positive signal → `Overpowered` (high pick) or `Sleeper` (low pick).
   - Negative signal → `Trap` (high pick) or `Underpowered` (low pick).
   - If `|win_rate_added| <= wra_weak` and Delta VP is neutral/absent → `Balanced`.
   - Otherwise → `Swingy`.
6. Additional tags:
   - `Utility`: low-cost, highly flexible weapons (cost sum <= 2, flex >= 0.9, output <= 3) unless severely negative.
   - `Situational`: pick rate below 60% of median with weak WRA.
   - `Tempo` / `Finisher`: buy timing skewed to day/night or by average acquire turn.
   - `VP <Pattern>` tags (Snowball, Finisher, Delta Trap, Panic Button, Anchor) derived from early/mid/late Delta VP.

## 4. Visualizations

### Simulation Results: Balance Matrix

- Scatter plot: Pick rate vs WRA.
- Table: pick rate, WRA, timing-weighted WRA, activation efficiency, average buy turn, retention.

### Balance Lab: Deck Analysis

- Design Space: math score vs WRA scatter.
- Delta VP Timing: average turn acquired vs average Delta VP scatter.
- Card Evaluation table:
  - Delta VP column shows raw and normalized averages (click for profile).
  - Buy distribution is split into Day and Night.
  - Era WRA, synergy, and anti-synergy panels help explain interactions.
- Delta VP profile modal:
  - Early/Mid/Late bar chart, counts, power score, and diagnosis label.

## 5. Result Schema Highlights

`card_balance_data` includes:

- `times_offered`, `times_bought`, `times_activated`, `times_used`
- `wins_with_card`, `games_with_card`
- `buy_turns_total`, `buy_turns_samples`, `buy_turn_histogram`, `buy_turn_histogram_day`, `buy_turn_histogram_night`
- `buy_turns_ratio_total`, `buy_turns_ratio_samples`
- `retention_turns_total`, `retention_samples`
- `retention_turns_ratio_total`, `retention_turns_ratio_samples`
- `delta_vp_total`, `delta_vp_samples`, `delta_vp_norm_total`, `delta_vp_norm_samples`
- `delta_vp_early_total`, `delta_vp_early_samples`
- `delta_vp_mid_total`, `delta_vp_mid_samples`
- `delta_vp_late_total`, `delta_vp_late_samples`
- `win_rate_when_owned`, `win_rate_added`, `win_rate_added_weighted`

`card_usage` remains available as a legacy activity count (activations + weapon uses), but balance decisions should rely on `card_balance_data`.
