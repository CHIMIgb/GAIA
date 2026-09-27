"""Cliente Redis asíncrono (`redis>=5`, API `redis.asyncio`) — singleton con
reconexión automática (PROJECT_STRUCTURE §5.10).
"""

import asyncio

from redis.asyncio import Redis

from app.config import settings

_redis: Redis | None = None
_redis_loop: asyncio.AbstractEventLoop | object | None = None

# Marcador para el cliente que inyectan los tests: no pertenece a ningún loop y
# por tanto serves para todos (el TestClient y el test corren en loops distintos).
_LOOP_ANY = object()


def get_redis() -> Redis:
    global _redis, _redis_loop
    try:
        loop: asyncio.AbstractEventLoop | None = asyncio.get_running_loop()
    except RuntimeError:
        loop = None  # contexto síncrono: no hay pool al que atar todavía

    # El pool de redis.asyncio queda atado al loop que lo creó. En producción hay
    # uno solo, pero en tests cada TestClient abre el suyo: si el cliente sobrevive
    # a su loop, la siguiente petición muere con "Event loop is closed".
    if _redis is None:
        _redis = _new_client()
        _redis_loop = loop
    elif loop is not None and _redis_loop is not _LOOP_ANY:
        if _redis_loop is None:
            _redis_loop = loop  # creado sin loop: se ata al actual
        elif _redis_loop is not loop:
            _redis = _new_client()  # el loop anterior ya está cerrado
            _redis_loop = loop
    return _redis


def _new_client() -> Redis:
    return Redis.from_url(
        settings.REDIS_URL,
        socket_connect_timeout=settings.REDIS_TIMEOUT_SECONDS,
        socket_timeout=settings.REDIS_TIMEOUT_SECONDS,
        decode_responses=True,
    )


async def close_redis() -> None:
    """Cierra el pool; `redis.asyncio` no tiene deconstructor async."""
    global _redis, _redis_loop
    if _redis is not None:
        await _redis.aclose()
    _redis = None
    _redis_loop = None
