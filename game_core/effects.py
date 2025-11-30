"""
Helpers for interpreting card effect tags.

This creates a structured place to parse the lightweight `tags` we store on
market cards (see game_core/data/market.json). Engine code can opt-in to call
these helpers to derive modifiers without embedding string parsing in the
session logic.
"""
from dataclasses import dataclass
from typing import Dict, List, Optional

from .models import ResourceType


@dataclass
class CardEffect:
    """Structured representation of a single parsed tag."""
    kind: str
    value: Optional[str] = None
    amount: Optional[int] = None
    context: Optional[str] = None  # e.g., "day" or "night"
    source_id: Optional[str] = None
    source_name: Optional[str] = None


def parse_effect_tags(card: Dict) -> List[CardEffect]:
    """
    Parse the optional `tags` field on a card into structured effects.

    Supported patterns (extendable):
      - "fight:cost_reduction:R3"          -> reduce red cost by 3 during fights
      - "fight:cost_reduction:R3:day"      -> reduce red cost by 3 only in Day era
      - "fight:range:any"                  -> can target any threat position
      - "production:R1"                    -> +1R at start of turn
      - "production:R1:day"                -> +1R at start of turn during Day
      - "production:stance:1"              -> +1 in stance color (Balanced chooses internally)
      - "production:lowest:1"              -> +1 to lowest resource (custom tie-break)
      - "spec:red"                         -> thematic specialization hint
    """
    tags = card.get("tags") or []
    source_id = card.get("id")
    source_name = card.get("name")
    parsed: List[CardEffect] = []
    for raw in tags:
        if not isinstance(raw, str):
            continue
        if raw.startswith("fight:cost_reduction:"):
            payload = raw.split("fight:cost_reduction:")[-1]
            parts = payload.split(":")
            if not parts:
                continue
            if parts[0].lower().startswith("stance"):
                amount_part = parts[1] if len(parts) > 1 else ""
                try:
                    amt_val = int(amount_part)
                except ValueError:
                    continue
                era = parts[2] if len(parts) > 2 else None
                parsed.append(
                    CardEffect(kind="fight_cost_reduction_stance", value="stance", amount=amt_val, context=era, source_id=source_id, source_name=source_name)
                )
            else:
                res_key = parts[0][:1].upper()
                amount_part = parts[0][1:] if len(parts[0]) > 1 else ""
                try:
                    amt_val = int(amount_part)
                except ValueError:
                    continue
                era = parts[1] if len(parts) > 1 else None
                try:
                    res = ResourceType(res_key)
                except Exception:
                    continue
                parsed.append(CardEffect(kind="fight_cost_reduction", value=res.value, amount=amt_val, context=era, source_id=source_id, source_name=source_name))
        elif raw.startswith("fight:range:"):
            rng = raw.split("fight:range:")[-1]
            parsed.append(CardEffect(kind="fight_range", value=rng, source_id=source_id, source_name=source_name))
        elif raw.startswith("spec:"):
            spec = raw.split("spec:")[-1]
            parsed.append(CardEffect(kind="specialization", value=spec, source_id=source_id, source_name=source_name))
        elif raw.startswith("production:"):
            payload = raw.split("production:")[-1]
            parts = payload.split(":")
            if not parts:
                continue
            if parts[0] == "stance":
                amount_part = parts[1] if len(parts) > 1 else ""
                try:
                    amt_val = int(amount_part)
                except ValueError:
                    continue
                era = parts[2] if len(parts) > 2 else None
                parsed.append(CardEffect(kind="production_stance", amount=amt_val, context=era, source_id=source_id, source_name=source_name))
            elif parts[0] == "lowest":
                amount_part = parts[1] if len(parts) > 1 else ""
                try:
                    amt_val = int(amount_part)
                except ValueError:
                    continue
                era = parts[2] if len(parts) > 2 else None
                parsed.append(CardEffect(kind="production_lowest", amount=amt_val, context=era, source_id=source_id, source_name=source_name))
            else:
                res_key = parts[0][:1].upper()
                amount_part = parts[0][1:] if len(parts[0]) > 1 else ""
                try:
                    amt_val = int(amount_part)
                except ValueError:
                    continue
                era = parts[1] if len(parts) > 1 else None
                try:
                    res = ResourceType(res_key)
                except Exception:
                    continue
                parsed.append(CardEffect(kind="production", value=res.value, amount=amt_val, context=era, source_id=source_id, source_name=source_name))
    return parsed


def effect_to_wire(effect: CardEffect) -> Dict[str, Optional[str]]:
    return {
        "kind": effect.kind,
        "value": effect.value,
        "amount": effect.amount,
        "context": effect.context,
        "source_id": effect.source_id,
        "source_name": effect.source_name,
    }
