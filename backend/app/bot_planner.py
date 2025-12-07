import copy
import itertools
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
        max_depth: int = 5,
        top_n: int = 5,
        max_branches: int = 150,
        rng: Optional[random.Random] = None,
    ):
        self.max_depth = max_depth
        self.top_n = top_n
        self.max_branches = max_branches
        self.rng = rng or random.Random()

    async def plan(self, game: GameSession, player_id: str) -> Dict[str, Any]:
        base_round = getattr(game.state, "round", 0)
        base_era = getattr(game.state, "era", "day")
        start_score = score_state(game, player_id)
        best_runs: List[Dict[str, Any]] = []
        explored = 0

        async def push_result(result: Dict[str, Any]):
            nonlocal best_runs
            # Insert sorted by score desc
            best_runs.append(result)
            best_runs = sorted(best_runs, key=lambda r: r.get("score", -1e9), reverse=True)[: self.top_n]

        async def dfs(session: GameSession, steps: List[Dict[str, Any]], depth: int):
            nonlocal explored
            if explored >= self.max_branches:
                return
            if depth >= self.max_depth:
                await push_result(
                    {
                        "round": getattr(session.state, "round", base_round),
                        "era": getattr(session.state, "era", base_era),
                        "start_score": start_score,
                        "score": score_state(session, player_id),
                        "actions": [s["action"] for s in steps],
                        "steps": steps,
                    }
                )
                explored += 1
                return

            possible = await self._enumerate_actions(session, player_id)
            if not possible:
                await push_result(
                    {
                        "round": getattr(session.state, "round", base_round),
                        "era": getattr(session.state, "era", base_era),
                        "start_score": start_score,
                        "score": score_state(session, player_id),
                        "actions": [s["action"] for s in steps],
                        "steps": steps,
                    }
                )
                explored += 1
                return

            for action in possible:
                if explored >= self.max_branches:
                    break
                gs = copy.deepcopy(session)
                try:
                    await gs.player_action(player_id, action["type"], action.get("payload") or {}, None)
                except Exception:
                    continue
                current_score = score_state(gs, player_id)
                step_info = {
                    "action": action,
                    "score": current_score,
                    "round": getattr(gs.state, "round", base_round),
                    "era": getattr(gs.state, "era", base_era),
                }
                new_steps = steps + [step_info]
                if action["type"] == "end_turn":
                    await push_result(
                        {
                            "round": step_info["round"],
                            "era": step_info["era"],
                            "start_score": start_score,
                            "score": current_score,
                            "actions": [s["action"] for s in new_steps],
                            "steps": new_steps,
                        }
                    )
                    explored += 1
                else:
                    await dfs(gs, new_steps, depth + 1)

        # Begin exhaustive search up to depth
        await dfs(copy.deepcopy(game), [], 0)

        # Prepare logs for top results only
        sim_logs: List[str] = []
        for idx, run in enumerate(best_runs[: self.top_n]):
            sim_logs.append(
                f"[top {idx+1}] round {run.get('round', base_round)} era {run.get('era', base_era)} start {run.get('start_score', start_score):.2f} → final {run.get('score', -1e9):.2f}"
            )
        sim_logs.append(f"[info] explored {explored} branches (depth≤{self.max_depth})")

        # Attach ids
        for i, run in enumerate(best_runs, start=1):
            run["id"] = i

        best_plan = best_runs[0]["actions"] if best_runs else []
        best_score = best_runs[0]["score"] if best_runs else -1e9

        # Multi-turn lookahead: simulate this turn end, other players, and our next turn end.
        future_candidates = [r for r in best_runs if r.get("actions")]
        end_turn_candidates = [r for r in future_candidates if r["actions"] and r["actions"][-1]["type"] == "end_turn"]
        if end_turn_candidates:
            future_candidates = end_turn_candidates
        future_k = min(5, self.top_n)
        future_candidates = future_candidates[:future_k]

        best_future_score = -1e9
        best_future_plan: List[Dict[str, Any]] = best_plan
        self_turn_target = 4  # current turn (already simulated) + two future turns
        for run in future_candidates:
            sim = copy.deepcopy(game)
            try:
                for act in run["actions"]:
                    await sim.player_action(player_id, act["type"], act.get("payload") or {}, None)
            except Exception:
                continue
            self_turns_completed = 1 if run["actions"] and run["actions"][-1]["type"] == "end_turn" else 0
            # Advance through other players and our next turns (greedy best actions)
            while self_turns_completed < self_turn_target and sim.state.phase != GamePhase.GAME_OVER:
                active_id = sim.state.get_active_player_id()
                if not active_id:
                    break
                await self._simulate_best_turn(sim, active_id, max_steps=8)
                if active_id == player_id:
                    self_turns_completed += 1
            future_score = score_state(sim, player_id)
            run["future_score"] = future_score
            if future_score > best_future_score:
                best_future_score = future_score
                best_future_plan = run["actions"]

        return {
            "actions": best_future_plan,
            "score": best_future_score if future_candidates else best_score,
            "logs": sim_logs,
            "simulations": best_runs,
        }

    async def _enumerate_actions(self, gs: GameSession, player_id: str) -> List[Dict[str, Any]]:
        player = gs.state.players.get(player_id)
        if not player:
            return []
        actions: List[Dict[str, Any]] = []
        # Fight simulations (only when main action available or during boss fights)
        actions.extend(await self._generate_fight_actions(gs, player_id))

        # Main actions
        if not player.action_used:
            # pick token
            for token in ["attack", "conversion", "wild"]:
                if player.tokens.get(TokenType[token.upper()], 0) < 3:
                    actions.append({"type": "pick_token", "payload": {"token": token}})
            # stance change
            for stance in Stance:
                if stance != player.stance:
                    actions.append({"type": "realign", "payload": {"stance": stance.value}})

        # Optional buy
        if not player.buy_used:
            for card in gs.state.market.upgrades:
                if len(player.upgrades) < player.upgrade_slots and player.can_pay(card.cost):
                    actions.append({"type": "buy_upgrade", "payload": {"card_id": card.id}})
            for card in gs.state.market.weapons:
                if len(player.weapons) < player.weapon_slots and player.can_pay(card.cost):
                    actions.append({"type": "buy_weapon", "payload": {"card_id": card.id}})

        # Optional extend slot
        if not player.extend_used and player.tokens.get(TokenType.WILD, 0) > 0:
            if len(player.upgrades) >= player.upgrade_slots and player.upgrade_slots < 4:
                actions.append({"type": "extend_slot", "payload": {"slot_type": "upgrade"}})
            if len(player.weapons) >= player.weapon_slots and player.weapon_slots < 4:
                actions.append({"type": "extend_slot", "payload": {"slot_type": "weapon"}})

        # Conversion token usage
        if player.tokens.get(TokenType.CONVERSION, 0) > 0:
            for from_res in ResourceType:
                if player.resources.get(from_res, 0) <= 0:
                    continue
                for to_res in ResourceType:
                    if to_res == from_res:
                        continue
                    actions.append({"type": "convert", "payload": {"from": from_res.value, "to": to_res.value, "amount": 1}})

        # Upgrade actives
        if player.upgrades:
            for card in player.upgrades:
                if player.active_used.get(card.id):
                    continue
                tags = getattr(card, "tags", []) or []
                if any(str(t).startswith("active:mass_token") for t in tags):
                    for token in ["attack", "conversion", "wild", "mass", "boss"]:
                        if player.tokens.get(TokenType[token.upper()], 0) > 0 and player.resources.get(ResourceType.GREEN, 0) >= 2:
                            actions.append({"type": "activate_card", "payload": {"card_id": card.id, "token": token}})
                if any(str(t).startswith("active:convert_split") for t in tags):
                    for res in ["R", "B", "G"]:
                        resource_enum = ResourceType(res)
                        if player.resources.get(resource_enum, 0) > 0:
                            actions.append({"type": "activate_card", "payload": {"card_id": card.id, "resource": res}})

        # End turn fallback
        actions.append({"type": "end_turn", "payload": {}})
        print(actions)
        return actions

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
        for r in range(1, len(weapons) + 1):
            combos.extend(itertools.combinations(weapons, r))
        return combos

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

    async def _simulate_best_turn(self, gs: GameSession, active_id: str, max_steps: int = 8):
        """Greedy turn simulation for a given player until turn passes or steps exceed."""
        steps = 0
        while gs.state.get_active_player_id() == active_id and steps < max_steps:
            steps += 1
            best_action = await self._pick_best_action(gs, active_id)
            if not best_action:
                best_action = {"type": "end_turn", "payload": {}}
            try:
                await gs.player_action(active_id, best_action["type"], best_action.get("payload") or {}, None)
            except Exception:
                # If action fails, force end turn to avoid infinite loops
                try:
                    await gs.player_action(active_id, "end_turn", {}, None)
                except Exception:
                    break
        # Safety: if still on this player's turn after max_steps, force end turn
        if gs.state.get_active_player_id() == active_id:
            try:
                await gs.player_action(active_id, "end_turn", {}, None)
            except Exception:
                pass

    async def _pick_best_action(self, gs: GameSession, player_id: str) -> Optional[Dict[str, Any]]:
        actions = await self._enumerate_actions(gs, player_id)
        if not actions:
            return None
        best: Optional[Dict[str, Any]] = None
        best_score = -1e9
        for action in actions:
            sim = copy.deepcopy(gs)
            try:
                await sim.player_action(player_id, action["type"], action.get("payload") or {}, None)
            except Exception:
                continue
            score = score_state(sim, player_id)
            if score > best_score:
                best_score = score
                best = action
        return best
