import copy
import random
from typing import Any, Dict, List, Optional

from game_core import GameSession, ResourceType, TokenType, Stance


def score_state(session: GameSession, player_id: str) -> float:
    player = session.state.players.get(player_id)
    if not player:
        return -1e9
    # Simple heuristic: VP plus weighted resources/tokens, minus wounds
    res_score = sum(player.resources.values()) * 0.1
    token_score = sum(player.tokens.get(t, 0) for t in TokenType) * 0.2
    wound_penalty = player.wounds * 1.0
    slot_score = (player.upgrade_slots + player.weapon_slots) * 0.5
    return player.vp + res_score + token_score + slot_score - wound_penalty


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

            possible = self._enumerate_actions(session, player_id)
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

        return {"actions": best_plan, "score": best_score, "logs": sim_logs, "simulations": best_runs}

    def _enumerate_actions(self, gs: GameSession, player_id: str) -> List[Dict[str, Any]]:
        player = gs.state.players.get(player_id)
        if not player:
            return []
        actions: List[Dict[str, Any]] = []
        # Main actions (skip fight for now)
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
        return actions
