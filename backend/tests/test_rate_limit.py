"""Criterio ROADMAP 0.2.3: más de 120 peticiones/minuto → 429, burst 240 tolerado.

Límite y algoritmo según docs/GAIA_SECURITY.md §4.1 y §4.2. Redis va simulado con
fakeredis (el script Lua es real y se ejecuta en el fake).
"""

import pytest

from app.main import app
from app.middleware import rate_limit

PROBE = "/api/_rl-probe"


@pytest.fixture
def probe(fake_redis):
    """Endpoint de prueba: los módulos reales (F2-F6) aún no existen."""
    @app.get(PROBE)
    async def _rl_probe():
        return {"success": True, "data": {"ok": True}, "error": None}

    return PROBE


@pytest.fixture
def clock(monkeypatch):
    """Reloj congelado: si no, el refill real (2 tokens/s) tapa el agotamiento."""
    state = {"t": 1_700_000_000.0}
    monkeypatch.setattr(rate_limit, "_now", lambda: state["t"])
    return state


def test_burst_240_tolerado(client, probe, clock):
    for _ in range(240):
        assert client.get(PROBE).status_code == 200

    res = client.get(PROBE)

    assert res.status_code == 429
    body = res.json()
    assert body["success"] is False
    assert body["data"] is None
    assert body["error"]["code"] == "UPSTREAM_RATE_LIMITED"
    assert body["error"]["details"]["retry_after_seconds"] >= 1
    assert int(res.headers["Retry-After"]) >= 1


def test_refill_tras_un_minuto(client, probe, clock):
    for _ in range(240):
        client.get(PROBE)
    assert client.get(PROBE).status_code == 429

    # 60 s después: 120 tokens recargados (120/min).
    clock["t"] += 60
    for _ in range(120):
        assert client.get(PROBE).status_code == 200

    assert client.get(PROBE).status_code == 429


def test_limite_no_se_excede_al_capacity(client, probe, clock):
    """Con reloj congelado, tras el refill tampoco se superan los 240 tokens."""
    for _ in range(240):
        client.get(PROBE)
    clock["t"] += 3600
    for _ in range(240):
        assert client.get(PROBE).status_code == 200

    assert client.get(PROBE).status_code == 429


async def test_health_exento_al_rate_limit(client, fake_redis):
    for _ in range(5):
        assert client.get("/api/health").status_code == 200

    # Exento = ni siquiera crea bucket en Redis.
    assert await fake_redis.keys("*") == []
