"""
Defines the Enums and constants for card effect tags.
This provides a single, structured source of truth for game logic.
"""

from enum import Enum

class OnFailEffect(str, Enum):
    """Tags for Threat 'On Fail:' effects."""
    DISCARD_SCRAP_1 = "DISCARD_SCRAP_1"
    FALL_TO_BACK = "FALL_TO_BACK"
    PREVENT_ACTION = "PREVENT_ACTION"

class UpgradeEffect(str, Enum):
    """Tags for Upgrade 'special_effect_id' field."""
    # On Reveal Effects
    ON_REVEAL_GAIN_SCRAP_PARTS_1 = "ON_REVEAL:GAIN_SCRAP:PARTS:1"
    ON_REVEAL_GAIN_SCRAP_WIRING_1 = "ON_REVEAL:GAIN_SCRAP:WIRING:1"
    ON_REVEAL_GAIN_SCRAP_PLATES_1 = "ON_REVEAL:GAIN_SCRAP:PLATES:1"
    ON_REVEAL_GAIN_SCRAP_ALL_1 = "ON_REVEAL:GAIN_SCRAP:ALL:1"
    ON_REVEAL_DRAW_ARSENAL_1 = "ON_REVEAL:DRAW_ARSENAL:1"
    ON_REVEAL_DRAW_ARSENAL_2 = "ON_REVEAL:DRAW_ARSENAL:2"
    ON_REVEAL_DEFENSE_ALL_2 = "ON_REVEAL:DEFENSE:ALL:2"
    
    # On Kill Effects
    ON_KILL_GAIN_SCRAP_ALL_1 = "ON_KILL:GAIN_SCRAP:ALL:1"
    ON_KILL_GAIN_SCRAP_PARTS_1 = "ON_KILL:GAIN_SCRAP:PARTS:1"
    ON_KILL_GAIN_SCRAP_WIRING_1 = "ON_KILL:GAIN_SCRAP:WIRING:1"
    ON_KILL_GAIN_SCRAP_PLATES_1 = "ON_KILL:GAIN_SCRAP:PLATES:1"
    ON_KILL_DRAW_ARSENAL_1 = "ON_KILL:DRAW_ARSENAL:1"
    
    # Combined Effect
    MASTERWORK_TOOLS = "DEFENSE:ALL:2;ON_KILL:GAIN_SCRAP:ALL:1;ON_KILL:DRAW_ARSENAL:1"

    # Piercing Defense (handled by defense_piercing dict, but we can tag it)
    PIG_STICKER = "DEFENSE_PIERCING:PARTS:8"
    TESLA_COIL = "DEFENSE_PIERCING:WIRING:8"
    THE_WALL = "DEFENSE_PIERCING:PLATES:8"
    
    # Passive Defense (handled by defense_boost dict, but we can tag it)
    VETERANS_EYE = "DEFENSE:ALL:1;ON_KILL:DRAW_ARSENAL:1"
    FIRE_HARDENED_TIPS = "DEFENSE:PARTS:2;ON_KILL:GAIN_SCRAP:PARTS:1"
    INSULATED_WIRING = "DEFENSE:WIRING:2;ON_KILL:GAIN_SCRAP:WIRING:1"
    SHARPENED_PLATES = "DEFENSE:PLATES:2;ON_KILL:GAIN_SCRAP:PLATES:1"
    PIG_IRON_ARMOR = "DEFENSE:ALL:3"


class ArsenalEffect(str, Enum):
    """Tags for Arsenal 'special_effect_id' field."""
    # On Kill Effects
    ON_KILL_RETURN_TO_HAND = "ON_KILL:RETURN_TO_HAND"

    # On Fail Effects
    ON_FAIL_IGNORE_CONSEQUENCES = "ON_FAIL:IGNORE_CONSEQUENCES"

    # Special Active Effects (require player input or custom logic)
    SPECIAL_LURE_TO_WEAKNESS = "SPECIAL:LURE_TO_WEAKNESS"
    SPECIAL_CORROSIVE_SLUDGE = "SPECIAL:CORROSIVE_SLUDGE"
    SPECIAL_MAKESHIFT_AMP = "SPECIAL:MAKESHIFT_AMP"