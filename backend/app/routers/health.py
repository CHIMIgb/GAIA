"""GET /api/health — estado del servidor y de Redis.

Forma del payload según docs/GAIA_DEPLOYMENT.md §3.3. PostgreSQL y conectividad a
APIs se añaden cuando existan sus dependencias (0.3.1 y siguientes).
"""

from typing import Any

from fastapi import APIRouter, Depends
from redis.asyncio import Redis
from redis.exceptions import RedisError

from app.cache.redis_client import get_redis
from app.models.response import APIResponse

router = APIRouter()


@router.get("/health", response_model=APIResponse[dict[str, Any]])
async def health(redis: Redis = Depends(get_redis)) -> APIResponse[dict[str, Any]]:
    try:
        await redis.ping()
        redis_status = "connected"
    except RedisError:
        # Health informa, no falla: un Redis caído no debe tumbar el uptime check.
        redis_status = "disconnected"
    return APIResponse.ok({"status": "ok", "redis": redis_status})
