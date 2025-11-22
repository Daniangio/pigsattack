Game core (shared)
==================

This package owns all domain logic for the Wild Pigs game and is intentionally isolated from FastAPI/WebSocket concerns. The backend should only route lobby/session events and delegate rules to the classes here.

Key pieces
- `GameSession`: orchestrates turns/phases, holds `GameState`, and exposes `player_action`/`public_preview`.
- `GameDataLoader`: loads static data from `data/market.json` and `data/threats.json`.
- `models.py`: domain enums (`GamePhase`, `Stance`, `TokenType`), dataclasses for cards/state, and helpers for resource conversion.
- `data/`: JSON seeds for threats/boss and market pulled from the existing frontend JS.

Available actions (first pass)
- `fight` with payload `{row, discount_resource?, use_tokens?}`
- `buy_upgrade`/`buy_weapon` with `{card_id}`
- `extend_slot` with `{slot_type: "upgrade"|"weapon"}`
- `realign` with `{stance}`
- `end_turn`, `surrender`, `disconnect`

Usage example
```python
from game_core import GameSession
import asyncio

async def demo():
    session = GameSession("demo", [{"id": "p1", "username": "Alice"}])
    await session.async_setup()
    await session.player_action("p1", "end_turn", {})
    print(session.state.get_redacted_state("p1"))

asyncio.run(demo())
```

Next steps
- Flesh out combat rewards/effects, weapon charges, and boss thresholds.
- Expand phase flow to match the full rulebook (boss fights, intermissions, etc.).
