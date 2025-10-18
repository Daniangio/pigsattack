from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    SECRET_KEY: str = "a_super_secret_key_that_should_be_in_an_env_file"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 30

    class Config:
        env_file = ".env"

settings = Settings()