from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    db_host: str = "localhost"
    db_port: int = 5432
    db_user: str = "projectmanager"
    db_password: str = "projectmanager"
    db_name: str = "projectmanager"
    secret_key: str = "your-secret-key-change-in-production"
    algorithm: str = "HS256"

    model_config = SettingsConfigDict(env_file=".env")

settings = Settings()
