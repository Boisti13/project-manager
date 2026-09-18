from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    db_host: str = "localhost"
    db_port: int = 5432
    db_user: str = "taskmanager"
    db_password: str = "taskmanager"
    db_name: str = "taskmanager"
    secret_key: str = "your-secret-key-change-in-production"
    algorithm: str = "HS256"

    class Config:
        env_file = ".env"

settings = Settings()
