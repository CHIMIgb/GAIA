"""Criterio ROADMAP 0.3.2: el registro en `session_events` guarda el hash, no la cookie.

Va contra la BD real (el store no se simula). Se omite si no hay PostgreSQL
alcanzable: desde WSL el firewall de Windows descarta el inbound, así que este
test se ejecuta con el Python de Windows (igual que `test_migrations.py`).
"""

import uuid

import pytest

# Un solo event loop para todo el módulo: `app.db.engine` cachea el engine en el
# proceso, y el pool de asyncpg queda atado al loop que lo abrió (por eso los
# tests de la app usan el cliente de redis en vez del singleton global).
pytestmark = pytest.mark.asyncio(loop_scope="module")
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import create_async_engine

from app.config import settings
from app.db.session_store import session_key, upsert_session_event


@pytest.fixture(scope="module")
async def url() -> str:
    value = settings.DATABASE_URL
    engine = create_async_engine(value, connect_args={"timeout": 5})
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
    except (SQLAlchemyError, OSError, TimeoutError) as exc:
        pytest.skip(f"PostgreSQL no alcanzable en {value}: {exc.__class__.__name__}")
    finally:
        await engine.dispose()
    return value


async def _fila(url: str, digest: str) -> dict | None:
    engine = create_async_engine(url)
    try:
        async with engine.connect() as conn:
            row = (
                await conn.execute(
                    text(
                        "SELECT session_hash, request_count, user_agent_family,"
                        " country_code FROM session_events WHERE session_hash = :h"
                    ),
                    {"h": digest},
                )
            ).mappings().first()
        return dict(row) if row else None
    finally:
        await engine.dispose()


async def _borrar(url: str, digest: str) -> None:
    engine = create_async_engine(url)
    try:
        async with engine.connect() as conn:
            await conn.execute(
                text("DELETE FROM session_events WHERE session_hash = :h"), {"h": digest}
            )
            await conn.commit()
    finally:
        await engine.dispose()


async def test_el_registro_guarda_el_hash_y_no_la_cookie(url: str) -> None:
    token = str(uuid.uuid4())
    digest = session_key(token)
    try:
        await upsert_session_event(digest, 1, "Chrome")
        fila = await _fila(url, digest)
        assert fila is not None
        assert fila["session_hash"] == digest
        assert token not in fila["session_hash"]
        assert len(fila["session_hash"]) == 64  # sha256 en hex
        assert fila["request_count"] == 1
        assert fila["user_agent_family"] == "Chrome"
        # Sin columna de IP: DATABASE §8.3 la descarta por privacidad.
        assert "country_code" in fila and fila["country_code"] is None
    finally:
        await _borrar(url, digest)


async def test_repetir_el_registro_actualiza_y_no_duplica(url: str) -> None:
    token = str(uuid.uuid4())
    digest = session_key(token)
    try:
        for requests in (1, 10, 25):
            await upsert_session_event(digest, requests, "Firefox")
        engine = create_async_engine(url)
        async with engine.connect() as conn:
            filas = (
                await conn.execute(
                    text("SELECT request_count FROM session_events WHERE session_hash = :h"),
                    {"h": digest},
                )
            ).all()
        await engine.dispose()
        # Idempotente por session_hash: una fila, con el contador más reciente.
        assert filas == [(25,)]
    finally:
        await _borrar(url, digest)
