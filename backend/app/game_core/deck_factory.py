"""
Parses card data from CSV files to create the initial decks.
This is kept separate to be testable and to keep models.py clean.

v1.9 Refactor:
- All `..._templates_raw` lists have been removed.
- Card data is now loaded from CSV files in `game_core/data/`.
- Added new helper functions:
  - `_load_card_templates` to read CSVs.
  - `_parse_scrap_string` (renamed from _parse_cost) to handle costs/spoils.
  - `_parse_effect_tags` a generic tag parser.
  - `_parse_threat_template` to map CSV row to ThreatCard fields.
  - `_parse_upgrade_template` to map CSV row to UpgradeCard fields.
  - `_parse_arsenal_template` to map CSV row to ArsenalCard fields.
- `create_..._deck` functions now use this new loading/parsing pipeline.
- Logic now populates new structured fields like `on_fail_effect`.
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
# Define the path to the data directory, relative to this file
DATA_DIR = os.path.join(os.path.dirname(__file__), 'data')
THREAT_CARDS_CSV = os.path.join(DATA_DIR, 'threat_cards.csv')
UPGRADE_CARDS_CSV = os.path.join(DATA_DIR, 'upgrade_cards.csv')
ARSENAL_CARDS_CSV = os.path.join(DATA_DIR, 'arsenal_cards.csv')

CARDS_PER_ERA_PER_PLAYER = 5

# --- Factory Helpers ---

def _create_cards(card_class: Type[Card], card_template_list: List[Dict]) -> List[Card]:
    """
    Creates multiple card instances from a list of template dictionaries.
    Ensures each card gets a new, unique UUID.
    """
    deck = []
    for template in card_template_list:
        # Create a new card instance from the template dict, ensuring a new UUID
        deck.append(card_class(id=str(uuid.uuid4()), **template))
    return deck

def _load_card_templates(csv_filepath: str) -> List[Dict]:
    """Loads all rows from a CSV file into a list of dictionaries."""
    if not os.path.exists(csv_filepath):
        raise FileNotFoundError(f"Card data file not found: {csv_filepath}. Make sure it is in the 'game_core/data' directory.")
        
    with open(csv_filepath, mode='r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        return [row for row in reader]

def _parse_scrap_string(cost_str: str) -> Dict[ScrapType, int]:
    """
    Parses cost/spoil string like '2 PARTS, 1 WIRING', '1G', or '2 of each'.
    """
    if not cost_str or cost_str == '-':
        return {}
        
    cost_str = cost_str.strip().upper()
    cost = {}

    if "OF EACH" in cost_str:
        try:
            amount = int(cost_str.split()[0])
            return {ScrapType.PARTS: amount, ScrapType.WIRING: amount, ScrapType.PLATES: amount}
        except ValueError:
            return {} # Invalid format

    parts = cost_str.split(',')
    for part in parts:
        part = part.strip()
        try:
            amount_str, color_str = part.split(maxsplit=1)
            amount = int(amount_str)
            if "PARTS" in color_str:
                cost[ScrapType.PARTS] = cost.get(ScrapType.PARTS, 0) + amount
            elif "WIRING" in color_str:
                cost[ScrapType.WIRING] = cost.get(ScrapType.WIRING, 0) + amount
            elif "PLATES" in color_str:
                cost[ScrapType.PLATES] = cost.get(ScrapType.PLATES, 0) + amount
        except ValueError:
            # Handle single-letter format like "2R"
            try:
                amount = int(part[:-1])
                color = part[-1]
                if color == 'R':
                    cost[ScrapType.PARTS] = cost.get(ScrapType.PARTS, 0) + amount
                elif color == 'B':
                    cost[ScrapType.WIRING] = cost.get(ScrapType.WIRING, 0) + amount
                elif color == 'G':
                    cost[ScrapType.PLATES] = cost.get(ScrapType.PLATES, 0) + amount
            except Exception:
                print(f"Warning: Could not parse cost part '{part}'")
                continue
    return cost

def _parse_effect_tags(tags_str: str) -> List[str]:
    """Splits a tag string (e.g., "TAG1;TAG2") into a list."""
    if not tags_str:
        return []
    return [tag.strip().upper() for tag in tags_str.split(';')]

def _parse_threat_template(row: Dict[str, str]) -> Dict[str, Any]:
    """
    Parses a CSV row dictionary into a ThreatCard template dictionary.
    This is where "tags and numbers" are converted to structured data.
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
        "player_count_min": int(row['PlayerCount']), # For filtering
        
        # Initialize structured fields
        "resistant": [],
        "immune": [],
        "on_fail_effect": None
    }

    tags = _parse_effect_tags(row['EffectTags'])

    special_tag = None
    for tag in tags:
        if not tag.startswith("DEFENSE:"):
            special_tag = tag
            break # Found the special tag

    if special_tag:
        template["special_effect_id"] = special_tag
        try:
            ArsenalEffect(special_tag)
        except ValueError:
            print(f"Warning: Tag '{special_tag}' for Arsenal '{row['Name']}' is not a defined ArsenalEffect.")

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
        "copies": int(row['Copies']), # For deck building
        
        # Initialize structured fields
        "defense_boost": {},
        "defense_piercing": {},
        "special_effect_id": None
    }
    
    tags = _parse_effect_tags(row['EffectTags'])
    
    # Use the full tag string as the special_effect_id for most logic
    if tags:
        template["special_effect_id"] = row['EffectTags']

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
                
            # Other tags are handled by the special_effect_id in game logic
        
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
        "copies": int(row['Copies']), # For deck building
        
        # Initialize structured fields
        "defense_boost": {},
        "special_effect_id": None
    }
    
    tags = _parse_effect_tags(row['EffectTags'])

    # Use the first tag as the special_effect_id
    # (or the full string if it's complex)
    if tags:
        # For simple defense, we don't need a special_effect_id
        # For special cards, we do.
        is_simple_defense = all(t.startswith("DEFENSE:") for t in tags)
        
        if not is_simple_defense:
            # Use the *first* tag as the ID for logic
            template["special_effect_id"] = tags[0] 
            # e.g., "ON_KILL:RETURN_TO_HAND", "ON_FAIL:IGNORE_CONSEQUENCES", "SPECIAL:LURE_TO_WEAKNESS"
            
            # Verify it's a known ArsenalEffect
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
            
            # Other tags are handled by special_effect_id in game logic
        
        except Exception as e:
            print(f"Warning: Could not parse tag '{tag}' for Arsenal '{row['Name']}'. Error: {e}")
            
    return template


# --- Public Deck Creation Functions ---

def create_threat_deck(player_count: int) -> List[ThreatCard]:
    """
    Creates the combined Threat Deck for all 3 Eras.
    Loads from CSV, filters by player count, then samples
    (player_count * 5) cards from each Era.
    """
    
    # 1. Load all card templates from CSV
    all_rows = _load_card_templates(THREAT_CARDS_CSV)
    
    # 2. Parse and Filter templates
    all_templates = []
    for row in all_rows:
        try:
            template = _parse_threat_template(row)
            # Filter out cards not for this player count
            if template["player_count_min"] <= player_count:
                all_templates.append(template)
        except Exception as e:
            print(f"Error parsing threat row: {row}. Error: {e}")
            continue
            
    # 3. Group templates by Era
    era_templates: Dict[int, List[Dict]] = {1: [], 2: [], 3: []}
    for t in all_templates:
        if t['era'] in era_templates:
            era_templates[t['era']].append(t)
            
    # 4. Sample and build the deck
    deck = []
    num_cards_per_era = player_count * CARDS_PER_ERA_PER_PLAYER
    
    for era in [1, 2, 3]:
        templates = era_templates[era]
        if len(templates) < num_cards_per_era:
            # This is a fallback in case the CSV doesn't have enough cards
            print(f"Warning: Era {era} has {len(templates)} unique cards, but {num_cards_per_era} are needed. Using all available cards.")
            era_deck_templates = templates
        else:
            era_deck_templates = random.sample(templates, num_cards_per_era)
        
        # Create card instances
        deck.extend(_create_cards(ThreatCard, era_deck_templates))
        
    random.shuffle(deck)
    return deck

def create_upgrade_deck() -> List[UpgradeCard]:
    """Creates the shuffled Upgrade Deck from the CSV."""
    
    all_rows = _load_card_templates(UPGRADE_CARDS_CSV)
    card_template_list = []
    
    for row in all_rows:
        try:
            template = _parse_upgrade_template(row)
            copies = template.pop("copies", 1)
            
            # Add N copies to the list to be instantiated
            for _ in range(copies):
                card_template_list.append(template)
        except Exception as e:
            print(f"Error parsing upgrade row: {row}. Error: {e}")
            continue

    deck = _create_cards(UpgradeCard, card_template_list)
    random.shuffle(deck)
    return deck

def create_arsenal_deck() -> List[ArsenalCard]:
    """Creates the shuffled Arsenal Deck from the CSV."""
    
    all_rows = _load_card_templates(ARSENAL_CARDS_CSV)
    card_template_list = []
    
    for row in all_rows:
        try:
            template = _parse_arsenal_template(row)
            copies = template.pop("copies", 1)
            
            # Add N copies to the list to be instantiated
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