"""
Parses the game rules to create the initial decks of cards.
This is kept separate to be testable and to keep models.py clean.

v1.8 Refactor:
- All card templates completely rebuilt from v1.8 rulebook.
- create_threat_deck() now creates 5 cards per player per Era.
- create_threat_deck() parses 'resistant' and 'immune' fields.
- create_upgrade_deck() and create_arsenal_deck() built from v1.8 manifest.
- ---
- CRITICAL FIX: threat_templates_raw and upgrade templates_raw
- were updated to match the v1.8 Rulebook Manifest. The previous
- data was from an older version.
"""

from typing import List, Dict, Any
from .game_models import (
    ScrapType, LureCard, ThreatCard, UpgradeCard, ArsenalCard
)
import random
import uuid

# A helper function to create multiple copies of cards with unique IDs
def _create_cards(card_class, card_template_list):
    deck = []
    for template in card_template_list:
        # Create a new card instance from the template dict, ensuring a new UUID
        deck.append(card_class(id=str(uuid.uuid4()), **template))
    return deck

def _parse_cost(cost_str: str) -> Dict[ScrapType, int]:
    """
    Parses cost string like '2 Red, 1 Blue', '1G', or '2G, 2B'
    This is now a module-level function.
    """
    cost = {}
    parts = [p.strip() for p in cost_str.split(',')]
    c_map = {
        "Red": ScrapType.PARTS, "R": ScrapType.PARTS,
        "Blue": ScrapType.WIRING, "B": ScrapType.WIRING,
        "Green": ScrapType.PLATES, "G": ScrapType.PLATES,
    }
    
    if "any" in cost_str:
        # v1.8 rulebook doesn't use "of any"
        pass
        
    if "of each" in cost_str:
        # Handle "1 of each" or "2 of each"
        val = int(cost_str.split(' ')[0])
        cost[ScrapType.PARTS] = val
        cost[ScrapType.WIRING] = val
        cost[ScrapType.PLATES] = val
        return cost

    for part in parts:
        try:
            val_str, type_str = part.split(' ', 1)
            val = int(val_str)
            sc_type = c_map[type_str]
            cost[sc_type] = val
        except (ValueError, KeyError):
            # Try parsing '2B', '1G'
            try:
                val = int(part[:-1])
                sc_type = c_map[part[-1]]
                cost[sc_type] = val
            except (ValueError, KeyError, IndexError):
                print(f"Warning: Could not parse cost string part '{part}'")
                
    return cost

def create_threat_deck(num_players: int) -> List[ThreatCard]:
    """
    Creates the shuffled 3-era threat deck.
    [Source 28] 5 cards per player per Era.
    """
    
    ERA_MAP = {
        "Day": 1,
        "Twilight": 2,
        "Night": 3
    }
    
    # --- CRITICAL FIX: Updated manifest to match v1.8 Rulebook ---
    # [Source: Rulebook "Card Manifest (v1.8)"]
    # fmt: off
    threat_templates_raw = [
        # --- ERA 1 (Day) ---
        {"name": "Young Boar", "era": "Day", "lure": "BLOODY_RAGS", "stats": "6/3/3", "spoil": "3 Red"},
        {"name": "Scrabbling Piglet", "era": "Day", "lure": "STRANGE_NOISES", "stats": "3/5/3", "spoil": "3 Blue"},
        {"name": "Hefty Swine", "era": "Day", "lure": "FALLEN_FRUIT", "stats": "3/3/6", "spoil": "3 Green"},
        {"name": "Territorial Sow", "era": "Day", "lure": "BLOODY_RAGS", "stats": "7/4/4", "spoil": "2 Red, 1 Green"},
        {"name": "Rooting Digger", "era": "Day", "lure": "FALLEN_FRUIT", "stats": "4/4/7", "spoil": "2 Green, 1 Red"},
        {"name": "Cunning Runt", "era": "Day", "lure": "STRANGE_NOISES", "stats": "4/7/4", "spoil": "2 Blue, 1 Green"},
        
        # --- ERA 2 (Twilight) ---
        {"name": "Stalker Pig", "era": "Twilight", "lure": "STRANGE_NOISES", "stats": "5/9/5", "spoil": "4 Blue", "resistant": "B"},
        {"name": "Feral Sow", "era": "Twilight", "lure": "BLOODY_RAGS", "stats": "10/6/6", "spoil": "4 Red", "resistant": "R"},
        {"name": "Crushing Tusker", "era": "Twilight", "lure": "FALLEN_FRUIT", "stats": "6/5/10", "spoil": "4 Green", "resistant": "G", "on_fail": "GAIN_INJURY"},
        {"name": "Vicious Hunter", "era": "Twilight", "lure": "BLOODY_RAGS", "stats": "11/8/7", "spoil": "3 Red, 1 Blue", "resistant": "R", "on_fail": "DISCARD_SCRAP"},
        {"name": "Saboteur Pig", "era": "Twilight", "lure": "STRANGE_NOISES", "stats": "7/12/8", "spoil": "3 Blue, 1 Red", "resistant": "B, R"}, # Rulebook has "R: Red", assuming "resistant: R"
        {"name": "Corrosive Pig", "era": "Twilight", "lure": "FALLEN_FRUIT", "stats": "8/7/12", "spoil": "3 Green, 1 Blue", "resistant": "G, B", "on_fail": "DISCARD_SCRAP"}, # Rulebook has "R: Blue"
        
        # --- ERA 3 (Night) ---
        {"name": "Alpha Razorback", "era": "Night", "lure": "BLOODY_RAGS", "stats": "15/10/10", "spoil": "4 Red, 2 Blue", "resistant": "R, B, G", "immune": "B", "on_fail": "PREVENT_ACTION"}, # Rulebook "R: All"
        {"name": "The Unseen", "era": "Night", "lure": "STRANGE_NOISES", "stats": "10/16/10", "spoil": "4 Blue, 2 Green", "resistant": "R, B, G", "immune": "G", "on_fail": "GIVE_SCRAP"}, # Rulebook "R: All"
        {"name": "Juggernaut", "era": "Night", "lure": "FALLEN_FRUIT", "stats": "10/10/17", "spoil": "4 Green, 2 Red", "resistant": "R, B, G", "immune": "R", "on_fail": "GAIN_INJURY"}, # Rulebook "R: All"
        {"name": "Blood Frenzy", "era": "Night", "lure": "BLOODY_RAGS", "stats": "18/12/12", "spoil": "5 Red", "resistant": "R, G"},
        {"name": "Night Terror", "era": "Night", "lure": "STRANGE_NOISES", "stats": "12/19/12", "spoil": "5 Blue", "resistant": "B, R", "on_fail": "PREVENT_ACTION"},
        {"name": "Ancient Guardian", "era": "Night", "lure": "FALLEN_FRUIT", "stats": "14/14/20", "spoil": "5 Green", "resistant": "G, B"},
    ]
    # fmt: on

    # Helper to parse R/G/B strings
    def _parse_res_imm(code_str: str) -> List[ScrapType]:
        types = []
        if not code_str: return types
        code_str = code_str.upper()
        if "R" in code_str: types.append(ScrapType.PARTS)
        if "B" in code_str: types.append(ScrapType.WIRING)
        if "G" in code_str: types.append(ScrapType.PLATES)
        return types
        
    era1_templates, era2_templates, era3_templates = [], [], []
    
    for t in threat_templates_raw:
        stats = [int(s) for s in t["stats"].split('/')]
        
        template = {
            "name": t["name"],
            "era": ERA_MAP.get(t["era"], 1),
            "lure": LureCard(t["lure"]),
            "ferocity": stats[0],
            "cunning": stats[1],
            "mass": stats[2],
            "spoil": _parse_cost(t["spoil"]),
            "resistant": _parse_res_imm(t.get("resistant", "")),
            "immune": _parse_res_imm(t.get("immune", "")),
            "on_fail": t.get("on_fail", None),
        }
        
        if template["era"] == 1:
            era1_templates.append(template)
        elif template["era"] == 2:
            era2_templates.append(template)
        elif template["era"] == 3:
            era3_templates.append(template)
            
    # [Source 28] 5 cards per player per Era
    cards_per_era = 5 * num_players
    
    # Rule [Source 28] says "5 cards per player", but manifest
    # only has 6 unique cards per era. This implies we MUST
    # sample WITH REPLACEMENT to fulfill, e.g., a 3-player game (15 cards).
    def _get_era_sample(templates: List[Dict], count: int) -> List[Dict]:
        if not templates:
            return []
        return random.choices(templates, k=count)


    # Shuffle each era deck separately
    era1_cards = _create_cards(ThreatCard, _get_era_sample(era1_templates, cards_per_era))
    era2_cards = _create_cards(ThreatCard, _get_era_sample(era2_templates, cards_per_era))
    era3_cards = _create_cards(ThreatCard, _get_era_sample(era3_templates, cards_per_era))
    
    random.shuffle(era1_cards)
    random.shuffle(era2_cards)
    random.shuffle(era3_cards)
    
    # Stack the decks in order (Day on top)
    # [Source 3]
    deck = era1_cards + era2_cards + era3_cards
    
    return deck


def create_upgrade_deck() -> List[UpgradeCard]:
    """
    Creates the shuffled Upgrade deck.
    [Source: Rulebook "Card Manifest (v1.8)"]
    """
    
    # --- CRITICAL FIX: Updated manifest to match v1.8 Rulebook ---
    # fmt: off
    templates_raw = [
        # --- Scrap Build ---
        {"name": "Piercing Jaws", "cost": "2 Red, 1 Blue", "effect": "Your Red Scrap ignores the Resistant keyword.", "id": "PIERCING_JAWS", "copies": 1}, # Assuming 1 copy each unless specified
        {"name": "Serrated Parts", "cost": "3 Red, 1G", "effect": "Your Red Scrap provides +1 defense. (Stacks with base value).", "id": "SERRATED_PARTS", "copies": 1},
        {"name": "Focused Wiring", "cost": "2 Blue, 1 Red", "effect": "Your Blue Scrap ignores the Resistant keyword.", "id": "FOCUSED_WIRING", "copies": 1},
        {"name": "High-Voltage Wire", "cost": "3 Blue, 1G", "effect": "Your Blue Scrap provides +1 defense.", "id": "HIGH_VOLTAGE_WIRE", "copies": 1},
        {"name": "Reinforced Plating", "cost": "2 Green, 1R", "effect": "Your Green Scrap ignores the Resistant keyword.", "id": "REINFORCED_PLATING", "copies": 1},
        {"name": "Layered Plating", "cost": "3 Green, 1B", "effect": "Your Green Scrap provides +1 defense.", "id": "LAYERED_PLATING", "copies": 1},
        
        # --- Base Build ---
        {"name": "Scrap Plating", "cost": "3 Green", "effect": "Gain +1 permanent Red defense.", "def_boost": {ScrapType.PARTS: 1}, "copies": 1},
        {"name": "Tripwire", "cost": "3 Green", "effect": "Gain +1 permanent Blue defense.", "def_boost": {ScrapType.WIRING: 1}, "copies": 1},
        {"name": "Reinforced Post", "cost": "3 Green", "effect": "Gain +1 permanent Green defense.", "def_boost": {ScrapType.PLATES: 1}, "copies": 1},
        {"name": "Fortified Bunker", "cost": "6 Green", "effect": "Gain +1 permanent defense to all stats.", "def_boost": {ScrapType.PARTS: 1, ScrapType.WIRING: 1, ScrapType.PLATES: 1}, "copies": 1},
        
        # --- Utility ---
        {"name": "Tinker's Bench", "cost": "2G, 2B", "effect": "Once per round, you may trade 1 Scrap for 1 Scrap of your choice.", "id": "TINKERS_BENCH", "copies": 1},
        {"name": "Scavenger's Eye", "cost": "4G, 1B", "effect": "Your Scavenge action now lets you choose 3 Scrap instead of 2.", "id": "SCAVENGERS_EYE", "copies": 1},
        {"name": "Scrap Sieve", "cost": "2 of each", "effect": "When you gain Scrap from Scavenge or a pig's Spoil, gain 1 additional Scrap of your choice.", "id": "SCRAP_SIEVE", "copies": 1},
        {"name": "Scrap Repeater", "cost": "3R, 1B", "effect": "Artifact. Gain +4 permanent Red defense. At the start of the Cleanup Phase, you must pay 1 Red Scrap. If you cannot, destroy this.", "def_boost": {ScrapType.PARTS: 4}, "id": "SCRAP_REPEATER", "copies": 1},
    ]
    # fmt: on

    # Note: The rulebook doesn't specify copy counts for Upgrades,
    # unlike the previous data. The dev notes for v1.7 mention 40 cards.
    # The list above is 14 cards.
    # I will assume 3 copies of each "Scrap/Base Build" and 2 of "Utility"
    # to approximate a deck of 40 (10*3 + 4*2 = 38).
    
    templates = []
    for t in templates_raw:
        new_template = {
            "name": t["name"],
            "cost": _parse_cost(t["cost"]),
            "effect": t["effect"],
            "defense_boost": t.get("def_boost", {}),
            "special_effect_id": t.get("id", None),
        }
        
        # --- FIX: Apply assumed copy counts ---
        copies = t.get("copies", 1) # Get from manifest if present
        if copies == 1: # If not present, use our assumption
            if t["name"] in ["Tinker's Bench", "Scavenger's Eye", "Scrap Sieve", "Scrap Repeater"]:
                copies = 2
            else:
                copies = 3
        
        for _ in range(copies):
            templates.append(new_template)
            
    deck = _create_cards(UpgradeCard, templates)
    random.shuffle(deck)
    return deck


def create_arsenal_deck() -> List[ArsenalCard]:
    """
    Creates the shuffled Arsenal deck.
    [Source: Rulebook "Card Manifest (v1.8)"]
    """
    
    # This manifest was already correct.
    # fmt: off
    templates_raw = [
        # --- Defensive (Multi-Use) ---
        {"name": "Scrap Shield", "cost": "2 Red", "effect": "Gain +7 Red defense. 2 Charges.", "def_boost": {ScrapType.PARTS: 7}, "charges": 2, "copies": 1},
        {"name": "Caltrops", "cost": "2 Blue", "effect": "Gain +7 Blue defense. 2 Charges.", "def_boost": {ScrapType.WIRING: 7}, "charges": 2, "copies": 1},
        {"name": "Brace", "cost": "2 Green", "effect": "Gain +7 Green defense. 2 Charges.", "def_boost": {ScrapType.PLATES: 7}, "charges": 2, "copies": 1},
        
        # --- Offensive (Conditional) ---
        {"name": "Recycler-Net", "cost": "3 Blue, 1R", "effect": "Gain +9 Blue defense. On Kill: Return to hand.", "def_boost": {ScrapType.WIRING: 9}, "id": "RECYCLER_NET", "copies": 1},
        {"name": "Boar Spear", "cost": "3 Red, 1B", "effect": "Gain +9 Red defense. On Kill: Return to hand.", "def_boost": {ScrapType.PARTS: 9}, "id": "BOAR_SPEAR", "copies": 1},
        
        # --- Utility (One-Use) ---
        {"name": "Adrenaline", "cost": "2 Blue", "effect": "Play after you FAIL to ignore all consequences.", "id": "ADRENALINE", "copies": 1},
        {"name": "Lure to Weakness", "cost": "2B, 1R", "effect": "Play during Defense. Choose one of your Threat's non-highest stats. For this turn, that stat is the target for the Kill calculation.", "id": "LURE_TO_WEAKNESS", "copies": 1},
        {"name": "Corrosive Sludge", "cost": "2B, 2G", "effect": "Play during Defense. Choose one stat on your Threat. That stat loses Resistant and Immune for this defense.", "id": "CORROSIVE_SLUDGE", "copies": 1},
        {"name": "Makeshift Amp", "cost": "2 of each", "effect": "Pay X additional Scrap of any one type. Gain +X defense for that type. This defense value is not affected by Resistance or Immunity.", "id": "MAKESHIFT_AMP", "copies": 1},
    ]
    # fmt: on
    
    # Note: Rulebook says 30 Arsenal cards. This is 9 unique cards.
    # I will assume 3 copies of each, +3 extra of the basic shield/caltrops/brace
    # 9 * 3 = 27. Let's make it 3 copies of utility/offensive (6*3=18)
    # and 4 copies of defensive (3*4=12). 18+12=30.
    
    templates = []
    for t in templates_raw:
        new_template = {
            "name": t["name"],
            "cost": _parse_cost(t["cost"]),
            "effect": t["effect"],
            "defense_boost": t.get("def_boost", {}),
            "special_effect_id": t.get("id", None),
            "charges": t.get("charges", None)
        }
        
        # --- FIX: Apply assumed copy counts ---
        copies = t.get("copies", 1)
        if copies == 1: # If not specified, use our assumption
            if t["name"] in ["Scrap Shield", "Caltrops", "Brace"]:
                copies = 4
            else:
                copies = 3
        
        for _ in range(copies):
            templates.append(new_template)
            
    deck = _create_cards(ArsenalCard, templates)
    random.shuffle(deck)
    return deck
