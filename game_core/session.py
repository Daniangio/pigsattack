from typing import Any, Dict, List, Optional
from types import SimpleNamespace

import random

from .data_loader import GameDataLoader
from .models import BossCard, BossThreshold, CardType, GamePhase, GameState, MarketCard, PlayerBoard, PlayerStatus, ResourceType, Reward, Stance, TokenType, clamp_cost, resource_to_wire
from .effects import CardEffect, parse_effect_tags, effect_to_wire
from .threats import ThreatManager
from .utils import parse_resource_key


class InvalidActionError(ValueError):
    """Raised when a player attempts an illegal action."""


class GameSession:
    """
    Domain-level game session independent from any transport layer.
    """

    def __init__(self, game_id: str, players: List[Dict[str, str]], data_loader: Optional[GameDataLoader] = None, verbose: bool = True):
        self.data_loader = data_loader or GameDataLoader()
        self.state = GameState(game_id=game_id, verbose=verbose)
        self.threat_manager: Optional[ThreatManager] = None
        self.rng = random.Random()
        for p in players:
            board = PlayerBoard(
                user_id=p["id"],
                username=p["username"],
                is_bot=bool(p.get("is_bot")),
                personality=p.get("personality") or "greedy",
            )
            self.state.players[p["id"]] = board
            self.state.turn_order.append(p["id"])
        self._update_deck_remaining()

    def clone_quiet(self) -> "GameSession":
        """Create a lightweight clone for simulations: shallow-copy immutable assets, deep-copy mutable state."""
        clone = GameSession(
            self.state.game_id,
            [],
            data_loader=self.data_loader,  # shared static data
            verbose=False,
        )
        # Copy state deeply to avoid cross-mutation
        clone.state = copy.deepcopy(self.state)
        clone.state.verbose = False
        clone.threat_manager = copy.deepcopy(self.threat_manager)
        clone.rng = random.Random()
        return clone

    def _card_effects(self, card: Any) -> List[CardEffect]:
        """
        Safely parse effect tags for a card-like object. Returns empty list when
        the object is a string or missing expected attributes to avoid crashes.
        """
        if not card:
            return []
        tags = getattr(card, "tags", None)
        if tags is None:
            return []
        return parse_effect_tags(
            {
                "tags": tags,
                "id": getattr(card, "id", None) or str(card),
                "name": getattr(card, "name", None) or str(card),
            }
        )

    def _card_name(self, card: Any) -> str:
        """Best-effort readable card name for logging."""
        return getattr(card, "name", None) or getattr(card, "id", None) or str(card)

    def _ensure_market_cards(self, entries: List[Any], default_type: CardType) -> List[MarketCard]:
        """Normalize loose card representations (dict/str) into MarketCard objects to keep bots/states stable."""
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
            # Fallback for raw strings/objects
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

    async def async_setup(self):
        """Populate decks/market and start the first round."""
        threat_data = self.data_loader.load_threats()
        self.threat_manager = ThreatManager(threat_data, len(self.state.players))
        self.state.bosses = threat_data.bosses
        self.state.boss = threat_data.bosses[0] if threat_data.bosses else None
        self.state.boss_stage = "day"
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
            "activate_card": self._handle_activate_card,
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
                p.extend_used = False
        self._sync_era_from_deck()
        self._refill_market()
        self.state.add_log(f"Round {self.state.round} start. Resources produced.")

        self.state.phase = GamePhase.PLAYER_TURN
        self.state.active_player_index = 0
        await self._skip_inactive_players()
        self._begin_player_turn()

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
                }
            )
        return thresholds

    async def _start_boss_phase(self, stage: str):
        # Always play Day boss first, then Night boss, regardless of deck phase drift.
        stage_to_use = "day" if self.state.boss_index == 0 else "night"
        self.state.era = stage_to_use
        self.state.boss_stage = stage_to_use
        boss = self._boss_card_for_stage(stage_to_use)
        if not boss:
            # No boss for this stage: advance directly to the next era or end.
            if stage_to_use == "day":
                await self._start_night_after_boss()
            else:
                await self._check_game_over(force=True)
            return
        # Align deck phase with the boss stage to keep effects consistent.
        if self.threat_manager and self.threat_manager.deck:
            self.threat_manager.deck.phase = stage_to_use
            self._sync_era_from_deck()
        self.state.boss = boss
        self.state.boss_mode = True
        self.state.phase = GamePhase.BOSS
        self.state.boss_thresholds_state = self._build_boss_threshold_state(boss)
        self.state.add_log(f"{stage_to_use.capitalize()} boss {boss.name} emerges!")
        self.state.active_player_index = 0
        # Clear threats display during boss
        self.state.threat_rows = []
        await self._skip_inactive_players()
        self._begin_player_turn()

    async def _complete_boss_phase(self):
        stage = self.state.boss_stage or "day"
        self.state.boss_mode = False
        self.state.phase = GamePhase.ROUND_START
        self.state.boss_thresholds_state = []
        finished_index = self.state.boss_index
        self.state.boss_index = finished_index + 1
        if finished_index == 0:
            await self._start_night_after_boss()
        else:
            # Night boss ends the game
            self.state.phase = GamePhase.GAME_OVER
            winner = self._determine_winner()
            self.state.winner_id = winner.user_id if winner else None
            if winner:
                self.state.add_log(f"Game over. Winner: {winner.username}")
            else:
                self.state.add_log("Game over. No winner determined.")

    async def _start_night_after_boss(self):
        # Initialize night deck and draw first threats
        if self.threat_manager and self.threat_manager.deck:
            self.threat_manager.board.reset()
            self.threat_manager.deck.phase = "night"
            # Draw initial 3 threats into back slots
            for _ in range(3):
                self.threat_manager.board.spawn(self.threat_manager.deck.draw_next)
            self._sync_threat_rows()
            self._sync_era_from_deck()
        self.state.boss_stage = "night"
        self.state.boss = self._boss_card_for_stage("night")
        self.state.round = 1
        self._update_deck_remaining()
        await self._start_round()

    async def _end_round(self):
        self.state.phase = GamePhase.ROUND_END
        self.state.add_log(f"Round {self.state.round} ended.")
        current_round = self.state.round

        if self.threat_manager:
            logs = self.threat_manager.advance_and_spawn()
            for log in logs:
                self.state.add_log(log)
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

        # Boss phase triggers after round 6 for day/night respectively
        if not self.state.boss_mode:
            if (self.state.era == "day" and current_round >= 6) or (self.state.era == "night" and current_round >= 6):
                await self._start_boss_phase(self.state.era)
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
        player.upgrades = self._ensure_market_cards(player.upgrades, CardType.UPGRADE)
        player.weapons = self._ensure_market_cards(player.weapons, CardType.WEAPON)
        player.action_used = False
        player.buy_used = False
        player.extend_used = False
        player.active_used = {}
        player.turn_initial_stance = player.stance

    def _consume_main_action(self, player: PlayerBoard):
        if player.action_used:
            raise InvalidActionError("Main action already used this turn.")
        player.action_used = True

    def _consume_buy_action(self, player: PlayerBoard):
        if player.buy_used:
            raise InvalidActionError("Market buy already used this turn.")
        player.buy_used = True

    def _consume_extend_action(self, player: PlayerBoard):
        if player.extend_used:
            raise InvalidActionError("Extend slot already used this turn.")
        player.extend_used = True

    def _assert_active_available(self, player: PlayerBoard, card_id: str):
        if player.active_used.get(card_id):
            raise InvalidActionError("This card's active ability was already used this turn.")

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
        if self.state.phase not in {GamePhase.PLAYER_TURN, GamePhase.BOSS} or not active_id:
            raise InvalidActionError("It is not time to act.")
        if player.user_id != active_id:
            raise InvalidActionError("It is not your turn.")

    async def _handle_fight(self, player: PlayerBoard, payload: Dict[str, Any]):
        self._assert_turn(player)
        result = self._compute_fight_cost(player, payload)
        if not result["can_afford"]:
            raise InvalidActionError(result["message"])
        is_boss_fight = self.state.boss_mode or self.state.phase == GamePhase.BOSS or result.get("boss_threshold") is not None
        if not is_boss_fight:
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
            weapon_id = getattr(weapon, "id", None)
            if weapon_id not in played_weapon_ids:
              remaining_weapons.append(weapon)
              continue
            # Only decrement uses if present; strings will skip this safely.
            uses = getattr(weapon, "uses", None)
            if uses is None:
              remaining_weapons.append(weapon)
              continue
            weapon.uses = max(0, uses - 1)
            if weapon.uses > 0:
              remaining_weapons.append(weapon)
            else:
              self.state.add_log(f"{player.username}'s {self._card_name(weapon)} was discarded after being used up.")
          player.weapons = remaining_weapons

        # Resolve fight
        if is_boss_fight:
            if getattr(threat, "spoils", None):
                for reward in threat.spoils:
                    reward.apply(player)
                    self.state.add_log(f"{player.username} gains {reward.label}.")
            else:
                self._apply_reward(player, getattr(threat, "reward", ""))
            self.state.add_log(f"{player.username} cleared boss threshold {getattr(threat, 'label', 'Boss')}.")
            idx = result.get("boss_threshold")
            for entry in self.state.boss_thresholds_state:
                if int(entry.get("index", -1)) == idx:
                    entry["defeated"] = True
            player.threats_defeated += 1
        else:
            player.vp += threat.vp
            enrage_tokens = getattr(threat, "enrage_tokens", 0) or 0
            if enrage_tokens > 0:
                player.vp += 1
                self.state.add_log(f"{player.username} gains +1 VP for defeating an enraged threat.")
            if getattr(threat, "spoils", None):
                for reward in threat.spoils:
                    reward.apply(player)
                    self.state.add_log(f"{player.username} gains {reward.label}.")
            else:
                self._apply_reward(player, threat.reward)
            player.threats_defeated += 1
            if not self.threat_manager:
                raise InvalidActionError("Threat manager unavailable.")
            self.threat_manager.remove_threat(result["row_index"], threat.id)
            # On-kill upgrade effects (e.g., Catalyst Array)
            kill_effects = []
            for card in player.upgrades or []:
                for eff in self._card_effects(card):
                    if eff.kind == "on_kill_conversion" and eff.amount:
                        kill_effects.append(eff)
            for eff in kill_effects:
                current = player.tokens.get(TokenType.CONVERSION, 0)
                gained = min(eff.amount, max(0, 3 - current))
                if gained:
                    player.tokens[TokenType.CONVERSION] = current + gained
                    self.state.add_log(f"{player.username} gained {gained} conversion token(s) from {eff.source_name or 'an upgrade'}.")

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
        self.state.add_log(f"{player.username} bought upgrade {self._card_name(card)}.")

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
        self.state.add_log(f"{player.username} bought weapon {self._card_name(card)}.")

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

        if player.tokens.get(TokenType.WILD, 0) <= 0:
            raise InvalidActionError("You need a wild token to extend a slot.")

        if slot_type == "upgrade":
            if player.upgrade_slots >= 4:
                raise InvalidActionError("Upgrade slots already at max.")
        else:
            if player.weapon_slots >= 4:
                raise InvalidActionError("Weapon slots already at max.")

        self._consume_extend_action(player)
        player.tokens[TokenType.WILD] = max(0, player.tokens.get(TokenType.WILD, 0) - 1)
        if slot_type == "upgrade":
            player.upgrade_slots += 1
        else:
            player.weapon_slots += 1

        self.state.add_log(f"{player.username} spent a wild token to extend a {slot_type} slot.")

    async def _handle_activate_card(self, player: PlayerBoard, payload: Dict[str, Any]):
        self._assert_turn(player)
        card_id = payload.get("card_id")
        if not card_id:
            raise InvalidActionError("card_id is required.")
        # Ensure we have normalized cards
        player.upgrades = self._ensure_market_cards(player.upgrades, CardType.UPGRADE)
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
            if player.tokens.get(TokenType.MASS, 0) >= 3:
                raise InvalidActionError("You already have the maximum Mass tokens.")

            # Consume costs
            player.tokens[token_type] = max(0, player.tokens.get(token_type, 0) - 1)
            player.resources[ResourceType.GREEN] = max(0, player.resources.get(ResourceType.GREEN, 0) - 2)
            player.tokens[TokenType.MASS] = min(3, player.tokens.get(TokenType.MASS, 0) + 1)
            self.state.add_log(f"{player.username} activated {self._card_name(card)} to forge a Mass token (spent 1 token and 2G).")

        elif has_split_active:
            res_key = payload.get("resource") or payload.get("from")
            if not res_key:
                raise InvalidActionError("Choose a resource to convert.")
            res = parse_resource_key(res_key, InvalidActionError)
            if player.resources.get(res, 0) <= 0:
                raise InvalidActionError("Not enough of that resource to convert.")
            # Determine other resources
            others = [r for r in ResourceType if r != res]
            if len(others) < 2:
                raise InvalidActionError("Conversion failed.")
            player.resources[res] = max(0, player.resources.get(res, 0) - 1)
            player.resources[others[0]] = player.resources.get(others[0], 0) + 1
            player.resources[others[1]] = player.resources.get(others[1], 0) + 1
            self.state.add_log(
                f"{player.username} activated {self._card_name(card)} to split 1 {res.value} into 1 {others[0].value} and 1 {others[1].value}."
            )

        player.active_used[card.id] = True

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
        self.state.add_log(f"{player.username} realigned to {player.stance.value}.")

    async def _handle_convert(self, player: PlayerBoard, payload: Dict[str, Any]):
        # Conversion token can be used outside of action flow; no turn assertion
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

        player.resources[from_res] = player.resources.get(from_res, 0) - amount
        player.resources[to_res] = player.resources.get(to_res, 0) + amount
        player.tokens[TokenType.CONVERSION] = max(0, player.tokens.get(TokenType.CONVERSION, 0) - 1)
        self.state.add_log(f"{player.username} converted {amount} {from_res.value} → {to_res.value}.")

    async def _handle_stance_step(self, player: PlayerBoard, payload: Dict[str, Any]):
        await self._handle_realign(player, payload)

    async def _handle_end_turn(self, player: PlayerBoard, payload: Dict[str, Any]):
        await self._process_end_turn(player, payload, allow_inactive=False)

    async def _process_end_turn(self, player: PlayerBoard, payload: Dict[str, Any], allow_inactive: bool = False):
        if not allow_inactive:
            self._assert_turn(player)
        # Players can optionally pass a steal_allocation payload to choose which resources a Cunning attack steals.
        steal_pref = payload.get("steal_allocation") or payload.get("steal") or payload.get("cunning_allocation")
        if self.threat_manager and not self.state.boss_mode:
            for msg in self.threat_manager.resolve_end_of_turn(player, steal_pref):
                self.state.add_log(msg)
            self._sync_threat_rows()

        # End-of-turn wild token income (capped at 3)
        current_wild = player.tokens.get(TokenType.WILD, 0)
        if current_wild < 3:
            player.tokens[TokenType.WILD] = min(3, current_wild + 1)
            self.state.add_log(f"{player.username} gains 1 wild token at end of turn.")

        await self._check_game_over()
        if self.state.phase == GamePhase.GAME_OVER:
            return
        if self.state.boss_mode and self.state.boss_thresholds_state and all(e.get("defeated") for e in self.state.boss_thresholds_state):
            self.state.add_log(f"{self.state.boss.name if self.state.boss else 'Boss'} is defeated!")
            await self._complete_boss_phase()
            return
        # Advance to next player
        total_players = len(self.state.turn_order)
        next_index = (self.state.active_player_index + 1) % total_players if total_players else 0
        # If we looped back, the round is done
        if next_index == 0:
            if self.state.boss_mode:
                await self._complete_boss_phase()
            else:
                await self._end_round()
        else:
            self.state.active_player_index = next_index
            await self._skip_inactive_players()
            self._begin_player_turn()

    async def _handle_surrender(self, player: PlayerBoard, payload: Dict[str, Any]):
        player.status = PlayerStatus.SURRENDERED
        self.state.add_log(f"{player.username} surrendered.")
        # Run end-turn effects if this player was active
        try:
            await self._process_end_turn(player, payload or {}, allow_inactive=True)
        except Exception:
            pass
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
        }
        token_type = reward_map.get(reward)
        if token_type:
            player.tokens[token_type] = min(3, player.tokens.get(token_type, 0) + 1)
            self.state.add_log(f"{player.username} gained a {token_type.value} token.")
        # Effect-driven rewards (e.g., Catalyst Array)
        for eff in self._card_effects(reward):
            if eff.kind == "on_kill_conversion" and eff.amount:
                player.tokens[TokenType.CONVERSION] = min(3, player.tokens.get(TokenType.CONVERSION, 0) + eff.amount)
                self.state.add_log(f"{player.username} gained {eff.amount} conversion token(s) from {eff.source_name or 'an upgrade'}.")

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
        player.upgrades = self._ensure_market_cards(player.upgrades, CardType.UPGRADE)
        era = getattr(self.threat_manager.deck, "phase", None) if self.threat_manager else None
        effects = []
        for card in player.upgrades:
            effects.extend(self._card_effects(card))

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
        total_humans = [p for p in self.state.players.values() if not getattr(p, "is_bot", False)]
        active_humans = [p for p in total_humans if p.status == PlayerStatus.ACTIVE]
        active_bots = [p for p in self.state.players.values() if getattr(p, "is_bot", False) and p.status == PlayerStatus.ACTIVE]
        if self.state.boss_mode and active_humans and not force:
            return
        if self.threat_manager:
            all_threats_defeated = self.threat_manager.is_cleared()
        else:
            all_threats_defeated = all(not row for row in self.state.threat_rows)
        active_players = [p for p in self.state.players.values() if p.status == PlayerStatus.ACTIVE]

        end_for_humans = len(active_humans) == 0 or (len(active_humans) == 1 and len(active_bots) == 0)
        if force or all_threats_defeated or len(active_players) <= 1 or end_for_humans:
            self.state.phase = GamePhase.GAME_OVER
            winner = None
            if len(active_humans) == 1:
                winner = active_humans[0]
            else:
                winner = self._determine_winner()
            self.state.winner_id = winner.user_id if winner else None
            if winner:
                self.state.add_log(f"Game over. Winner: {winner.username}")
            else:
                self.state.add_log("Game over. No winner determined.")

    def _determine_winner(self) -> Optional[PlayerBoard]:
        def effective_vp(p: PlayerBoard) -> int:
            # Wound penalties: -10 VP at 5+, -20 VP at 10+
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
            [p for p in self.state.players.values() if p.status == PlayerStatus.ACTIVE],
            key=score_tuple,
        )
        return scored_players[0] if scored_players else None

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
        if not state_entry or state_entry.get("defeated"):
            raise InvalidActionError("That threshold is already defeated.")
        boss = self._boss_card_for_stage(self.state.boss_stage)
        if not boss or idx < 0 or idx >= len(boss.thresholds):
            raise InvalidActionError("Boss threshold not found.")
        threshold: BossThreshold = boss.thresholds[idx]
        cost = dict(threshold.cost)
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
        # Leverage existing spoils handling and fight panel display
        return {
            "can_afford": can_afford,
            "message": "ok" if can_afford else "Not enough resources to fight the boss threshold.",
            "threat": threat_like,
            "row_index": 0,
            "adjusted_cost": adjusted_cost,
            "attack_used": attack_used,
            "wild_used": wild_allocated,
            "remaining_resources": remaining,
            "effects": [],
            "applied_effects": [],
            "boss_threshold": idx,
        }

    def _compute_fight_cost(self, player: PlayerBoard, payload: Dict[str, Any]) -> Dict[str, Any]:
        """
        Shared logic for computing fight costs. Does not mutate state.
        """
        if self.state.boss_mode or self.state.phase == GamePhase.BOSS:
            return self._compute_boss_fight_cost(player, payload)
        row_index = int(payload.get("row", 0))
        if not self.threat_manager:
            raise InvalidActionError("Threats not initialized.")
        requested_id = payload.get("threat_id")

        # Normalize stored cards to avoid attribute errors if state contained raw strings/dicts
        player.upgrades = self._ensure_market_cards(player.upgrades, CardType.UPGRADE)
        player.weapons = self._ensure_market_cards(player.weapons, CardType.WEAPON)

        played_weapon_ids = set(payload.get("played_weapons") or [])
        active_weapons: List[MarketCard] = []
        for card in (player.weapons or []):
            card_id = getattr(card, "id", None) or (str(card) if card else None)
            if card_id in played_weapon_ids:
                active_weapons.append(card)
        active_effects = []
        for card in active_weapons:
            active_effects.extend(self._card_effects(card))
        # Passive range weapons (e.g., Snipe Scope) always grant fight_range:any
        for card in (player.weapons or []):
            for eff in self._card_effects(card):
                if eff.kind == "fight_range" and eff.value == "any":
                    active_effects.append(eff)

        # Include played upgrades that have fight tags (e.g., stance-based reductions)
        active_upgrades: List[MarketCard] = player.upgrades or []
        for card in active_upgrades:
            active_effects.extend(self._card_effects(card))
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
            cost[ResourceType.RED] = cost.get(ResourceType.RED, 0) + 2 * min(1, enrage_tokens)

        # Mass tokens are permanent reductions on green
        mass_tokens = player.tokens.get(TokenType.MASS, 0)
        if mass_tokens:
            # Mass Core may boost defense value; default reduction is 2 per token
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

        # Apply tag-driven fight effects
        applied_effects: List = []
        # Optional stance choice for Balanced (Precision Optics)
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
                    # Balanced: choose provided stance choice if valid, otherwise the highest current cost
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

    def preview_fight(self, player_id: str, payload: Dict[str, Any]) -> Dict[str, Any]:
        player = self.state.players.get(player_id)
        if not player:
            return {"can_afford": False, "message": "Player not found."}
        try:
            result = self._compute_fight_cost(player, payload)
            threat_obj = result.get("threat")
            if hasattr(threat_obj, "to_public_dict"):
                threat_pub = threat_obj.to_public_dict()
            elif isinstance(threat_obj, dict):
                threat_pub = threat_obj
            else:
                threat_pub = {
                    "id": getattr(threat_obj, "id", "boss-threshold"),
                    "name": getattr(threat_obj, "name", "Boss Threshold"),
                    "cost": getattr(threat_obj, "cost", {}),
                    "vp": getattr(threat_obj, "vp", 0),
                    "reward": getattr(threat_obj, "reward", ""),
                    "type": getattr(threat_obj, "type", "Boss"),
                    "boss_threshold": getattr(threat_obj, "boss_threshold", None),
                }
            return {
                "can_afford": result["can_afford"],
                "message": result["message"],
                "adjusted_cost": result["adjusted_cost"],
                "remaining_resources": result["remaining_resources"],
                "threat": threat_pub,
                "effects": result.get("effects", []),
                "applied_effects": result.get("applied_effects", []),
            }
        except InvalidActionError as e:
            return {"can_afford": False, "message": str(e)}
