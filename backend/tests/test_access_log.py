"""Access log: una fila por petición, sin IP ni cookie cruda (ROADMAP 0.3.3)."""

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy.exc import OperationalError

from app.config import settings
from app.middleware import access_log, rate_limit
from app.services import session as session_service
from app.services.session import new_token, session_key

COOKIE = settings.SESSION_COOKIE_NAME


def _token(response) -> str:
    """Token de la cookie `gaia_session` de la respuesta (el jar entra en conflicto)."""
    raw = response.headers["set-cookie"]
    assert raw.startswith(f"{COOKIE}=")
    return raw.split(";", 1)[0].split("=", 1)[1]


@pytest.fixture
def registros(monkeypatch):
    """Captura las filas que el middleware intenta insertar."""
    filas: list[dict] = []

    async def fake_log_request(**kwargs):
        filas.append(kwargs)

    monkeypatch.setattr(access_log, "log_request", fake_log_request)
    return filas


@pytest.fixture
def app(registros, fake_redis, monkeypatch):
    async def _sin_bd(*_args, **_kwargs):
        return None

    monkeypatch.setattr(session_service, "upsert_session_event", _sin_bd)

    # Mismo orden que app/main.py (el último add_middleware es el más externo).
    test_app = FastAPI()
    test_app.add_middleware(session_service.SessionMiddleware)
    test_app.add_middleware(rate_limit.RateLimitMiddleware)
    test_app.add_middleware(access_log.AccessLogMiddleware)

    @test_app.get("/api/pets")
    def pets():
        return {"ok": True}

    @test_app.get("/api/roto")
    def roto():
        raise RuntimeError("reventado")

    return test_app


@pytest.fixture
def client(app):
    return TestClient(app, raise_server_exceptions=False)


async def test_una_peticion_deja_una_fila_con_los_datos(client, registros):
    client.get("/api/pets")

    assert len(registros) == 1
    fila = registros[0]
    assert fila["method"] == "GET"
    assert fila["path"] == "/api/pets"
    assert fila["status_code"] == 200
    assert fila["latency_ms"] >= 0


async def test_loguea_el_codigo_de_error(client, registros):
    """El 500 lo produce ServerErrorMiddleware, por encima del log: aun así se registra."""
    client.get("/api/roto")

    assert [f["status_code"] for f in registros] == [500]


async def test_correlaciona_con_la_sesion_sin_guardar_la_cookie(client, registros):
    token = _token(client.get("/api/pets"))  # crea la sesión y su cookie
    client.get("/api/pets")  # ya es una sesión válida

    fila = registros[-1]
    assert fila["session_hash"] == session_key(token)
    # La cookie en claro no puede aparecer en ningún valor registrado.
    assert token not in "".join(str(v) for v in fila.values())


async def test_una_sesion_desconocida_se_renueva_con_otro_hash(client, registros):
    inventado = new_token()
    client.cookies.set(COOKIE, inventado)
    nuevo = _token(client.get("/api/pets"))

    # La sesión se renueva: se registra el hash de la sesión nueva, no el del
    # token que no existía en Redis.
    assert registros[-1]["session_hash"] == session_key(nuevo)
    assert registros[-1]["session_hash"] != session_key(inventado)


async def test_el_query_string_no_se_guarda(client, registros):
    """La ruta basta para auditar; los parámetros no se registran."""
    client.get("/api/pets?hours=24&lat=41.4")

    assert registros[-1]["path"] == "/api/pets"


async def test_una_bd_caida_no_rompe_la_peticion(client, monkeypatch):
    """El log es accesorio: si la BD no responde, la API sigue sirviendo."""

    async def boom(**_kwargs):
        raise OperationalError("INSERT", {}, Exception("bd caída"))

    monkeypatch.setattr(access_log, "log_request", boom)

    assert client.get("/api/pets").status_code == 200


async def test_el_health_check_tambien_se_loguea(client, registros):
    """El log es de la API entera; /api/health entra como una petición más."""
    client.get("/api/health")

    assert [f["path"] for f in registros] == ["/api/health"]


async def test_un_429_tambien_se_loguea(client, registros, monkeypatch):
    """El access log va por fuera del rate-limit: los rechazos son lo que más
    interesa en una auditoría (abuso/scraping), así que no se pueden perder."""
    monkeypatch.setattr(rate_limit, "_now", lambda: 1_700_000_000.0)
    for _ in range(240):
        client.get("/api/pets")
    registros.clear()

    assert client.get("/api/pets").status_code == 429

    assert [f["status_code"] for f in registros] == [429]
