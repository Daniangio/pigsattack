import copy
import itertools
import math
import random
from typing import Any, Dict, List, Optional, Sequence, Tuple

from game_core import GameSession, GamePhase, ResourceType, TokenType, Stance


def score_state(session: GameSession, player_id: str) -> float:
    player = session.state.players.get(player_id)
    if not player:
        return -1e9
    # Simple heuristic: VP plus weighted resources/tokens, minus wounds
    # Target ratio: ~5 resources ≈ 1 VP
    res_score = sum(player.resources.values()) * 0.2
    token_score = sum(player.tokens.get(t, 0) for t in TokenType) * 0.2
    weapon_value = 0.0
    # Value weapons by total fight cost reduction * remaining uses to reward preservation/usage
    for weapon in player.weapons or []:
        try:
            effects = session._card_effects(weapon)
        except Exception:
            effects = []
        reduction = sum(
            eff.amount or 0
            for eff in effects
            if eff.kind in {"fight_cost_reduction", "fight_cost_reduction_stance"}
        )
        if reduction <= 0:
            continue
        uses = getattr(weapon, "uses", None)
        remaining_uses = uses if uses is not None else 3
        weapon_value += reduction * max(0, remaining_uses)
    weapon_score = weapon_value * 0.1
    upgrade_value = 0.0
    for upgrade in player.upgrades or []:
        raw_cost = getattr(upgrade, "cost", {}) or {}
        # Costs are stored with ResourceType keys
        total_cost = sum(int(v or 0) for v in raw_cost.values())
        upgrade_value += total_cost * 1.2 - getattr(upgrade, "vp", 0)
    upgrade_score = upgrade_value
    if player.wounds >= 10:
        wound_penalty = 20.0
    elif player.wounds >= 5:
        wound_penalty = 10.0
    else:
        wound_penalty = player.wounds * 1.0
    # Empty slots are worth less than a token; occupied slots approximate the value of a token.
    total_slots = player.upgrade_slots + player.weapon_slots
    occupied = len(player.upgrades or []) + len(player.weapons or [])
    slot_score = total_slots * 0.1 + occupied * 0.9
    return player.vp + res_score + token_score + slot_score + weapon_score + upgrade_score - wound_penalty


class BotPlanner:
    def __init__(
        self,
        max_depth: int = 2,
        top_n: int = 5,
        max_branches: int = 150,
        rng: Optional[random.Random] = None,
    ):
        self.max_depth = max_depth  # number of this bot's future turns to explore
        self.top_n = top_n
        self.max_branches = max_branches
        self.rng = rng or random.Random()
        self._quiet = True  # disable logging in simulation clones
        self._score_cache: Dict[str, float] = {}

    async def plan(self, game: GameSession, player_id: str, personality: str = "greedy") -> Dict[str, Any]:
        base_round = getattr(game.state, "round", 0)
        base_era = getattr(game.state, "era", "day")
        start_score = self._score_state_cached(game, player_id)
        best_runs: List[Dict[str, Any]] = []
        best_runs: List[Dict[str, Any]] = []
        score_cache: Dict[str, float] = {}

        async def evaluate_turn(session: GameSession, turn_index: int, accumulated_steps: List[Dict[str, Any]]):
            if turn_index >= self.max_depth or session.state.phase == GamePhase.GAME_OVER:
                score = self._score_state_cached(session, player_id, score_cache)
                best_runs.append(
                    {
                        "round": getattr(session.state, "round", base_round),
                        "era": getattr(session.state, "era", base_era),
                        "start_score": start_score,
                        "score": score,
                        "actions": [s["action"] for s in accumulated_steps],
                        "steps": accumulated_steps,
                    }
                )
                return

            turn_plans = await self._enumerate_turn_plans(session, player_id)
            if not turn_plans:
                turn_plans = [[{"type": "end_turn", "payload": {}}]]

            scored_plans: List[Tuple[float, List[Dict[str, Any]], GameSession, List[Dict[str, Any]]]] = []
            for plan in turn_plans:
                sim = self._clone_quiet(session)
                steps: List[Dict[str, Any]] = []
                for action in plan:
                    try:
                        await sim.player_action(player_id, action["type"], action.get("payload") or {}, None)
                    except Exception:
                        steps = []
                        break
                    steps.append(
                        {
                            "action": action,
                            "score": self._score_state_cached(sim, player_id, score_cache),
                            "round": getattr(sim.state, "round", base_round),
                            "era": getattr(sim.state, "era", base_era),
                        }
                    )
                    if sim.state.phase == GamePhase.GAME_OVER:
                        break
                    if sim.state.get_active_player_id() != player_id:
                        break
                if not steps:
                    continue
                if sim.state.get_active_player_id() == player_id and sim.state.phase != GamePhase.GAME_OVER:
                    try:
                        await sim.player_action(player_id, "end_turn", {}, None)
                    except Exception:
                        continue
                scored_plans.append((steps[-1]["score"], plan, sim, steps))

            if not scored_plans:
                return

            scored_plans.sort(key=lambda t: t[0], reverse=True)
            scored_plans = scored_plans[: self.top_n]

            for _, plan_actions, sim_after_plan, plan_steps in scored_plans:
                advanced = await self._advance_to_next_bot_turn(sim_after_plan, player_id)
                await evaluate_turn(advanced, turn_index + 1, accumulated_steps + plan_steps)

        await evaluate_turn(self._clone_quiet(game), 0, [])

        best_runs = sorted(best_runs, key=lambda r: r.get("score", -1e9), reverse=True)
        for i, run in enumerate(best_runs, start=1):
            run["id"] = i
            run["final_score"] = run.get("score")
            run["score_after_lookahead"] = run.get("score")

        sim_logs: List[str] = []
        for idx, run in enumerate(best_runs[: self.top_n]):
            sim_logs.append(
                f"[top {idx+1}] round {run.get('round', base_round)} era {run.get('era', base_era)} start {run.get('start_score', start_score):.2f} → final {run.get('score', -1e9):.2f}"
            )
        sim_logs.append(f"[info] explored up to {self.max_depth} bot turns")

        chosen_run = self._choose_run_by_personality(best_runs, personality)
        best_plan = chosen_run.get("actions", []) if chosen_run else []
        best_score = chosen_run.get("score", -1e9) if chosen_run else -1e9

        return {
            "actions": best_plan,
            "score": best_score,
            "logs": sim_logs,
            "simulations": best_runs,
        }

    async def _enumerate_actions(self, gs: GameSession, player_id: str) -> List[Dict[str, Any]]:
        return await self._enumerate_turn_plans(gs, player_id)

    async def _enumerate_turn_plans(
        self, gs: GameSession, player_id: str, conversions_done: int = 0
    ) -> List[List[Dict[str, Any]]]:
        """Build ordered action plans (one turn) with optional skips for non-main actions."""
        player = gs.state.players.get(player_id)
        if not player:
            return []

        # --- Conversion tokens (0/1/2 allowed) ---
        max_conv_left = min(player.tokens.get(TokenType.CONVERSION, 0), max(0, 2 - conversions_done))
        if max_conv_left > 0:
            conv_actions: List[Dict[str, Any]] = []
            for from_res in ResourceType:
                amount = player.resources.get(from_res, 0)
                if amount <= 0:
                    continue
                for to_res in ResourceType:
                    if to_res == from_res:
                        continue
                    conv_actions.append(
                        [
                            {
                                "type": "convert",
                                "payload": {"from": from_res.value, "to": to_res.value, "amount": amount},
                            }
                        ]
                    )
            # include no-conversion option
            conv_options = [[]]
            conv_options.extend(conv_actions)
            # allow pairs
            if len(conv_actions) > 1:
                for i in range(len(conv_actions)):
                    for j in range(i + 1, len(conv_actions)):
                        conv_options.append(conv_actions[i] + conv_actions[j])
        else:
            conv_options = [[]]

        # --- Buying/slots ---
        buy_upgrades: List[List[Dict[str, Any]]] = []
        buy_weapons: List[List[Dict[str, Any]]] = []
        need_upgrade_slot = (
            not player.extend_used
            and player.tokens.get(TokenType.WILD, 0) > 0
            and len(player.upgrades) >= player.upgrade_slots
            and player.upgrade_slots < 4
            and any(player.can_pay(card.cost) for card in gs.state.market.upgrades)
        )
        need_weapon_slot = (
            not player.extend_used
            and player.tokens.get(TokenType.WILD, 0) > 0
            and len(player.weapons) >= player.weapon_slots
            and player.weapon_slots < 4
            and any(player.can_pay(card.cost) for card in gs.state.market.weapons)
        )
        if not player.extend_used:
            if need_upgrade_slot:
                pass
            if need_weapon_slot:
                pass

        if not player.buy_used:
            if len(player.upgrades) < player.upgrade_slots or need_upgrade_slot:
                for card in gs.state.market.upgrades:
                    if player.can_pay(card.cost):
                        action = {
                            "type": "buy_upgrade",
                            "payload": {"card_id": card.id, "card_name": getattr(card, "name", card.id)},
                        }
                        if need_upgrade_slot and len(player.upgrades) >= player.upgrade_slots:
                            buy_upgrades.append(
                                [{"type": "extend_slot", "payload": {"slot_type": "upgrade"}}, action]
                            )
                        if len(player.upgrades) < player.upgrade_slots:
                            buy_upgrades.append([action])
            if len(player.weapons) < player.weapon_slots or need_weapon_slot:
                for card in gs.state.market.weapons:
                    if player.can_pay(card.cost):
                        action = {
                            "type": "buy_weapon",
                            "payload": {"card_id": card.id, "card_name": getattr(card, "name", card.id)},
                        }
                        if need_weapon_slot and len(player.weapons) >= player.weapon_slots:
                            buy_weapons.append(
                                [{"type": "extend_slot", "payload": {"slot_type": "weapon"}}, action]
                            )
                        if len(player.weapons) < player.weapon_slots:
                            buy_weapons.append([action])
        buy_options: List[List[Dict[str, Any]]] = [[]]
        buy_options.extend(buy_upgrades)
        buy_options.extend(buy_weapons)

        # --- Upgrade activations ---
        activation_options: List[List[Dict[str, Any]]] = [[]]
        if player.upgrades:
            for card in player.upgrades:
                if player.active_used.get(card.id):
                    continue
                tags = getattr(card, "tags", []) or []
                if any(str(t).startswith("active:mass_token") for t in tags):
                    for token in ["attack", "conversion", "wild", "mass"]:
                        if player.tokens.get(TokenType[token.upper()], 0) > 0 and player.resources.get(ResourceType.GREEN, 0) >= 2:
                            activation_options.append([{"type": "activate_card", "payload": {"card_id": card.id, "token": token}}])
                if any(str(t).startswith("active:convert_split") for t in tags):
                    for res in ["R", "B", "G"]:
                        resource_enum = ResourceType(res)
                        if player.resources.get(resource_enum, 0) > 0:
                            activation_options.append([{"type": "activate_card", "payload": {"card_id": card.id, "resource": res}}])

        # --- Main action bucket (required) ---
        main_actions: List[Dict[str, Any]] = []
        fights = await self._generate_fight_actions(gs, player_id)
        if fights:
            main_actions.extend(fights)
        else:
            if not player.action_used:
                for stance in Stance:
                    if stance != player.stance:
                        main_actions.append({"type": "realign", "payload": {"stance": stance.value}})
                for token in ["attack", "conversion", "wild"]:
                    if player.tokens.get(TokenType[token.upper()], 0) < 3:
                        main_actions.append({"type": "pick_token", "payload": {"token": token}})
            if not main_actions:
                main_actions.append({"type": "end_turn", "payload": {}})
        plans: List[List[Dict[str, Any]]] = []
        for conv_seq in conv_options:
            for buy_seq in buy_options:
                for act_seq in activation_options:
                    for main_action in main_actions:
                        plans.append(conv_seq + buy_seq + act_seq + [main_action])
        if len(plans) > 80:
            plans = plans[:80]
        return plans

    async def _generate_fight_actions(self, gs: GameSession, player_id: str) -> List[Dict[str, Any]]:
        player = gs.state.players.get(player_id)
        if not player:
            return []
        # Non-boss fights consume the main action
        if player.action_used and not (gs.state.boss_mode or gs.state.phase == GamePhase.BOSS):
            return []
        if not gs.threat_manager:
            return []
        has_range_any = self._has_range_any(gs, player)
        targets = self._attackable_threats(gs, has_range_any)
        if not targets:
            return []

        playable_weapons = self._playable_weapons(gs, player)
        weapon_sets = list(self._weapon_subsets(playable_weapons))
        actions: List[Dict[str, Any]] = []
        seen_keys = set()
        for row_index, threat in targets:
            for subset in weapon_sets:
                payload = self._build_fight_payload(gs, player, row_index, threat, subset)
                if not payload:
                    continue
                use_tokens = payload.get("use_tokens", {}) or {}
                key = (
                    row_index,
                    payload.get("threat_id"),
                    tuple(sorted(payload.get("played_weapons", []))),
                    use_tokens.get("attack", 0),
                    tuple(sorted((use_tokens.get("wild_allocation", {}) or {}).items())),
                )
                if key in seen_keys:
                    continue
                seen_keys.add(key)
                actions.append({"type": "fight", "payload": payload})
        return actions

    def _has_range_any(self, gs: GameSession, player: Any) -> bool:
        cards = (player.weapons or []) + (player.upgrades or [])
        for card in cards:
            for eff in gs._card_effects(card):
                if eff.kind == "fight_range" and eff.value == "any":
                    return True
        return False

    def _attackable_threats(self, gs: GameSession, has_range_any: bool) -> List[Tuple[int, Any]]:
        tm = gs.threat_manager
        if not tm or not getattr(tm, "board", None):
            return []
        threats: List[Tuple[int, Any]] = []
        lanes = getattr(tm.board, "lanes", []) or []
        for row_index, lane in enumerate(lanes):
            if has_range_any:
                for pos in ["front", "mid", "back"]:
                    threat = getattr(lane, pos, None)
                    if threat:
                        threat.position = pos
                        threats.append((row_index, threat))
            else:
                threat = tm.front_threat(row_index)
                if threat:
                    threats.append((row_index, threat))
        return threats

    def _playable_weapons(self, gs: GameSession, player: Any) -> List[Any]:
        playable: List[Any] = []
        for weapon in player.weapons or []:
            uses = getattr(weapon, "uses", None)
            if uses is not None and uses <= 0:
                continue
            effects = gs._card_effects(weapon)
            if any(e.kind in {"fight_cost_reduction", "fight_cost_reduction_stance"} for e in effects):
                playable.append(weapon)
        return playable

    def _weapon_subsets(self, weapons: Sequence[Any]) -> Sequence[Sequence[Any]]:
        combos: List[Sequence[Any]] = [tuple()]
        for r in range(1, min(len(weapons), 3) + 1):
            combos.extend(itertools.combinations(weapons, r))
        return combos[:12]

    def _build_fight_payload(
        self,
        gs: GameSession,
        player: Any,
        row_index: int,
        threat: Any,
        weapons: Sequence[Any],
    ) -> Optional[Dict[str, Any]]:
        threat_id = getattr(threat, "id", None)
        if threat_id is None:
            return None
        weapon_ids = []
        for weapon in weapons:
            wid = getattr(weapon, "id", None) or str(weapon)
            uses = getattr(weapon, "uses", None)
            if uses is not None and uses <= 0:
                continue
            weapon_ids.append(wid)

        payload: Dict[str, Any] = {"row": row_index, "threat_id": threat_id, "played_weapons": weapon_ids}
        try:
            base = gs._compute_fight_cost(player, payload)
        except Exception:
            return None
        adjusted_cost: Dict[ResourceType, int] = base.get("adjusted_cost", {})
        attack_used, wild_alloc = self._plan_tokens(player, adjusted_cost)

        use_tokens: Dict[str, Any] = {}
        if attack_used:
            use_tokens["attack"] = attack_used
        if wild_alloc:
            use_tokens["wild_allocation"] = {res.value: amt for res, amt in wild_alloc.items() if amt > 0}
        if use_tokens:
            payload["use_tokens"] = use_tokens

        try:
            result = gs._compute_fight_cost(player, payload)
        except Exception:
            return None
        if not result.get("can_afford"):
            return None
        return payload

    def _plan_tokens(self, player: Any, cost: Dict[ResourceType, int]) -> Tuple[int, Dict[ResourceType, int]]:
        # Attack tokens reduce R by 2; use only when missing more than 1R initially
        remaining_r = cost.get(ResourceType.RED, 0)
        attack_available = player.tokens.get(TokenType.ATTACK, 0)
        attack_used = 0
        while remaining_r > 1 and attack_used < attack_available:
            attack_used += 1
            remaining_r = max(0, remaining_r - 2)

        # Allocate wild tokens to remaining deficits, prioritizing larger gaps
        wild_remaining = player.tokens.get(TokenType.WILD, 0)
        needs = {
            ResourceType.RED: remaining_r,
            ResourceType.BLUE: cost.get(ResourceType.BLUE, 0),
            ResourceType.GREEN: cost.get(ResourceType.GREEN, 0),
        }
        wild_alloc: Dict[ResourceType, int] = {res: 0 for res in ResourceType}
        for res, deficit in sorted(needs.items(), key=lambda kv: kv[1], reverse=True):
            if deficit <= 0 or wild_remaining <= 0:
                continue
            use = min(deficit, wild_remaining)
            wild_alloc[res] += use
            wild_remaining -= use
            needs[res] = max(0, needs[res] - use)

        # If still missing exactly 1R after wilds, spend one more attack token
        if needs[ResourceType.RED] == 1 and attack_used < attack_available:
            attack_used += 1
            needs[ResourceType.RED] = max(0, needs[ResourceType.RED] - 2)

        return attack_used, {res: amt for res, amt in wild_alloc.items() if amt > 0}

    def _choose_run_by_personality(self, runs: List[Dict[str, Any]], personality: str) -> Optional[Dict[str, Any]]:
        if not runs:
            return None
        if personality == "top3":
            pool = runs[: min(3, len(runs))]
            return self.rng.choice(pool)
        if personality == "softmax5":
            pool = runs[: min(5, len(runs))]
            scores = [r.get("score", -1e9) for r in pool]
            max_s = max(scores) if scores else 0.0
            exp_scores = [math.exp(s - max_s) for s in scores]
            total = sum(exp_scores) or 1.0
            probs = [v / total for v in exp_scores]
            pick = self.rng.random()
            acc = 0.0
            for run, p in zip(pool, probs):
                acc += p
                if pick <= acc:
                    return run
            return pool[-1]
        return runs[0]

    def _clone_quiet(self, session: GameSession) -> GameSession:
        try:
            return session.clone_quiet()
        except Exception:
            clone = copy.deepcopy(session)
            try:
                clone.state.verbose = False
            except Exception:
                pass
            return clone

    async def _apply_plan_in_place(self, sim: GameSession, player_id: str, plan: List[Dict[str, Any]]) -> bool:
        for action in plan:
            try:
                await sim.player_action(player_id, action["type"], action.get("payload") or {}, None)
            except Exception:
                return False
            if sim.state.phase == GamePhase.GAME_OVER or sim.state.get_active_player_id() != player_id:
                break
        if sim.state.get_active_player_id() == player_id and sim.state.phase != GamePhase.GAME_OVER:
            try:
                await sim.player_action(player_id, "end_turn", {}, None)
            except Exception:
                return False
        return True

    async def _advance_to_next_bot_turn(self, sim: GameSession, bot_id: str, score_cache: Optional[Dict[str, float]] = None) -> GameSession:
        """Advance simulation through other players using greedy plans until the bot's turn returns."""
        current = self._clone_quiet(sim)
        cache = score_cache if score_cache is not None else self._score_cache
        guard = 0
        while current.state.phase != GamePhase.GAME_OVER:
            active = current.state.get_active_player_id()
            if not active:
                break
            if active == bot_id:
                break
            plans = await self._enumerate_turn_plans(current, active)
            if not plans:
                plans = [[{"type": "end_turn", "payload": {}}]]
            best_sim = None
            best_score = -1e9
            for plan in plans:
                trial = self._clone_quiet(current)
                success = await self._apply_plan_in_place(trial, active, plan)
                if not success:
                    continue
                score = self._score_state_cached(trial, active, cache)
                if score > best_score:
                    best_score = score
                    best_sim = trial
            if not best_sim:
                break
            current = best_sim
            guard += 1
            if guard > 50:
                break
        return current

    def _score_state_cached(self, session: GameSession, player_id: str, cache: Optional[Dict[str, float]] = None) -> float:
        cache = cache if cache is not None else self._score_cache
        key = self._score_signature(session, player_id)
        if key in cache:
            return cache[key]
        val = score_state(session, player_id)
        cache[key] = val
        return val

    def _score_signature(self, session: GameSession, player_id: str) -> str:
        p = session.state.players.get(player_id)
        if not p:
            return f"missing:{player_id}"
        res_sig = (p.resources.get(ResourceType.RED, 0), p.resources.get(ResourceType.BLUE, 0), p.resources.get(ResourceType.GREEN, 0))
        tok_sig = tuple(sorted((t.value, p.tokens.get(t, 0)) for t in TokenType))
        upgrades = tuple(sorted(getattr(u, "id", str(u)) for u in (p.upgrades or [])))
        weapons = tuple(sorted(getattr(w, "id", str(w)) for w in (p.weapons or [])))
        return f"{player_id}|{p.vp}|{p.wounds}|{p.stance}|{res_sig}|{tok_sig}|{upgrades}|{weapons}|{p.upgrade_slots}|{p.weapon_slots}"
