"""
Parses the game rules to create the initial decks of cards.
This is kept separate to be testable and to keep models.py clean.

v1.8 Refactor:
- All card templates completely rebuilt from v1.8 rulebook.
- create_threat_deck() now creates 5 cards per player per Era.
- create_threat_deck() parses 'resistant' and 'immune' fields.
- create_upgrade_deck() and create_arsenal_deck() built from v1.8 manifest.
"""

from typing import List, Dict, Any
from .models import ScrapType, LureCard, ThreatCard, UpgradeCard, ArsenalCard
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
    c_map = {"Red": ScrapType.PARTS, "R": ScrapType.PARTS,
             "Blue": ScrapType.WIRING, "B": ScrapType.WIRING,
             "Green": ScrapType.PLATES, "G": ScrapType.PLATES}
    
    for part in parts:
        if not part:
            continue
            
        if "of each" in part:
            try:
                count = int(part.split(' ')[0])
                return {ScrapType.PARTS: count, ScrapType.WIRING: count, ScrapType.PLATES: count}
            except ValueError:
                print(f"Warning: Could not parse 'of each' string '{part}'")
                continue

        try:
            count_str: str
            color_str: str
            
            if ' ' in part:
                # Format: "2 Red"
                count_str, color_str = part.split(' ', 1)
            else:
                # Format: "1G" or "10R"
                count_str = part[:-1]
                color_str = part[-1]
                
            if color_str in c_map:
                cost[c_map[color_str]] = int(count_str)
            else:
                print(f"Warning: Could not parse color '{color_str}' in cost string '{part}'")
                
        except ValueError:
            print(f"Warning: Could not parse cost string '{part}'")
    return cost

def _parse_resist_immune(ability_str: str) -> (List[ScrapType], List[ScrapType]):
    """Parses ability text for Resistance and Immunity."""
    resistant = []
    immune = []
    parts = [p.strip() for p in ability_str.split('.')]
    
    r_map = {"Red": ScrapType.PARTS, "Blue": ScrapType.WIRING, "Green": ScrapType.PLATES}
    
    for part in parts:
        if part.startswith("Resistant: ") or part.startswith("R: "):
            val = part.replace("Resistant: ", "").replace("R: ", "")
            if val == "All":
                resistant = [ScrapType.PARTS, ScrapType.WIRING, ScrapType.PLATES]
            elif val in r_map:
                resistant.append(r_map[val])
        
        if part.startswith("Immune: "):
            val = part.replace("Immune: ", "")
            if val in r_map:
                immune.append(r_map[val])

    # Immunity overrides resistance
    for i in immune:
        if i in resistant:
            resistant.remove(i)
            
    return resistant, immune

def _parse_spoil(spoil_str: str) -> Dict[ScrapType, int]:
    """Parses spoil text like '3 Red' or '2 Blue, 1 Green'."""
    if not spoil_str or spoil_str == "-":
        return {}
        
    spoil = {}
    parts = [p.strip() for p in spoil_str.split(',')]
    s_map = {"Red": ScrapType.PARTS, "Blue": ScrapType.WIRING, "Green": ScrapType.PLATES}
    
    for part in parts:
        try:
            count, color = part.split(' ')
            if color in s_map:
                spoil[s_map[color]] = int(count)
        except ValueError:
            print(f"Warning: Could not parse spoil string '{part}'")
            
    return spoil

def create_threat_deck(num_players: int) -> List[ThreatCard]:
    """Creates the full, shuffled threat deck based on the v1.8 rules."""
    
    # --- DAY THREATS (v1.8) ---
    day_templates_raw = [
        {"name": "Young Boar", "lure": LureCard.BLOODY_RAGS, "r": 6, "b": 3, "g": 3, "abil": "-", "spoil": "3 Red"},
        {"name": "Scrabbling Piglet", "lure": LureCard.STRANGE_NOISES, "r": 3, "b": 5, "g": 3, "abil": "-", "spoil": "3 Blue"},
        {"name": "Hefty Swine", "lure": LureCard.FALLEN_FRUIT, "r": 3, "b": 3, "g": 6, "abil": "-", "spoil": "3 Green"},
        {"name": "Territorial Sow", "lure": LureCard.BLOODY_RAGS, "r": 7, "b": 4, "g": 4, "abil": "-", "spoil": "2 Red, 1 Green"},
        {"name": "Rooting Digger", "lure": LureCard.FALLEN_FRUIT, "r": 4, "b": 4, "g": 7, "abil": "-", "spoil": "2 Green, 1 Red"},
        {"name": "Cunning Runt", "lure": LureCard.STRANGE_NOISES, "r": 4, "b": 7, "g": 4, "abil": "-", "spoil": "2 Blue, 1 Green"},
    ]
    
    # --- TWILIGHT THREATS (v1.8) ---
    twilight_templates_raw = [
        {"name": "Stalker Pig", "lure": LureCard.STRANGE_NOISES, "r": 5, "b": 9, "g": 5, "abil": "Resistant: Blue", "spoil": "4 Blue"},
        {"name": "Feral Sow", "lure": LureCard.BLOODY_RAGS, "r": 10, "b": 6, "g": 6, "abil": "Resistant: Red", "spoil": "4 Red"},
        {"name": "Crushing Tusker", "lure": LureCard.FALLEN_FRUIT, "r": 6, "b": 5, "g": 10, "abil": "Resistant: Green. On Fail: Gain 1 additional Injury.", "spoil": "4 Green"},
        {"name": "Vicious Hunter", "lure": LureCard.BLOODY_RAGS, "r": 11, "b": 8, "g": 7, "abil": "Resistant: Red. On Fail: Discard 1 Scrap.", "spoil": "3 Red, 1 Blue"},
        {"name": "Saboteur Pig", "lure": LureCard.STRANGE_NOISES, "r": 7, "b": 12, "g": 8, "abil": "Resistant: Blue, R: Red", "spoil": "3 Blue, 1 Red"},
        {"name": "Corrosive Pig", "lure": LureCard.FALLEN_FRUIT, "r": 8, "b": 7, "g": 12, "abil": "Resistant: Green, R: Blue. On Fail: Discard 1 Scrap.", "spoil": "3 Green, 1 Blue"},
    ]
    
    # --- NIGHT THREATS (v1.8) ---
    night_templates_raw = [
        {"name": "Alpha Razorback", "lure": LureCard.BLOODY_RAGS, "r": 15, "b": 10, "g": 10, "abil": "R: All, Immune: Blue. On Fail: You cannot perform your Action this round.", "spoil": "4 Red, 2 Blue"},
        {"name": "The Unseen", "lure": LureCard.STRANGE_NOISES, "r": 10, "b": 16, "g": 10, "abil": "R: All, Immune: Green. On Fail: You must give 1 Scrap to each other player.", "spoil": "4 Blue, 2 Green"},
        {"name": "Juggernaut", "lure": LureCard.FALLEN_FRUIT, "r": 10, "b": 10, "g": 17, "abil": "R: All, Immune: Red. On Fail: Gain 1 additional Injury.", "spoil": "4 Green, 2 Red"},
        {"name": "Blood Frenzy", "lure": LureCard.BLOODY_RAGS, "r": 18, "b": 12, "g": 12, "abil": "R: Red, R: Green", "spoil": "5 Red"},
        {"name": "Night Terror", "lure": LureCard.STRANGE_NOISES, "r": 12, "b": 19, "g": 12, "abil": "R: Blue, R: Red. On Fail: You cannot perform your Action this round.", "spoil": "5 Blue"},
        {"name": "Ancient Guardian", "lure": LureCard.FALLEN_FRUIT, "r": 14, "b": 14, "g": 20, "abil": "R: Green, R: Blue", "spoil": "5 Green"},
    ]

    def _process_templates(templates, era):
        processed = []
        for t in templates:
            r, i = _parse_resist_immune(t["abil"])
            processed.append({
                "name": t["name"],
                "era": era,
                "lure": t["lure"],
                "ferocity": t["r"],
                "cunning": t["b"],
                "mass": t["g"],
                "ability": t["abil"],
                "spoil": _parse_spoil(t["spoil"]),
                "resistant": r,
                "immune": i
            })
        return processed

    day_templates = _process_templates(day_templates_raw, "Day")
    twilight_templates = _process_templates(twilight_templates_raw, "Twilight")
    night_templates = _process_templates(night_templates_raw, "Night")
    
    # Rule 3: 5 cards per player from each deck
    cards_per_era = num_players * 5

    # Create full decks by cycling templates, then shuffle
    day_deck_full = []
    while len(day_deck_full) < cards_per_era:
        day_deck_full.extend(_create_cards(ThreatCard, day_templates))
    random.shuffle(day_deck_full)
    day_deck = day_deck_full[:cards_per_era]
    
    twilight_deck_full = []
    while len(twilight_deck_full) < cards_per_era:
        twilight_deck_full.extend(_create_cards(ThreatCard, twilight_templates))
    random.shuffle(twilight_deck_full)
    twilight_deck = twilight_deck_full[:cards_per_era]
    
    night_deck_full = []
    while len(night_deck_full) < cards_per_era:
        night_deck_full.extend(_create_cards(ThreatCard, night_templates))
    random.shuffle(night_deck_full)
    night_deck = night_deck_full[:cards_per_era]
    
    # Stack them as per rules: Day on top, then Twilight, then Night
    return day_deck + twilight_deck + night_deck

def create_upgrade_deck() -> List[UpgradeCard]:
    """Creates the full, shuffled upgrade deck (40 cards, v1.8)."""
    
    # _parse_cost function removed from here
    
    templates_raw = [
        # Scrap Build
        {"name": "Piercing Jaws", "cost": "2 Red, 1 Blue", "effect": "Your Red Scrap ignores the Resistant keyword.", "id": "PIERCING_JAWS"},
        {"name": "Serrated Parts", "cost": "3 Red, 1G", "effect": "Your Red Scrap provides +1 defense.", "id": "SERRATED_PARTS"},
        {"name": "Focused Wiring", "cost": "2 Blue, 1 Red", "effect": "Your Blue Scrap ignores the Resistant keyword.", "id": "FOCUSED_WIRING"},
        {"name": "High-Voltage Wire", "cost": "3 Blue, 1G", "effect": "Your Blue Scrap provides +1 defense.", "id": "HIGH_VOLTAGE_WIRE"},
        {"name": "Reinforced Plating", "cost": "2 Green, 1R", "effect": "Your Green Scrap ignores the Resistant keyword.", "id": "REINFORCED_PLATING"},
        {"name": "Layered Plating", "cost": "3 Green, 1B", "effect": "Your Green Scrap provides +1 defense.", "id": "LAYERED_PLATING"},
        # Base Build
        {"name": "Scrap Plating", "cost": "3 Green", "effect": "Gain +1 permanent Red defense.", "perm_def": {ScrapType.PARTS: 1}},
        {"name": "Tripwire", "cost": "3 Green", "effect": "Gain +1 permanent Blue defense.", "perm_def": {ScrapType.WIRING: 1}},
        {"name": "Reinforced Post", "cost": "3 Green", "effect": "Gain +1 permanent Green defense.", "perm_def": {ScrapType.PLATES: 1}},
        {"name": "Fortified Bunker", "cost": "6 Green", "effect": "Gain +1 permanent defense to all stats.", "perm_def": {ScrapType.PARTS: 1, ScrapType.WIRING: 1, ScrapType.PLATES: 1}},
        # Utility
        {"name": "Tinker's Bench", "cost": "2G, 2B", "effect": "Once per round, you may trade 1 Scrap for 1 Scrap of your choice.", "id": "TINKERS_BENCH"},
        {"name": "Scavenger's Eye", "cost": "4G, 1B", "effect": "Your Scavenge action now lets you choose 3 Scrap instead of 2.", "id": "SCAVENGERS_EYE"},
        {"name": "Scrap Sieve", "cost": "2 of each", "effect": "When you gain Scrap from Scavenge or a pig's Spoil, gain 1 additional Scrap of your choice.", "id": "SCRAP_SIEVE"},
        {"name": "Scrap Repeater", "cost": "3R, 1B", "effect": "Artifact. Gain +4 permanent Red defense. At the start of the Cleanup Phase, you must pay 1 Red Scrap. If you cannot, destroy this.", "perm_def": {ScrapType.PARTS: 4}, "id": "SCRAP_REPEATER"},
    ]

    templates = []
    for t in templates_raw:
        templates.append({
            "name": t["name"],
            "cost": _parse_cost(t["cost"]),
            "effect": t["effect"],
            "permanent_defense": t.get("perm_def", {}),
            "special_effect_id": t.get("id", None)
        })

    # Rulebook: 40 Upgrade cards. We have 14 templates. ~3 copies each.
    deck = []
    for _ in range(3):
        deck.extend(_create_cards(UpgradeCard, templates))
    
    random.shuffle(deck)
    return deck[:40] # Trim to 40

def create_arsenal_deck() -> List[ArsenalCard]:
    """Creates the full, shuffled arsenal deck (30 cards, v1.8)."""
    
    # Cost parsing from create_upgrade_deck
    # _parse_cost = create_upgrade_deck.__globals__['_parse_cost'] # <-- This line is removed
    
    templates_raw = [
        # Defensive (Multi-Use)
        {"name": "Scrap Shield", "cost": "2 Red", "effect": "Gain +7 Red defense. Starts with 2 Charges.", "def_boost": {ScrapType.PARTS: 7}, "charges": 2},
        {"name": "Caltrops", "cost": "2 Blue", "effect": "Gain +7 Blue defense. Starts with 2 Charges.", "def_boost": {ScrapType.WIRING: 7}, "charges": 2},
        {"name": "Brace", "cost": "2 Green", "effect": "Gain +7 Green defense. Starts with 2 Charges.", "def_boost": {ScrapType.PLATES: 7}, "charges": 2},
        # Offensive (Conditional)
        {"name": "Recycler-Net", "cost": "3 Blue, 1R", "effect": "Gain +9 Blue defense. If used to Kill, return to hand.", "def_boost": {ScrapType.WIRING: 9}, "id": "RECYCLER_NET"},
        {"name": "Boar Spear", "cost": "3 Red, 1B", "effect": "Gain +9 Red defense. If used to Kill, return to hand.", "def_boost": {ScrapType.PARTS: 9}, "id": "BOAR_SPEAR"},
        # Utility (One-Use)
        {"name": "Adrenaline", "cost": "2 Blue", "effect": "Play after you FAIL to ignore all consequences.", "id": "ADRENALINE"},
        {"name": "Lure to Weakness", "cost": "2B, 1R", "effect": "Play during Defense. Choose one of your Threat's non-highest stats. For this turn, that stat is the target for the Kill calculation.", "id": "LURE_TO_WEAKNESS"},
        {"name": "Corrosive Sludge", "cost": "2B, 2G", "effect": "Play during Defense. Choose one stat on your Threat. That stat loses Resistant and Immune for this defense.", "id": "CORROSIVE_SLUDGE"},
        {"name": "Makeshift Amp", "cost": "2 of each", "effect": "Pay X additional Scrap of any one type. Gain +X defense for that type. This defense value is not affected by Resistance or Immunity.", "id": "MAKESHIFT_AMP"},
    ]
    
    templates = []
    for t in templates_raw:
        templates.append({
            "name": t["name"],
            "cost": _parse_cost(t["cost"]),
            "effect": t["effect"],
            "defense_boost": t.get("def_boost", {}),
            "special_effect_id": t.get("id", None),
            "charges": t.get("charges", None)
        })

    # Rulebook: 30 Arsenal cards. We have 9 templates. ~3 copies each.
    deck = []
    for _ in range(4): # ~3-4 copies
        deck.extend(_create_cards(ArsenalCard, templates))
        
    random.shuffle(deck)
    return deck[:30] # Trim to 30

