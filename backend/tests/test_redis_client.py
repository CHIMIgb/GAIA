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
from tests.conftest import PROBE


async def test_ping_responde(fake_redis):
    assert await get_redis().ping() is True


async def test_ttl_se_respeta(fake_redis):
    client = get_redis()
    await client.set("gaia:test", "1", ex=300)

    assert 0 < await client.ttl("gaia:test") <= 300


async def test_get_devuelve_lo_que_se_escribio(fake_redis):
    client = get_redis()
    await client.set("gaia:test", "valor")

    assert await client.get("gaia:test") == b"valor"


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


class DeadRedis:
    """Redis caído: cualquier comando lanza ConnectionError.

    El middleware de sesión y el rate-limit usan get_redis() directo (no la
    dependencia inyectada), así que Redis tiene que estar muerto también para ellos.
    """

    def __getattr__(self, _name):
        async def _fail(*_args, **_kwargs):
            raise RedisConnectionError("redis caído")

        return _fail


@pytest.fixture
def dead_redis(monkeypatch):
    """Redis muerto en toda la app, y `dependency_overrides` se limpia al terminar.

    Que sea una fixture y no un `try/finally` en cada test es a propósito: `app` es
    global y un override sin limpiar envenena los tests siguientes.
    """
    app.dependency_overrides[get_redis] = lambda: DeadRedis()
    monkeypatch.setattr(redis_client, "_redis", DeadRedis())
    monkeypatch.setattr(redis_client, "_redis_loop", redis_client._LOOP_ANY)
    yield
    app.dependency_overrides.clear()


def test_health_no_falla_si_redis_cae(client, dead_redis):
    res = client.get("/api/health")

    assert res.status_code == 200
    assert res.json()["data"] == {"status": "ok", "redis": "disconnected"}


def test_una_peticion_normal_tambien_se_sirve_si_redis_cae(
    client, dead_redis, caplog
):
    """Fail-open del rate-limit (0.6.8): con Redis caído se sirve y se avisa.

    Sin esto, toda ruta /api/* daba 500 porque el limitador no capturaba el error de
    Redis. El aviso en el log es la contrapartida: el corte no es silencioso.
    """
    with caplog.at_level("WARNING", logger="app.middleware.rate_limit"):
        res = client.get(PROBE)

    assert res.status_code == 200
    assert res.json() == {"success": True, "data": {"ok": True}, "error": None}
    assert "Rate-limit no disponible" in caplog.text
