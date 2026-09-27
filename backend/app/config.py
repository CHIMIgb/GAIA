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
    # Orígenes permitidos del frontend, separados por coma (DEPLOYMENT §4.1).
    # Allowlist explícita, nunca `*`: la API lleva cookie de sesión, y con
    # credenciales el navegador rechaza un `*` (SECURITY §5.2). El default es el
    # puerto del dev server de Vite (ROADMAP 0.1.1).
    CORS_ORIGINS: str = "http://localhost:5173"
    # Modo desarrollo (DEPLOYMENT §4.1): detalles en INTERNAL_SERVER_ERROR y logs
    # verbose. Aquí además monta `/docs` y cambia la CSP a la variante con
    # `'unsafe-inline'` de la NOTA de SECURITY §6.2, que Swagger UI necesita.
    DEBUG: bool = False


settings = Settings()
