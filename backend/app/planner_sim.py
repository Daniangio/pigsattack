from __future__ import annotations

import copy
import random
from types import SimpleNamespace
from typing import Any, Dict, List, Optional, Tuple

from game_core import (
    BossCard,
    BossThreshold,
    CardType,
    GamePhase,
    GameState,
    MarketCard,
    PlayerBoard,
    PlayerStatus,
    ResourceType,
    Reward,
    Stance,
    TokenType,
    clamp_cost,
    resource_to_wire,
)
from game_core.effects import CardEffect, effect_to_wire, parse_effect_tags_cached
from game_core.session import InvalidActionError
from game_core.threats import ThreatInstance, ThreatManager
from game_core.utils import parse_resource_key, sum_resources


class UndoLog:
    def __init__(self) -> None:
        self._ops: List[Any] = []

    def checkpoint(self) -> int:
        return len(self._ops)

    def add(self, fn: Any) -> None:
        self._ops.append(fn)

    def rollback(self, checkpoint: int) -> None:
        while len(self._ops) > checkpoint:
            undo = self._ops.pop()
            undo()


class PlannerSim:
    def __init__(self, state: GameState, threat_manager: Optional[ThreatManager], rng: Optional[random.Random] = None):
        self.state = state
        self.threat_manager = threat_manager
        self.rng = rng or random.Random()
        self._undo = UndoLog()

    @classmethod
    def from_session(cls, session: Any) -> "PlannerSim":
        state = copy.deepcopy(session.state)
        state.verbose = False
        tm = copy.deepcopy(session.threat_manager)
        rng = random.Random()
        try:
            rng.setstate(session.rng.getstate())
        except Exception:
            pass
        sim = cls(state, tm, rng)
        sim._sync_threat_rows()
        sim._update_deck_remaining()
        return sim

    def checkpoint(self) -> int:
        return self._undo.checkpoint()

    def rollback(self, checkpoint: int) -> None:
        self._undo.rollback(checkpoint)

    def _set_attr(self, obj: Any, attr: str, value: Any) -> None:
        old = getattr(obj, attr)
        if old is value:
            return
        self._undo.add(lambda obj=obj, attr=attr, old=old: setattr(obj, attr, old))
        setattr(obj, attr, value)

    def _dict_set(self, data: Dict[Any, Any], key: Any, value: Any) -> None:
        had = key in data
        old = data.get(key)
        self._undo.add(
            lambda data=data, key=key, had=had, old=old: data.__setitem__(key, old)
            if had
            else data.pop(key, None)
        )
        data[key] = value

    def _list_append(self, data: List[Any], value: Any) -> None:
        self._undo.add(lambda data=data: data.pop())
        data.append(value)

    def _list_extend(self, data: List[Any], values: List[Any]) -> None:
        if not values:
            return
        count = len(values)
        self._undo.add(lambda data=data, count=count: data.__delitem__(slice(-count, None)))
        data.extend(values)

    def _list_insert(self, data: List[Any], index: int, value: Any) -> None:
        self._undo.add(lambda data=data, index=index: data.pop(index))
        data.insert(index, value)

    def _list_pop(self, data: List[Any], index: Optional[int] = None) -> Any:
        if index is None:
            index = len(data) - 1
        value = data.pop(index)
        self._undo.add(lambda data=data, index=index, value=value: data.insert(index, value))
        return value

    def _list_remove_index(self, data: List[Any], index: int) -> Any:
        value = data.pop(index)
        self._undo.add(lambda data=data, index=index, value=value: data.insert(index, value))
        return value

    def _list_remove_value(self, data: List[Any], value: Any) -> None:
        index = data.index(value)
        self._undo.add(lambda data=data, index=index, value=value: data.insert(index, value))
        data.pop(index)

    def _list_clear(self, data: List[Any]) -> None:
        old = list(data)
        self._undo.add(lambda data=data, old=old: data.extend(old))
        data.clear()

    def _shuffle_list(self, data: List[Any]) -> None:
        old_state = self.rng.getstate()
        old = list(data)
        self._undo.add(lambda data=data, old=old, old_state=old_state: self._restore_shuffle(data, old, old_state))
        self.rng.shuffle(data)

    def _restore_shuffle(self, data: List[Any], old: List[Any], old_state: Any) -> None:
        data[:] = old
        try:
            self.rng.setstate(old_state)
        except Exception:
            pass

    def _set_resource(self, player: PlayerBoard, res: ResourceType, value: int) -> None:
        self._dict_set(player.resources, res, value)

    def _inc_resource(self, player: PlayerBoard, res: ResourceType, delta: int) -> None:
        current = int(player.resources.get(res, 0))
        self._dict_set(player.resources, res, current + delta)

    def _set_token(self, player: PlayerBoard, token: TokenType, value: int) -> None:
        self._dict_set(player.tokens, token, value)

    def _inc_token(self, player: PlayerBoard, token: TokenType, delta: int) -> None:
        current = int(player.tokens.get(token, 0))
        self._dict_set(player.tokens, token, current + delta)

    def _card_effects(self, card: Any) -> List[CardEffect]:
        if not card:
            return []
        tags = getattr(card, "tags", None)
        if tags is None:
            return []
        return parse_effect_tags_cached(
            tags,
            getattr(card, "id", None) or str(card),
            getattr(card, "name", None) or str(card),
        )

    def _card_name(self, card: Any) -> str:
        return getattr(card, "name", None) or getattr(card, "id", None) or str(card)

    def _ensure_market_cards(self, entries: List[Any], default_type: CardType) -> List[MarketCard]:
        normalized: List[MarketCard] = []
        for entry in entries or []:
            if isinstance(entry, MarketCard):
                normalized.append(entry)
                continue
            if isinstance(entry, dict):
                raw_type = entry.get("type") or entry.get("card_type") or entry.get("cardType") or default_type.value
                try:
                    card_type = CardType(raw_type.upper()) if isinstance(raw_type, str) else CardType(raw_type)
                except Exception:
                    card_type = default_type
                normalized.append(
                    MarketCard(
                        id=str(entry.get("id") or entry.get("name") or len(normalized)),
                        card_type=card_type,
                        name=str(entry.get("name") or entry.get("id") or "Unknown"),
                        cost={},
                        vp=int(entry.get("vp") or 0),
                        effect=str(entry.get("effect") or ""),
                        uses=entry.get("uses"),
                        tags=entry.get("tags", []) if isinstance(entry.get("tags", []), list) else [],
                    )
                )
                continue
            normalized.append(
                MarketCard(
                    id=str(entry),
                    card_type=default_type,
                    name=str(entry),
                    cost={},
                    vp=0,
                    effect="",
                    uses=None,
                    tags=[],
                )
            )
        return normalized

    def _normalize_player_cards(self, player: PlayerBoard) -> None:
        upgrades = self._ensure_market_cards(player.upgrades, CardType.UPGRADE)
        if upgrades is not player.upgrades:
            self._set_attr(player, "upgrades", upgrades)
        weapons = self._ensure_market_cards(player.weapons, CardType.WEAPON)
        if weapons is not player.weapons:
            self._set_attr(player, "weapons", weapons)

    def _find_card(self, cards: List[MarketCard], card_id: Optional[str]) -> Optional[MarketCard]:
        if not card_id:
            return None
        return next((c for c in cards if c.id == card_id), None)

    def _assert_turn(self, player: PlayerBoard) -> None:
        active_id = self.state.get_active_player_id()
        if self.state.phase not in {GamePhase.PLAYER_TURN, GamePhase.BOSS} or not active_id:
            raise InvalidActionError("It is not time to act.")
        if player.user_id != active_id:
            raise InvalidActionError("It is not your turn.")

    def _consume_main_action(self, player: PlayerBoard) -> None:
        if player.action_used:
            raise InvalidActionError("Main action already used this turn.")
        self._set_attr(player, "action_used", True)

    def _consume_buy_action(self, player: PlayerBoard) -> None:
        if player.buy_used:
            raise InvalidActionError("Market buy already used this turn.")
        self._set_attr(player, "buy_used", True)

    def _consume_extend_action(self, player: PlayerBoard) -> None:
        if player.extend_used:
            raise InvalidActionError("Extend slot already used this turn.")
        self._set_attr(player, "extend_used", True)

    def _assert_active_available(self, player: PlayerBoard, card_id: str) -> None:
        if player.active_used.get(card_id):
            raise InvalidActionError("This card's active ability was already used this turn.")

    def apply_action(self, player_id: str, action: str, payload: Dict[str, Any]) -> None:
        player = self.state.players.get(player_id)
        if not player:
            raise InvalidActionError("Player not found.")

        if player.status != PlayerStatus.ACTIVE and action not in {"surrender", "disconnect"}:
            raise InvalidActionError("You are not an active player.")

        handlers = {
            "fight": self._handle_fight,
            "buy_upgrade": self._handle_buy_upgrade,
            "buy_weapon": self._handle_buy_weapon,
            "pick_token": self._handle_pick_token,
            "extend_slot": self._handle_extend_slot,
            "realign": self._handle_realign,
            "stance_step": self._handle_stance_step,
            "activate_card": self._handle_activate_card,
            "end_turn": self._handle_end_turn,
            "convert": self._handle_convert,
        }

        handler = handlers.get(action)
        if not handler:
            raise InvalidActionError(f"Unknown action: {action}")
        handler(player, payload or {})

    def _handle_buy_upgrade(self, player: PlayerBoard, payload: Dict[str, Any]) -> None:
        self._assert_turn(player)
        market = self.state.market
        card = self._find_card((market.upgrades_top + market.upgrades_bottom), payload.get("card_id"))
        if not card:
            raise InvalidActionError("Upgrade not found.")
        if len(player.upgrades) >= player.upgrade_slots:
            raise InvalidActionError("No upgrade slots left.")
        if not player.can_pay(card.cost):
            raise InvalidActionError("Not enough resources.")

        self._consume_buy_action(player)
        for res, amt in card.cost.items():
            self._set_resource(player, res, max(0, player.resources.get(res, 0) - amt))
        self._list_append(player.upgrades, card)
        if card.vp:
            self._set_attr(player, "vp", player.vp + card.vp)
        self._remove_market_card(market.upgrades_top, card.id)
        self._remove_market_card(market.upgrades_bottom, card.id)

    def _handle_buy_weapon(self, player: PlayerBoard, payload: Dict[str, Any]) -> None:
        self._assert_turn(player)
        market = self.state.market
        card = self._find_card((market.weapons_top + market.weapons_bottom), payload.get("card_id"))
        if not card:
            raise InvalidActionError("Weapon not found.")
        if len(player.weapons) >= player.weapon_slots:
            raise InvalidActionError("No weapon slots left.")
        if not player.can_pay(card.cost):
            raise InvalidActionError("Not enough resources.")

        self._consume_buy_action(player)
        for res, amt in card.cost.items():
            self._set_resource(player, res, max(0, player.resources.get(res, 0) - amt))
        self._list_append(player.weapons, card)
        if card.vp:
            self._set_attr(player, "vp", player.vp + card.vp)
        self._remove_market_card(market.weapons_top, card.id)
        self._remove_market_card(market.weapons_bottom, card.id)

    def _handle_pick_token(self, player: PlayerBoard, payload: Dict[str, Any]) -> None:
        self._assert_turn(player)
        self._consume_main_action(player)
        token_raw = (payload.get("token") or payload.get("token_type") or "").lower()
        token_map = {
            "ferocity": TokenType.ATTACK,
            "attack": TokenType.ATTACK,
            "conversion": TokenType.CONVERSION,
            "convert": TokenType.CONVERSION,
            "wild": TokenType.WILD,
        }
        token_type = token_map.get(token_raw)
        if not token_type:
            raise InvalidActionError("Unknown token type.")
        current = player.tokens.get(token_type, 0)
        if current >= 5:
            raise InvalidActionError("You already have the maximum of that token.")
        self._set_token(player, token_type, min(5, current + 1))

    def _handle_extend_slot(self, player: PlayerBoard, payload: Dict[str, Any]) -> None:
        self._assert_turn(player)
        slot_type = (payload.get("slot_type") or "upgrade").lower()
        if slot_type not in {"upgrade", "weapon"}:
            raise InvalidActionError("slot_type must be 'upgrade' or 'weapon'.")
        if player.tokens.get(TokenType.WILD, 0) <= 0:
            raise InvalidActionError("You need a wild token to extend a slot.")
        if slot_type == "upgrade":
            if player.upgrade_slots >= 5:
                raise InvalidActionError("Upgrade slots already at max.")
        else:
            if player.weapon_slots >= 5:
                raise InvalidActionError("Weapon slots already at max.")

        self._consume_extend_action(player)
        self._set_token(player, TokenType.WILD, max(0, player.tokens.get(TokenType.WILD, 0) - 1))
        if slot_type == "upgrade":
            self._set_attr(player, "upgrade_slots", player.upgrade_slots + 1)
        else:
            self._set_attr(player, "weapon_slots", player.weapon_slots + 1)

    def _handle_activate_card(self, player: PlayerBoard, payload: Dict[str, Any]) -> None:
        self._assert_turn(player)
        card_id = payload.get("card_id")
        if not card_id:
            raise InvalidActionError("card_id is required.")
        self._normalize_player_cards(player)
        card = self._find_card(player.upgrades, card_id)
        if not card:
            raise InvalidActionError("Upgrade not found.")
        effects = self._card_effects(card)
        has_mass_active = any(eff.kind == "active_mass_token" for eff in effects)
        has_split_active = any(eff.kind == "active_convert_split" for eff in effects)
        if not (has_mass_active or has_split_active):
            raise InvalidActionError("This card has no active ability.")
        self._assert_active_available(player, card.id)

        if has_mass_active:
            token_raw = (payload.get("token") or payload.get("token_type") or "").lower()
            token_map = {
                "attack": TokenType.ATTACK,
                "conversion": TokenType.CONVERSION,
                "wild": TokenType.WILD,
                "mass": TokenType.MASS,
            }
            token_type = token_map.get(token_raw)
            if not token_type:
                raise InvalidActionError("A token type is required to activate this card.")
            if player.tokens.get(token_type, 0) <= 0:
                raise InvalidActionError("Selected token not available.")
            if player.resources.get(ResourceType.GREEN, 0) < 2:
                raise InvalidActionError("Not enough green resources (need 2G).")
            if player.tokens.get(TokenType.MASS, 0) >= 5:
                raise InvalidActionError("You already have the maximum Mass tokens.")

            self._set_token(player, token_type, max(0, player.tokens.get(token_type, 0) - 1))
            self._set_resource(player, ResourceType.GREEN, max(0, player.resources.get(ResourceType.GREEN, 0) - 2))
            self._set_token(player, TokenType.MASS, min(5, player.tokens.get(TokenType.MASS, 0) + 1))

        elif has_split_active:
            res_key = payload.get("resource") or payload.get("from")
            if not res_key:
                raise InvalidActionError("Choose a resource to convert.")
            res = parse_resource_key(res_key, InvalidActionError)
            if player.resources.get(res, 0) <= 0:
                raise InvalidActionError("Not enough of that resource to convert.")
            others = [r for r in ResourceType if r != res]
            if len(others) < 2:
                raise InvalidActionError("Conversion failed.")
            self._set_resource(player, res, max(0, player.resources.get(res, 0) - 1))
            self._inc_resource(player, others[0], 1)
            self._inc_resource(player, others[1], 1)

        self._dict_set(player.active_used, card.id, True)

    def _handle_realign(self, player: PlayerBoard, payload: Dict[str, Any]) -> None:
        self._assert_turn(player)
        target = payload.get("stance")
        if not target:
            raise InvalidActionError("Target stance required.")
        try:
            target_stance = Stance[target.upper()]
        except KeyError:
            raise InvalidActionError("Unknown stance.")

        if getattr(player, "free_stance_changes", 0) > 0:
            self._set_attr(player, "free_stance_changes", max(0, player.free_stance_changes - 1))
        else:
            self._consume_main_action(player)
        self._set_attr(player, "stance", target_stance)

    def _handle_convert(self, player: PlayerBoard, payload: Dict[str, Any]) -> None:
        from_key = payload.get("from") or payload.get("from_res")
        to_key = payload.get("to") or payload.get("to_res")
        amount_requested = int(payload.get("amount", 0)) if payload.get("amount") is not None else None
        if not from_key or not to_key:
            raise InvalidActionError("from and to are required for conversion.")
        from_res = parse_resource_key(from_key, InvalidActionError)
        to_res = parse_resource_key(to_key, InvalidActionError)
        if from_res == to_res:
            raise InvalidActionError("Cannot convert to the same resource.")
        if player.tokens.get(TokenType.CONVERSION, 0) <= 0:
            raise InvalidActionError("No conversion tokens available.")
        available = player.resources.get(from_res, 0)
        if available <= 0:
            raise InvalidActionError("Not enough resources to convert.")
        if amount_requested is None or amount_requested <= 0:
            amount = min(3, available)
        else:
            amount = min(3, amount_requested, available)
        if amount <= 0:
            raise InvalidActionError("Not enough resources to convert.")

        self._set_resource(player, from_res, player.resources.get(from_res, 0) - amount)
        self._inc_resource(player, to_res, amount)
        self._set_token(player, TokenType.CONVERSION, max(0, player.tokens.get(TokenType.CONVERSION, 0) - 1))

    def _handle_stance_step(self, player: PlayerBoard, payload: Dict[str, Any]) -> None:
        self._handle_realign(player, payload)

    def _handle_end_turn(self, player: PlayerBoard, payload: Dict[str, Any]) -> None:
        self._process_end_turn(player, payload, allow_inactive=False)

    def _remove_market_card(self, cards: List[MarketCard], card_id: str) -> None:
        for idx, card in enumerate(list(cards)):
            if getattr(card, "id", None) == card_id:
                self._list_remove_index(cards, idx)
                break

    def _apply_reward(self, player: PlayerBoard, reward: str) -> None:
        reward_map = {
            "+Attack": TokenType.ATTACK,
            "+Conversion": TokenType.CONVERSION,
            "+Wild": TokenType.WILD,
            "+Mass": TokenType.MASS,
        }
        token_type = reward_map.get(reward)
        if token_type:
            current = player.tokens.get(token_type, 0)
            self._set_token(player, token_type, min(5, current + 1))
        for eff in self._card_effects(reward):
            if eff.kind == "on_kill_conversion" and eff.amount:
                current = player.tokens.get(TokenType.CONVERSION, 0)
                gained = min(eff.amount, max(0, 5 - current))
                if gained:
                    self._set_token(player, TokenType.CONVERSION, current + gained)

    def _apply_reward_obj(self, player: PlayerBoard, reward: Reward) -> None:
        kind = reward.kind
        if kind == "vp":
            self._set_attr(player, "vp", player.vp + reward.amount)
        elif kind == "heal_wound":
            self._set_attr(player, "wounds", max(0, player.wounds - reward.amount))
        elif kind == "token" and reward.token:
            tok = reward.token
            if isinstance(tok, str):
                try:
                    tok = TokenType(tok.lower())
                except Exception:
                    try:
                        tok = TokenType[tok.upper()]
                    except Exception:
                        tok = None
            if tok:
                current = player.tokens.get(tok, 0)
                self._set_token(player, tok, min(5, current + reward.amount))
        elif kind in {"stance_change", "free_stance_change"}:
            delta = reward.amount if reward.amount else 1
            self._set_attr(player, "free_stance_changes", max(0, player.free_stance_changes + delta))
        elif kind == "slot" and reward.slot_type:
            if reward.slot_type == "upgrade":
                self._set_attr(player, "upgrade_slots", min(5, player.upgrade_slots + reward.amount))
            elif reward.slot_type == "weapon":
                self._set_attr(player, "weapon_slots", min(5, player.weapon_slots + reward.amount))
        elif kind == "resource" and reward.resources:
            for res, amt in reward.resources.items():
                if amt:
                    self._inc_resource(player, res, max(0, amt))

    def _compute_boss_fight_cost(self, player: PlayerBoard, payload: Dict[str, Any]) -> Dict[str, Any]:
        idx_raw = payload.get("boss_threshold")
        if idx_raw is None:
            raise InvalidActionError("Select a boss threshold to fight.")
        try:
            idx = int(idx_raw)
        except Exception:
            raise InvalidActionError("Invalid boss threshold.")
        thresholds_state = self.state.boss_thresholds_state or []
        state_entry = next((t for t in thresholds_state if int(t.get("index", -1)) == idx), None)
        if not state_entry:
            raise InvalidActionError("That threshold is already defeated.")
        defeated_by = state_entry.get("defeated_by") or []
        if player.user_id in defeated_by:
            raise InvalidActionError("You already defeated that threshold.")
        boss = self._boss_card_for_stage(self.state.boss_stage)
        if not boss or idx < 0 or idx >= len(boss.thresholds):
            raise InvalidActionError("Boss threshold not found.")
        threshold: BossThreshold = boss.thresholds[idx]
        cost = dict(threshold.cost)

        self._normalize_player_cards(player)

        played_weapon_ids = set(payload.get("played_weapons") or [])
        active_weapons: List[MarketCard] = []
        for card in (player.weapons or []):
            card_id = getattr(card, "id", None) or (str(card) if card else None)
            if card_id in played_weapon_ids:
                active_weapons.append(card)
        active_effects: List[CardEffect] = []
        for card in active_weapons:
            active_effects.extend(self._card_effects(card))
        for card in (player.weapons or []):
            for eff in self._card_effects(card):
                if eff.kind == "fight_range" and eff.value == "any":
                    active_effects.append(eff)
        active_upgrades: List[MarketCard] = player.upgrades or []
        for card in active_upgrades:
            active_effects.extend(self._card_effects(card))

        mass_tokens = player.tokens.get(TokenType.MASS, 0)
        if mass_tokens:
            defense_boosts = [eff.amount for eff in active_effects if eff.kind == "mass_token_defense" and eff.amount]
            reduction_per = max(defense_boosts) if defense_boosts else 2
            cost[ResourceType.GREEN] = max(0, cost.get(ResourceType.GREEN, 0) - reduction_per * mass_tokens)

        use_tokens = payload.get("use_tokens", {}) or {}
        attack_used = int(use_tokens.get("attack", 0))
        if attack_used > player.tokens.get(TokenType.ATTACK, 0):
            raise InvalidActionError("Not enough attack tokens.")
        if attack_used:
            cost[ResourceType.RED] = max(0, cost.get(ResourceType.RED, 0) - 2 * attack_used)
        wild_allocation_raw = use_tokens.get("wild_allocation", {}) or {}
        wild_allocated = 0
        for key, amount in wild_allocation_raw.items():
            res_type = parse_resource_key(key, InvalidActionError)
            wild_allocated += int(amount)
            cost[res_type] = max(0, cost.get(res_type, 0) - int(amount))
        if wild_allocated > player.tokens.get(TokenType.WILD, 0):
            raise InvalidActionError("Not enough wild tokens.")

        applied_effects: List[CardEffect] = []
        stance_choice_raw = payload.get("stance_choice")
        stance_choice_res: Optional[ResourceType] = None
        if stance_choice_raw:
            try:
                stance_choice_res = parse_resource_key(stance_choice_raw, InvalidActionError)
            except InvalidActionError:
                stance_choice_res = None
        for eff in active_effects:
            if eff.kind == "fight_cost_reduction" and eff.value and eff.amount:
                if eff.context:
                    era = getattr(self.threat_manager.deck, "phase", None) if self.threat_manager else None
                    if era and eff.context.lower() != str(era).lower():
                        continue
                res_type = parse_resource_key(eff.value, InvalidActionError)
                cost[res_type] = max(0, cost.get(res_type, 0) - eff.amount)
                applied_effects.append(eff)
            if eff.kind == "fight_cost_reduction_stance" and eff.amount:
                if eff.context:
                    era = getattr(self.threat_manager.deck, "phase", None) if self.threat_manager else None
                    if era and eff.context.lower() != str(era).lower():
                        continue
                stance = player.stance
                stance_map = {
                    Stance.AGGRESSIVE: ResourceType.RED,
                    Stance.TACTICAL: ResourceType.BLUE,
                    Stance.HUNKERED: ResourceType.GREEN,
                }
                if stance in stance_map:
                    target_res = stance_map[stance]
                else:
                    if stance_choice_res:
                        target_res = stance_choice_res
                    else:
                        ranked = sorted(cost.items(), key=lambda kv: kv[1], reverse=True)
                        target_res = ranked[0][0] if ranked else ResourceType.RED
                cost[target_res] = max(0, cost.get(target_res, 0) - eff.amount)
                applied_effects.append(
                    CardEffect(
                        kind=eff.kind,
                        value=target_res.value,
                        amount=eff.amount,
                        context=eff.context,
                        source_id=eff.source_id,
                        source_name=eff.source_name,
                    )
                )

        adjusted_cost = clamp_cost(cost)
        can_afford = player.can_pay(adjusted_cost)
        remaining = dict(player.resources)
        if can_afford:
            for res, val in adjusted_cost.items():
                remaining[res] = max(0, remaining.get(res, 0) - val)

        threat_like = SimpleNamespace(
            id=f"boss-{idx}",
            name=f"{boss.name} • {threshold.label}",
            label=threshold.label,
            cost=resource_to_wire(threshold.cost),
            reward=threshold.reward,
            spoils=threshold.spoils,
            vp=0,
            type="Boss",
            boss_threshold=idx,
        )
        return {
            "can_afford": can_afford,
            "message": "ok" if can_afford else "Not enough resources to fight the boss threshold.",
            "threat": threat_like,
            "row_index": 0,
            "adjusted_cost": adjusted_cost,
            "attack_used": attack_used,
            "wild_used": wild_allocated,
            "remaining_resources": remaining,
            "effects": [effect_to_wire(eff) for eff in active_effects],
            "applied_effects": [effect_to_wire(eff) for eff in applied_effects],
            "boss_threshold": idx,
        }

    def _compute_fight_cost(self, player: PlayerBoard, payload: Dict[str, Any]) -> Dict[str, Any]:
        if self.state.boss_mode or self.state.phase == GamePhase.BOSS:
            return self._compute_boss_fight_cost(player, payload)
        row_index = int(payload.get("row", 0))
        if not self.threat_manager:
            raise InvalidActionError("Threats not initialized.")
        requested_id = payload.get("threat_id")

        self._normalize_player_cards(player)

        played_weapon_ids = set(payload.get("played_weapons") or [])
        active_weapons: List[MarketCard] = []
        for card in (player.weapons or []):
            card_id = getattr(card, "id", None) or (str(card) if card else None)
            if card_id in played_weapon_ids:
                active_weapons.append(card)
        active_effects: List[CardEffect] = []
        for card in active_weapons:
            active_effects.extend(self._card_effects(card))
        for card in (player.weapons or []):
            for eff in self._card_effects(card):
                if eff.kind == "fight_range" and eff.value == "any":
                    active_effects.append(eff)
        active_upgrades: List[MarketCard] = player.upgrades or []
        for card in active_upgrades:
            active_effects.extend(self._card_effects(card))
        has_range_any = any(e.kind == "fight_range" and e.value == "any" for e in active_effects)

        threat = self._front_threat(row_index)
        if not threat:
            raise InvalidActionError("No threat available in that lane.")
        if requested_id:
            if has_range_any:
                threat = self._threat_by_id(row_index, requested_id) or threat
            else:
                threat = self._fightable_threat(row_index, requested_id)
            if not threat:
                raise InvalidActionError("That threat is not currently fightable.")
        cost = dict(threat.cost)
        weight_cost = getattr(threat, "weight", 0) or 0
        if weight_cost:
            cost[ResourceType.GREEN] = cost.get(ResourceType.GREEN, 0) + weight_cost
        enrage_tokens = getattr(threat, "enrage_tokens", 0) or 0
        if enrage_tokens:
            cost[ResourceType.RED] = cost.get(ResourceType.RED, 0) + 2 * min(1, enrage_tokens)

        mass_tokens = player.tokens.get(TokenType.MASS, 0)
        if mass_tokens:
            defense_boosts = [eff.amount for eff in active_effects if eff.kind == "mass_token_defense" and eff.amount]
            reduction_per = max(defense_boosts) if defense_boosts else 2
            cost[ResourceType.GREEN] = max(0, cost.get(ResourceType.GREEN, 0) - reduction_per * mass_tokens)

        use_tokens = payload.get("use_tokens", {}) or {}
        attack_used = int(use_tokens.get("attack", 0))
        if attack_used > player.tokens.get(TokenType.ATTACK, 0):
            raise InvalidActionError("Not enough attack tokens.")
        if attack_used:
            cost[ResourceType.RED] = max(0, cost.get(ResourceType.RED, 0) - 2 * attack_used)

        wild_allocation_raw = use_tokens.get("wild_allocation", {})
        wild_allocated = 0
        for key, amount in wild_allocation_raw.items():
            res_type = parse_resource_key(key, InvalidActionError)
            wild_allocated += int(amount)
            cost[res_type] = max(0, cost.get(res_type, 0) - int(amount))

        if wild_allocated > player.tokens.get(TokenType.WILD, 0):
            raise InvalidActionError("Not enough wild tokens.")

        applied_effects: List[CardEffect] = []
        stance_choice_raw = payload.get("stance_choice")
        stance_choice_res: Optional[ResourceType] = None
        if stance_choice_raw:
            try:
                stance_choice_res = parse_resource_key(stance_choice_raw, InvalidActionError)
            except InvalidActionError:
                stance_choice_res = None
        for eff in active_effects:
            if eff.kind == "fight_cost_reduction" and eff.value and eff.amount:
                if eff.context:
                    era = getattr(self.threat_manager.deck, "phase", None) if self.threat_manager else None
                    if era and eff.context.lower() != str(era).lower():
                        continue
                res_type = parse_resource_key(eff.value, InvalidActionError)
                cost[res_type] = max(0, cost.get(res_type, 0) - eff.amount)
                applied_effects.append(eff)
            if eff.kind == "fight_cost_reduction_stance" and eff.amount:
                if eff.context:
                    era = getattr(self.threat_manager.deck, "phase", None) if self.threat_manager else None
                    if era and eff.context.lower() != str(era).lower():
                        continue
                stance = player.stance
                stance_map = {
                    Stance.AGGRESSIVE: ResourceType.RED,
                    Stance.TACTICAL: ResourceType.BLUE,
                    Stance.HUNKERED: ResourceType.GREEN,
                }
                if stance in stance_map:
                    target_res = stance_map[stance]
                else:
                    if stance_choice_res:
                        target_res = stance_choice_res
                    else:
                        ranked = sorted(cost.items(), key=lambda kv: kv[1], reverse=True)
                        target_res = ranked[0][0] if ranked else ResourceType.RED
                cost[target_res] = max(0, cost.get(target_res, 0) - eff.amount)
                applied_effects.append(
                    CardEffect(
                        kind=eff.kind,
                        value=target_res.value,
                        amount=eff.amount,
                        context=eff.context,
                        source_id=eff.source_id,
                        source_name=eff.source_name,
                    )
                )

        adjusted_cost = clamp_cost(cost)
        can_afford = player.can_pay(adjusted_cost)

        remaining = dict(player.resources)
        if can_afford:
            for res, val in adjusted_cost.items():
                remaining[res] = max(0, remaining.get(res, 0) - val)

        return {
            "can_afford": can_afford,
            "message": "ok" if can_afford else "Not enough resources to fight.",
            "threat": threat,
            "row_index": row_index,
            "adjusted_cost": adjusted_cost,
            "attack_used": attack_used,
            "wild_used": wild_allocated,
            "remaining_resources": remaining,
            "effects": [effect_to_wire(eff) for eff in active_effects],
            "applied_effects": [effect_to_wire(eff) for eff in applied_effects],
        }

    def _handle_fight(self, player: PlayerBoard, payload: Dict[str, Any]) -> None:
        self._assert_turn(player)
        result = self._compute_fight_cost(player, payload)
        if not result["can_afford"]:
            raise InvalidActionError(result["message"])
        is_boss_fight = self.state.boss_mode or self.state.phase == GamePhase.BOSS or result.get("boss_threshold") is not None
        if is_boss_fight and result.get("boss_threshold") is not None:
            idx = result.get("boss_threshold")
            for entry in self.state.boss_thresholds_state:
                if int(entry.get("index", -1)) == idx and entry.get("defeated"):
                    raise InvalidActionError("That boss threshold has already been defeated.")
        if not is_boss_fight:
            self._consume_main_action(player)

        threat = result["threat"]
        cost = result["adjusted_cost"]
        attack_used = result["attack_used"]
        wild_used = result["wild_used"]
        played_weapon_ids = set(payload.get("played_weapons") or [])
        played_weapon_effects: List[CardEffect] = []
        if played_weapon_ids:
            for weapon in player.weapons or []:
                weapon_id = getattr(weapon, "id", None)
                if weapon_id in played_weapon_ids:
                    played_weapon_effects.extend(self._card_effects(weapon))

        self._set_token(player, TokenType.ATTACK, player.tokens.get(TokenType.ATTACK, 0) - attack_used)
        self._set_token(player, TokenType.WILD, player.tokens.get(TokenType.WILD, 0) - wild_used)
        for res, amt in cost.items():
            self._set_resource(player, res, max(0, player.resources.get(res, 0) - amt))

        if played_weapon_ids:
            remaining_weapons: List[MarketCard] = []
            for weapon in player.weapons:
                weapon_id = getattr(weapon, "id", None)
                if weapon_id not in played_weapon_ids:
                    remaining_weapons.append(weapon)
                    continue
                uses = getattr(weapon, "uses", None)
                if uses is None:
                    remaining_weapons.append(weapon)
                    continue
                self._set_attr(weapon, "uses", max(0, uses - 1))
                if weapon.uses > 0:
                    remaining_weapons.append(weapon)
            if remaining_weapons != player.weapons:
                self._set_attr(player, "weapons", remaining_weapons)

        if is_boss_fight:
            if getattr(threat, "spoils", None):
                for reward in threat.spoils:
                    self._apply_reward_obj(player, reward)
                    if reward.kind == "slot" and reward.slot_type == "weapon":
                        market = self.state.market
                        if market and len(player.weapons) < player.weapon_slots:
                            drawn = self._draw_market_cards(market.weapon_deck, market.weapon_discard, 1)
                            if drawn:
                                self._list_append(player.weapons, drawn[0])
            else:
                self._apply_reward(player, getattr(threat, "reward", ""))
            idx = result.get("boss_threshold")
            for entry in self.state.boss_thresholds_state:
                if int(entry.get("index", -1)) == idx:
                    defeated_by = entry.get("defeated_by")
                    if defeated_by is None:
                        defeated_by = []
                        self._dict_set(entry, "defeated_by", defeated_by)
                    if player.user_id not in defeated_by:
                        self._list_append(defeated_by, player.user_id)
            self._set_attr(player, "threats_defeated", player.threats_defeated + 1)
            threat_name = getattr(threat, "name", None) or getattr(threat, "label", None) or "Boss Threshold"
            self._list_append(player.defeated_threats, str(threat_name))
        else:
            base_vp = int(getattr(threat, "vp", 0) or 0)
            enrage_tokens = getattr(threat, "enrage_tokens", 0) or 0
            bonus_vp = 1 if enrage_tokens > 0 else 0
            if base_vp or bonus_vp:
                self._set_attr(player, "vp", player.vp + base_vp + bonus_vp)
            if getattr(threat, "spoils", None):
                for reward in threat.spoils:
                    self._apply_reward_obj(player, reward)
            else:
                self._apply_reward(player, threat.reward)
            self._set_attr(player, "threats_defeated", player.threats_defeated + 1)
            if getattr(threat, "name", None):
                self._list_append(player.defeated_threats, str(threat.name))
            if not self.threat_manager:
                raise InvalidActionError("Threat manager unavailable.")
            self._remove_threat(result["row_index"], threat.id)
            kill_effects: List[CardEffect] = []
            for card in player.upgrades or []:
                kill_effects.extend(self._card_effects(card))
            kill_effects.extend(played_weapon_effects)
            for eff in kill_effects:
                source_name = eff.source_name or "an upgrade"
                if eff.kind == "on_kill_conversion" and eff.amount:
                    current = player.tokens.get(TokenType.CONVERSION, 0)
                    gained = min(eff.amount, max(0, 5 - current))
                    if gained:
                        self._set_token(player, TokenType.CONVERSION, current + gained)
                if eff.kind == "on_kill_stance_change" and eff.amount:
                    gained = max(0, eff.amount)
                    if gained:
                        self._set_attr(player, "free_stance_changes", max(0, player.free_stance_changes + gained))
                if eff.kind == "on_kill_resource" and eff.amount and eff.value:
                    gained = max(0, eff.amount)
                    if gained:
                        res = parse_resource_key(eff.value, InvalidActionError)
                        self._inc_resource(player, res, gained)

            self._sync_threat_rows()
            self._check_game_over(force=False)

    def _process_end_turn(self, player: PlayerBoard, payload: Dict[str, Any], allow_inactive: bool = False) -> None:
        if not allow_inactive:
            self._assert_turn(player)
        steal_pref = payload.get("steal_allocation") or payload.get("steal") or payload.get("cunning_allocation")
        if self.threat_manager and not self.state.boss_mode:
            self._resolve_end_of_turn(player, steal_pref)
            self._sync_threat_rows()

        current_wild = player.tokens.get(TokenType.WILD, 0)
        if current_wild < 5:
            self._set_token(player, TokenType.WILD, min(5, current_wild + 1))

        self._check_game_over(force=False)
        if self.state.phase == GamePhase.GAME_OVER:
            return
        if self.state.boss_mode and self.state.boss_thresholds_state and all(
            e.get("defeated") for e in self.state.boss_thresholds_state
        ):
            self._complete_boss_phase()
            return
        total_players = len(self.state.turn_order)
        next_index = (self.state.active_player_index + 1) % total_players if total_players else 0
        if next_index == 0:
            if self.state.boss_mode:
                self._complete_boss_phase()
            else:
                self._end_round()
        else:
            self._set_attr(self.state, "active_player_index", next_index)
            self._skip_inactive_players()
            self._begin_player_turn()

    def _start_round(self) -> None:
        if self.state.phase == GamePhase.GAME_OVER:
            return
        self._set_attr(self.state, "phase", GamePhase.ROUND_START)
        for p in self.state.players.values():
            if p.status == PlayerStatus.ACTIVE:
                self._produce(p)
                self._apply_upgrade_production(p)
                self._set_attr(p, "turn_initial_stance", p.stance)
                self._set_attr(p, "action_used", False)
                self._set_attr(p, "buy_used", False)
                self._set_attr(p, "extend_used", False)
        self._sync_era_from_deck()
        market = self.state.market
        if (
            self.state.round == 1
            and market
            and not market.upgrades_bottom
            and not market.weapons_bottom
            and not market.upgrade_discard
            and not market.weapon_discard
        ):
            self._refill_market_top()
        else:
            self._advance_market_round()
        self._set_attr(self.state, "phase", GamePhase.PLAYER_TURN)
        self._set_attr(self.state, "active_player_index", 0)
        self._skip_inactive_players()
        self._begin_player_turn()

    def _end_round(self) -> None:
        self._set_attr(self.state, "phase", GamePhase.ROUND_END)
        current_round = self.state.round
        current_era = self.state.era

        boss_next = not self.state.boss_mode and (
            (self.state.era == "day" and current_round >= 6) or (self.state.era == "night" and current_round >= 6)
        )
        if self.threat_manager and not boss_next:
            self._advance_and_spawn()
            self._sync_threat_rows()
            self._sync_era_from_deck()

        last_player_id = self.state.get_active_player_id()
        if last_player_id and last_player_id in self.state.turn_order:
            remaining = [pid for pid in self.state.turn_order if pid != last_player_id]
            self._set_attr(self.state, "turn_order", [last_player_id] + remaining)

        self._set_attr(self.state, "round", self.state.round + 1)
        self._check_game_over(force=False)
        if self.state.phase == GamePhase.GAME_OVER:
            return

        if not self.state.boss_mode:
            if (self.state.era == "day" and current_round >= 6) or (self.state.era == "night" and current_round >= 6):
                self._start_boss_phase(self.state.era)
                return

        self._start_round()

    def _skip_inactive_players(self) -> None:
        active_ids = [pid for pid in self.state.turn_order if self.state.players[pid].status == PlayerStatus.ACTIVE]
        if not active_ids:
            self._check_game_over(force=True)
            return

        original_index = self.state.active_player_index
        for _ in range(len(self.state.turn_order)):
            pid = self.state.turn_order[self.state.active_player_index]
            if self.state.players[pid].status == PlayerStatus.ACTIVE:
                return
            self._set_attr(
                self.state, "active_player_index", (self.state.active_player_index + 1) % len(self.state.turn_order)
            )

        if original_index == self.state.active_player_index:
            self._end_round()

    def _begin_player_turn(self) -> None:
        active_id = self.state.get_active_player_id()
        if not active_id:
            return
        player = self.state.players.get(active_id)
        if not player:
            return
        self._normalize_player_cards(player)
        self._set_attr(player, "action_used", False)
        self._set_attr(player, "buy_used", False)
        self._set_attr(player, "extend_used", False)
        self._set_attr(player, "active_used", {})
        self._set_attr(player, "turn_initial_stance", player.stance)

    def _boss_card_for_stage(self, stage: str) -> Optional[BossCard]:
        if not self.state.bosses:
            return None
        stage_lower = (stage or "day").lower()
        if stage_lower == "night" and len(self.state.bosses) > 1:
            return self.state.bosses[1]
        return self.state.bosses[0]

    def _build_boss_threshold_state(self, boss: BossCard) -> List[Dict[str, Any]]:
        thresholds: List[Dict[str, Any]] = []
        for idx, th in enumerate(boss.thresholds):
            thresholds.append(
                {
                    "index": idx,
                    "label": th.label,
                    "cost": resource_to_wire(clamp_cost(th.cost)),
                    "reward": th.reward,
                    "spoils": [r.to_public_dict() for r in th.spoils],
                    "defeated": False,
                    "defeated_by": [],
                }
            )
        return thresholds

    def _prepare_boss_turns(self) -> None:
        for p in self.state.players.values():
            if p.status == PlayerStatus.ACTIVE:
                self._produce(p)
                self._apply_upgrade_production(p)
                self._set_attr(p, "turn_initial_stance", p.stance)
                self._set_attr(p, "action_used", False)
                self._set_attr(p, "buy_used", False)
                self._set_attr(p, "extend_used", False)

    def _start_boss_phase(self, stage: str) -> None:
        stage_to_use = "day" if self.state.boss_index == 0 else "night"
        self._set_attr(self.state, "era", stage_to_use)
        self._set_attr(self.state, "boss_stage", stage_to_use)
        boss = self._boss_card_for_stage(stage_to_use)
        if not boss:
            if stage_to_use == "day":
                self._start_night_after_boss()
            else:
                self._check_game_over(force=True)
            return
        if self.threat_manager and self.threat_manager.deck:
            self._set_attr(self.threat_manager.deck, "phase", stage_to_use)
            self._sync_era_from_deck()
        self._set_attr(self.state, "boss", boss)
        self._set_attr(self.state, "boss_mode", True)
        self._set_attr(self.state, "phase", GamePhase.BOSS)
        self._set_attr(self.state, "boss_thresholds_state", self._build_boss_threshold_state(boss))
        self._set_attr(self.state, "active_player_index", 0)
        self._set_attr(self.state, "threat_rows", [])
        self._prepare_boss_turns()
        self._skip_inactive_players()
        self._begin_player_turn()

    def _complete_boss_phase(self) -> None:
        stage = self.state.boss_stage or "day"
        self._set_attr(self.state, "boss_mode", False)
        self._set_attr(self.state, "phase", GamePhase.ROUND_START)
        self._set_attr(self.state, "boss_thresholds_state", [])
        finished_index = self.state.boss_index
        self._set_attr(self.state, "boss_index", finished_index + 1)
        if finished_index == 0:
            self._start_night_after_boss()
        else:
            self._set_attr(self.state, "phase", GamePhase.GAME_OVER)
            winner = self._determine_winner()
            self._set_attr(self.state, "winner_id", winner.user_id if winner else None)

    def _start_night_after_boss(self) -> None:
        if self.threat_manager and self.threat_manager.deck:
            self._threat_board_reset()
            self._set_attr(self.threat_manager.deck, "phase", "night")
            self._spawn_threat()
            self._sync_threat_rows()
            self._sync_era_from_deck()
        self._set_attr(self.state, "boss_stage", "night")
        self._set_attr(self.state, "boss", self._boss_card_for_stage("night"))
        self._set_attr(self.state, "round", 1)
        self._update_deck_remaining()
        self._start_round()

    def _sync_era_from_deck(self) -> None:
        if self.threat_manager and self.threat_manager.deck:
            self._set_attr(self.state, "era", getattr(self.threat_manager.deck, "phase", "day") or "day")

    def _apply_upgrade_production(self, player: PlayerBoard) -> None:
        if not player.upgrades:
            return
        self._normalize_player_cards(player)
        era = getattr(self.threat_manager.deck, "phase", None) if self.threat_manager else None
        effects: List[CardEffect] = []
        for card in player.upgrades:
            effects.extend(self._card_effects(card))

        for eff in effects:
            if eff.context and era and eff.context.lower() != str(era).lower():
                continue
            if eff.kind == "production" and eff.value and eff.amount:
                res = parse_resource_key(eff.value, InvalidActionError)
                self._inc_resource(player, res, eff.amount)
            elif eff.kind == "production_stance" and eff.amount:
                stance_map = {
                    Stance.AGGRESSIVE: ResourceType.RED,
                    Stance.TACTICAL: ResourceType.BLUE,
                    Stance.HUNKERED: ResourceType.GREEN,
                }
                if player.stance in stance_map:
                    target_res = stance_map[player.stance]
                else:
                    target_res = ResourceType.BLUE
                self._inc_resource(player, target_res, eff.amount)
            elif eff.kind == "production_lowest" and eff.amount:
                res_values = player.resources
                min_val = min(res_values.values()) if res_values else 0
                lowest = [r for r, v in res_values.items() if v == min_val]
                if ResourceType.BLUE in lowest:
                    target_res = ResourceType.BLUE
                else:
                    target_res = lowest[0] if lowest else ResourceType.RED
                self._inc_resource(player, target_res, eff.amount)

    def _draw_market_cards(self, deck: List[MarketCard], discard: List[MarketCard], count: int) -> List[MarketCard]:
        drawn: List[MarketCard] = []
        while len(drawn) < count:
            if not deck:
                if not discard:
                    break
                self._shuffle_list(discard)
                self._list_extend(deck, discard)
                self._list_clear(discard)
            if not deck:
                break
            drawn.append(self._list_pop(deck))
        return drawn

    def _refill_market_top(self) -> None:
        if not self.state.market:
            return
        desired = max(1, len(self.state.players) + 2)
        market = self.state.market
        upgrade_needed = max(0, desired - len(market.upgrades_top))
        weapon_needed = max(0, desired - len(market.weapons_top))
        if upgrade_needed:
            self._list_extend(
                market.upgrades_top,
                self._draw_market_cards(market.upgrade_deck, market.upgrade_discard, upgrade_needed),
            )
        if weapon_needed:
            self._list_extend(
                market.weapons_top,
                self._draw_market_cards(market.weapon_deck, market.weapon_discard, weapon_needed),
            )

    def _advance_market_round(self) -> None:
        if not self.state.market:
            return
        market = self.state.market
        if market.upgrades_bottom:
            self._list_extend(market.upgrade_discard, market.upgrades_bottom)
        if market.weapons_bottom:
            self._list_extend(market.weapon_discard, market.weapons_bottom)
        self._set_attr(self.state.market, "upgrades_bottom", market.upgrades_top)
        self._set_attr(self.state.market, "weapons_bottom", market.weapons_top)
        self._set_attr(self.state.market, "upgrades_top", [])
        self._set_attr(self.state.market, "weapons_top", [])
        self._refill_market_top()

    def _update_deck_remaining(self) -> None:
        if self.threat_manager:
            self._set_attr(self.state, "threat_deck_remaining", self.threat_manager.deck.remaining())
        else:
            self._set_attr(self.state, "threat_deck_remaining", 0)

    def _sync_threat_rows(self) -> None:
        if self.threat_manager:
            self._set_attr(self.state, "threat_rows", self._threat_rows())
            self._update_deck_remaining()
        else:
            self._set_attr(self.state, "threat_rows", [])

    def _check_game_over(self, force: bool = False) -> None:
        if self.state.phase == GamePhase.GAME_OVER:
            return
        total_humans = [p for p in self.state.players.values() if not getattr(p, "is_bot", False)]
        active_humans = [p for p in total_humans if p.status == PlayerStatus.ACTIVE]
        active_bots = [
            p for p in self.state.players.values() if getattr(p, "is_bot", False) and p.status == PlayerStatus.ACTIVE
        ]
        if self.state.boss_mode and active_humans and not force:
            return
        if self.threat_manager:
            all_threats_defeated = self._is_cleared()
        else:
            all_threats_defeated = all(not row for row in self.state.threat_rows)
        active_players = [p for p in self.state.players.values() if p.status == PlayerStatus.ACTIVE]
        bosses_pending = bool(self.state.bosses) and self.state.boss_index < 2

        end_for_humans = (len(active_humans) == 0 and not active_bots) or (
            len(active_humans) == 1 and len(active_bots) == 0
        )
        if force or len(active_players) <= 1 or end_for_humans or (all_threats_defeated and not bosses_pending):
            self._set_attr(self.state, "phase", GamePhase.GAME_OVER)
            winner = None
            if len(active_humans) == 1:
                winner = active_humans[0]
            else:
                winner = self._determine_winner()
            self._set_attr(self.state, "winner_id", winner.user_id if winner else None)

    def _determine_winner(self) -> Optional[PlayerBoard]:
        def effective_vp(p: PlayerBoard) -> int:
            penalty = 0
            if p.wounds >= 10:
                penalty = 20
            elif p.wounds >= 5:
                penalty = 10
            return p.vp - penalty

        def score_tuple(p: PlayerBoard):
            resources_total = sum(p.resources.values())
            return (-effective_vp(p), p.wounds, -p.threats_defeated, -resources_total)

        scored_players = sorted(
            [p for p in self.state.players.values() if p.status == PlayerStatus.ACTIVE], key=score_tuple
        )
        return scored_players[0] if scored_players else None

    def _produce(self, player: PlayerBoard) -> None:
        profile = {
            Stance.AGGRESSIVE: {ResourceType.RED: 5, ResourceType.BLUE: 0, ResourceType.GREEN: 1},
            Stance.TACTICAL: {ResourceType.RED: 1, ResourceType.BLUE: 4, ResourceType.GREEN: 1},
            Stance.HUNKERED: {ResourceType.RED: 0, ResourceType.BLUE: 1, ResourceType.GREEN: 5},
            Stance.BALANCED: {ResourceType.RED: 2, ResourceType.BLUE: 2, ResourceType.GREEN: 2},
        }.get(player.stance, {})
        for res, amount in profile.items():
            self._inc_resource(player, res, amount)

    def _board_has_threats(self) -> bool:
        if not self.threat_manager or not getattr(self.threat_manager, "board", None):
            return False
        return any(lane.front or lane.mid or lane.back for lane in self.threat_manager.board.lanes)

    def _is_cleared(self) -> bool:
        if not self.threat_manager:
            return True
        return not self._board_has_threats() and self.threat_manager.deck.remaining() == 0

    def _front_threat(self, row_index: int) -> Optional[ThreatInstance]:
        if not self.threat_manager or not getattr(self.threat_manager, "board", None):
            return None
        lanes = self.threat_manager.board.lanes
        if row_index < 0 or row_index >= len(lanes):
            return None
        lane = lanes[row_index]
        if lane.front:
            lane.front.position = "front"
            return lane.front
        if lane.mid:
            lane.mid.position = "mid"
            return lane.mid
        if lane.back:
            lane.back.position = "back"
            return lane.back
        return None

    def _fightable_threat(self, row_index: int, threat_id: Optional[str]) -> Optional[ThreatInstance]:
        if not self.threat_manager or not getattr(self.threat_manager, "board", None):
            return None
        lanes = self.threat_manager.board.lanes
        if row_index < 0 or row_index >= len(lanes):
            return None
        lane = lanes[row_index]
        candidates = [
            ("front", lane.front),
            ("mid", lane.mid),
            ("back", lane.back),
        ]
        visible = next(((pos, t) for pos, t in candidates if t), None)
        if not visible:
            return None
        pos, threat = visible
        threat.position = pos
        if threat_id and threat.id != threat_id:
            return None
        return threat

    def _threat_by_id(self, row_index: int, threat_id: str) -> Optional[ThreatInstance]:
        if not self.threat_manager or not getattr(self.threat_manager, "board", None):
            return None
        lanes = self.threat_manager.board.lanes
        if row_index < 0 or row_index >= len(lanes):
            return None
        lane = lanes[row_index]
        for pos in ["front", "mid", "back"]:
            threat = getattr(lane, pos)
            if threat and threat.id == threat_id:
                threat.position = pos
                return threat
        return None

    def _threat_rows(self) -> List[List[ThreatInstance]]:
        if not self.threat_manager or not getattr(self.threat_manager, "board", None):
            return []
        rows: List[List[ThreatInstance]] = []
        for lane in self.threat_manager.board.lanes:
            row: List[ThreatInstance] = []
            for pos in ("front", "mid", "back"):
                threat = getattr(lane, pos)
                if threat:
                    threat.position = pos
                    row.append(threat)
            rows.append(row)
        return rows

    def _remove_threat(self, row_index: int, threat_id: str) -> None:
        if not self.threat_manager or not getattr(self.threat_manager, "board", None):
            return
        lanes = self.threat_manager.board.lanes
        if row_index < 0 or row_index >= len(lanes):
            return
        lane = lanes[row_index]
        if lane.front and lane.front.id == threat_id:
            self._set_attr(lane, "front", None)
            return
        if lane.mid and lane.mid.id == threat_id:
            self._set_attr(lane, "mid", None)
            return
        if lane.back and lane.back.id == threat_id:
            self._set_attr(lane, "back", None)
            return

    def _advance_and_spawn(self) -> None:
        if not self.threat_manager or not getattr(self.threat_manager, "board", None):
            return
        moved_any = False
        enraged: List[ThreatInstance] = []
        for lane in self.threat_manager.board.lanes:
            moved, lane_enraged = self._advance_lane(lane)
            moved_any = moved_any or moved
            if lane_enraged and lane.front:
                if getattr(lane.front, "enrage_tokens", 0) <= 1:
                    self._set_attr(
                        lane.front,
                        "enrage_tokens",
                        min(1, getattr(lane.front, "enrage_tokens", 0)),
                    )
                lane.front.position = "front"
                enraged.append(lane.front)
        spawned = 0
        for lane in self.threat_manager.board.lanes:
            if lane.back:
                continue
            threat = self._draw_threat()
            if not threat:
                continue
            threat.position = "back"
            self._set_attr(lane, "back", threat)
            spawned += 1

    def _advance_lane(self, lane: Any) -> Tuple[bool, bool]:
        moved = False
        enraged = False
        if lane.front:
            current = max(0, getattr(lane.front, "enrage_tokens", 0))
            if current < 1:
                self._set_attr(lane.front, "enrage_tokens", 1)
                enraged = True
        if not lane.front and lane.mid:
            self._set_attr(lane, "front", lane.mid)
            self._set_attr(lane, "mid", None)
            moved = True
        if not lane.mid and lane.back:
            self._set_attr(lane, "mid", lane.back)
            self._set_attr(lane, "back", None)
            moved = True
        return moved, enraged

    def _draw_threat(self) -> Optional[ThreatInstance]:
        if not self.threat_manager:
            return None
        deck = self.threat_manager.deck.day_deck if self.threat_manager.deck.phase == "day" else self.threat_manager.deck.night_deck
        if deck:
            card = self._list_pop(deck)
            return ThreatInstance(card=card, era=self.threat_manager.deck.phase)
        if self.threat_manager.deck.phase == "day":
            self._set_attr(self.threat_manager.deck, "phase", "night")
            return self._draw_threat()
        return None

    def _spawn_threat(self) -> None:
        if not self.threat_manager or not getattr(self.threat_manager, "board", None):
            return
        for lane in self.threat_manager.board.lanes:
            if lane.back:
                continue
            threat = self._draw_threat()
            if threat:
                threat.position = "back"
                self._set_attr(lane, "back", threat)

    def _threat_board_reset(self) -> None:
        if not self.threat_manager or not getattr(self.threat_manager, "board", None):
            return
        for lane in self.threat_manager.board.lanes:
            self._set_attr(lane, "front", None)
            self._set_attr(lane, "mid", None)
            self._set_attr(lane, "back", None)

    def _front_threats_with_index(self) -> List[Tuple[int, ThreatInstance]]:
        result: List[Tuple[int, ThreatInstance]] = []
        if not self.threat_manager or not getattr(self.threat_manager, "board", None):
            return result
        for idx, lane in enumerate(self.threat_manager.board.lanes):
            if lane.front:
                lane.front.position = "front"
                result.append((idx, lane.front))
        return result

    def _grow_front_weights(self) -> None:
        for _, threat in self._front_threats_with_index():
            if threat.type_key == "massive":
                if threat.weight < 3:
                    self._set_attr(threat, "weight", threat.weight + 1)

    def _resolve_end_of_turn(self, player: PlayerBoard, steal_preference: Optional[Dict[str, int]] = None) -> None:
        self._grow_front_weights()
        for lane_idx, threat in self._front_threats_with_index():
            if not self._threat_targets_player(threat, player.stance):
                continue
            self._apply_attack(threat, player, lane_idx, steal_preference)

    def _threat_targets_player(self, threat: ThreatInstance, stance: Stance) -> bool:
        if getattr(threat, "position", "front") != "front":
            return False
        if getattr(threat, "enrage_tokens", 0) > 0:
            return True
        threat_key = threat.type_key
        if threat_key == "hybrid":
            return stance != Stance.BALANCED
        weaknesses = {
            Stance.AGGRESSIVE: {"feral"},
            Stance.TACTICAL: {"cunning"},
            Stance.HUNKERED: {"massive"},
            Stance.BALANCED: {"feral", "cunning", "massive"},
        }.get(stance, set())
        return threat_key in weaknesses

    def _resolved_attack_type(self, threat: ThreatInstance, stance: Stance) -> str:
        if threat.type_key != "hybrid":
            return threat.type_key
        if stance == Stance.AGGRESSIVE:
            return "feral"
        if stance == Stance.TACTICAL:
            return "cunning"
        if stance == Stance.HUNKERED:
            return "massive"
        return "none"

    def _apply_attack(
        self,
        threat: ThreatInstance,
        player: PlayerBoard,
        lane_idx: int,
        steal_preference: Optional[Dict[str, int]] = None,
    ) -> None:
        attack_type = self._resolved_attack_type(threat, player.stance)
        if attack_type == "none":
            return
        if attack_type == "feral":
            self._set_attr(player, "wounds", max(0, player.wounds + 1))
        elif attack_type == "cunning":
            self._resolve_cunning_attack(threat, player, lane_idx, steal_preference)
        elif attack_type == "massive":
            if threat.weight >= 3:
                self._set_attr(player, "wounds", max(0, player.wounds + 1))
        if threat.type_key == "hybrid" and player.stance == Stance.HUNKERED:
            self._set_attr(threat, "weight", threat.weight + 1)
            self._set_attr(player, "wounds", max(0, player.wounds + 1))

    def _resolve_cunning_attack(
        self,
        threat: ThreatInstance,
        player: PlayerBoard,
        lane_idx: int,
        steal_preference: Optional[Dict[str, int]] = None,
    ) -> None:
        steal_amount = 2
        available = sum_resources(player.resources)
        to_steal = min(steal_amount, available)
        wound = available < steal_amount

        allocation: Dict[ResourceType, int] = {ResourceType.RED: 0, ResourceType.BLUE: 0, ResourceType.GREEN: 0}
        if to_steal > 0:
            allocation = self._allocate_theft(player, to_steal, steal_preference)
            removed: Dict[ResourceType, int] = {}
            for res, amt in allocation.items():
                if amt <= 0:
                    continue
                current = player.resources.get(res, 0)
                delta = min(current, amt)
                if delta:
                    self._set_resource(player, res, current - delta)
                removed[res] = delta
            to_steal = sum(removed.values())
        if wound or to_steal == 0:
            self._set_attr(player, "wounds", max(0, player.wounds + 1))

    def _allocate_theft(
        self,
        player: PlayerBoard,
        amount: int,
        steal_preference: Optional[Dict[str, int]] = None,
    ) -> Dict[ResourceType, int]:
        allocation: Dict[ResourceType, int] = {ResourceType.RED: 0, ResourceType.BLUE: 0, ResourceType.GREEN: 0}
        preferred: Dict[ResourceType, int] = {}
        if steal_preference:
            for key, val in steal_preference.items():
                try:
                    res = parse_resource_key(key)
                except Exception:
                    continue
                preferred[res] = max(0, int(val))

        remaining = amount
        if preferred:
            for res, requested in sorted(preferred.items(), key=lambda item: item[1], reverse=True):
                if remaining <= 0:
                    break
                available = max(0, player.resources.get(res, 0) - allocation.get(res, 0))
                take = min(requested, available, remaining)
                if take:
                    allocation[res] = allocation.get(res, 0) + take
                    remaining -= take

        if remaining > 0:
            sorted_resources = sorted(player.resources.items(), key=lambda item: item[1], reverse=True)
            for res, qty in sorted_resources:
                if remaining <= 0:
                    break
                available = max(0, qty - allocation.get(res, 0))
                take = min(available, remaining)
                if take:
                    allocation[res] = allocation.get(res, 0) + take
                    remaining -= take
        return allocation
