from collections.abc import Iterator

import pytest
from fakeredis import aioredis
from fastapi.testclient import TestClient

from app.cache import redis_client
from app.main import app


@pytest.fixture
def client() -> Iterator[TestClient]:
    # raise_server_exceptions=False: deja que el handler global de 500 se pruebe de verdad.
    # El `with` no es cosmético: sin lifespan no corre `close_redis()` al final del
    # test, el pool de Redis sobrevive al loop que lo creó y la petición siguiente
    # muere con "Event loop is closed" → 500. Dentro del `with` hay un solo loop por
    # test y el lifespan lo cierra limpio.
    with TestClient(app, raise_server_exceptions=False) as test_client:
        yield test_client


@pytest.fixture
def fake_redis(monkeypatch):
    """Redis simulado en el sitio del singleton (PROJECT_STRUCTURE §5.11)."""
    redis = aioredis.FakeRedis()
    monkeypatch.setattr(redis_client, "_redis", redis)
    # El cliente inyectado no pertenece a ningún loop: get_redis() lo respeta y no
    # lo reemplaza por uno real (el pool de redis.asyncio se ata al loop, y aquí
    # conviven el loop del TestClient y el del propio test).
    monkeypatch.setattr(redis_client, "_redis_loop", redis_client._LOOP_ANY)
    return redis
