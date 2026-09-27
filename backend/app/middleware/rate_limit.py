"""Rate-limit global: token bucket por IP sobre Redis (docs/GAIA_SECURITY.md §4.1).

- Bucket = un hash de Redis con los campos `tokens` y `last`, recreado desde cero con
  `capacity` tokens tras `refill_per_min × 2` s de inactividad.
- La recarga y el drenaje ocurren en un único script LUA atómico.
- `/api/health` está exento (uptime checks). Los límites por módulo de la tabla de
  §4.1 se añaden con cada módulo (F2-F6).
- Si Redis no responde, el limitador **degrada y deja pasar** (fail-open), con aviso en
  el log: la API se queda de pie y `/api/health` reporta `redis: "disconnected"`. El
  límite global se revisa con el diseño de resiliencia de F8.
"""

import logging
import math
import time
from typing import Any

from fastapi import status
from fastapi.responses import JSONResponse
from redis.exceptions import RedisError

from app.cache.redis_client import get_redis
from app.models.response import APIResponse, ErrorCode

logger = logging.getLogger(__name__)

GLOBAL_LIMIT: dict[str, int] = {"capacity": 240, "refill_per_min": 120}
EXEMPT_PATHS = frozenset({"/api/health"})

# ARGV: capacity, refill_per_min, now, ttl_bucket. Devuelve 1 (permitido) o 0 (429).
LUA_ALLOW = """
local capacity, refill_per_min, now, ttl = tonumber(ARGV[1]), tonumber(ARGV[2]), tonumber(ARGV[3]), tonumber(ARGV[4])
local rate = refill_per_min / 60.0

local tokens = tonumber(redis.call('HGET', KEYS[1], 'tokens'))
local last = tonumber(redis.call('HGET', KEYS[1], 'last'))
if tokens == nil then
    tokens, last = capacity, now
end

tokens = math.min(capacity, tokens + (now - last) * rate)
if tokens < 1 then
    redis.call('HSET', KEYS[1], 'tokens', tokens, 'last', now)
    redis.call('EXPIRE', KEYS[1], ttl)
    return 0
end

redis.call('HSET', KEYS[1], 'tokens', tokens - 1, 'last', now)
redis.call('EXPIRE', KEYS[1], ttl)
return 1
"""


def _now() -> float:
    return time.time()


def _client_ip(scope: dict[str, Any]) -> str:
    # ponytail: X-Forwarded-For solo se honra detrás del proxy Nginx de DEPLOYMENT §5;
    # si el backend se expone sin proxy, hay que ignorar la cabecera.
    forwarded = dict(scope.get("headers") or {}).get(b"x-forwarded-for")
    if forwarded:
        return forwarded.decode().split(",")[0].strip()
    client = scope.get("client")
    return client[0] if client else "unknown"


class RateLimitMiddleware:
    """ASGI middleware global sobre `/api/*` (SECURITY §4.1)."""

    def __init__(self, app, limit: dict[str, int] = GLOBAL_LIMIT) -> None:
        self.app = app
        self.limit = limit

    async def __call__(self, scope, receive, send) -> None:
        path = scope.get("path", "")
        if scope["type"] != "http" or path in EXEMPT_PATHS or not path.startswith("/api"):
            await self.app(scope, receive, send)
            return

        redis = get_redis()
        # Bucket por IP y endpoint: el límite "global" es el fallback de los endpoints
        # sin límite propio.
        key = f"{_client_ip(scope)}:{path}"
        try:
            allowed = await redis.eval(
                LUA_ALLOW,
                1,
                key,
                self.limit["capacity"],
                self.limit["refill_per_min"],
                _now(),
                self.limit["refill_per_min"] * 2,
            )
        except (RedisError, OSError, TimeoutError) as exc:
            # Fail-open, igual que la sesión: si Redis no responde, la petición se
            # sirve igual y sin límite. Servir de más durante una caída de Redis es
            # mejor que no servir nada, y el corte no es silencioso —`/api/health`
            # ya reporta `redis: disconnected` y esto avisa por log—. El precio es
            # que el rate-limit queda apagado mientras Redis esté caído.
            logger.warning("Rate-limit no disponible (Redis): %s", exc)
            await self.app(scope, receive, send)
            return
        if allowed:
            await self.app(scope, receive, send)
            return

        # Un bucket rechazado tiene menos de 1 token: esperar 1 token es la espera
        # máxima necesaria.
        retry_after = max(1, math.ceil(60 / self.limit["refill_per_min"]))
        body = APIResponse.fail(
            ErrorCode.UPSTREAM_RATE_LIMITED,
            f"Too many requests. Try again in {retry_after} seconds.",
            {"retry_after_seconds": retry_after},
        ).model_dump(mode="json")
        response = JSONResponse(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS, content=body
        )
        response.headers["Retry-After"] = str(retry_after)
        response.headers["RateLimit-Limit"] = str(self.limit["refill_per_min"])
        response.headers["RateLimit-Remaining"] = "0"
        response.headers["RateLimit-Reset"] = str(retry_after)
        await response(scope, receive, send)
