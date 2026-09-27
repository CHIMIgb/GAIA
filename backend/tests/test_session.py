"""Criterio ROADMAP 0.3.2: cookie de sesión anonimizada.

Valores literales de docs/GAIA_SECURITY.md §3.1 y veredicto de
docs/GAIA_DATABASE.md §8.4: token opaco de 256 bits, HttpOnly, SameSite=Lax,
Path=/, Max-Age 30 días, Secure en producción, y en el store solo el sha256.
"""

import re

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import hashlib
from datetime import datetime

from app.config import settings
from app.db.session_store import session_key
from app.middleware.rate_limit import RateLimitMiddleware
from app.services import session as session_service

COOKIE = "gaia_session"


@pytest.fixture
def app(fake_redis, monkeypatch) -> FastAPI:
    """App mínima con el middleware de sesión, sin el resto de la plataforma."""
    monkeypatch.setattr(session_service, "_DB_FLUSH_EVERY", 2)
    test_app = FastAPI()
    test_app.add_middleware(session_service.SessionMiddleware)
    test_app.add_middleware(RateLimitMiddleware)

    @test_app.get("/api/ping")
    async def ping() -> dict[str, str]:
        return {"pong": "ok"}

    return test_app


@pytest.fixture
def client(app: FastAPI) -> TestClient:
    return TestClient(app, raise_server_exceptions=False)


def _set_cookie(response) -> str:
    """Devuelve el token de la cookie gaia_session de la respuesta."""
    raw = response.headers["set-cookie"]
    assert raw.startswith(f"{COOKIE}=")
    return raw.split(";", 1)[0].split("=", 1)[1]


# --- Token -----------------------------------------------------------------


def test_el_token_es_opaco_de_256_bits() -> None:
    token = session_service.new_token()
    assert re.fullmatch(r"[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}", token)
    assert token != session_service.new_token()


def test_la_clave_de_sesion_es_el_sha256_del_token() -> None:
    token = session_service.new_token()
    digest = session_key(token)
    assert digest == hashlib.sha256(token.encode()).hexdigest()
    assert len(digest) == 64
    assert token not in digest


# --- Cookie ----------------------------------------------------------------


async def test_la_sesion_guarda_ultima_actividad_y_contador(
    client, fake_redis, monkeypatch
) -> None:
    async def _nada(session_hash: str, requests: int, user_agent: str | None) -> None:
        return None

    monkeypatch.setattr(session_service, "upsert_session_event", _nada)
    token = _set_cookie(client.get("/api/ping"))
    datos = await fake_redis.hgetall(f"gaia:session:{session_key(token)}")
    assert datos[b"requests"] == b"1"
    # `last_seen` es una marca de tiempo ISO, no un marcador vacío.
    assert datetime.fromisoformat(datos[b"last_seen"].decode()).tzinfo is not None


async def test_una_peticion_crea_la_sesion_y_su_cookie(
    client: TestClient, fake_redis
) -> None:
    response = client.get("/api/ping")
    assert response.status_code == 200
    token = _set_cookie(response)
    # La sesión existe en Redis y solo guarda el hash (§3.1).
    datos = await fake_redis.hgetall(f"gaia:session:{session_key(token)}")
    assert datos[b"hash"].decode() == session_key(token)
    assert datos[b"requests"] == b"1"


def test_atributos_de_la_cookie_httponly_samesite_maxage(client: TestClient) -> None:
    raw = client.get("/api/ping").headers["set-cookie"]
    assert "HttpOnly" in raw
    # Starlette emite "SameSite=lax"; el valor no distingue mayusculas (RFC 6265).
    assert "samesite=lax" in raw.lower()
    assert "Path=/" in raw
    assert f"Max-Age={settings.SESSION_TTL_SECONDS}" in raw
    assert session_service.COOKIE_NAME == COOKIE == "gaia_session"
    assert settings.SESSION_TTL_SECONDS == 2592000  # 30 días (§3.1)


def test_secure_solo_cuando_corresponde(client: TestClient, monkeypatch) -> None:
    # En local (HTTP) no se marca Secure; en producción sí (§3.1).
    assert "Secure" not in client.get("/api/ping").headers["set-cookie"]
    monkeypatch.setattr(settings, "SESSION_COOKIE_SECURE", True)
    assert "Secure" in client.get("/api/ping").headers["set-cookie"]


def test_la_cookie_no_va_en_el_cuerpo_ni_en_la_url(client: TestClient) -> None:
    response = client.get("/api/ping")
    assert COOKIE not in response.text
    assert "gaia_session" not in str(response.request.url)


# --- Reuso de sesión -------------------------------------------------------


async def test_la_segunda_peticion_reutiliza_la_sesion(
    client: TestClient, fake_redis
) -> None:
    first = client.get("/api/ping")
    token = _set_cookie(first)
    second = client.get("/api/ping")  # el TestClient reenvía la cookie
    # Mismo token (no se crea otra sesión) y cookie renovada: §3.1 "se renueva con uso".
    assert _set_cookie(second) == token
    datos = await fake_redis.hgetall(f"gaia:session:{session_key(token)}")
    assert datos[b"requests"] == b"2"


def test_un_token_desconocido_no_se_acepta_como_sesion(client: TestClient) -> None:
    client.cookies.set(COOKIE, "inventado")
    response = client.get("/api/ping")
    # Se renueva: el token no existia en Redis, asi que se crea una sesion nueva.
    assert "set-cookie" in response.headers


# --- Registro en la BD (nada de PII) --------------------------------------


def test_el_registro_usa_el_hash_y_la_familia_de_ua(client: TestClient, monkeypatch) -> None:
    escrito: dict[str, object] = {}

    async def fake_upsert(session_hash: str, requests: int, user_agent: str | None) -> None:
        escrito.update(hash=session_hash, requests=requests, user_agent=user_agent)

    monkeypatch.setattr(session_service, "upsert_session_event", fake_upsert)
    token = _set_cookie(
        client.get("/api/ping", headers={"user-agent": "Mozilla/5.0 Chrome/126.0 Safari/537.36"})
    )
    client.get("/api/ping", headers={"user-agent": "Mozilla/5.0 Chrome/126.0 Safari/537.36"})

    assert escrito["hash"] == session_key(token)
    assert token not in str(escrito["hash"])
    assert escrito["requests"] == 2  # refresco cada N peticiones
    # Solo la familia del navegador: nunca el UA crudo (DATABASE §8.3).
    assert escrito["user_agent"] == "Chrome"


def test_la_bd_caida_no_rompe_la_navegacion(client: TestClient, monkeypatch) -> None:
    async def boom(*_args, **_kwargs) -> None:
        raise ConnectionError("postgres no responde")

    monkeypatch.setattr(session_service, "upsert_session_event", boom)
    response = client.get("/api/ping")
    assert response.status_code == 200
    assert "set-cookie" in response.headers
