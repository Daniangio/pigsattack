"""
Parses the game rules to create the initial decks of cards.
This is kept separate to be testable and to keep models.py clean.
"""

from typing import List
from .models import ScrapType, LureCard, ThreatCard, UpgradeCard, ArsenalCard
import random
import uuid

def create_threat_deck() -> List[ThreatCard]:
    """Creates the full, shuffled threat deck."""
    
    # --- START BUGFIX ---
    # We must generate a new UUID for *every single card*, not just for
    # the templates. We use extend with a list comprehension.
    
    day_deck = []
    for _ in range(10): # 40 Day Cards
        day_deck.extend([
            ThreatCard(id=str(uuid.uuid4()), name="Young Boar", era="Day", lure=LureCard.BLOODY_RAGS, ferocity=4, cunning=3, mass=3, ability="On Fail: Discard 1 random Scrap.", spoil={ScrapType.PARTS: 2}, trophy=LureCard.BLOODY_RAGS),
            ThreatCard(id=str(uuid.uuid4()), name="Young Boar", era="Day", lure=LureCard.STRANGE_NOISES, ferocity=4, cunning=3, mass=3, ability="On Fail: Discard 1 random Scrap.", spoil={ScrapType.PARTS: 1, ScrapType.WIRING: 1}, trophy=LureCard.STRANGE_NOISES),
            ThreatCard(id=str(uuid.uuid4()), name="Hefty Swine", era="Day", lure=LureCard.FALLEN_FRUIT, ferocity=3, cunning=3, mass=5, spoil={ScrapType.PLATES: 2}, trophy=LureCard.FALLEN_FRUIT),
            ThreatCard(id=str(uuid.uuid4()), name="Eerie Silence", era="Day", lure=LureCard.STRANGE_NOISES, ferocity=4, cunning=4, mass=4, ability="Global: The Initiative Queue does not change...", spoil={ScrapType.PARTS: 1, ScrapType.WIRING: 1, ScrapType.PLATES: 1}, trophy=LureCard.STRANGE_NOISES),
        ])
    
    twilight_deck = []
    for _ in range(10): # 40 Twilight Cards
        twilight_deck.extend([
            ThreatCard(id=str(uuid.uuid4()), name="Stalker Pig", era="Twilight", lure=LureCard.STRANGE_NOISES, ferocity=5, cunning=7, mass=4, ability="On Fail: Discard 2 random Scrap.", spoil={ScrapType.WIRING: 3}, trophy=LureCard.STRANGE_NOISES),
            ThreatCard(id=str(uuid.uuid4()), name="Feral Sow", era="Twilight", lure=LureCard.BLOODY_RAGS, ferocity=8, cunning=4, mass=6, ability="On Fail: Destroy one of your Upgrades...", spoil={ScrapType.PARTS: 3}, trophy=LureCard.BLOODY_RAGS),
            ThreatCard(id=str(uuid.uuid4()), name="Crushing Tusker", era="Twilight", lure=LureCard.FALLEN_FRUIT, ferocity=6, cunning=5, mass=8, ability="On Fail: Discard all your Plates.", spoil={ScrapType.PLATES: 3}, trophy=LureCard.FALLEN_FRUIT),
            ThreatCard(id=str(uuid.uuid4()), name="Vicious Hunter", era="Twilight", lure=LureCard.BLOODY_RAGS, ferocity=7, cunning=5, mass=4, ability="Savage: Deals 2 HP damage on fail.", spoil={ScrapType.PARTS: 2, ScrapType.WIRING: 1}, trophy=LureCard.BLOODY_RAGS),
        ])

    night_deck = []
    for _ in range(10): # 40 Night Cards
        night_deck.extend([
            ThreatCard(id=str(uuid.uuid4()), name="Alpha Razorback", era="Night", lure=LureCard.BLOODY_RAGS, ferocity=10, cunning=7, mass=8, ability="On Fail: Destroy 2 of your Upgrades.", spoil={ScrapType.PARTS: 4, ScrapType.WIRING: 1}, trophy=LureCard.BLOODY_RAGS),
            ThreatCard(id=str(uuid.uuid4()), name="The Unseen", era="Night", lure=LureCard.STRANGE_NOISES, ferocity=7, cunning=11, mass=7, ability="On Fail: Discard your entire hand of Arsenal cards.", spoil={}, trophy=LureCard.STRANGE_NOISES), # Spoil: Draw 2 keep 1
            ThreatCard(id=str(uuid.uuid4()), name="Juggernaut", era="Night", lure=LureCard.FALLEN_FRUIT, ferocity=8, cunning=6, mass=12, ability="On Fail: Discard your entire Scrap supply.", spoil={ScrapType.PLATES: 4, ScrapType.PARTS: 2}, trophy=LureCard.FALLEN_FRUIT),
            ThreatCard(id=str(uuid.uuid4()), name="Ancient Guardian", era="Night", lure=LureCard.FALLEN_FRUIT, ferocity=10, cunning=10, mass=14, ability="On Fail: You are eliminated.", spoil={}, trophy=LureCard.FALLEN_FRUIT), # Spoil: Win game
        ])
    # --- END BUGFIX ---
    
    # Shuffle each deck individually
    random.shuffle(day_deck)
    random.shuffle(twilight_deck)
    random.shuffle(night_deck)
    
    # Stack them as per rules: Day on top, then Twilight, then Night
    return day_deck + twilight_deck + night_deck

def create_upgrade_deck() -> List[UpgradeCard]:
    """Creates the full, shuffled upgrade deck."""
    deck = []
    # Use extend and list comprehension to ensure unique IDs
    for _ in range(6): # ~40 cards
        deck.extend([
            UpgradeCard(id=str(uuid.uuid4()), name="Scrap Plating", cost={ScrapType.PLATES: 3}, effect="Gain +1 permanent Ferocity (p) defense.", permanent_defense={ScrapType.PARTS: 1}),
            UpgradeCard(id=str(uuid.uuid4()), name="Tripwire", cost={ScrapType.PLATES: 3}, effect="Gain +1 permanent Cunning (k) defense.", permanent_defense={ScrapType.WIRING: 1}),
            UpgradeCard(id=str(uuid.uuid4()), name="Reinforced Post", cost={ScrapType.PLATES: 3}, effect="Gain +1 permanent Mass (m) defense.", permanent_defense={ScrapType.PLATES: 1}),
            UpgradeCard(id=str(uuid.uuid4()), name="Tinker's Bench", cost={ScrapType.PLATES: 2, ScrapType.WIRING: 2}, effect="Once per round, trade 1 Scrap.", special_effect_id="TINKERS_BENCH"),
            UpgradeCard(id=str(uuid.uuid4()), name="Scavenger's Eye", cost={ScrapType.PLATES: 4, ScrapType.WIRING: 1}, effect="Scavenge gets +1 Scrap.", special_effect_id="SCAVENGERS_EYE"),
            UpgradeCard(id=str(uuid.uuid4()), name="Fortified Bunker", cost={ScrapType.PLATES: 6}, effect="Gain +1 permanent defense to all stats.", permanent_defense={ScrapType.PARTS: 1, ScrapType.WIRING: 1, ScrapType.PLATES: 1}),
            UpgradeCard(id=str(uuid.uuid4()), name="Master Schemer", cost={ScrapType.WIRING: 4, ScrapType.PLATES: 2}, effect="Your Scheme action now provides a base defense of 2/2/2.", special_effect_id="MASTER_SCHEMER"),
        ])
    random.shuffle(deck)
    return deck

def create_arsenal_deck() -> List[ArsenalCard]:
    """Creates the full, shuffled arsenal deck."""
    deck = []
    # Use extend and list comprehension to ensure unique IDs
    for _ in range(5): # ~30 cards
        deck.extend([
            ArsenalCard(id=str(uuid.uuid4()), name="Scrap Shield", cost={ScrapType.PARTS: 1}, effect="Gain +6 Ferocity (p) defense this turn.", defense_boost={ScrapType.PARTS: 6}),
            ArsenalCard(id=str(uuid.uuid4()), name="Caltrops", cost={ScrapType.WIRING: 1}, effect="Gain +6 Cunning (k) defense this turn.", defense_boost={ScrapType.WIRING: 6}),
            ArsenalCard(id=str(uuid.uuid4()), name="Brace", cost={ScrapType.PLATES: 1}, effect="Gain +6 Mass (m) defense this turn.", defense_boost={ScrapType.PLATES: 6}),
            ArsenalCard(id=str(uuid.uuid4()), name="Boar Spear", cost={ScrapType.PARTS: 2}, effect="Gain +4 vs p. If kill, gain spoil twice.", defense_boost={ScrapType.PARTS: 4}, special_effect_id="BOAR_SPEAR"),
            ArsenalCard(id=str(uuid.uuid4()), name="Adrenaline", cost={ScrapType.WIRING: 2}, effect="Play after failing to ignore consequences.", special_effect_id="ADRENALINE"),
            ArsenalCard(id=str(uuid.uuid4()), name="Flashbang", cost={ScrapType.WIRING: 3}, effect="Force another player to swap threats with you.", special_effect_id="FLASHBANG"),
            ArsenalCard(id=str(uuid.uuid4()), name="Sacrifice", cost={ScrapType.PARTS: 2, ScrapType.WIRING: 1}, effect="Choose player. They lose 1 HP. You gain 1 of each Scrap.", special_effect_id="SACRIFICE"),
        ])
    random.shuffle(deck)
    return deck
