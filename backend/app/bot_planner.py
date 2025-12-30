import copy
import itertools
import math
import random
from typing import Any, Dict, List, Optional, Sequence, Tuple

from game_core import GameSession, GamePhase, ResourceType, TokenType, Stance

from .planner_sim import PlannerSim


def score_state(session: Any, player_id: str) -> float:
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
        self._opponent_action_cache: Dict[str, Dict[str, Dict[str, Optional[Dict[str, Any]]]]] = {}

    async def plan(
        self,
        game: GameSession,
        player_id: str,
        personality: str = "greedy",
        planning_profile: Optional[str] = None,
    ) -> Dict[str, Any]:
        sim = PlannerSim.from_session(game)
        base_round = getattr(sim.state, "round", 0)
        base_era = getattr(sim.state, "era", "day")
        start_score = self._score_state_cached(sim, player_id)
        best_runs: List[Dict[str, Any]] = []
        best_runs: List[Dict[str, Any]] = []
        score_cache: Dict[str, float] = {}
        active_profile = "full"
        opponent_profile = planning_profile
        if opponent_profile is None:
            opponent_profile = getattr(game.state.players.get(player_id), "planning_profile", None)
        self._opponent_action_cache.clear()

        async def evaluate_turn(
            turn_index: int,
            accumulated_steps: List[Dict[str, Any]],
            root_actions: Optional[List[Dict[str, Any]]],
        ):
            if turn_index >= self.max_depth or sim.state.phase == GamePhase.GAME_OVER:
                score = self._score_state_cached(sim, player_id, score_cache)
                best_runs.append(
                    {
                        "round": getattr(sim.state, "round", base_round),
                        "era": getattr(sim.state, "era", base_era),
                        "start_score": start_score,
                        "score": score,
                        "actions": list(root_actions or []),
                        "steps": accumulated_steps,
                    }
                )
                return

            turn_plans = await self._enumerate_turn_plans(sim, player_id, active_profile)
            if not turn_plans:
                turn_plans = [[{"type": "end_turn", "payload": {}}]]

            scored_plans: List[Tuple[float, List[Dict[str, Any]], List[Dict[str, Any]]]] = []
            for plan in turn_plans:
                checkpoint = sim.checkpoint()
                steps: List[Dict[str, Any]] = []
                for action in plan:
                    try:
                        sim.apply_action(player_id, action["type"], action.get("payload") or {})
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
                    sim.rollback(checkpoint)
                    continue
                player_after = sim.state.players.get(player_id)
                free_changes = getattr(player_after, "free_stance_changes", 0) if player_after else 0
                branch_checkpoint = sim.checkpoint()

                def record_branch(plan_branch: List[Dict[str, Any]], steps_branch: List[Dict[str, Any]]) -> None:
                    branch_apply_checkpoint = sim.checkpoint()
                    if sim.state.get_active_player_id() == player_id and sim.state.phase != GamePhase.GAME_OVER:
                        try:
                            sim.apply_action(player_id, "end_turn", {},)
                        except Exception:
                            sim.rollback(branch_apply_checkpoint)
                            return
                    scored_plans.append((steps_branch[-1]["score"], plan_branch, list(steps_branch)))
                    sim.rollback(branch_apply_checkpoint)

                if sim.state.get_active_player_id() == player_id and sim.state.phase != GamePhase.GAME_OVER and free_changes > 0:
                    for stance in Stance:
                        if not player_after or stance == player_after.stance:
                            continue
                        stance_checkpoint = sim.checkpoint()
                        action = {"type": "realign", "payload": {"stance": stance.value}}
                        try:
                            sim.apply_action(player_id, "realign", {"stance": stance.value})
                        except Exception:
                            sim.rollback(stance_checkpoint)
                            continue
                        steps_clone = list(steps)
                        steps_clone.append(
                            {
                                "action": action,
                                "score": self._score_state_cached(sim, player_id, score_cache),
                                "round": getattr(sim.state, "round", base_round),
                                "era": getattr(sim.state, "era", base_era),
                            }
                        )
                        record_branch(plan + [action], steps_clone)
                        sim.rollback(stance_checkpoint)

                record_branch(plan, steps)
                sim.rollback(branch_checkpoint)
                sim.rollback(checkpoint)

            if not scored_plans:
                return

            scored_plans.sort(key=lambda t: t[0], reverse=True)
            scored_plans = scored_plans[: self.top_n]

            for _, plan_actions, plan_steps in scored_plans:
                next_root = root_actions if root_actions is not None else list(plan_actions)
                replay_checkpoint = sim.checkpoint()
                ok = True
                for action in plan_actions:
                    try:
                        sim.apply_action(player_id, action["type"], action.get("payload") or {})
                    except Exception:
                        ok = False
                        break
                    if sim.state.phase == GamePhase.GAME_OVER or sim.state.get_active_player_id() != player_id:
                        break
                if ok and sim.state.get_active_player_id() == player_id and sim.state.phase != GamePhase.GAME_OVER:
                    try:
                        sim.apply_action(player_id, "end_turn", {})
                    except Exception:
                        ok = False
                if ok:
                    await self._advance_to_next_bot_turn(
                        sim,
                        player_id,
                        personality=personality,
                        opponent_profile=opponent_profile,
                    )
                    await evaluate_turn(turn_index + 1, accumulated_steps + plan_steps, next_root)
                sim.rollback(replay_checkpoint)

        await evaluate_turn(0, [], None)

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
            fight_cost_cache: Dict[Tuple[Any, ...], Dict[str, Any]] = {}
            fights = await self._generate_fight_actions(gs, player_id, fight_cost_cache)
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

    async def _generate_fight_actions(
        self,
        gs: GameSession,
        player_id: str,
        fight_cost_cache: Optional[Dict[Tuple[Any, ...], Dict[str, Any]]] = None,
    ) -> List[List[Dict[str, Any]]]:
        player = gs.state.players.get(player_id)
        if not player:
            return []
        # Non-boss fights consume the main action
        if player.action_used and not (gs.state.boss_mode or gs.state.phase == GamePhase.BOSS):
            return []
        if gs.state.boss_mode or gs.state.phase == GamePhase.BOSS:
            return self._generate_boss_fight_actions(gs, player, fight_cost_cache)
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
                built = self._build_fight_payload(
                    gs,
                    player,
                    row_index,
                    threat,
                    subset,
                    fight_cost_cache=fight_cost_cache,
                )
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

    def _generate_boss_fight_actions(
        self,
        gs: GameSession,
        player: Any,
        fight_cost_cache: Optional[Dict[Tuple[Any, ...], Dict[str, Any]]] = None,
    ) -> List[List[Dict[str, Any]]]:
        thresholds = gs.state.boss_thresholds_state or []
        if not thresholds:
            return []
        playable_weapons = self._playable_weapons(gs, player)
        weapon_sets = list(self._weapon_subsets(playable_weapons))
        best_by_threshold: Dict[int, Tuple[int, int, List[Dict[str, Any]]]] = {}
        for entry in thresholds:
            idx_raw = entry.get("index")
            if idx_raw is None:
                continue
            try:
                idx = int(idx_raw)
            except Exception:
                continue
            if entry.get("defeated"):
                continue
            defeated_by = entry.get("defeated_by") or []
            if player.user_id in defeated_by:
                continue
            for subset in weapon_sets:
                built = self._build_boss_fight_payload(
                    gs,
                    player,
                    idx,
                    subset,
                    fight_cost_cache=fight_cost_cache,
                )
                if not built:
                    continue
                payload, resource_cost, token_used, can_afford, adjusted_cost = built
                fight_action = {"type": "fight", "payload": payload}
                plans: List[List[Dict[str, Any]]] = []
                if can_afford:
                    plans.append([fight_action])
                else:
                    conversion_candidates = self._pick_conversion_for_fight(player, adjusted_cost)
                    for conv_action in conversion_candidates:
                        if self._can_afford_fight_with_conversion(gs, player, payload, conv_action):
                            plans.append([conv_action, fight_action])
                for seq in plans:
                    candidate = (resource_cost, token_used, seq)
                    current = best_by_threshold.get(idx)
                    if not current or candidate[0] < current[0] or (candidate[0] == current[0] and candidate[1] < current[1]):
                        best_by_threshold[idx] = candidate
        return [seq for _, _, seq in best_by_threshold.values()]

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

    def _fight_cost_cache_key(self, payload: Dict[str, Any]) -> Tuple[Any, ...]:
        use_tokens = payload.get("use_tokens") or {}
        wild_allocation = use_tokens.get("wild_allocation") or {}
        wild_key = tuple(sorted((str(k), int(v)) for k, v in wild_allocation.items()))
        played_weapons = tuple(sorted(str(w) for w in (payload.get("played_weapons") or [])))
        stance_choice = payload.get("stance_choice")
        boss_threshold = payload.get("boss_threshold")
        return (
            int(boss_threshold) if boss_threshold is not None else None,
            int(payload.get("row", 0)),
            str(payload.get("threat_id") or ""),
            played_weapons,
            int(use_tokens.get("attack", 0) or 0),
            wild_key,
            str(stance_choice) if stance_choice is not None else None,
        )

    def _compute_fight_cost_cached(
        self,
        gs: GameSession,
        player: Any,
        payload: Dict[str, Any],
        cache: Optional[Dict[Tuple[Any, ...], Dict[str, Any]]],
    ) -> Dict[str, Any]:
        if cache is None:
            return gs._compute_fight_cost(player, payload)
        key = self._fight_cost_cache_key(payload)
        cached = cache.get(key)
        if cached is not None:
            return cached
        result = gs._compute_fight_cost(player, payload)
        cache[key] = result
        return result

    def _build_fight_payload(
        self,
        gs: GameSession,
        player: Any,
        row_index: int,
        threat: Any,
        weapons: Sequence[Any],
        fight_cost_cache: Optional[Dict[Tuple[Any, ...], Dict[str, Any]]] = None,
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
            base = self._compute_fight_cost_cached(gs, player, payload, fight_cost_cache)
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
            result = self._compute_fight_cost_cached(gs, player, payload, fight_cost_cache)
        except Exception:
            return None
        total_cost = sum(int(v or 0) for v in result.get("adjusted_cost", {}).values())
        token_used = int(attack_used) + sum(int(v) for v in wild_alloc.values())
        return payload, total_cost, token_used, bool(result.get("can_afford")), result.get("adjusted_cost", {})

    def _build_boss_fight_payload(
        self,
        gs: GameSession,
        player: Any,
        boss_threshold: int,
        weapons: Sequence[Any],
        fight_cost_cache: Optional[Dict[Tuple[Any, ...], Dict[str, Any]]] = None,
    ) -> Optional[Tuple[Dict[str, Any], int, int, bool, Dict[ResourceType, int]]]:
        weapon_ids = []
        for weapon in weapons:
            wid = getattr(weapon, "id", None) or str(weapon)
            uses = getattr(weapon, "uses", None)
            if uses is not None and uses <= 0:
                continue
            weapon_ids.append(wid)

        payload: Dict[str, Any] = {"boss_threshold": int(boss_threshold), "played_weapons": weapon_ids}
        try:
            base = self._compute_fight_cost_cached(gs, player, payload, fight_cost_cache)
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
            result = self._compute_fight_cost_cached(gs, player, payload, fight_cost_cache)
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

    def _apply_plan_in_place(self, sim: PlannerSim, player_id: str, plan: List[Dict[str, Any]]) -> bool:
        for action in plan:
            try:
                sim.apply_action(player_id, action["type"], action.get("payload") or {})
            except Exception:
                return False
            if sim.state.phase == GamePhase.GAME_OVER or sim.state.get_active_player_id() != player_id:
                break
        if sim.state.get_active_player_id() == player_id and sim.state.phase != GamePhase.GAME_OVER:
            try:
                sim.apply_action(player_id, "end_turn", {})
            except Exception:
                return False
        return True

    def _ensure_opponent_cache(self, bot_id: str) -> Dict[str, Dict[str, Optional[Dict[str, Any]]]]:
        cache = self._opponent_action_cache.setdefault(bot_id, {})
        cache.setdefault("buy", {"primary": None, "secondary": None})
        cache.setdefault("fight", {"primary": None, "secondary": None})
        return cache

    def _has_cached_opponent_choices(self, cache: Dict[str, Dict[str, Optional[Dict[str, Any]]]]) -> bool:
        return any(
            (cache.get(key, {}) or {}).get(level)
            for key in ("buy", "fight")
            for level in ("primary", "secondary")
        )

    def _update_opponent_cache(
        self,
        bot_id: str,
        key: str,
        choice: Optional[Dict[str, Any]],
        allow_secondary: bool = False,
    ) -> None:
        if not choice:
            return
        cache = self._ensure_opponent_cache(bot_id).get(key, {})
        if cache.get("primary") is None:
            cache["primary"] = choice
        elif allow_secondary:
            cache["secondary"] = choice
        elif cache.get("secondary") is None:
            cache["secondary"] = choice

    def _extract_cached_choices(self, plan: List[Dict[str, Any]]) -> Tuple[Optional[Dict[str, Any]], Optional[Dict[str, Any]]]:
        buy_choice = None
        fight_choice = None
        for action in plan:
            action_type = action.get("type")
            if action_type in {"buy_upgrade", "buy_weapon"} and not buy_choice:
                payload = action.get("payload") or {}
                buy_choice = {
                    "type": action_type,
                    "card_id": payload.get("card_id"),
                    "card_name": payload.get("card_name"),
                }
            if action_type == "fight" and not fight_choice:
                payload = action.get("payload") or {}
                fight_choice = {"threat_id": payload.get("threat_id"), "row": payload.get("row")}
            if buy_choice and fight_choice:
                break
        return buy_choice, fight_choice

    def _find_market_card(self, gs: GameSession, choice: Dict[str, Any]) -> Optional[Any]:
        if not choice:
            return None
        market = getattr(gs.state, "market", None)
        if not market:
            return None
        action_type = choice.get("type")
        card_id = str(choice.get("card_id")) if choice.get("card_id") is not None else None
        card_name = choice.get("card_name")
        if action_type == "buy_upgrade":
            cards = (market.upgrades_top or []) + (market.upgrades_bottom or [])
        elif action_type == "buy_weapon":
            cards = (market.weapons_top or []) + (market.weapons_bottom or [])
        else:
            return None
        for card in cards:
            cid = str(getattr(card, "id", None) or getattr(card, "name", None) or "")
            if card_id and cid == card_id:
                return card
            if card_name and getattr(card, "name", None) == card_name:
                return card
        return None

    def _build_buy_for_choice(self, gs: GameSession, player_id: str, choice: Dict[str, Any]) -> Optional[List[Dict[str, Any]]]:
        player = gs.state.players.get(player_id)
        if not player:
            return None
        card = self._find_market_card(gs, choice)
        if not card:
            return None
        action_type = choice.get("type")
        is_upgrade = action_type == "buy_upgrade"
        if not is_upgrade and action_type != "buy_weapon":
            return None
        needs_slot = len(player.upgrades) >= player.upgrade_slots if is_upgrade else len(player.weapons) >= player.weapon_slots
        can_extend = (
            not player.extend_used
            and player.tokens.get(TokenType.WILD, 0) > 0
            and ((player.upgrade_slots < 5) if is_upgrade else (player.weapon_slots < 5))
        )
        if needs_slot and not can_extend:
            return None
        extend_seq = [{"type": "extend_slot", "payload": {"slot_type": "upgrade" if is_upgrade else "weapon"}}] if needs_slot else []
        action = {
            "type": action_type,
            "payload": {"card_id": card.id, "card_name": getattr(card, "name", card.id)},
        }
        if player.can_pay(card.cost):
            return extend_seq + [action]
        if not self._can_convert_to_cover_cost(player, card.cost):
            return None
        conv_action = self._pick_conversion_for_cost(player, card.cost)
        if conv_action:
            return extend_seq + [conv_action, action]
        return None

    def _build_cached_buy_sequence(
        self, gs: GameSession, player_id: str, cache_entry: Dict[str, Optional[Dict[str, Any]]]
    ) -> Tuple[Optional[List[Dict[str, Any]]], Dict[str, bool]]:
        primary = cache_entry.get("primary") if cache_entry else None
        secondary = cache_entry.get("secondary") if cache_entry else None
        status = {"primary_invalid": False, "used_secondary": False, "has_primary": primary is not None}
        if primary:
            seq = self._build_buy_for_choice(gs, player_id, primary)
            if seq:
                return seq, status
            status["primary_invalid"] = True
        if secondary:
            seq = self._build_buy_for_choice(gs, player_id, secondary)
            if seq:
                status["used_secondary"] = True
                return seq, status
        return None, status

    def _locate_threat(self, gs: GameSession, threat_id: str, preferred_row: Optional[int]) -> Optional[Tuple[int, Any]]:
        tm = gs.threat_manager
        if not tm or not getattr(tm, "board", None):
            return None
        lanes = getattr(tm.board, "lanes", []) or []
        if preferred_row is not None and 0 <= preferred_row < len(lanes):
            lane = lanes[preferred_row]
            for pos in ("front", "mid", "back"):
                threat = getattr(lane, pos, None)
                if threat and str(getattr(threat, "id", "")) == str(threat_id):
                    threat.position = pos
                    return preferred_row, threat
        for row_index, lane in enumerate(lanes):
            for pos in ("front", "mid", "back"):
                threat = getattr(lane, pos, None)
                if threat and str(getattr(threat, "id", "")) == str(threat_id):
                    threat.position = pos
                    return row_index, threat
        return None

    def _build_fight_for_choice(
        self, gs: GameSession, player_id: str, choice: Dict[str, Any]
    ) -> Optional[List[Dict[str, Any]]]:
        player = gs.state.players.get(player_id)
        if not player:
            return None
        if player.action_used and not (gs.state.boss_mode or gs.state.phase == GamePhase.BOSS):
            return None
        threat_id = choice.get("threat_id")
        if not threat_id:
            return None
        located = self._locate_threat(gs, str(threat_id), choice.get("row"))
        if not located:
            return None
        row_index, threat = located
        has_range_any = self._has_range_any(gs, player)
        if not has_range_any:
            front = gs.threat_manager.front_threat(row_index) if gs.threat_manager else None
            if not front or str(getattr(front, "id", "")) != str(threat_id):
                return None
        playable_weapons = self._playable_weapons(gs, player)
        weapon_sets = list(self._weapon_subsets(playable_weapons))
        fight_cost_cache: Dict[Tuple[Any, ...], Dict[str, Any]] = {}
        best_seq: Optional[List[Dict[str, Any]]] = None
        best_cost: Optional[Tuple[int, int]] = None
        for subset in weapon_sets:
            built = self._build_fight_payload(
                gs,
                player,
                row_index,
                threat,
                subset,
                fight_cost_cache=fight_cost_cache,
            )
            if not built:
                continue
            payload, resource_cost, token_used, can_afford, adjusted_cost = built
            fight_action = {"type": "fight", "payload": payload}
            sequences: List[List[Dict[str, Any]]] = []
            if can_afford:
                sequences.append([fight_action])
            else:
                conversion_candidates = self._pick_conversion_for_fight(player, adjusted_cost)
                for conv_action in conversion_candidates:
                    if self._can_afford_fight_with_conversion(gs, player, payload, conv_action):
                        sequences.append([conv_action, fight_action])
            for seq in sequences:
                candidate = (resource_cost, token_used)
                if best_cost is None or candidate < best_cost:
                    best_cost = candidate
                    best_seq = seq
        return best_seq

    def _build_cached_fight_sequence(
        self, gs: GameSession, player_id: str, cache_entry: Dict[str, Optional[Dict[str, Any]]]
    ) -> Tuple[Optional[List[Dict[str, Any]]], Dict[str, bool]]:
        primary = cache_entry.get("primary") if cache_entry else None
        secondary = cache_entry.get("secondary") if cache_entry else None
        status = {"primary_invalid": False, "used_secondary": False, "has_primary": primary is not None}
        if primary:
            seq = self._build_fight_for_choice(gs, player_id, primary)
            if seq:
                return seq, status
            status["primary_invalid"] = True
        if secondary:
            seq = self._build_fight_for_choice(gs, player_id, secondary)
            if seq:
                status["used_secondary"] = True
                return seq, status
        return None, status

    async def _advance_to_next_bot_turn(
        self,
        sim: PlannerSim,
        bot_id: str,
        personality: str = "greedy",
        score_cache: Optional[Dict[str, float]] = None,
        opponent_profile: Optional[str] = None,
    ) -> PlannerSim:
        """Advance simulation through other players using the planning bot's choice policy."""
        cache = score_cache if score_cache is not None else self._score_cache
        guard = 0
        while sim.state.phase != GamePhase.GAME_OVER:
            active = sim.state.get_active_player_id()
            if not active:
                break
            if active == bot_id:
                break
            active_player = sim.state.players.get(active)
            profile = opponent_profile or (getattr(active_player, "planning_profile", "full") if active_player else "full")
            opponent_cache = self._ensure_opponent_cache(active)
            buy_seq, buy_status = self._build_cached_buy_sequence(sim, active, opponent_cache.get("buy", {}))
            fight_seq, fight_status = self._build_cached_fight_sequence(sim, active, opponent_cache.get("fight", {}))
            has_cached = self._has_cached_opponent_choices(opponent_cache)
            needs_recompute = not has_cached
            if buy_status["primary_invalid"] and not buy_status["used_secondary"]:
                needs_recompute = True
            if fight_status["primary_invalid"] and not fight_status["used_secondary"]:
                needs_recompute = True
            if has_cached and not (buy_seq or fight_seq):
                needs_recompute = True

            if not needs_recompute and (buy_seq or fight_seq):
                cached_plan = (buy_seq or []) + (fight_seq or [])
                checkpoint = sim.checkpoint()
                if self._apply_plan_in_place(sim, active, cached_plan):
                    guard += 1
                    if guard > 50:
                        break
                    continue
                sim.rollback(checkpoint)

            plans = await self._enumerate_turn_plans(sim, active, profile)
            if not plans:
                plans = [[{"type": "end_turn", "payload": {}}]]
            candidate_runs: List[Dict[str, Any]] = []
            for plan in plans:
                checkpoint = sim.checkpoint()
                success = self._apply_plan_in_place(sim, active, plan)
                if success:
                    score = self._score_state_cached(sim, active, cache)
                    candidate_runs.append({"score": score, "plan": plan})
                sim.rollback(checkpoint)
            if not candidate_runs:
                break
            candidate_runs.sort(key=lambda run: run.get("score", -1e9), reverse=True)
            chosen = self._choose_run_by_personality(candidate_runs, personality) or candidate_runs[0]
            plan_choice = chosen.get("plan") or []
            buy_choice, fight_choice = self._extract_cached_choices(plan_choice)
            self._update_opponent_cache(
                active, "buy", buy_choice, allow_secondary=buy_status["primary_invalid"]
            )
            self._update_opponent_cache(
                active, "fight", fight_choice, allow_secondary=fight_status["primary_invalid"]
            )
            if not self._apply_plan_in_place(sim, active, plan_choice):
                try:
                    sim.apply_action(active, "end_turn", {})
                except Exception:
                    break
            guard += 1
            if guard > 50:
                break
        return sim

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
