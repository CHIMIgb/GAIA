"""Cliente Redis asíncrono (`redis>=5`, API `redis.asyncio`) — singleton con
reconexión automática (PROJECT_STRUCTURE §5.10).
"""

from redis.asyncio import Redis

from app.config import settings

_redis: Redis | None = None


def get_redis() -> Redis:
    global _redis
    if _redis is None:
        _redis = Redis.from_url(
            settings.REDIS_URL,
            socket_connect_timeout=settings.REDIS_TIMEOUT_SECONDS,
            socket_timeout=settings.REDIS_TIMEOUT_SECONDS,
            decode_responses=True,
        )
    return _redis


async def close_redis() -> None:
    """Cierra el pool; `redis.asyncio` no tiene deconstructor async."""
    global _redis
    if _redis is not None:
        await _redis.aclose()
        _redis = None
