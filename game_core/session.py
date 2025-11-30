from typing import Any, Dict, List, Optional

import random

from .data_loader import GameDataLoader
from .models import GamePhase, GameState, MarketCard, PlayerBoard, PlayerStatus, ResourceType, Stance, TokenType, clamp_cost, STANCE_PROFILES
from .effects import CardEffect, parse_effect_tags, effect_to_wire
from .threats import ThreatManager
from .utils import parse_resource_key


class InvalidActionError(ValueError):
    """Raised when a player attempts an illegal action."""


class GameSession:
    """
    Domain-level game session independent from any transport layer.
    """

    def __init__(self, game_id: str, players: List[Dict[str, str]], data_loader: Optional[GameDataLoader] = None):
        self.data_loader = data_loader or GameDataLoader()
        self.state = GameState(game_id=game_id)
        self.threat_manager: Optional[ThreatManager] = None
        self.rng = random.Random()
        for p in players:
            board = PlayerBoard(user_id=p["id"], username=p["username"])
            self.state.players[p["id"]] = board
            self.state.turn_order.append(p["id"])
        self._update_deck_remaining()

    async def async_setup(self):
        """Populate decks/market and start the first round."""
        threat_data = self.data_loader.load_threats()
        self.threat_manager = ThreatManager(threat_data, len(self.state.players))
        self.state.bosses = threat_data.bosses
        self.state.boss = threat_data.bosses[0] if threat_data.bosses else None
        self.state.market = self.data_loader.load_market()
        self._init_market()
        self._sync_era_from_deck()
        for log in self.threat_manager.bootstrap():
            self.state.add_log(log)
        self._sync_threat_rows()
        self._update_deck_remaining()
        self.state.round = 1
        self.state.phase = GamePhase.ROUND_START
        self.state.add_log("Game initialized.")
        await self._start_round()

    async def player_action(self, player_id: str, action: str, payload: Dict[str, Any], conn_manager: Any = None) -> bool:
        """
        Main entry point used by the backend. Returns True when the state mutated.
        """
        player = self.state.players.get(player_id)
        if not player:
            raise InvalidActionError("Player not found.")

        # Allow only control actions for non-active players
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
            "end_turn": self._handle_end_turn,
            "surrender": self._handle_surrender,
            "disconnect": self._handle_disconnect,
            "convert": self._handle_convert,
        }

        if action not in handlers:
            raise InvalidActionError(f"Unknown action: {action}")

        await handlers[action](player, payload or {})
        return True

    def public_preview(self, player_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        """Placeholder for future previews; currently returns current state."""
        return self.state.get_redacted_state(player_id)

    async def _start_round(self):
        if self.state.phase == GamePhase.GAME_OVER:
            return

        self.state.phase = GamePhase.ROUND_START
        for p in self.state.players.values():
            if p.status == PlayerStatus.ACTIVE:
                p.produce()
                self._apply_upgrade_production(p)
                p.turn_initial_stance = p.stance
                p.action_used = False
                p.buy_used = False
        self._sync_era_from_deck()
        self._refill_market()
        self.state.add_log(f"Round {self.state.round} start. Resources produced.")

        self.state.phase = GamePhase.PLAYER_TURN
        self.state.active_player_index = 0
        await self._skip_inactive_players()
        self._begin_player_turn()

    async def _end_round(self):
        self.state.phase = GamePhase.ROUND_END
        self.state.add_log(f"Round {self.state.round} ended.")

        if self.threat_manager:
            moved, enraged = self.threat_manager.advance_and_spawn()
            if moved:
                self.state.add_log("Threats advance toward the survivors.")
            for threat in enraged:
                self.state.add_log(f"{threat.name} becomes enraged in the front line (+2R cost, attacks all stances).")
            self._sync_threat_rows()
            self._sync_era_from_deck()

        # Rotate initiative so the last player of this round starts the next.
        last_player_id = self.state.get_active_player_id()
        if last_player_id and last_player_id in self.state.turn_order:
            remaining = [pid for pid in self.state.turn_order if pid != last_player_id]
            self.state.turn_order = [last_player_id] + remaining

        self.state.round += 1
        await self._check_game_over()
        if self.state.phase == GamePhase.GAME_OVER:
            return
        await self._start_round()

    async def _skip_inactive_players(self):
        active_ids = [pid for pid in self.state.turn_order if self.state.players[pid].status == PlayerStatus.ACTIVE]
        if not active_ids:
            await self._check_game_over(force=True)
            return

        # Move index to next active player
        original_index = self.state.active_player_index
        for _ in range(len(self.state.turn_order)):
            pid = self.state.turn_order[self.state.active_player_index]
            if self.state.players[pid].status == PlayerStatus.ACTIVE:
                return
            self.state.active_player_index = (self.state.active_player_index + 1) % len(self.state.turn_order)

        # If we looped without finding anyone, end round
        if original_index == self.state.active_player_index:
            await self._end_round()

    def _begin_player_turn(self):
        active_id = self.state.get_active_player_id()
        if not active_id:
            return
        player = self.state.players.get(active_id)
        if not player:
            return
        player.action_used = False
        player.buy_used = False
        player.turn_initial_stance = player.stance

    def _consume_main_action(self, player: PlayerBoard):
        if player.action_used:
            raise InvalidActionError("Main action already used this turn.")
        player.action_used = True

    def _consume_buy_action(self, player: PlayerBoard):
        if player.buy_used:
            raise InvalidActionError("Optional buy already used this turn.")
        player.buy_used = True

    def _sync_threat_rows(self):
        if self.threat_manager:
            self.state.threat_rows = self.threat_manager.rows()
            self._update_deck_remaining()
        else:
            self.state.threat_rows = []

    def _update_deck_remaining(self):
        if self.threat_manager:
            self.state.threat_deck_remaining = self.threat_manager.deck.remaining()
        else:
            self.state.threat_deck_remaining = 0

    def _assert_turn(self, player: PlayerBoard):
        active_id = self.state.get_active_player_id()
        if self.state.phase != GamePhase.PLAYER_TURN or not active_id:
            raise InvalidActionError("It is not time to act.")
        if player.user_id != active_id:
            raise InvalidActionError("It is not your turn.")

    async def _handle_fight(self, player: PlayerBoard, payload: Dict[str, Any]):
        self._assert_turn(player)
        result = self._compute_fight_cost(player, payload)
        if not result["can_afford"]:
            raise InvalidActionError(result["message"])
        self._consume_main_action(player)

        threat = result["threat"]
        cost = result["adjusted_cost"]
        attack_used = result["attack_used"]
        wild_used = result["wild_used"]
        played_weapon_ids = set(payload.get("played_weapons") or [])

        # Consume tokens and resources
        player.tokens[TokenType.ATTACK] -= attack_used
        player.tokens[TokenType.WILD] -= wild_used
        player.pay(cost)
        if played_weapon_ids:
          remaining_weapons: List[MarketCard] = []
          for weapon in player.weapons:
            if weapon.id not in played_weapon_ids:
              remaining_weapons.append(weapon)
              continue
            if weapon.uses is None:
              remaining_weapons.append(weapon)
              continue
            weapon.uses = max(0, weapon.uses - 1)
            if weapon.uses > 0:
              remaining_weapons.append(weapon)
            else:
              self.state.add_log(f"{player.username}'s {weapon.name} was discarded after being used up.")
          player.weapons = remaining_weapons

        # Resolve fight
        player.vp += threat.vp
        if getattr(threat, "spoils", None):
            for reward in threat.spoils:
                reward.apply(player)
                self.state.add_log(f"{player.username} gains {reward.label}.")
        else:
            self._apply_reward(player, threat.reward)
        if not self.threat_manager:
            raise InvalidActionError("Threat manager unavailable.")
        self.threat_manager.remove_threat(result["row_index"], threat.id)
        self._sync_threat_rows()
        self.state.add_log(f"{player.username} defeated {threat.name} for {threat.vp} VP.")
        await self._check_game_over()

    async def _handle_buy_upgrade(self, player: PlayerBoard, payload: Dict[str, Any]):
        self._assert_turn(player)
        card = self._find_card(self.state.market.upgrades, payload.get("card_id"))
        if not card:
            raise InvalidActionError("Upgrade not found.")
        if len(player.upgrades) >= player.upgrade_slots:
            raise InvalidActionError("No upgrade slots left.")
        if not player.can_pay(card.cost):
            raise InvalidActionError("Not enough resources.")

        self._consume_buy_action(player)
        player.pay(card.cost)
        player.upgrades.append(card)
        player.vp += card.vp
        self.state.market.upgrades = [c for c in self.state.market.upgrades if c.id != card.id]
        self._refill_market()
        self.state.add_log(f"{player.username} bought upgrade {card.name}.")

    async def _handle_buy_weapon(self, player: PlayerBoard, payload: Dict[str, Any]):
        self._assert_turn(player)
        card = self._find_card(self.state.market.weapons, payload.get("card_id"))
        if not card:
            raise InvalidActionError("Weapon not found.")
        if len(player.weapons) >= player.weapon_slots:
            raise InvalidActionError("No weapon slots left.")
        if not player.can_pay(card.cost):
            raise InvalidActionError("Not enough resources.")

        self._consume_buy_action(player)
        player.pay(card.cost)
        player.weapons.append(card)
        player.vp += card.vp
        self.state.market.weapons = [c for c in self.state.market.weapons if c.id != card.id]
        self._refill_market()
        self.state.add_log(f"{player.username} bought weapon {card.name}.")

    async def _handle_pick_token(self, player: PlayerBoard, payload: Dict[str, Any]):
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
        if current >= 3:
            raise InvalidActionError("You already have the maximum of that token.")
        player.tokens[token_type] = min(3, current + 1)
        self.state.add_log(f"{player.username} picked a {token_type.value} token.")

    async def _handle_extend_slot(self, player: PlayerBoard, payload: Dict[str, Any]):
        self._assert_turn(player)
        slot_type = (payload.get("slot_type") or "upgrade").lower()
        if slot_type not in {"upgrade", "weapon"}:
            raise InvalidActionError("slot_type must be 'upgrade' or 'weapon'.")

        if slot_type == "upgrade":
            if player.upgrade_slots >= 4:
                raise InvalidActionError("Upgrade slots already at max.")
            self._consume_main_action(player)
            player.upgrade_slots += 1
        else:
            if player.weapon_slots >= 4:
                raise InvalidActionError("Weapon slots already at max.")
            self._consume_main_action(player)
            player.weapon_slots += 1

        player.tokens[TokenType.WILD] = min(3, player.tokens.get(TokenType.WILD, 0) + 1)
        self.state.add_log(f"{player.username} extended a {slot_type} slot and gained a wild token.")

    async def _handle_realign(self, player: PlayerBoard, payload: Dict[str, Any]):
        self._assert_turn(player)
        target = payload.get("stance")
        if not target:
            raise InvalidActionError("Target stance required.")
        try:
            player.stance = Stance[target.upper()]
        except KeyError:
            raise InvalidActionError("Unknown stance.")

        self._consume_main_action(player)
        player.tokens[TokenType.WILD] = min(3, player.tokens.get(TokenType.WILD, 0) + 1)
        self.state.add_log(f"{player.username} realigned to {player.stance.value} and gained a wild token.")

    async def _handle_convert(self, player: PlayerBoard, payload: Dict[str, Any]):
        # Conversion token can be used outside of action flow; no turn assertion
        from_key = payload.get("from") or payload.get("from_res")
        to_key = payload.get("to") or payload.get("to_res")
        if not from_key or not to_key:
            raise InvalidActionError("from and to are required for conversion.")
        from_res = parse_resource_key(from_key, InvalidActionError)
        to_res = parse_resource_key(to_key, InvalidActionError)
        if from_res == to_res:
            raise InvalidActionError("Cannot convert to the same resource.")
        if player.tokens.get(TokenType.CONVERSION, 0) <= 0:
            raise InvalidActionError("No conversion tokens available.")
        amount = min(2, player.resources.get(from_res, 0))
        if amount <= 0:
            raise InvalidActionError("Not enough resources to convert.")

        player.resources[from_res] = player.resources.get(from_res, 0) - amount
        player.resources[to_res] = player.resources.get(to_res, 0) + amount
        player.tokens[TokenType.CONVERSION] = max(0, player.tokens.get(TokenType.CONVERSION, 0) - 1)
        self.state.add_log(f"{player.username} converted {amount} {from_res.value} → {to_res.value}.")

    async def _handle_stance_step(self, player: PlayerBoard, payload: Dict[str, Any]):
        await self._handle_realign(player, payload)

    async def _handle_end_turn(self, player: PlayerBoard, payload: Dict[str, Any]):
        self._assert_turn(player)
        # Players can optionally pass a steal_allocation payload to choose which resources a Cunning attack steals.
        steal_pref = payload.get("steal_allocation") or payload.get("steal") or payload.get("cunning_allocation")
        if self.threat_manager:
            for msg in self.threat_manager.resolve_end_of_turn(player, steal_pref):
                self.state.add_log(msg)
            self._sync_threat_rows()

        await self._check_game_over()
        if self.state.phase == GamePhase.GAME_OVER:
            return
        # Advance to next player
        total_players = len(self.state.turn_order)
        next_index = (self.state.active_player_index + 1) % total_players if total_players else 0
        # If we looped back, the round is done
        if next_index == 0:
            await self._end_round()
        else:
            self.state.active_player_index = next_index
            await self._skip_inactive_players()
            self._begin_player_turn()

    async def _handle_surrender(self, player: PlayerBoard, payload: Dict[str, Any]):
        player.status = PlayerStatus.SURRENDERED
        self.state.add_log(f"{player.username} surrendered.")
        await self._check_game_over()
        await self._skip_inactive_players()

    async def _handle_disconnect(self, player: PlayerBoard, payload: Dict[str, Any]):
        player.status = PlayerStatus.DISCONNECTED
        self.state.add_log(f"{player.username} disconnected.")
        await self._check_game_over()
        await self._skip_inactive_players()

    def _is_adjacent_stance(self, current: Stance, target: Stance) -> bool:
        if current == target:
            return True
        # Balanced connects to all, corners only to Balanced
        if current == Stance.BALANCED:
            return True
        if target == Stance.BALANCED:
            return True
        return False

    def _apply_reward(self, player: PlayerBoard, reward: str):
        reward_map = {
            "+Attack": TokenType.ATTACK,
            "+Conversion": TokenType.CONVERSION,
            "+Wild": TokenType.WILD,
            "+Mass": TokenType.MASS,
            "Boss Token": TokenType.BOSS,
        }
        token_type = reward_map.get(reward)
        if token_type:
            player.tokens[token_type] = min(3, player.tokens.get(token_type, 0) + 1)
            self.state.add_log(f"{player.username} gained a {token_type.value} token.")

    def _init_market(self):
        """Shuffle decks and reveal initial market (N_players + 1)."""
        if not self.state.market:
            return
        market = self.state.market
        market.upgrade_deck = list(market.upgrades)
        market.weapon_deck = list(market.weapons)
        self.rng.shuffle(market.upgrade_deck)
        self.rng.shuffle(market.weapon_deck)
        market.upgrades = []
        market.weapons = []
        self._refill_market()

    def _refill_market(self):
        """Ensure visible market has N_players + 1 cards per pile."""
        if not self.state.market:
            return
        desired = max(1, len(self.state.players) + 1)
        market = self.state.market
        while len(market.upgrades) < desired and market.upgrade_deck:
            market.upgrades.append(market.upgrade_deck.pop(0))
        while len(market.weapons) < desired and market.weapon_deck:
            market.weapons.append(market.weapon_deck.pop(0))

    def _sync_era_from_deck(self):
        if self.threat_manager and self.threat_manager.deck:
            self.state.era = getattr(self.threat_manager.deck, "phase", "day") or "day"

    def _apply_upgrade_production(self, player: PlayerBoard):
        """Apply start-of-turn production from upgrade tags (era-aware)."""
        if not player.upgrades:
            return
        era = getattr(self.threat_manager.deck, "phase", None) if self.threat_manager else None
        effects = []
        for card in player.upgrades:
            effects.extend(parse_effect_tags({"tags": getattr(card, "tags", []), "id": card.id, "name": card.name}))

        for eff in effects:
            if eff.context and era and eff.context.lower() != str(era).lower():
                continue
            if eff.kind == "production" and eff.value and eff.amount:
                res = parse_resource_key(eff.value, InvalidActionError)
                player.resources[res] = player.resources.get(res, 0) + eff.amount
            elif eff.kind == "production_stance" and eff.amount:
                stance_map = {
                    Stance.AGGRESSIVE: ResourceType.RED,
                    Stance.TACTICAL: ResourceType.BLUE,
                    Stance.HUNKERED: ResourceType.GREEN,
                }
                if player.stance in stance_map:
                    target_res = stance_map[player.stance]
                else:
                    # Balanced: choose Blue by rule text fallback
                    target_res = ResourceType.BLUE
                player.resources[target_res] = player.resources.get(target_res, 0) + eff.amount
            elif eff.kind == "production_lowest" and eff.amount:
                res_values = player.resources
                min_val = min(res_values.values()) if res_values else 0
                lowest = [r for r, v in res_values.items() if v == min_val]
                if ResourceType.BLUE in lowest:
                    target_res = ResourceType.BLUE
                else:
                    target_res = lowest[0] if lowest else ResourceType.RED
                player.resources[target_res] = player.resources.get(target_res, 0) + eff.amount

    def _find_card(self, cards: List[MarketCard], card_id: Optional[str]) -> Optional[MarketCard]:
        if not card_id:
            return None
        return next((c for c in cards if c.id == card_id), None)

    async def _check_game_over(self, force: bool = False):
        if self.threat_manager:
            all_threats_defeated = self.threat_manager.is_cleared()
        else:
            all_threats_defeated = all(not row for row in self.state.threat_rows)
        active_players = [p for p in self.state.players.values() if p.status == PlayerStatus.ACTIVE]

        if force or all_threats_defeated or len(active_players) <= 1:
            self.state.phase = GamePhase.GAME_OVER
            winner = self._determine_winner()
            self.state.winner_id = winner.user_id if winner else None
            if winner:
                self.state.add_log(f"Game over. Winner: {winner.username}")
            else:
                self.state.add_log("Game over. No winner determined.")

    def _determine_winner(self) -> Optional[PlayerBoard]:
        scored_players = sorted(self.state.players.values(), key=lambda p: p.vp, reverse=True)
        return scored_players[0] if scored_players else None

    def _compute_fight_cost(self, player: PlayerBoard, payload: Dict[str, Any]) -> Dict[str, Any]:
        """
        Shared logic for computing fight costs. Does not mutate state.
        """
        row_index = int(payload.get("row", 0))
        if not self.threat_manager:
            raise InvalidActionError("Threats not initialized.")
        requested_id = payload.get("threat_id")

        played_weapon_ids = set(payload.get("played_weapons") or [])
        active_weapons: List[MarketCard] = [
            card for card in (player.weapons or []) if card.id in played_weapon_ids
        ]
        active_effects = []
        for card in active_weapons:
            active_effects.extend(parse_effect_tags({"tags": getattr(card, "tags", []), "id": card.id, "name": card.name}))

        # Include played upgrades that have fight tags (e.g., stance-based reductions)
        active_upgrades: List[MarketCard] = player.upgrades or []
        for card in active_upgrades:
            active_effects.extend(parse_effect_tags({"tags": getattr(card, "tags", []), "id": card.id, "name": card.name}))
        has_range_any = any(e.kind == "fight_range" and e.value == "any" for e in active_effects)

        threat = self.threat_manager.front_threat(row_index)
        if not threat:
            raise InvalidActionError("No threat available in that lane.")
        if self.threat_manager and requested_id:
            if has_range_any:
                threat = self.threat_manager.threat_by_id(row_index, requested_id) or threat
            else:
                threat = self.threat_manager.fightable_threat(row_index, requested_id)
            if not threat:
                raise InvalidActionError("That threat is not currently fightable.")
        cost = dict(threat.cost)
        weight_cost = getattr(threat, "weight", 0) or 0
        if weight_cost:
            cost[ResourceType.GREEN] = cost.get(ResourceType.GREEN, 0) + weight_cost
        enrage_tokens = getattr(threat, "enrage_tokens", 0) or 0
        if enrage_tokens:
            cost[ResourceType.RED] = cost.get(ResourceType.RED, 0) + 2 * enrage_tokens

        # Mass tokens are permanent reductions on green
        mass_tokens = player.tokens.get(TokenType.MASS, 0)
        if mass_tokens:
            cost[ResourceType.GREEN] = max(0, cost.get(ResourceType.GREEN, 0) - 2 * mass_tokens)

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

        # Apply tag-driven fight effects
        applied_effects: List = []
        for eff in active_effects:
            if eff.kind == "fight_cost_reduction" and eff.value and eff.amount:
                if eff.context:
                    era = getattr(self.threat_manager.deck, "phase", None)
                    if era and eff.context.lower() != str(era).lower():
                        continue
                res_type = parse_resource_key(eff.value, InvalidActionError)
                cost[res_type] = max(0, cost.get(res_type, 0) - eff.amount)
                applied_effects.append(eff)
            if eff.kind == "fight_cost_reduction_stance" and eff.amount:
                if eff.context:
                    era = getattr(self.threat_manager.deck, "phase", None)
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
                    # Balanced: choose the highest current cost to maximize value
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

    def preview_fight(self, player_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        player = self.state.players.get(player_id)
        if not player:
            return {"can_afford": False, "message": "Player not found."}
        try:
            result = self._compute_fight_cost(player, payload)
            return {
                "can_afford": result["can_afford"],
                "message": result["message"],
                "adjusted_cost": result["adjusted_cost"],
                "remaining_resources": result["remaining_resources"],
                "threat": result["threat"].to_public_dict(),
                "effects": result.get("effects", []),
                "applied_effects": result.get("applied_effects", []),
            }
        except InvalidActionError as e:
            return {"can_afford": False, "message": str(e)}
