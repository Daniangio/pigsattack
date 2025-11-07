"""
Parses card data from CSV files to create the initial decks.

v1.9.2 - RULEBOOK COHERENCE FIXES
- Fixed: `_parse_threat_template` had a copy-paste bug that
-   tried to validate OnFail tags as ArsenalEffect tags.
-   This block has been removed.
- Fixed: `create_threat_deck` now correctly shuffles each Era
-   *before* sampling, then combines them in order.
"""

from typing import List, Dict, Any, Type, Optional
from .game_models import (
    ScrapType, LureCard, SurvivorActionCard, ThreatCard, UpgradeCard, ArsenalCard, Card,
    OnFailEffect, UpgradeEffect, ArsenalEffect
)
import random
import uuid
import csv
import os

# --- Constants ---
DATA_DIR = os.path.join(os.path.dirname(__file__), 'data')
THREAT_CARDS_CSV = os.path.join(DATA_DIR, 'threat_cards.csv')
UPGRADE_CARDS_CSV = os.path.join(DATA_DIR, 'upgrade_cards.csv')
ARSENAL_CARDS_CSV = os.path.join(DATA_DIR, 'arsenal_cards.csv')

CARDS_PER_ERA_PER_PLAYER = 5

# ... (Helper functions _create_cards, _load_card_templates, _parse_scrap_string, _parse_effect_tags remain the same) ...
def _create_cards(card_class: Type[Card], card_template_list: List[Dict]) -> List[Card]:
    deck = []
    for template in card_template_list:
        deck.append(card_class(id=str(uuid.uuid4()), **template))
    return deck

def _load_card_templates(csv_filepath: str) -> List[Dict]:
    if not os.path.exists(csv_filepath):
        raise FileNotFoundError(f"Card data file not found: {csv_filepath}")
    with open(csv_filepath, mode='r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        return [row for row in reader]

def _parse_scrap_string(cost_str: str) -> Dict[ScrapType, int]:
    if not cost_str or cost_str == '-': return {}
    cost_str = cost_str.strip().upper()
    cost = {}
    if "OF EACH" in cost_str:
        try:
            amount = int(cost_str.split()[0])
            return {ScrapType.PARTS: amount, ScrapType.WIRING: amount, ScrapType.PLATES: amount}
        except ValueError: return {}
    parts = cost_str.split(',')
    for part in parts:
        part = part.strip()
        try:
            amount_str, color_str = part.split(maxsplit=1)
            amount = int(amount_str)
            if "PARTS" in color_str: cost[ScrapType.PARTS] = cost.get(ScrapType.PARTS, 0) + amount
            elif "WIRING" in color_str: cost[ScrapType.WIRING] = cost.get(ScrapType.WIRING, 0) + amount
            elif "PLATES" in color_str: cost[ScrapType.PLATES] = cost.get(ScrapType.PLATES, 0) + amount
        except ValueError:
            try:
                amount = int(part[:-1])
                color = part[-1]
                if color == 'R': cost[ScrapType.PARTS] = cost.get(ScrapType.PARTS, 0) + amount
                elif color == 'B': cost[ScrapType.WIRING] = cost.get(ScrapType.WIRING, 0) + amount
                elif color == 'G': cost[ScrapType.PLATES] = cost.get(ScrapType.PLATES, 0) + amount
            except Exception: print(f"Warning: Could not parse cost part '{part}'"); continue
    return cost

def _parse_effect_tags(tags_str: str) -> List[str]:
    if not tags_str or tags_str == '-': return []
    return [tag.strip().upper() for tag in tags_str.split(';')]


def _parse_threat_template(row: Dict[str, str]) -> Dict[str, Any]:
    """
    Parses a CSV row dictionary into a ThreatCard template dictionary.
    """
    template = {
        "name": row['Name'],
        "era": int(row['Era']),
        "lure_type": row['Lure'],
        "ferocity": int(row['Parts']),
        "cunning": int(row['Wiring']),
        "mass": int(row['Plates']),
        "abilities_text": row['Abilities'],
        "trophy_value": _parse_scrap_string(row['Spoil']),
        "player_count_min": int(row['PlayerCount']),
        "resistant": [],
        "immune": [],
        "on_fail_effect": None
    }

    tags = _parse_effect_tags(row['EffectTags'])
    
    # --- FIX: Removed buggy block that cross-checked with ArsenalEffect ---

    for tag in tags:
        try:
            if tag.startswith("RESIST:"):
                color = tag.split(':', 1)[1]
                if color == "ALL":
                    template["resistant"] = [ScrapType.PARTS, ScrapType.WIRING, ScrapType.PLATES]
                else:
                    template["resistant"].append(ScrapType(color))
            
            elif tag.startswith("IMMUNE:"):
                color = tag.split(':', 1)[1]
                if color == "ALL":
                    template["immune"] = [ScrapType.PARTS, ScrapType.WIRING, ScrapType.PLATES]
                else:
                    template["immune"].append(ScrapType(color))
            
            elif tag.startswith("ON_FAIL:"):
                effect_name = tag.split(':', 1)[1]
                template["on_fail_effect"] = OnFailEffect(effect_name)
        
        except Exception as e:
            print(f"Warning: Could not parse tag '{tag}' for Threat '{row['Name']}'. Error: {e}")

    return template

def _parse_upgrade_template(row: Dict[str, str]) -> Dict[str, Any]:
    """Parses a CSV row dictionary into an UpgradeCard template dictionary."""
    template = {
        "name": row['Name'],
        "cost": _parse_scrap_string(row['Cost']),
        "effect_text": row['Effect'],
        "copies": int(row['Copies']),
        "defense_boost": {},
        "defense_piercing": {},
        "special_effect_id": None
    }
    
    tags = _parse_effect_tags(row['EffectTags'])
    
    if tags:
        template["special_effect_id"] = row['EffectTags'].strip().upper()

    for tag in tags:
        try:
            parts = tag.split(':')
            if parts[0] == "DEFENSE":
                color = parts[1]
                amount = int(parts[2])
                if color == "ALL":
                    template["defense_boost"] = {ScrapType.PARTS: amount, ScrapType.WIRING: amount, ScrapType.PLATES: amount}
                else:
                    template["defense_boost"][ScrapType(color)] = amount
            
            elif parts[0] == "DEFENSE_PIERCING":
                color = parts[1]
                amount = int(parts[2])
                template["defense_piercing"][ScrapType(color)] = amount
            
            elif tag == "SCRAP_IGNORE_RESIST:PARTS":
                template["special_effect_id"] = UpgradeEffect.SCRAP_IGNORE_RESIST_PARTS
            elif tag == "SCRAP_IGNORE_RESIST:WIRING":
                template["special_effect_id"] = UpgradeEffect.SCRAP_IGNORE_RESIST_WIRING
            elif tag == "SCRAP_IGNORE_RESIST:PLATES":
                template["special_effect_id"] = UpgradeEffect.SCRAP_IGNORE_RESIST_PLATES
            elif tag == "SCRAP_BONUS:PARTS:1":
                template["special_effect_id"] = UpgradeEffect.SCRAP_BONUS_PARTS_1
            elif tag == "SCRAP_BONUS:WIRING:1":
                template["special_effect_id"] = UpgradeEffect.SCRAP_BONUS_WIRING_1
            elif tag == "SCRAP_BONUS:PLATES:1":
                template["special_effect_id"] = UpgradeEffect.SCRAP_BONUS_PLATES_1
        
        except Exception as e:
            print(f"Warning: Could not parse tag '{tag}' for Upgrade '{row['Name']}'. Error: {e}")
            
    return template

def _parse_arsenal_template(row: Dict[str, str]) -> Dict[str, Any]:
    """Parses a CSV row dictionary into an ArsenalCard template dictionary."""
    template = {
        "name": row['Name'],
        "cost": _parse_scrap_string(row['Cost']),
        "effect_text": row['Effect'],
        "charges": int(row['Charges']) if row['Charges'] else None,
        "copies": int(row['Copies']),
        "defense_boost": {},
        "special_effect_id": None
    }
    
    tags = _parse_effect_tags(row['EffectTags'])

    if tags:
        is_simple_defense = all(t.startswith("DEFENSE:") for t in tags)
        
        if not is_simple_defense:
            template["special_effect_id"] = tags[0] 
            try:
                ArsenalEffect(tags[0])
            except ValueError:
                print(f"Warning: Tag '{tags[0]}' for Arsenal '{row['Name']}' is not a defined ArsenalEffect.")

    for tag in tags:
        try:
            parts = tag.split(':')
            if parts[0] == "DEFENSE":
                color = parts[1]
                amount = int(parts[2])
                if color == "ALL":
                    template["defense_boost"] = {ScrapType.PARTS: amount, ScrapType.WIRING: amount, ScrapType.PLATES: amount}
                else:
                    template["defense_boost"][ScrapType(color)] = amount
        except Exception as e:
            print(f"Warning: Could not parse tag '{tag}' for Arsenal '{row['Name']}'. Error: {e}")
            
    return template


# --- Public Deck Creation Functions ---

def create_threat_deck(player_count: int) -> List[ThreatCard]:
    """
    Creates the combined Threat Deck for all 3 Eras,
    in order (Era 1, then Era 2, then Era 3).
    """
    all_rows = _load_card_templates(THREAT_CARDS_CSV)
    
    all_templates = []
    for row in all_rows:
        try:
            template = _parse_threat_template(row)
            if template["player_count_min"] <= player_count:
                all_templates.append(template)
        except Exception as e:
            print(f"Error parsing threat row: {row}. Error: {e}")
            continue
            
    era_templates: Dict[int, List[Dict]] = {1: [], 2: [], 3: []}
    for t in all_templates:
        if t['era'] in era_templates:
            era_templates[t['era']].append(t)
            
    # --- FIX: Build deck in correct Era order ---
    era_1_deck = []
    era_2_deck = []
    era_3_deck = []
    
    num_cards_per_era = player_count * CARDS_PER_ERA_PER_PLAYER
    
    for era, deck_to_fill in [(1, era_1_deck), (2, era_2_deck), (3, era_3_deck)]:
        templates = era_templates[era]
        
        # --- Shuffle *before* sampling ---
        random.shuffle(templates)
        
        if len(templates) < num_cards_per_era:
            print(f"Warning: Era {era} has {len(templates)} cards, but {num_cards_per_era} are needed. Using all.")
            era_deck_templates = templates
        else:
            era_deck_templates = templates[:num_cards_per_era]
        
        deck_to_fill.extend(_create_cards(ThreatCard, era_deck_templates))
        
    # Combine the decks in order
    return era_1_deck + era_2_deck + era_3_deck

def create_upgrade_deck() -> List[UpgradeCard]:
    all_rows = _load_card_templates(UPGRADE_CARDS_CSV)
    card_template_list = []
    for row in all_rows:
        try:
            template = _parse_upgrade_template(row)
            copies = template.pop("copies", 1)
            for _ in range(copies):
                card_template_list.append(template)
        except Exception as e:
            print(f"Error parsing upgrade row: {row}. Error: {e}")
            continue
    deck = _create_cards(UpgradeCard, card_template_list)
    random.shuffle(deck)
    return deck

def create_arsenal_deck() -> List[ArsenalCard]:
    all_rows = _load_card_templates(ARSENAL_CARDS_CSV)
    card_template_list = []
    for row in all_rows:
        try:
            template = _parse_arsenal_template(row)
            copies = template.pop("copies", 1)
            for _ in range(copies):
                card_template_list.append(template)
        except Exception as e:
            print(f"Error parsing arsenal row: {row}. Error: {e}")
            continue
    deck = _create_cards(ArsenalCard, card_template_list)
    random.shuffle(deck)
    return deck


# --- Initial Hand Creation ---

def create_initial_lure_cards() -> List[LureCard]:
    """Creates the 3 starting Lure cards for a player."""
    templates = [
        {"name": "Bloody Rags", "lure_type": ScrapType.PARTS, "strength": 1},
        {"name": "Strange Noises", "lure_type": ScrapType.WIRING, "strength": 2},
        {"name": "Fallen Fruit", "lure_type": ScrapType.PLATES, "strength": 3},
    ]
    return _create_cards(LureCard, templates)

def create_initial_action_cards() -> List[SurvivorActionCard]:
    """Creates the 4 starting Action cards for a player."""
    templates = [
        {"name": "Scavenge"},
        {"name": "Fortify"},
        {"name": "Armory Run"},
        {"name": "Scheme"},
    ]
    return _create_cards(SurvivorActionCard, templates)