"""Settings de la aplicación.

Variables y defaults según docs/GAIA_DEPLOYMENT.md §4.1.
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    REDIS_URL: str = "redis://localhost:6379/0"
    # Timeout de conexión y de lectura a Redis (s). Default = default de redis-py.
    REDIS_TIMEOUT_SECONDS: float = 5.0
    # DSN SQLAlchemy async (asyncpg). Default = docs/GAIA_DATABASE.md §6.4.
    DATABASE_URL: str = "postgresql+asyncpg://gaia:gaia@localhost:5432/gaia"
    # Cookie de sesión (docs/GAIA_SECURITY.md §3.1).
    SESSION_COOKIE_NAME: str = "gaia_session"
    # Max-Age 30 días = 2592000 s (§3.1). También es el TTL del hash en Redis.
    SESSION_TTL_SECONDS: int = 2592000
    # `Secure` solo en producción: sobre HTTP local invalidaría la cookie (§3.1).
    SESSION_COOKIE_SECURE: bool = False
    # Peticiones entre refrescos del registro en `session_events`: Redis lleva la
    # cuenta caliente y la BD se actualiza de tanto en tanto, no en cada request.
    SESSION_DB_FLUSH_EVERY: int = 10


settings = Settings()
