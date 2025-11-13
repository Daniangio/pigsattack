"""
Handles complex, read-only calculations for the game.
(No changes were needed in this file, the logic was ported correctly.)
"""
from typing import Dict, Any
from ...game_core.game_models import (
    GameState, PlayerState, ThreatCard, PlayerDefense, ScrapType,
    UpgradeCard, ArsenalCard, DefensePayload, SurvivorActionCard, LureCard
)
from ...game_core.card_effects import UpgradeEffect, ArsenalEffect
from .validation import GameValidator
from pydantic import ValidationError

BASE_DEFENSE_MAP = {
    "SCAVENGE": {ScrapType.WIRING: 2},
    "FORTIFY": {ScrapType.PLATES: 2},
    "ARMORY_RUN": {ScrapType.PARTS: 2},
    "SCHEME": {ScrapType.PARTS: 1, ScrapType.WIRING: 1, ScrapType.PLATES: 1},
}

class GameCalculationService:
    """
    A service for performing complex, read-only game calculations.
    It does not mutate the game state.
    """

    def __init__(self, state: GameState, validator: GameValidator):
        self.state = state
        self.validator = validator

    def public_preview_defense(self, player_id: str, defense_payload: Dict[str, Any]) -> Dict[str, Any]:
        player = self.state.players.get(player_id)
        threat = self.state.get_assigned_threat(player_id)

        if not player or not threat:
            return {"error": "Player or threat not found for preview."}

        try:
            payload_model = DefensePayload(**defense_payload)
            # Use check_only=True for a read-only preview
            self.validator.validate_scrap_payment(player, payload_model.scrap_spent, check_only=True)
            arsenal_cards = self.validator.validate_arsenal_cards_in_hand(player, payload_model.arsenal_card_ids)
            self.validator.validate_special_defense_inputs(payload_model, arsenal_cards)

            # Create a temporary defense object for calculation
            defense = PlayerDefense(
                scrap_spent=payload_model.scrap_spent,
                arsenal_card_ids=payload_model.arsenal_card_ids,
                special_target_stat=payload_model.special_target_stat,
                special_corrode_stat=payload_model.special_corrode_stat,
                special_amp_spend=payload_model.special_amp_spend
            )
            
            # Run the calculation
            return self.calculate_defense(player, threat, defense)

        except (ValidationError, ValueError) as e:
            return {"error": f"Invalid defense payload: {e}"}
        except Exception as e:
            print(f"Error during defense preview: {e}")
            return {"error": f"Calculation failed: {e}"}

    def calculate_defense(self, player: PlayerState, threat: ThreatCard, defense: PlayerDefense) -> Dict[str, Any]:
        """
        Calculates if a player's defense beats a threat.
        This is a direct port of the logic from old_game_instance.py
        """
        
        # 1. Get Base Defense
        base_defense = {s: 0 for s in ScrapType}
        if player.plan: # player.plan should be set during the phase
            planned_action_card = player.get_card_from_hand(player.plan.action_card_id)
            
            for action_card in player.action_cards:
                if planned_action_card and action_card.id == planned_action_card.id:
                    continue # Skip the played card
                
                card_name_key = action_card.name.upper().replace(" ", "_")
                if card_name_key in BASE_DEFENSE_MAP:
                    for s_type, val in BASE_DEFENSE_MAP[card_name_key].items():
                        base_defense[s_type] += val
        
        # 2. Get Scrap Value
        scrap_value = self._get_scrap_value(player, defense, threat)

        # 3. Get Arsenal & Upgrade Boosts
        arsenal_boosts, has_lure_to_weakness, has_corrosive_sludge = self._get_arsenal_boosts(player, defense)
        upgrade_boosts, upgrade_piercing_boosts = self._get_upgrade_boosts(player)
        
        # 5. Get Special Amp Boosts
        amp_boosts = defense.special_amp_spend

        # 6. Calculate Final Defense Totals
        final_defense_non_piercing = {
            s: base_defense[s] + scrap_value[s] + arsenal_boosts[s] + upgrade_boosts[s]
            for s in ScrapType
        }
        final_piercing_defense = {
            s: upgrade_piercing_boosts[s] + amp_boosts.get(s, 0)
            for s in ScrapType
        }

        # 7. Get Threat's Target Stats
        threat_original_stats = {
            ScrapType.PARTS: threat.ferocity,
            ScrapType.WIRING: threat.cunning,
            ScrapType.PLATES: threat.mass,
        }
        resistant_to, immune_to = threat.resistant.copy(), threat.immune.copy()

        # 8. Apply Special Modifiers (Corrosive Sludge)
        corrosive_sludge_active = False
        if has_corrosive_sludge and defense.special_corrode_stat:
            corrosive_sludge_active = True
            s_type = defense.special_corrode_stat
            if s_type in immune_to: immune_to.remove(s_type)
            if s_type in resistant_to: resistant_to.remove(s_type)

        # 9. Apply Resistance/Immunity to non-scrap defense
        final_defense_non_piercing_applied = final_defense_non_piercing.copy()
        for s_type in ScrapType:
            # Scrap value is already calculated with resistance/immunity
            # We only need to check non-scrap-based defense
            non_scrap_defense = base_defense[s_type] + arsenal_boosts[s_type] + upgrade_boosts[s_type]
            if s_type in immune_to:
                non_scrap_defense = 0
            # Note: Resistance does not apply to non-scrap defense per v1.8 rules
            
            final_defense_non_piercing_applied[s_type] = scrap_value[s_type] + non_scrap_defense

        # 10. Check for Kill
        total_defense_applied = {
            s: final_defense_non_piercing_applied[s] + final_piercing_defense[s]
            for s in ScrapType
        }
        is_kill, highest_stats_to_beat, lure_to_weakness_active = self._check_for_kill(
            total_defense_applied, threat_original_stats, defense, has_lure_to_weakness
        )

        # Return a structured dictionary
        return {
            "is_kill": is_kill,
            "player_total_defense": {s.value: v for s, v in total_defense_applied.items()},
            "threat_original_stats": {s.value: v for s, v in threat_original_stats.items()},
            "threat_highest_stats_to_beat": [s.value for s in highest_stats_to_beat],
            "threat_resistant_to": [s.value for s in resistant_to],
            "threat_immune_to": [s.value for s in immune_to],
            "is_lure_to_weakness_active": lure_to_weakness_active,
            "is_corrosive_sludge_active": corrosive_sludge_active,
            # For debugging:
            "debug_base_defense": {s.value: v for s, v in base_defense.items()},
            "debug_scrap_value": {s.value: v for s, v in scrap_value.items()},
            "debug_piercing_defense": {s.value: v for s, v in final_piercing_defense.items()},
        }

    def _get_scrap_value(self, player: PlayerState, defense: PlayerDefense, threat: ThreatCard):
        scrap_count = defense.scrap_spent
        scrap_value = {s: 0 for s in ScrapType}
        ignores_resist = {s: False for s in ScrapType}
        scrap_bonus = {s: 0 for s in ScrapType}

        # Check for permanent upgrades
        for card in player.upgrade_cards:
            if card.special_effect_id == UpgradeEffect.SCRAP_IGNORE_RESIST_PARTS: ignores_resist[ScrapType.PARTS] = True
            elif card.special_effect_id == UpgradeEffect.SCRAP_IGNORE_RESIST_WIRING: ignores_resist[ScrapType.WIRING] = True
            elif card.special_effect_id == UpgradeEffect.SCRAP_IGNORE_RESIST_PLATES: ignores_resist[ScrapType.PLATES] = True
            elif card.special_effect_id == UpgradeEffect.SCRAP_BONUS_PARTS_1: scrap_bonus[ScrapType.PARTS] += 1
            elif card.special_effect_id == UpgradeEffect.SCRAP_BONUS_WIRING_1: scrap_bonus[ScrapType.WIRING] += 1
            elif card.special_effect_id == UpgradeEffect.SCRAP_BONUS_PLATES_1: scrap_bonus[ScrapType.PLATES] += 1

        # Calculate value
        for s_type, count in scrap_count.items():
            if count == 0: continue
            
            base_val = 2 + scrap_bonus[s_type] # Base is 2, +1 for bonus
            
            if s_type in threat.immune: 
                scrap_value[s_type] = 0
            elif s_type in threat.resistant and not ignores_resist[s_type]: 
                scrap_value[s_type] = (base_val - 1) * count # Resistance drops value by 1
            else: 
                scrap_value[s_type] = base_val * count
        return scrap_value

    def _get_arsenal_boosts(self, player: PlayerState, defense: PlayerDefense):
        arsenal_boosts = {s: 0 for s in ScrapType}
        has_lure, has_corrosive = False, False
        arsenal_cards_used = [player.get_card_from_hand(cid) for cid in defense.arsenal_card_ids]
        
        for card in arsenal_cards_used:
            if card and isinstance(card, ArsenalCard):
                for s_type, amount in card.defense_boost.items(): arsenal_boosts[s_type] += amount
                if card.special_effect_id == ArsenalEffect.SPECIAL_LURE_TO_WEAKNESS: has_lure = True
                if card.special_effect_id == ArsenalEffect.SPECIAL_CORROSIVE_SLUDGE: has_corrosive = True
        return arsenal_boosts, has_lure, has_corrosive

    def _get_upgrade_boosts(self, player: PlayerState):
        upgrade_boosts = {s: 0 for s in ScrapType}
        piercing_boosts = {s: 0 for s in ScrapType}
        for card in player.upgrade_cards:
            for s_type, amount in card.defense_boost.items(): upgrade_boosts[s_type] += amount
            for s_type, amount in card.defense_piercing.items(): piercing_boosts[s_type] += amount
        return upgrade_boosts, piercing_boosts

    def _check_for_kill(self, total_defense, threat_stats, defense, has_lure):
        lure_active = False
        if has_lure and defense.special_target_stat:
            lure_active = True
            s_type = defense.special_target_stat
            is_kill = total_defense[s_type] >= threat_stats[s_type]
            return is_kill, [s_type], lure_active

        # Standard kill check
        highest_stat_val = max(threat_stats.values()) if threat_stats else 0
        if highest_stat_val == 0: 
            return True, [], False # Threat has 0 stats, auto-kill

        highest_stats_to_beat = [s for s, v in threat_stats.items() if v == highest_stat_val]
        
        # You kill if you beat *at least one* of the highest stats
        is_kill = any(total_defense[s] >= threat_stats[s] for s in highest_stats_to_beat)
        
        return is_kill, highest_stats_to_beat, False