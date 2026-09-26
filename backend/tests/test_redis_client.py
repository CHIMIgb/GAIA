"""Criterio ROADMAP 0.2.2: PING responde, TTL se respeta, timeout configurable.

Redis se simula con fakeredis (DEPLOYMENT §5 y PROJECT_STRUCTURE §5.10); contra un
Redis real (docker) se verifica en el smoke test del Criterio.
"""

import pytest
from redis.exceptions import ConnectionError as RedisConnectionError

from app.cache import redis_client
from app.cache.redis_client import get_redis
from app.config import Settings
from app.main import app


async def test_ping_responde(fake_redis):
    assert await get_redis().ping() is True


async def test_ttl_se_respeta(fake_redis):
    client = get_redis()
    await client.set("gaia:test", "1", ex=300)

    assert 0 < await client.ttl("gaia:test") <= 300


def test_timeout_es_configurable(monkeypatch):
    monkeypatch.setenv("REDIS_TIMEOUT_SECONDS", "1.5")

    assert Settings().REDIS_TIMEOUT_SECONDS == 1.5


def test_timeout_llega_al_cliente(monkeypatch):
    monkeypatch.setenv("REDIS_TIMEOUT_SECONDS", "1.5")
    monkeypatch.setattr(redis_client, "_redis", None)
    monkeypatch.setattr(redis_client, "settings", Settings())

    kwargs = get_redis().connection_pool.connection_kwargs

    assert kwargs["socket_connect_timeout"] == 1.5
    assert kwargs["socket_timeout"] == 1.5


def test_health_no_falla_si_redis_cae(client):
    class DeadRedis:
        async def ping(self) -> bool:
            raise RedisConnectionError("redis caído")

    app.dependency_overrides[get_redis] = lambda: DeadRedis()
    try:
        res = client.get("/api/health")
    finally:
        app.dependency_overrides.clear()

    assert res.status_code == 200
    assert res.json()["data"] == {"status": "ok", "redis": "disconnected"}
