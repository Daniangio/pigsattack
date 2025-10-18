from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from typing import Annotated
from . import security
from . import models

router = APIRouter()

# In-memory "database" for registered users.
# In a real application, this would be a database session.
fake_users_db = {
    "admin": models.UserInDB(
        id="admin",
        username="admin",
        hashed_password=security.get_password_hash("admin")
    )
}

# In-memory "database" for completed game records.
fake_games_db: dict[str, models.GameRecord] = {}

@router.post("/register", response_model=models.UserPublic)
def register_user(user: models.UserCreate):
    """
    Register a new user.
    """
    # --- START FIX ---
    # Add validation to prevent the bcrypt error.
    if len(user.password) < 8:
         raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Password must be at least 8 characters long.",
        )
    if len(user.password) > 72:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Password cannot be longer than 72 characters.",
        )
    if user.username in fake_users_db:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username already registered",
        )
    # --- END FIX ---
    
    hashed_password = security.get_password_hash(user.password)
    
    # Create the user object to store
    stored_user = models.UserInDB(id=user.username, username=user.username, hashed_password=hashed_password)
    fake_users_db[user.username] = stored_user
    
    # Return the public version of the user object
    return models.UserPublic(id=user.username, username=user.username)


@router.post("/token", response_model=models.Token)
def login_for_access_token(
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()]
):
    """
    Login and return a JWT access token.
    """
    user = security.authenticate_user(fake_users_db, form_data.username, form_data.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    access_token = security.create_access_token(
        data={"sub": user.username, "username": user.username}
    )
    return {"access_token": access_token, "token_type": "bearer"}


@router.get("/results/{game_id}", response_model=models.GameRecord)
def get_game_result(game_id: str):
    """
    Retrieve the results of a completed game.
    """
    record = fake_games_db.get(game_id)
    if not record:
        raise HTTPException(status_code=404, detail="Game record not found")
    return record
