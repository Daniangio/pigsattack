import random
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional, Tuple

from .models import BossCard, PlayerBoard, ResourceType, Stance, ThreatCard
from .utils import parse_resource_key, sum_resources


@dataclass
class ThreatDeckData:
    day_threats: List[ThreatCard] = field(default_factory=list)
    night_threats: List[ThreatCard] = field(default_factory=list)
    bosses: List[BossCard] = field(default_factory=list)


@dataclass
class ThreatInstance:
    card: ThreatCard
    weight: int = 0
    era: str = "day"
    position: str = "back"
    enrage_tokens: int = 0

    @property
    def id(self) -> str:
        return self.card.id

    @property
    def name(self) -> str:
        return self.card.name

    @property
    def cost(self) -> Dict[ResourceType, int]:
        return self.card.cost

    @property
    def vp(self) -> int:
        return self.card.vp

    @property
    def type(self) -> str:
        return self.card.type

    @property
    def reward(self) -> str:
        return self.card.reward

    @property
    def spoils(self):
        return getattr(self.card, "spoils", [])

    @property
    def image(self) -> Optional[str]:
        return getattr(self.card, "image", None)

    @property
    def type_key(self) -> str:
        return (self.type or "").lower()

    def to_public_dict(self) -> Dict[str, Any]:
        data = self.card.to_public_dict()
        data.update(
            {
                "weight": self.weight,
                "position": self.position,
                "era": self.era,
                "enrage_tokens": self.enrage_tokens,
            }
        )
        return data


class ThreatLane:
    def __init__(self):
        self.front: Optional[ThreatInstance] = None
        self.mid: Optional[ThreatInstance] = None
        self.back: Optional[ThreatInstance] = None

    def clear(self):
        self.front = None
        self.mid = None
        self.back = None

    def advance(self) -> Tuple[bool, bool]:
        moved = False
        enraged = False
        if self.front:
            # Cannot move further; becomes enraged.
            current = max(0, getattr(self.front, "enrage_tokens", 0))
            if current < 1:
                self.front.enrage_tokens = 1
                enraged = True
        if not self.front and self.mid:
            self.front = self.mid
            self.mid = None
            moved = True
        if not self.mid and self.back:
            self.mid = self.back
            self.back = None
            moved = True
        return moved, enraged

    def spawn(self, draw: Callable[[], Optional[ThreatInstance]]) -> bool:
        if self.back:
            return False
        card = draw()
        if not card:
            return False
        card.position = "back"
        self.back = card
        return True

    def remove_front(self) -> Optional[ThreatInstance]:
        threat = self.front
        self.front = None
        return threat

    def slots(self) -> List[Tuple[str, Optional[ThreatInstance]]]:
        return [("front", self.front), ("mid", self.mid), ("back", self.back)]

    def to_row(self) -> List[ThreatInstance]:
        row: List[ThreatInstance] = []
        for position, threat in self.slots():
            if threat:
                threat.position = position
                row.append(threat)
        return row

    def has_threats(self) -> bool:
        return any(t for _, t in self.slots())


class ThreatBoard:
    def __init__(self, lane_count: int):
        self.lanes: List[ThreatLane] = [ThreatLane() for _ in range(max(1, lane_count))]

    def reset(self):
        for lane in self.lanes:
            lane.clear()

    def advance(self) -> Tuple[bool, List[ThreatInstance]]:
        moved = False
        enraged: List[ThreatInstance] = []
        for lane in self.lanes:
            lane_moved, lane_enraged = lane.advance()
            moved = lane_moved or moved
            if lane_enraged and lane.front:
                # Enrage only once; cap tokens at 1
                if getattr(lane.front, "enrage_tokens", 0) <= 1:
                    lane.front.enrage_tokens = min(1, getattr(lane.front, "enrage_tokens", 0))
                lane.front.position = "front"
                enraged.append(lane.front)
        return moved, enraged

    def spawn(self, draw: Callable[[], Optional[ThreatInstance]]) -> int:
        spawned = 0
        for lane in self.lanes:
            if lane.spawn(draw):
                spawned += 1
        return spawned

    def to_rows(self) -> List[List[ThreatInstance]]:
        return [lane.to_row() for lane in self.lanes]

    def front_threat(self, row_index: int) -> Optional[ThreatInstance]:
        if row_index < 0 or row_index >= len(self.lanes):
            return None
        lane = self.lanes[row_index]
        if lane.front:
            lane.front.position = "front"
            return lane.front
        # Return next visible threat if front is empty
        if lane.mid:
            lane.mid.position = "mid"
            return lane.mid
        if lane.back:
            lane.back.position = "back"
            return lane.back
        return None

    def fightable_threat(self, row_index: int, threat_id: Optional[str] = None) -> Optional[ThreatInstance]:
        if row_index < 0 or row_index >= len(self.lanes):
            return None
        lane = self.lanes[row_index]
        candidates = [
            ("front", lane.front),
            ("mid", lane.mid),
            ("back", lane.back),
        ]
        # First visible threat is the first non-empty slot
        visible = next(((pos, t) for pos, t in candidates if t), None)
        if not visible:
            return None
        pos, threat = visible
        threat.position = pos
        if threat_id and threat.id != threat_id:
            return None
        return threat

    def threat_by_id(self, row_index: int, threat_id: str) -> Optional[ThreatInstance]:
        if row_index < 0 or row_index >= len(self.lanes):
            return None
        lane = self.lanes[row_index]
        for pos in ["front", "mid", "back"]:
            threat = getattr(lane, pos)
            if threat and threat.id == threat_id:
                threat.position = pos
                return threat
        return None

    def remove_front(self, row_index: int) -> Optional[ThreatInstance]:
        if row_index < 0 or row_index >= len(self.lanes):
            return None
        return self.lanes[row_index].remove_front()

    def remove_threat(self, row_index: int, threat_id: str) -> Optional[ThreatInstance]:
        if row_index < 0 or row_index >= len(self.lanes):
            return None
        lane = self.lanes[row_index]
        if lane.front and lane.front.id == threat_id:
            return lane.remove_front()
        if lane.mid and lane.mid.id == threat_id:
            threat = lane.mid
            lane.mid = None
            return threat
        if lane.back and lane.back.id == threat_id:
            threat = lane.back
            lane.back = None
            return threat
        return None

    def front_threats_with_index(self) -> List[Tuple[int, ThreatInstance]]:
        result: List[Tuple[int, ThreatInstance]] = []
        for idx, lane in enumerate(self.lanes):
            if lane.front:
                lane.front.position = "front"
                result.append((idx, lane.front))
        return result

    def grow_front_weights(self) -> List[str]:
        logs: List[str] = []
        for idx, threat in self.front_threats_with_index():
            if threat.type_key == "massive":
                if threat.weight < 3:
                    threat.weight += 1
                    logs.append(f"Front Massive threat {threat.name} in lane {idx + 1} grows heavier (weight {threat.weight}).")
        return logs

    def has_threats(self) -> bool:
        return any(lane.has_threats() for lane in self.lanes)


class ThreatDeckBuilder:
    def __init__(self, data: ThreatDeckData, player_count: int, rng: Optional[random.Random] = None):
        self.data = data
        self.player_count = player_count
        self.rng = rng or random.Random()
        self.phase = "day"
        rounds_per_era = 6
        self.day_deck = self._build_deck(data.day_threats, player_count * rounds_per_era)
        self.night_deck = self._build_deck(data.night_threats, player_count * rounds_per_era)

    def _build_deck(self, cards: List[ThreatCard], required_size: int) -> List[ThreatCard]:
        expanded: List[ThreatCard] = []
        for card in cards:
            copies = getattr(card, "copies", 1)
            for _ in range(max(1, int(copies))):
                expanded.append(card)
        if not expanded:
            return []
        deck: List[ThreatCard] = []
        while len(deck) < required_size:
            deck.extend(expanded)
        self.rng.shuffle(deck)
        return deck[:required_size]

    def draw_next(self) -> Optional[ThreatInstance]:
        deck = self.day_deck if self.phase == "day" else self.night_deck
        if deck:
            card = deck.pop(0)
            return ThreatInstance(card=card, era=self.phase)
        if self.phase == "day":
            self.phase = "night"
            return self.draw_next()
        return None

    def remaining(self) -> int:
        return len(self.day_deck) + len(self.night_deck)


class ThreatManager:
    def __init__(self, deck_data: ThreatDeckData, player_count: int):
        self.deck = ThreatDeckBuilder(deck_data, player_count)
        self.board = ThreatBoard(max(1, player_count))
        self.bosses = deck_data.bosses

    def bootstrap(self) -> List[str]:
        """Initial round-end trigger to populate backlines."""
        self.board.reset()
        return self.advance_and_spawn()

    def advance_and_spawn(self) -> List[str]:
        logs: List[str] = []
        moved, enraged = self.board.advance()
        if moved:
            logs.append("Threats advance toward the survivors.")
        for threat in enraged:
            logs.append(f"{threat.name} becomes enraged in the front line (+2R cost, attacks all stances).")
        spawned = self.board.spawn(self.deck.draw_next)
        if spawned:
            logs.append(f"{spawned} threat{'s' if spawned > 1 else ''} emerge in the backline.")
        return logs

    def remove_front(self, row_index: int) -> Optional[ThreatInstance]:
        return self.board.remove_front(row_index)

    def remove_threat(self, row_index: int, threat_id: str) -> Optional[ThreatInstance]:
        return self.board.remove_threat(row_index, threat_id)

    def front_threat(self, row_index: int) -> Optional[ThreatInstance]:
        return self.board.front_threat(row_index)

    def fightable_threat(self, row_index: int, threat_id: Optional[str]) -> Optional[ThreatInstance]:
        return self.board.fightable_threat(row_index, threat_id)

    def threat_by_id(self, row_index: int, threat_id: str) -> Optional[ThreatInstance]:
        return self.board.threat_by_id(row_index, threat_id)

    def rows(self) -> List[List[ThreatInstance]]:
        return self.board.to_rows()

    def front_row_index(self) -> Optional[int]:
        fronts = [idx for idx, threat in self.board.front_threats_with_index() if threat]
        return fronts[0] if fronts else None

    def is_cleared(self) -> bool:
        return not self.board.has_threats() and self.deck.remaining() == 0

    def resolve_end_of_turn(self, player: PlayerBoard, steal_preference: Optional[Dict[str, int]] = None) -> List[str]:
        logs = self.board.grow_front_weights()
        for lane_idx, threat in self.board.front_threats_with_index():
            if not self._threat_targets_player(threat, player.stance):
                continue
            logs.extend(self._apply_attack(threat, player, lane_idx, steal_preference))
        return logs

    def _threat_targets_player(self, threat: ThreatInstance, stance: Stance) -> bool:
        # Only explicit front-row threats may attack the player.
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
    ) -> List[str]:
        logs: List[str] = []
        attack_type = self._resolved_attack_type(threat, player.stance)
        if attack_type == "none":
            return logs

        if attack_type == "feral":
            player.add_wounds(1)
            logs.append(f"{threat.name} strikes {player.username} for 1 wound.")
        elif attack_type == "cunning":
            logs.extend(self._resolve_cunning_attack(threat, player, lane_idx, steal_preference))
        elif attack_type == "massive":
            if threat.weight >= 3:
                player.add_wounds(1)
                logs.append(f"{threat.name} crushes {player.username} with its mass (1 wound).")
            else:
                logs.append(f"{threat.name} looms but is not yet heavy enough to wound.")
        if threat.type_key == "hybrid" and player.stance == Stance.HUNKERED:
            threat.weight += 1
            player.add_wounds(1)
            logs.append(f"{threat.name} mutates against the Hunkered stance: +1 weight (now {threat.weight}) and 1 wound.")
        return logs

    def _resolve_cunning_attack(
        self,
        threat: ThreatInstance,
        player: PlayerBoard,
        lane_idx: int,
        steal_preference: Optional[Dict[str, int]] = None,
    ) -> List[str]:
        logs: List[str] = []
        steal_amount = 2
        available = sum_resources(player.resources)
        to_steal = min(steal_amount, available)
        wound = available < steal_amount

        allocation: Dict[ResourceType, int] = {ResourceType.RED: 0, ResourceType.BLUE: 0, ResourceType.GREEN: 0}
        if to_steal > 0:
            allocation = self._allocate_theft(player, to_steal, steal_preference)
            removed = player.lose_resources(allocation)
            to_steal = sum(removed.values())
            logs.append(
                f"{threat.name} steals {to_steal} resource(s) from {player.username} "
                f"(R:{removed.get(ResourceType.RED,0)}, B:{removed.get(ResourceType.BLUE,0)}, G:{removed.get(ResourceType.GREEN,0)})."
            )
        else:
            logs.append(f"{threat.name} finds nothing to steal from {player.username}.")

        if wound or to_steal == 0:
            player.add_wounds(1)
            logs.append(f"{player.username} suffers a wound from the theft in lane {lane_idx + 1}.")
        return logs

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
            # Auto-allocate from the largest piles first, respecting what was already allocated via preference.
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
