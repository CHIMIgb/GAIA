r"""Criterio ROADMAP 0.3.3 contra PostgreSQL real: el log tiene timestamps y el
job de limpieza borra las entradas viejas.

Va contra la BD real (no se simula). Se omite si no hay PostgreSQL alcanzable:
desde WSL el firewall de Windows descarta el inbound, así que este test se ejecuta
con el Python de Windows (mismo motivo y mismo comando que `test_migrations.py`,
cuyo docstring lo detalla):

    & C:\Users\chimi\.venvs\gaia-backend\Scripts\python.exe -m pytest tests/test_api_log_db.py -q --noconftest -o asyncio_mode=auto
"""

from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import create_async_engine

from app.config import settings
from app.db.api_log_store import (
    RETENTION_DAYS,
    count_api_log,
    log_request,
    purge_api_log,
)

# Un solo event loop para toda la sesion: `app.db.engine` cachea el engine en el
# proceso y su pool queda atado al loop que lo abrio. Con un loop por modulo, el
# segundo fichero que lo usa heredaria un pool de un loop ya cerrado.
pytestmark = pytest.mark.asyncio(loop_scope="session")


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


async def _consulta(url: str, sql: str) -> list[dict]:
    """Consulta SQL cruda: es el criterio del paso ("consulta SQL muestra logs")."""
    engine = create_async_engine(url)
    try:
        async with engine.connect() as conn:
            return [dict(row) for row in (await conn.execute(text(sql))).mappings()]
    finally:
        await engine.dispose()


async def _limpiar(url: str) -> None:
    engine = create_async_engine(url)
    try:
        async with engine.connect() as conn:
            await conn.execute(text("DELETE FROM api_log"))
            await conn.commit()
    finally:
        await engine.dispose()


async def test_una_consulta_sql_muestra_los_logs_con_timestamp(url: str) -> None:
    try:
        await log_request("GET", "/api/fires", 200, 12.5, "a" * 64)
        filas = await _consulta(
            url,
            "SELECT method, path, status_code, latency_ms, session_hash, logged_at"
            " FROM api_log ORDER BY logged_at DESC",
        )

        assert len(filas) == 1
        assert filas[0]["path"] == "/api/fires"
        assert filas[0]["status_code"] == 200
        assert filas[0]["latency_ms"] == 12.5
        # `logged_at` lo rellena la BD, con zona horaria, no desde Python.
        assert filas[0]["logged_at"].tzinfo is not None
    finally:
        await _limpiar(url)


async def test_la_tabla_no_tiene_ip_ni_cookie_cruda(url: str) -> None:
    try:
        columnas = await _consulta(
            url,
            "SELECT column_name FROM information_schema.columns"
            " WHERE table_name = 'api_log'",
        )
        nombres = {c["column_name"] for c in columnas}
        assert nombres == {
            "id",
            "logged_at",
            "method",
            "path",
            "status_code",
            "latency_ms",
            "session_hash",
        }
        assert not {"ip", "ip_address", "client_ip", "cookie", "token"} & nombres
    finally:
        await _limpiar(url)


async def test_el_job_borra_las_entradas_viejas(url: str) -> None:
    """Criterio del paso: el job de limpieza borra lo que pasa de 90 días."""
    try:
        await log_request("GET", "/api/viejo", 200, 1.0, logged_at=datetime.now(UTC) - timedelta(days=RETENTION_DAYS + 1))
        await log_request("GET", "/api/justo", 200, 1.0, logged_at=datetime.now(UTC) - timedelta(days=RETENTION_DAYS - 1))
        await log_request("GET", "/api/nuevo", 200, 1.0)
        assert await count_api_log() == 3

        borradas = await purge_api_log()

        assert borradas == 1
        assert [f["path"] for f in await _consulta(url, "SELECT path FROM api_log")] == [
            "/api/justo",
            "/api/nuevo",
        ]
    finally:
        await _limpiar(url)


async def test_el_job_es_idempotente(url: str) -> None:
    """Ejecutarlo dos veces no rompe ni borra de más."""
    try:
        await log_request("GET", "/api/viejo", 200, 1.0, logged_at=datetime.now(UTC) - timedelta(days=200))
        assert await purge_api_log() == 1
        assert await purge_api_log() == 0
        assert await count_api_log() == 0
    finally:
        await _limpiar(url)
