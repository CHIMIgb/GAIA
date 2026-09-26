import pytest
from fakeredis import aioredis
from fastapi.testclient import TestClient

from app.cache import redis_client
from app.main import app


@pytest.fixture
def client() -> TestClient:
    # raise_server_exceptions=False: deja que el handler global de 500 se pruebe de verdad.
    return TestClient(app, raise_server_exceptions=False)


@pytest.fixture
def fake_redis(monkeypatch):
    """Redis simulado en el sitio del singleton (PROJECT_STRUCTURE §5.11)."""
    redis = aioredis.FakeRedis()
    monkeypatch.setattr(redis_client, "_redis", redis)
    return redis
