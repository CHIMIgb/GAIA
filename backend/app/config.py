"""Settings de la aplicación.

Variables y defaults según docs/GAIA_DEPLOYMENT.md §4.1.
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    REDIS_URL: str = "redis://localhost:6379/0"
    # Timeout de conexión y de lectura a Redis (s). Default = default de redis-py.
    REDIS_TIMEOUT_SECONDS: float = 5.0


settings = Settings()
