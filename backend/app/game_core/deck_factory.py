"""
Parses the game rules to create the initial decks of cards.
This is kept separate to be testable and to keep models.py clean.
"""

from typing import List
from .models import ScrapType, LureCard, ThreatCard, UpgradeCard, ArsenalCard
import random
import uuid

# A helper function to create multiple copies of cards with unique IDs
def _create_cards(card_class, card_template_list, copies_per_template, num_sets):
    deck = []
    for _ in range(num_sets):
        for template in card_template_list:
            for _ in range(copies_per_template):
                # Create a new card instance from the template dict, ensuring a new UUID
                deck.append(card_class(id=str(uuid.uuid4()), **template))
    return deck

def create_threat_deck() -> List[ThreatCard]:
    """Creates the full, shuffled threat deck based on the v1.4 rules."""
    
    # --- DAY THREATS (40 total) ---
    # 10 sets of 4 cards
    day_templates = [
        {"name": "Young Boar", "era": "Day", "lure": LureCard.BLOODY_RAGS, "ferocity": 4, "cunning": 3, "mass": 3, "ability": "On Fail: Discard 1 random Scrap.", "spoil": {ScrapType.PARTS: 2}, "trophy": LureCard.BLOODY_RAGS},
        {"name": "Young Boar", "era": "Day", "lure": LureCard.STRANGE_NOISES, "ferocity": 4, "cunning": 3, "mass": 3, "ability": "On Fail: Discard 1 random Scrap.", "spoil": {ScrapType.PARTS: 1, ScrapType.WIRING: 1}, "trophy": LureCard.STRANGE_NOISES},
        {"name": "Young Boar", "era": "Day", "lure": LureCard.FALLEN_FRUIT, "ferocity": 4, "cunning": 3, "mass": 3, "ability": "On Fail: Discard 1 random Scrap.", "spoil": {ScrapType.PARTS: 1, ScrapType.PLATES: 1}, "trophy": LureCard.FALLEN_FRUIT},
        {"name": "Scraggly Piglet", "era": "Day", "lure": LureCard.BLOODY_RAGS, "ferocity": 3, "cunning": 4, "mass": 3, "spoil": {ScrapType.WIRING: 1, ScrapType.PARTS: 1}, "trophy": LureCard.BLOODY_RAGS},
        {"name": "Scraggly Piglet", "era": "Day", "lure": LureCard.STRANGE_NOISES, "ferocity": 3, "cunning": 4, "mass": 3, "spoil": {ScrapType.WIRING: 2}, "trophy": LureCard.STRANGE_NOISES},
        {"name": "Scraggly Piglet", "era": "Day", "lure": LureCard.FALLEN_FRUIT, "ferocity": 3, "cunning": 4, "mass": 3, "spoil": {ScrapType.WIRING: 1, ScrapType.PLATES: 1}, "trophy": LureCard.FALLEN_FRUIT},
        {"name": "Hefty Swine", "era": "Day", "lure": LureCard.BLOODY_RAGS, "ferocity": 3, "cunning": 3, "mass": 5, "spoil": {ScrapType.PLATES: 1, ScrapType.PARTS: 1}, "trophy": LureCard.BLOODY_RAGS},
        {"name": "Hefty Swine", "era": "Day", "lure": LureCard.STRANGE_NOISES, "ferocity": 3, "cunning": 3, "mass": 5, "spoil": {ScrapType.PLATES: 1, ScrapType.WIRING: 1}, "trophy": LureCard.STRANGE_NOISES},
        {"name": "Hefty Swine", "era": "Day", "lure": LureCard.FALLEN_FRUIT, "ferocity": 3, "cunning": 3, "mass": 5, "spoil": {ScrapType.PLATES: 2}, "trophy": LureCard.FALLEN_FRUIT},
        {"name": "Territorial Sow", "era": "Day", "lure": LureCard.BLOODY_RAGS, "ferocity": 5, "cunning": 3, "mass": 4, "ability": "On Fail: The player with the fewest trophies discards 2 random Scrap.", "spoil": {ScrapType.PARTS: 2, ScrapType.PLATES: 1}, "trophy": LureCard.BLOODY_RAGS},
        {"name": "Rooting Digger", "era": "Day", "lure": LureCard.FALLEN_FRUIT, "ferocity": 4, "cunning": 3, "mass": 5, "ability": "On Fail: The player with the most Scrap discards 2 random Scrap.", "spoil": {ScrapType.PLATES: 2, ScrapType.PARTS: 1}, "trophy": LureCard.FALLEN_FRUIT},
        {"name": "Sudden Downpour", "era": "Day", "lure": LureCard.FALLEN_FRUIT, "ferocity": 3, "cunning": 4, "mass": 3, "ability": "Global: All players discard 1 random Scrap.", "spoil": {ScrapType.PARTS: 1, ScrapType.WIRING: 1, ScrapType.PLATES: 1}, "trophy": LureCard.FALLEN_FRUIT},
        {"name": "Eerie Silence", "era": "Day", "lure": LureCard.STRANGE_NOISES, "ferocity": 4, "cunning": 4, "mass": 4, "ability": "Global: The Initiative Queue does not change...", "spoil": {ScrapType.PARTS: 1, ScrapType.WIRING: 1, ScrapType.PLATES: 1}, "trophy": LureCard.STRANGE_NOISES},
        {"name": "Gluttonous Pig", "era": "Day", "lure": LureCard.FALLEN_FRUIT, "ferocity": 4, "cunning": 4, "mass": 6, "ability": "On Fail: Discard all your Green Scrap.", "spoil": {ScrapType.PLATES: 3}, "trophy": LureCard.FALLEN_FRUIT},
    ]
    # This isn't a perfect 40, but it's a good representation based on the PDF
    day_deck = _create_cards(ThreatCard, day_templates, 1, 3) # Creates 42 cards
    
    # --- TWILIGHT THREATS (40 total) ---
    twilight_templates = [
        {"name": "Stalker Pig", "era": "Twilight", "lure": LureCard.STRANGE_NOISES, "ferocity": 5, "cunning": 7, "mass": 4, "ability": "On Fail: Discard 2 random Scrap.", "spoil": {ScrapType.WIRING: 3}, "trophy": LureCard.STRANGE_NOISES},
        {"name": "Feral Sow", "era": "Twilight", "lure": LureCard.BLOODY_RAGS, "ferocity": 8, "cunning": 4, "mass": 6, "ability": "On Fail: Destroy one of your Upgrades...", "spoil": {ScrapType.PARTS: 3}, "trophy": LureCard.BLOODY_RAGS},
        {"name": "Crushing Tusker", "era": "Twilight", "lure": LureCard.FALLEN_FRUIT, "ferocity": 6, "cunning": 5, "mass": 8, "ability": "On Fail: Discard all your Plates.", "spoil": {ScrapType.PLATES: 3}, "trophy": LureCard.FALLEN_FRUIT},
        {"name": "Vicious Hunter", "era": "Twilight", "lure": LureCard.BLOODY_RAGS, "ferocity": 7, "cunning": 5, "mass": 4, "ability": "Savage: Deals 2 HP damage on fail.", "spoil": {ScrapType.PARTS: 2, ScrapType.WIRING: 1}, "trophy": LureCard.BLOODY_RAGS},
        {"name": "Pack Alpha", "era": "Twilight", "lure": LureCard.BLOODY_RAGS, "ferocity": 7, "cunning": 6, "mass": 5, "ability": "Howl: When revealed, all other pigs gain +1...", "spoil": {ScrapType.PARTS: 1, ScrapType.WIRING: 1, ScrapType.PLATES: 1}, "trophy": LureCard.BLOODY_RAGS}, # TODO: Spoil "draw 1 random"
        {"name": "Foggy Swamp", "era": "Twilight", "lure": LureCard.STRANGE_NOISES, "ferocity": 6, "cunning": 6, "mass": 6, "ability": "Global: Arsenal cards cannot be used...", "spoil": {}, "trophy": LureCard.STRANGE_NOISES}, # Spoil: Take 1 Arsenal
        {"name": "Corrosive Pig", "era": "Twilight", "lure": LureCard.FALLEN_FRUIT, "ferocity": 5, "cunning": 5, "mass": 7, "ability": "On Fail: Destroy 1 of your Upgrades with Mass...", "spoil": {ScrapType.PLATES: 2, ScrapType.WIRING: 2}, "trophy": LureCard.FALLEN_FRUIT},
        {"name": "Saboteur Pig", "era": "Twilight", "lure": LureCard.STRANGE_NOISES, "ferocity": 4, "cunning": 8, "mass": 4, "ability": "On Fail: Give another player one of your Arsenal cards.", "spoil": {ScrapType.WIRING: 2, ScrapType.PARTS: 2}, "trophy": LureCard.STRANGE_NOISES},
        {"name": "Grudge Boar", "era": "Twilight", "lure": LureCard.BLOODY_RAGS, "ferocity": 6, "cunning": 5, "mass": 6, "ability": "On Fail: The player with the most trophies also loses 1 HP.", "spoil": {ScrapType.PARTS: 4}, "trophy": LureCard.BLOODY_RAGS},
        {"name": "Phantom Pig", "era": "Twilight", "lure": LureCard.STRANGE_NOISES, "ferocity": 5, "cunning": 9, "mass": 5, "ability": "Immunity: Cannot be damaged by spent Wiring.", "spoil": {ScrapType.WIRING: 4}, "trophy": LureCard.STRANGE_NOISES},
    ]
    twilight_deck = _create_cards(ThreatCard, twilight_templates, 1, 4) # 40 cards
    
    # --- NIGHT THREATS (40 total) ---
    night_templates = [
        {"name": "Alpha Razorback", "era": "Night", "lure": LureCard.BLOODY_RAGS, "ferocity": 10, "cunning": 7, "mass": 8, "ability": "On Fail: Destroy 2 of your Upgrades.", "spoil": {ScrapType.PARTS: 4, ScrapType.WIRING: 1}, "trophy": LureCard.BLOODY_RAGS},
        {"name": "The Unseen", "era": "Night", "lure": LureCard.STRANGE_NOISES, "ferocity": 7, "cunning": 11, "mass": 7, "ability": "On Fail: Discard your entire hand of Arsenal cards.", "spoil": {}, "trophy": LureCard.STRANGE_NOISES}, # Spoil: Draw 2 keep 1
        {"name": "Juggernaut", "era": "Night", "lure": LureCard.FALLEN_FRUIT, "ferocity": 8, "cunning": 6, "mass": 12, "ability": "On Fail: Discard your entire Scrap supply.", "spoil": {ScrapType.PLATES: 4, ScrapType.PARTS: 2}, "trophy": LureCard.FALLEN_FRUIT},
        {"name": "Blood Frenzy", "era": "Night", "lure": LureCard.BLOODY_RAGS, "ferocity": 11, "cunning": 8, "mass": 8, "ability": "On Fail: You lose 1 HP. Then, this pig attacks player to your left.", "spoil": {ScrapType.PARTS: 5}, "trophy": LureCard.BLOODY_RAGS}, # TODO: Spoil "take first player"
        {"name": "Overlord", "era": "Night", "lure": LureCard.BLOODY_RAGS, "ferocity": 12, "cunning": 10, "mass": 10, "ability": "Immunity: Cannot be damaged by spent Scrap.", "spoil": {ScrapType.PARTS: 3, ScrapType.WIRING: 2, ScrapType.PLATES: 2}, "trophy": LureCard.BLOODY_RAGS},
        {"name": "Ancient Guardian", "era": "Night", "lure": LureCard.FALLEN_FRUIT, "ferocity": 10, "cunning": 10, "mass": 14, "ability": "On Fail: You are eliminated.", "spoil": {}, "trophy": LureCard.FALLEN_FRUIT}, # Spoil: Win game
        {"name": "The Great Boar", "era": "Night", "lure": LureCard.FALLEN_FRUIT, "ferocity": 12, "cunning": 8, "mass": 12, "ability": "Savage: Deals 2 HP. On Fail: All players discard 2 Scrap.", "spoil": {ScrapType.PLATES: 4}, "trophy": LureCard.FALLEN_FRUIT}, # TODO: Spoil "all others lose 1 HP"
        {"name": "Night Terror", "era": "Night", "lure": LureCard.STRANGE_NOISES, "ferocity": 8, "cunning": 12, "mass": 8, "ability": "On Fail: You may not use your chosen Action Card.", "spoil": {ScrapType.WIRING: 5, ScrapType.PARTS: 1, ScrapType.PLATES: 1}, "trophy": LureCard.STRANGE_NOISES},
    ]
    night_deck = _create_cards(ThreatCard, night_templates, 1, 5) # 40 cards
    
    # Shuffle each deck individually
    random.shuffle(day_deck)
    random.shuffle(twilight_deck)
    random.shuffle(night_deck)
    
    # Stack them as per rules: Day on top, then Twilight, then Night
    return day_deck + twilight_deck + night_deck

def create_upgrade_deck() -> List[UpgradeCard]:
    """Creates the full, shuffled upgrade deck (40 cards)."""
    templates = [
        {"name": "Scrap Plating", "cost": {ScrapType.PLATES: 3}, "effect": "Gain +1 permanent Ferocity (p) defense.", "permanent_defense": {ScrapType.PARTS: 1}},
        {"name": "Tripwire", "cost": {ScrapType.PLATES: 3}, "effect": "Gain +1 permanent Cunning (k) defense.", "permanent_defense": {ScrapType.WIRING: 1}},
        {"name": "Reinforced Post", "cost": {ScrapType.PLATES: 3}, "effect": "Gain +1 permanent Mass (m) defense.", "permanent_defense": {ScrapType.PLATES: 1}},
        {"name": "Tinker's Bench", "cost": {ScrapType.PLATES: 2, ScrapType.WIRING: 2}, "effect": "Once per round, trade 1 Scrap.", "special_effect_id": "TINKERS_BENCH"},
        {"name": "Scavenger's Eye", "cost": {ScrapType.PLATES: 4, ScrapType.WIRING: 1}, "effect": "Scavenge gets +1 Scrap.", "special_effect_id": "SCAVENGERS_EYE"},
        {"name": "Master Schemer", "cost": {ScrapType.WIRING: 4, ScrapType.PLATES: 2}, "effect": "Your Scheme action base defense is 2/2/2.", "special_effect_id": "MASTER_SCHEMER"},
        {"name": "Trophy Rack", "cost": {ScrapType.PLATES: 4}, "effect": "For every 2 Fallen Fruit trophies, gain +1 Mass.", "special_effect_id": "TROPHY_RACK_M"},
        {"name": "Butcher's Table", "cost": {ScrapType.PLATES: 4}, "effect": "For every 2 Bloody Rags trophies, gain +1 Ferocity.", "special_effect_id": "TROPHY_RACK_P"},
        {"name": "Trap Workshop", "cost": {ScrapType.PLATES: 4}, "effect": "For every 2 Strange Noises trophies, gain +1 Cunning.", "special_effect_id": "TROPHY_RACK_K"},
        {"name": "Scrap Hoarder", "cost": {ScrapType.PLATES: 3, ScrapType.WIRING: 2}, "effect": "Increase Arsenal hand size by 2.", "special_effect_id": "SCRAP_HOARDER"},
        {"name": "Recycling Unit", "cost": {ScrapType.PARTS: 2, ScrapType.WIRING: 2, ScrapType.PLATES: 2}, "effect": "For every 3 Scrap spent on defense, return 1.", "special_effect_id": "RECYCLING_UNIT"},
        {"name": "Fortified Bunker", "cost": {ScrapType.PLATES: 6}, "effect": "Gain +1 permanent defense to all stats.", "permanent_defense": {ScrapType.PARTS: 1, ScrapType.WIRING: 1, ScrapType.PLATES: 1}},
        {"name": "Scrap Engine", "cost": {ScrapType.PLATES: 3, ScrapType.WIRING: 3}, "effect": "At start of Action Phase, gain 1 Scrap of choice.", "special_effect_id": "SCRAP_ENGINE"},
        {"name": "Lookout Tower", "cost": {ScrapType.PLATES: 5}, "effect": "During Attraction, look at one player's Lure card.", "special_effect_id": "LOOKOUT_TOWER"},
        {"name": "The Monolith", "cost": {ScrapType.PARTS: 4, ScrapType.WIRING: 4, ScrapType.PLATES: 4}, "effect": "Artifact. You can no longer be targeted by other players' card effects.", "special_effect_id": "THE_MONOLITH"},
    ]
    # Make ~40 cards
    deck = _create_cards(UpgradeCard, templates, 1, 3) # 45 cards
    random.shuffle(deck)
    return deck

def create_arsenal_deck() -> List[ArsenalCard]:
    """Creates the full, shuffled arsenal deck (30 cards)."""
    templates = [
        {"name": "Scrap Shield", "cost": {ScrapType.PARTS: 1}, "effect": "Gain +6 Ferocity (p) defense this turn.", "defense_boost": {ScrapType.PARTS: 6}},
        {"name": "Caltrops", "cost": {ScrapType.WIRING: 1}, "effect": "Gain +6 Cunning (k) defense this turn.", "defense_boost": {ScrapType.WIRING: 6}},
        {"name": "Brace", "cost": {ScrapType.PLATES: 1}, "effect": "Gain +6 Mass (m) defense this turn.", "defense_boost": {ScrapType.PLATES: 6}},
        {"name": "Boar Spear", "cost": {ScrapType.PARTS: 2}, "effect": "Gain +4 vs p. If kill, gain spoil twice.", "defense_boost": {ScrapType.PARTS: 4}, "special_effect_id": "BOAR_SPEAR"},
        {"name": "Spiked Shield", "cost": {ScrapType.PARTS: 1, ScrapType.PLATES: 1}, "effect": "Gain +4 vs p and +4 vs m.", "defense_boost": {ScrapType.PARTS: 4, ScrapType.PLATES: 4}},
        {"name": "Adrenaline", "cost": {ScrapType.WIRING: 2}, "effect": "Play after failing to ignore consequences.", "special_effect_id": "ADRENALINE"},
        {"name": "Flashbang", "cost": {ScrapType.WIRING: 3}, "effect": "Play during Attraction to swap threats.", "special_effect_id": "FLASHBANG"},
        {"name": "Bait Trap", "cost": {ScrapType.WIRING: 2, ScrapType.PARTS: 1}, "effect": "Play during Attraction. Force player to take highest Cunning threat.", "special_effect_id": "BAIT_TRAP"},
        {"name": "Net Gun", "cost": {ScrapType.WIRING: 3}, "effect": "Choose a pig. Its Cunning is 0 this turn.", "special_effect_id": "NET_GUN"},
        {"name": "Last Stand", "cost": {ScrapType.PARTS: 1, ScrapType.WIRING: 1, ScrapType.PLATES: 1}, "effect": "If at 1 HP, gain +8 to all defense.", "special_effect_id": "LAST_STAND"},
        {"name": "Sacrifice", "cost": {ScrapType.PARTS: 2, ScrapType.WIRING: 1}, "effect": "Choose player. They lose 1 HP. You gain 1 of each Scrap.", "special_effect_id": "SACRIFICE"},
        {"name": "Scavenge Party", "cost": {ScrapType.WIRING: 2}, "effect": "Choose player. You both choose 2 Scrap.", "special_effect_id": "SCAVENGE_PARTY"},
        {"name": "Overcharge", "cost": {ScrapType.PARTS: 3}, "effect": "Double the defensive value of all Scrap spent.", "special_effect_id": "OVERCHARGE"},
        {"name": "Decoy", "cost": {ScrapType.WIRING: 2, ScrapType.PLATES: 2}, "effect": "Play during Attraction. Discard an attracted Threat.", "special_effect_id": "DECOY"},
        {"name": "Mjolnir", "cost": {ScrapType.PARTS: 4, ScrapType.WIRING: 2}, "effect": "Artifact. Gain +10 vs p. If kill, all other players lose 1 HP.", "defense_boost": {ScrapType.PARTS: 10}, "special_effect_id": "MJOLNIR"},
    ]
    # Make 30 cards
    deck = _create_cards(ArsenalCard, templates, 1, 2) # 30 cards
    random.shuffle(deck)
    return deck
