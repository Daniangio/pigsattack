import json
import itertools
from pathlib import Path
from typing import Any, Dict, List, Optional

from .models import BossCard, BossThreshold, CardType, MarketCard, MarketState, ThreatCard, Reward, TokenType, ResourceType, resource_from_json
from .threats import ThreatDeckData

EMPTY_DECK_NAME = "__empty__"


def parse_reward_text(raw: str) -> List[Reward]:
    if not raw:
        return []
    parts = [p.strip() for p in raw.split("+")]
    rewards: List[Reward] = []
    for part in parts:
        if not part:
            continue
        lower_part = part.lower()
        # Resource reward (format like 2R or 1B or 3G)
        res_map = {"r": ResourceType.RED, "b": ResourceType.BLUE, "g": ResourceType.GREEN}
        if len(part) >= 2 and part[-1].lower() in res_map:
            try:
                val = int(part[:-1])
                res = res_map[part[-1].lower()]
                rewards.append(Reward(kind="resource", resources={res: val}))
                continue
            except ValueError:
                pass
        # VP reward
        if "vp" in lower_part:
            try:
                val = int("".join([c for c in part if c.isdigit()]) or "0")
                rewards.append(Reward(kind="vp", amount=val))
                continue
            except ValueError:
                pass
        # Slot reward
        if "slot" in lower_part:
            if "upgrade" in lower_part:
                rewards.append(Reward(kind="slot", slot_type="upgrade", amount=1))
                continue
            if "weapon" in lower_part:
                rewards.append(Reward(kind="slot", slot_type="weapon", amount=1))
                continue
        # Token reward
        token_map = {
            "attack": TokenType.ATTACK,
            "conversion": TokenType.CONVERSION,
            "mass": TokenType.MASS,
            "wild": TokenType.WILD,
        }
        amount = 1
        digits = "".join([c for c in part if c.isdigit()])
        if digits:
            try:
                amount = int(digits)
            except ValueError:
                amount = 1
        # Wound removal
        if "wound" in lower_part and ("ignore" in lower_part or "remove" in lower_part or "heal" in lower_part):
            rewards.append(Reward(kind="heal_wound", amount=amount))
            continue
        if "stance" in lower_part and ("change" in lower_part or "realign" in lower_part):
            rewards.append(Reward(kind="stance_change", amount=amount))
            continue
        for key, token in token_map.items():
            if key in lower_part:
                rewards.append(Reward(kind="token", token=token, amount=amount))
                break
    return rewards


def _parse_token_value(val: Any) -> Optional[TokenType]:
    if isinstance(val, TokenType):
        return val
    if val is None:
        return None
    s = str(val).lower()
    try:
        return TokenType(s)
    except Exception:
        try:
            return TokenType[s.upper()]
        except Exception:
            return None


class GameDataLoader:
    """Loads static game data from JSON files."""

    def __init__(
        self,
        data_root: Optional[Path] = None,
        threats_file: Optional[str] = None,
        bosses_file: Optional[str] = None,
        market_file: Optional[str] = None,
        upgrade_file: Optional[str] = None,
        weapon_file: Optional[str] = None,
    ):
        self.data_root = data_root or Path(__file__).resolve().parent / "data"
        self.threats_file = threats_file  # Optional full path or filename
        self.bosses_file = bosses_file  # Optional full path or filename
        self.market_file = market_file  # Optional full path or filename
        self.upgrade_file = upgrade_file  # Optional full path or filename
        self.weapon_file = weapon_file  # Optional full path or filename

    def _load_json(self, filename: str):
        path = self.data_root / filename
        with path.open("r", encoding="utf-8") as handle:
            return json.load(handle)

    def _load_optional_json(self, filename: str, file_override: Optional[str]):
        if file_override:
            path = Path(file_override)
            return json.loads(path.read_text(encoding="utf-8"))
        return self._load_json(filename)

    def load_threats(self) -> ThreatDeckData:
        if self.threats_file:
            path = Path(self.threats_file)
            data = json.loads(path.read_text(encoding="utf-8"))
        else:
            data = self._load_json("threats.json")

        # Load bosses separately if provided
        boss_data_src = None
        if self.bosses_file:
            boss_path = Path(self.bosses_file)
            if boss_path.exists():
                boss_data_src = json.loads(boss_path.read_text(encoding="utf-8"))
        if boss_data_src is None:
            default_boss_path = self.data_root / "bosses.json"
            if default_boss_path.exists():
                boss_data_src = json.loads(default_boss_path.read_text(encoding="utf-8"))
            else:
                boss_data_src = {"bosses": data.get("bosses", [])}

        bosses: List[BossCard] = []
        for boss_data in boss_data_src.get("bosses", []):
            thresholds = [
                BossThreshold(
                    label=t["label"],
                    cost=resource_from_json(t.get("cost", {})),
                    reward=t.get("reward", ""),
                    spoils=parse_reward_text(t.get("reward", "")),
                )
                for t in boss_data.get("thresholds", [])
            ]
            bosses.append(
                BossCard(
                    id=boss_data["id"],
                    name=boss_data["name"],
                    vp=boss_data.get("vp", 0),
                    image=boss_data.get("image"),
                    thresholds=thresholds,
                )
            )

        day_threats = self._parse_threat_list(data.get("day_threats", []))
        night_threats = self._parse_threat_list(data.get("night_threats", []))

        # Legacy fallback (old format) - flatten rows into day threats if new fields missing
        if not day_threats and data.get("rows"):
            for row in data.get("rows", []):
                for raw in row:
                    day_threats.append(
                        ThreatCard(
                            id=raw["id"],
                            name=raw["name"],
                            cost=resource_from_json(raw.get("cost", {})),
                            vp=raw.get("vp", 0),
                            type=raw.get("type", "Unknown"),
                            reward=raw.get("reward", ""),
                            spoils=parse_reward_text(raw.get("reward", "")),
                        )
                    )

        return ThreatDeckData(day_threats=day_threats, night_threats=night_threats, bosses=bosses)

    def load_market(self) -> MarketState:
        if self.market_file:
            combined = self._load_optional_json("market.json", self.market_file)
            upgrades_raw = combined.get("upgrades", []) if isinstance(combined, dict) else []
            weapons_raw = combined.get("weapons", []) if isinstance(combined, dict) else []
        else:
            if self.upgrade_file == EMPTY_DECK_NAME:
                upgrades_raw = []
            else:
                upgrades_payload = self._load_optional_json("upgrades.json", self.upgrade_file)
                if isinstance(upgrades_payload, dict):
                    upgrades_raw = upgrades_payload.get("upgrades", [])
                elif isinstance(upgrades_payload, list):
                    upgrades_raw = upgrades_payload
                else:
                    upgrades_raw = []
            if self.weapon_file == EMPTY_DECK_NAME:
                weapons_raw = []
            else:
                weapons_payload = self._load_optional_json("weapons.json", self.weapon_file)
                if isinstance(weapons_payload, dict):
                    weapons_raw = weapons_payload.get("weapons", [])
                elif isinstance(weapons_payload, list):
                    weapons_raw = weapons_payload
                else:
                    weapons_raw = []

        def build_cards(raw_items, card_type: CardType, id_counter: itertools.count) -> List[MarketCard]:
            cards: List[MarketCard] = []
            for raw in raw_items:
                copies = int(raw.get("copies", 1)) if isinstance(raw, dict) else 1
                base_id = raw.get("id") if isinstance(raw, dict) else None
                base_name = raw.get("name") if isinstance(raw, dict) else None
                name = base_name if base_name is not None else str(base_id or "Unknown")
                cost = resource_from_json(raw.get("cost", {})) if isinstance(raw, dict) else {}
                vp = raw.get("vp", 0) if isinstance(raw, dict) else 0
                effect = raw.get("effect", "") if isinstance(raw, dict) else ""
                uses = raw.get("uses") if isinstance(raw, dict) and card_type == CardType.WEAPON else None
                tags = raw.get("tags", []) if isinstance(raw, dict) and isinstance(raw.get("tags", []), list) else []
                prefix = "u" if card_type == CardType.UPGRADE else "w"
                for copy_idx in range(max(1, copies)):
                    if base_id:
                        card_id = str(base_id) if copies == 1 else f"{base_id}-{copy_idx + 1}"
                    else:
                        card_id = f"{prefix}-{next(id_counter)}"
                    cards.append(
                        MarketCard(
                            id=card_id,
                            card_type=card_type,
                            name=name,
                            cost=cost,
                            vp=vp,
                            effect=effect,
                            uses=uses,
                            tags=list(tags),
                        )
                    )
            return cards

        upgrades = build_cards(upgrades_raw, CardType.UPGRADE, itertools.count(1))
        weapons = build_cards(weapons_raw, CardType.WEAPON, itertools.count(1))

        return MarketState(
            upgrade_deck=upgrades,
            weapon_deck=weapons,
        )

    def _parse_threat_list(self, raw_items: List[Dict[str, Any]]) -> List[ThreatCard]:
        threats: List[ThreatCard] = []
        for raw in raw_items:
            spoils_raw = raw.get("spoils") or raw.get("spoils_tags") or []
            spoils: List[Reward] = []
            if spoils_raw and isinstance(spoils_raw, list):
                for entry in spoils_raw:
                    if isinstance(entry, dict):
                        kind = (entry.get("kind") or "token").lower()
                        amount = int(entry.get("amount", 0) or 0)
                        token_val = entry.get("token")
                        token = _parse_token_value(token_val) if token_val is not None else None
                        slot_type = entry.get("slot_type") or entry.get("slotType")
                        resources_map = entry.get("resources") or {}
                        res_parsed = {}
                        for key, val in (resources_map or {}).items():
                            try:
                                res_parsed[ResourceType(str(key).upper())] = int(val or 0)
                            except Exception:
                                continue
                        spoils.append(
                            Reward(
                                kind=kind or "token",
                                amount=amount,
                                token=token,
                                slot_type=slot_type,
                                resources=res_parsed if (res_parsed and (kind == "resource")) else None,
                            )
                        )
                    elif isinstance(entry, str):
                        # simple tag strings like "token:attack:2" or "resource:R:2,B:1"
                        tag = entry.strip().lower()
                        if tag.startswith("token:"):
                            parts = tag.split(":")
                            if len(parts) >= 3:
                                token_key = parts[1]
                                try:
                                    tok = _parse_token_value(token_key)
                                    amt = int(parts[2])
                                    spoils.append(Reward(kind="token", token=tok, amount=amt))
                                except Exception:
                                    pass
                        elif tag.startswith("resource:"):
                            try:
                                _, payload = tag.split(":", 1)
                                res_parts = payload.split(",")
                                res_map: Dict[ResourceType, int] = {}
                                for rp in res_parts:
                                    kv = rp.split(":")
                                    if len(kv) == 2:
                                        rk = kv[0].strip().upper()
                                        rv = int(kv[1])
                                        res_map[ResourceType(rk)] = rv
                                if res_map:
                                    spoils.append(Reward(kind="resource", resources=res_map))
                            except Exception:
                                pass
                        elif tag.startswith("stance_change") or tag.startswith("free_stance_change"):
                            parts = tag.split(":")
                            amt = 1
                            if len(parts) >= 2:
                                try:
                                    amt = int(parts[1])
                                except Exception:
                                    amt = 1
                            spoils.append(Reward(kind="stance_change", amount=amt))
            elif raw.get("reward"):
                spoils = parse_reward_text(raw.get("reward", ""))
            threats.append(
                ThreatCard(
                    id=raw["id"],
                    name=raw["name"],
                    cost=resource_from_json(raw.get("cost", {})),
                    vp=raw.get("vp", 0),
                    type=raw.get("type", "Unknown"),
                    reward=raw.get("reward", ""),
                    copies=int(raw.get("copies", 1)),
                    spoils=spoils,
                    image=raw.get("image"),
                )
            )
        return threats
