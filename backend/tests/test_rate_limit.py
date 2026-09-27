"""Criterio ROADMAP 0.2.3: más de 120 peticiones/minuto → 429, burst 240 tolerado.

Límite y algoritmo según docs/GAIA_SECURITY.md §4.1 y §4.2. Redis va simulado con
fakeredis (el script Lua es real y se ejecuta en el fake).
"""

import pytest

from app.main import app
from app.middleware import rate_limit
from tests.conftest import PROBE


@pytest.fixture
def probe(fake_redis):
    """Redis simulado + la ruta normal compartida de conftest."""
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


def test_limite_por_ip_un_cliente_no_deja_sin_servicio_a_los_demas(
    client, probe, clock
):
    """El bucket es `{IP}:{endpoint}` (SECURITY §4.1), no uno global compartido.

    Sin esto, un cliente que agotara su cuota dejaría sin servicio al resto: con
    240 peticiones contra una IP, otra distinta tiene que seguir pasando. Las IP se
    varían con `X-Forwarded-For`, que es lo que el backend honra detrás del proxy de
    DEPLOYMENT §5.
    """
    ip_a = {"X-Forwarded-For": "203.0.113.7"}
    ip_b = {"X-Forwarded-For": "198.51.100.4"}

    for _ in range(240):
        assert client.get(PROBE, headers=ip_a).status_code == 200

    assert client.get(PROBE, headers=ip_a).status_code == 429
    assert client.get(PROBE, headers=ip_b).status_code == 200


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

    # Exento = ni siquiera crea bucket en Redis. Las claves de sesion
    # (`gaia:session:*`, SECURITY §3.1) no son buckets y no se miran aqui.
    buckets = [k for k in await fake_redis.keys("*") if not k.startswith(b"gaia:session:")]
    assert buckets == []


async def test_un_429_no_crea_sesion(client, fake_redis, clock):
    """El rate-limit va por delante de la sesion: un 429 no abre sesion nueva."""
    for _ in range(240):
        client.get(PROBE)
    antes = len([k async for k in fake_redis.scan_iter(match="gaia:session:*")])

    assert client.get(PROBE).status_code == 429

    despues = len([k async for k in fake_redis.scan_iter(match="gaia:session:*")])
    assert despues == antes
