from fastapi import APIRouter, HTTPException, Depends
from typing import Dict

from .server_models import User, GameRecord
from .schemas import PlayerProfile, GameHistoryEntry, GameRecordDetails


# This would be your actual database in a real application
from .routers import fake_games_db, fake_users_db

router = APIRouter()

# --- START FIX ---
# Changed the path to remove the '/api' prefix, as it's handled by the app.include_router in main.py
@router.get("/players/{user_id}", response_model=PlayerProfile)
# --- END FIX ---
async def get_player_profile(user_id: str):
    """
    Fetches a player's profile, including their game history.
    """
    if user_id not in fake_users_db:
        raise HTTPException(status_code=404, detail="Player not found")

    user: User = fake_users_db[user_id]
    game_history: list[GameHistoryEntry] = []
    user_game_ids = user.game_ids
    for game_id in user_game_ids:
        if game_id in fake_games_db:
            record = fake_games_db[game_id]
            is_win = record.winner is not None and record.winner.id == user_id
            game_history.append(GameHistoryEntry(
                game_record_id=game_id,
                room_name=record.room_name,
                started_at=record.started_at,
                ended_at=record.ended_at,
                is_win=is_win))

    wins = sum(1 for game in game_history if game.is_win)
    # Return a public version of the user object
    public_user = {"id": user.id, "username": user.username}
    return PlayerProfile(user=public_user, games_played=len(game_history), wins=wins, game_history=game_history)

# --- START FIX ---
# Changed the path to remove the '/api' prefix
@router.get("/games/{game_record_id}", response_model=GameRecordDetails)
# --- END FIX ---
async def get_game_record(game_record_id: str):
    """
    Fetches the details of a specific past game.
    """
    if game_record_id not in fake_games_db:
        raise HTTPException(status_code=404, detail="Game record not found")
    return fake_games_db[game_record_id]
