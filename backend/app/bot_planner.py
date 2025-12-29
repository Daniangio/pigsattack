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
        top_n: int = 10,
        max_branches: int = 150,
        rng: Optional[random.Random] = None,
        randomness: float = 0.0,
    ):
        self.max_depth = max_depth  # number of this bot's future turns to explore
        self.top_n = top_n
        self.max_branches = max_branches
        self.rng = rng or random.Random()
        self.randomness = max(0.0, min(float(randomness or 0.0), 1.0))
        self._quiet = True  # disable logging in simulation clones
        self._score_cache: Dict[str, float] = {}

    async def plan(
        self,
        game: GameSession,
        player_id: str,
        personality: str = "greedy",
        planning_profile: Optional[str] = None,
    ) -> Dict[str, Any]:
        base_round = getattr(game.state, "round", 0)
        base_era = getattr(game.state, "era", "day")
        start_score = self._score_state_cached(game, player_id)
        best_runs: List[Dict[str, Any]] = []
        best_runs: List[Dict[str, Any]] = []
        score_cache: Dict[str, float] = {}
        active_profile = "full"
        opponent_profile = planning_profile
        if opponent_profile is None:
            opponent_profile = getattr(game.state.players.get(player_id), "planning_profile", None)

        async def evaluate_turn(
            session: GameSession,
            turn_index: int,
            accumulated_steps: List[Dict[str, Any]],
            root_actions: Optional[List[Dict[str, Any]]],
        ):
            if turn_index >= self.max_depth or session.state.phase == GamePhase.GAME_OVER:
                score = self._score_state_cached(session, player_id, score_cache)
                best_runs.append(
                    {
                        "round": getattr(session.state, "round", base_round),
                        "era": getattr(session.state, "era", base_era),
                        "start_score": start_score,
                        "score": score,
                        "actions": list(root_actions or []),
                        "steps": accumulated_steps,
                    }
                )
                return

            turn_plans = await self._enumerate_turn_plans(session, player_id, active_profile)
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
                branch_entries = [(sim, plan, steps)]
                if sim.state.get_active_player_id() == player_id and sim.state.phase != GamePhase.GAME_OVER:
                    player_after = sim.state.players.get(player_id)
                    free_changes = getattr(player_after, "free_stance_changes", 0) if player_after else 0
                    if free_changes > 0:
                        branch_entries = [(sim, plan, steps)]
                        for stance in Stance:
                            if not player_after or stance == player_after.stance:
                                continue
                            sim_clone = self._clone_quiet(sim)
                            action = {"type": "realign", "payload": {"stance": stance.value}}
                            try:
                                await sim_clone.player_action(player_id, "realign", {"stance": stance.value}, None)
                            except Exception:
                                continue
                            steps_clone = list(steps)
                            steps_clone.append(
                                {
                                    "action": action,
                                    "score": self._score_state_cached(sim_clone, player_id, score_cache),
                                    "round": getattr(sim_clone.state, "round", base_round),
                                    "era": getattr(sim_clone.state, "era", base_era),
                                }
                            )
                            branch_entries.append((sim_clone, plan + [action], steps_clone))
                for sim_branch, plan_branch, steps_branch in branch_entries:
                    if sim_branch.state.get_active_player_id() == player_id and sim_branch.state.phase != GamePhase.GAME_OVER:
                        try:
                            await sim_branch.player_action(player_id, "end_turn", {}, None)
                        except Exception:
                            continue
                    scored_plans.append((steps_branch[-1]["score"], plan_branch, sim_branch, steps_branch))

            if not scored_plans:
                return

            scored_plans.sort(key=lambda t: t[0], reverse=True)
            scored_plans = scored_plans[: self.top_n]

            for _, plan_actions, sim_after_plan, plan_steps in scored_plans:
                next_root = root_actions if root_actions is not None else list(plan_actions)
                advanced = await self._advance_to_next_bot_turn(
                    sim_after_plan,
                    player_id,
                    personality=personality,
                    opponent_profile=opponent_profile,
                )
                await evaluate_turn(advanced, turn_index + 1, accumulated_steps + plan_steps, next_root)

        await evaluate_turn(self._clone_quiet(game), 0, [], None)

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

    async def _enumerate_actions(
        self, gs: GameSession, player_id: str, planning_profile: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        return await self._enumerate_turn_plans(gs, player_id, planning_profile)

    async def _enumerate_turn_plans(
        self, gs: GameSession, player_id: str, planning_profile: Optional[str] = None
    ) -> List[List[Dict[str, Any]]]:
        """Build ordered action plans (one turn) with optional skips for non-main actions."""
        player = gs.state.players.get(player_id)
        if not player:
            return []
        profile = (planning_profile or getattr(player, "planning_profile", "full") or "full").lower()
        if profile not in {"full", "buy_only", "fight_only", "fight_buy"}:
            profile = "full"
        allow_buys = profile in {"full", "buy_only", "fight_buy"}
        allow_fights = profile in {"full", "fight_only", "fight_buy"}
        allow_realign = profile == "full"
        allow_pick_token = profile == "full"
        allow_activations = profile == "full"

        # --- Buying/slots ---
        buy_upgrades: List[List[Dict[str, Any]]] = []
        buy_weapons: List[List[Dict[str, Any]]] = []
        visible_upgrades = gs.state.market.upgrades_top + gs.state.market.upgrades_bottom
        visible_weapons = gs.state.market.weapons_top + gs.state.market.weapons_bottom
        can_extend_upgrade = (
            not player.extend_used
            and player.tokens.get(TokenType.WILD, 0) > 0
            and player.upgrade_slots < 5
        )
        can_extend_weapon = (
            not player.extend_used
            and player.tokens.get(TokenType.WILD, 0) > 0
            and player.weapon_slots < 5
        )

        if allow_buys and not player.buy_used:
            for card in visible_upgrades:
                needs_slot = len(player.upgrades) >= player.upgrade_slots
                if needs_slot and not can_extend_upgrade:
                    continue
                extend_seq = [{"type": "extend_slot", "payload": {"slot_type": "upgrade"}}] if needs_slot else []
                action = {
                    "type": "buy_upgrade",
                    "payload": {"card_id": card.id, "card_name": getattr(card, "name", card.id)},
                }
                if player.can_pay(card.cost):
                    buy_upgrades.append(extend_seq + [action])
                else:
                    if not self._can_convert_to_cover_cost(player, card.cost):
                        continue
                    conv_action = self._pick_conversion_for_cost(player, card.cost)
                    if conv_action:
                        buy_upgrades.append(extend_seq + [conv_action, action])

            for card in visible_weapons:
                needs_slot = len(player.weapons) >= player.weapon_slots
                if needs_slot and not can_extend_weapon:
                    continue
                extend_seq = [{"type": "extend_slot", "payload": {"slot_type": "weapon"}}] if needs_slot else []
                action = {
                    "type": "buy_weapon",
                    "payload": {"card_id": card.id, "card_name": getattr(card, "name", card.id)},
                }
                if player.can_pay(card.cost):
                    buy_weapons.append(extend_seq + [action])
                else:
                    if not self._can_convert_to_cover_cost(player, card.cost):
                        continue
                    conv_action = self._pick_conversion_for_cost(player, card.cost)
                    if conv_action:
                        buy_weapons.append(extend_seq + [conv_action, action])
        buy_options: List[List[Dict[str, Any]]] = [[]]
        if allow_buys:
            buy_options.extend(buy_upgrades)
            buy_options.extend(buy_weapons)

        # --- Upgrade activations ---
        activation_options: List[List[Dict[str, Any]]] = [[]]
        if allow_activations and player.upgrades:
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
        main_actions: List[List[Dict[str, Any]]] = []
        fights: List[List[Dict[str, Any]]] = []
        if allow_fights:
            fights = await self._generate_fight_actions(gs, player_id)
            if fights:
                main_actions.extend(fights)
        if not player.action_used and allow_realign:
            for stance in Stance:
                if stance != player.stance:
                    main_actions.append([{"type": "realign", "payload": {"stance": stance.value}}])
        if not fights and not player.action_used and allow_pick_token:
            for token in ["attack", "conversion", "wild"]:
                if player.tokens.get(TokenType[token.upper()], 0) < 3:
                    main_actions.append([{"type": "pick_token", "payload": {"token": token}}])
        if not main_actions:
            main_actions.append([{"type": "end_turn", "payload": {}}])
        plans: List[List[Dict[str, Any]]] = []
        for buy_seq in buy_options:
            for act_seq in activation_options:
                for main_action in main_actions:
                    plans.append(buy_seq + act_seq + main_action)
        if len(plans) > 80:
            plans = plans[:80]
        return plans

    async def _generate_fight_actions(self, gs: GameSession, player_id: str) -> List[List[Dict[str, Any]]]:
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
        best_by_target: Dict[Tuple[int, str], Tuple[int, int, List[Dict[str, Any]]]] = {}
        for row_index, threat in targets:
            for subset in weapon_sets:
                built = self._build_fight_payload(gs, player, row_index, threat, subset)
                if not built:
                    continue
                payload, resource_cost, token_used, can_afford, adjusted_cost = built
                threat_id = payload.get("threat_id")
                if not threat_id:
                    continue
                plans: List[List[Dict[str, Any]]] = []
                fight_action = {"type": "fight", "payload": payload}
                if can_afford:
                    plans.append([fight_action])
                else:
                    conversion_candidates = self._pick_conversion_for_fight(player, adjusted_cost)
                    for conv_action in conversion_candidates:
                        if self._can_afford_fight_with_conversion(gs, player, payload, conv_action):
                            plans.append([conv_action, fight_action])
                for seq in plans:
                    key = (row_index, str(threat_id))
                    candidate = (resource_cost, token_used, seq)
                    current = best_by_target.get(key)
                    if not current or candidate[0] < current[0] or (candidate[0] == current[0] and candidate[1] < current[1]):
                        best_by_target[key] = candidate
        return [seq for _, _, seq in best_by_target.values()]

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
    ) -> Optional[Tuple[Dict[str, Any], int, int, bool, Dict[ResourceType, int]]]:
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
        total_cost = sum(int(v or 0) for v in result.get("adjusted_cost", {}).values())
        token_used = int(attack_used) + sum(int(v) for v in wild_alloc.values())
        return payload, total_cost, token_used, bool(result.get("can_afford")), result.get("adjusted_cost", {})

    def _pick_conversion_for_fight(
        self, player: Any, cost: Dict[ResourceType, int]
    ) -> List[Dict[str, Any]]:
        if not cost:
            return []
        if player.tokens.get(TokenType.CONVERSION, 0) <= 0:
            return []
        remaining: Dict[ResourceType, int] = {}
        missing: Dict[ResourceType, int] = {}
        for res in ResourceType:
            available = int(player.resources.get(res, 0))
            required = int(cost.get(res, 0))
            remaining[res] = max(0, available - required)
            missing[res] = max(0, required - available)
        highest_res, highest_amount = max(remaining.items(), key=lambda kv: kv[1])
        if highest_amount <= 0:
            return []
        candidates: List[Dict[str, Any]] = []
        for res in ResourceType:
            miss = missing.get(res, 0)
            if miss <= 0 or res == highest_res:
                continue
            if miss <= 3 and highest_amount >= miss:
                candidates.append(
                    {
                        "type": "convert",
                        "payload": {"from": highest_res.value, "to": res.value, "amount": int(miss)},
                    }
                )
        return candidates

    def _can_afford_fight_with_conversion(
        self,
        gs: GameSession,
        player: Any,
        payload: Dict[str, Any],
        conversion_action: Dict[str, Any],
    ) -> bool:
        conv_payload = conversion_action.get("payload") or {}
        from_key = conv_payload.get("from")
        to_key = conv_payload.get("to")
        amount = int(conv_payload.get("amount") or 0)
        if not from_key or not to_key or amount <= 0:
            return False
        try:
            from_res = ResourceType(from_key)
            to_res = ResourceType(to_key)
        except Exception:
            return False
        if from_res == to_res:
            return False
        if player.resources.get(from_res, 0) < amount:
            return False
        sim_player = copy.copy(player)
        sim_player.resources = dict(player.resources)
        sim_player.resources[from_res] = max(0, sim_player.resources.get(from_res, 0) - amount)
        sim_player.resources[to_res] = sim_player.resources.get(to_res, 0) + amount
        try:
            result = gs._compute_fight_cost(sim_player, payload)
        except Exception:
            return False
        return bool(result.get("can_afford"))

    def _pick_conversion_for_cost(self, player: Any, cost: Dict[ResourceType, int]) -> Optional[Dict[str, Any]]:
        """Pick one conversion token action that enables buying; returns None if not needed or unavailable."""
        if not cost:
            return None
        if player.tokens.get(TokenType.CONVERSION, 0) <= 0:
            return None
        if player.can_pay(cost):
            return None
        if not self._can_convert_to_cover_cost(player, cost):
            return None

        valid_actions: List[Dict[str, Any]] = []
        for from_res in ResourceType:
            available = player.resources.get(from_res, 0)
            if available <= 0:
                continue
            max_amount = min(3, int(available))
            for to_res in ResourceType:
                if to_res == from_res:
                    continue
                for amount in range(1, max_amount + 1):
                    test_resources = dict(player.resources)
                    test_resources[from_res] = max(0, test_resources.get(from_res, 0) - amount)
                    test_resources[to_res] = test_resources.get(to_res, 0) + amount
                    if self._can_pay_cost(cost, test_resources):
                        valid_actions.append(
                            {
                                "type": "convert",
                                "payload": {"from": from_res.value, "to": to_res.value, "amount": amount},
                            }
                        )
        if not valid_actions:
            return None
        return self.rng.choice(valid_actions)

    def _can_convert_to_cover_cost(self, player: Any, cost: Dict[ResourceType, int]) -> bool:
        if not cost:
            return False
        if player.tokens.get(TokenType.CONVERSION, 0) <= 0:
            return False
        total_cost = sum(int(v or 0) for v in cost.values())
        total_resources = sum(int(v or 0) for v in player.resources.values())
        if total_cost > total_resources:
            return False
        missing: Dict[ResourceType, int] = {}
        surplus: Dict[ResourceType, int] = {}
        for res in ResourceType:
            required = int(cost.get(res, 0))
            available = int(player.resources.get(res, 0))
            missing[res] = max(0, required - available)
            surplus[res] = max(0, available - required)
        missing_total = sum(missing.values())
        if missing_total == 0:
            return False
        if missing_total > 3:
            return False
        missing_res = [res for res, amt in missing.items() if amt > 0]
        if len(missing_res) != 1:
            return False
        need = missing[missing_res[0]]
        return any(res != missing_res[0] and amt >= need for res, amt in surplus.items())

    def _can_pay_cost(self, cost: Dict[ResourceType, int], resources: Dict[ResourceType, int]) -> bool:
        for res, amt in (cost or {}).items():
            if resources.get(res, 0) < int(amt or 0):
                return False
        return True

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
        if personality == "random":
            return self.rng.choice(runs)

        scores = [r.get("score", -1e9) for r in runs]
        spread = (max(scores) - min(scores)) if scores else 0.0
        if spread <= 0:
            spread = max(1.0, abs(scores[0]) if scores else 1.0)

        adjusted_scores: Dict[int, float] = {}
        for idx, run in enumerate(runs):
            base = run.get("score", -1e9)
            if self.randomness > 0:
                base += self.rng.uniform(-1.0, 1.0) * self.randomness * spread
            adjusted_scores[idx] = base

        def adjusted_score(index: int) -> float:
            return adjusted_scores.get(index, -1e9)

        if personality == "top3":
            ranked = sorted(enumerate(runs), key=lambda pair: adjusted_score(pair[0]), reverse=True)
            pool = [run for _, run in ranked[: min(3, len(ranked))]]
            return self.rng.choice(pool)
        if personality == "softmax5":
            ranked = sorted(enumerate(runs), key=lambda pair: adjusted_score(pair[0]), reverse=True)
            pool = ranked[: min(5, len(ranked))]
            adj_scores = [adjusted_score(idx) for idx, _ in pool]
            max_s = max(adj_scores) if adj_scores else 0.0
            exp_scores = [math.exp(s - max_s) for s in adj_scores]
            total = sum(exp_scores) or 1.0
            probs = [v / total for v in exp_scores]
            pick = self.rng.random()
            acc = 0.0
            for (_, run), p in zip(pool, probs):
                acc += p
                if pick <= acc:
                    return run
            return pool[-1][1] if pool else runs[-1]
        ranked = sorted(enumerate(runs), key=lambda pair: adjusted_score(pair[0]), reverse=True)
        return ranked[0][1] if ranked else runs[0]

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

    async def _advance_to_next_bot_turn(
        self,
        sim: GameSession,
        bot_id: str,
        personality: str = "greedy",
        score_cache: Optional[Dict[str, float]] = None,
        opponent_profile: Optional[str] = None,
    ) -> GameSession:
        """Advance simulation through other players using the planning bot's choice policy."""
        current = self._clone_quiet(sim)
        cache = score_cache if score_cache is not None else self._score_cache
        guard = 0
        while current.state.phase != GamePhase.GAME_OVER:
            active = current.state.get_active_player_id()
            if not active:
                break
            if active == bot_id:
                break
            active_player = current.state.players.get(active)
            profile = opponent_profile or (getattr(active_player, "planning_profile", "full") if active_player else "full")
            plans = await self._enumerate_turn_plans(current, active, profile)
            if not plans:
                plans = [[{"type": "end_turn", "payload": {}}]]
            candidate_runs: List[Dict[str, Any]] = []
            for plan in plans:
                trial = self._clone_quiet(current)
                success = await self._apply_plan_in_place(trial, active, plan)
                if not success:
                    continue
                score = self._score_state_cached(trial, active, cache)
                candidate_runs.append({"score": score, "plan": plan, "sim": trial})
            if not candidate_runs:
                break
            candidate_runs.sort(key=lambda run: run.get("score", -1e9), reverse=True)
            chosen = self._choose_run_by_personality(candidate_runs, personality) or candidate_runs[0]
            current = chosen["sim"]
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
