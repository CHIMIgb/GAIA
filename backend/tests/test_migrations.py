"""Criterio ROADMAP 0.3.1: la migración crea el esquema y es idempotente.

Corre contra la BD real de `DATABASE_URL` (no se simula: el criterio es que
`migrate` cree el esquema en Postgres de verdad). Se omite —no falla— si no hay
PostgreSQL alcanzable, para que `pytest` siga siendo verde donde no hay BD.
"""

import asyncio
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import create_async_engine

from app.config import settings

BACKEND = Path(__file__).resolve().parents[1]
TABLAS_BASE = {"session_events", "data_ingestion_log"}


def _alembic_config() -> Config:
    cfg = Config(str(BACKEND / "alembic.ini"))
    cfg.set_main_option("script_location", str(BACKEND / "alembic"))
    cfg.set_main_option("sqlalchemy.url", settings.DATABASE_URL)
    return cfg


async def _upgrade(cfg: Config, revision: str = "head") -> None:
    """Alembic es dueña de su propio event loop (env.py: asyncio.run), asi que no
    puede invocarse desde el loop del test: se ejecuta en un hilo."""
    await asyncio.to_thread(command.upgrade, cfg, revision)


async def _downgrade(cfg: Config, revision: str = "base") -> None:
    await asyncio.to_thread(command.downgrade, cfg, revision)


async def _tablas(url: str) -> set[str]:
    engine = create_async_engine(url)
    try:
        async with engine.connect() as conn:
            rows = await conn.execute(
                text("SELECT tablename FROM pg_tables WHERE schemaname = 'public'")
            )
            return {row[0] for row in rows}
    finally:
        await engine.dispose()


@pytest.fixture(scope="module")
async def url() -> str:
    value = settings.DATABASE_URL
    engine = create_async_engine(value, connect_args={"timeout": 5})
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
    # SQLAlchemy deja pasar ConnectionRefusedError tal cual, y el timeout de
    # asyncpg no viene envuelto: de ahi OSError y TimeoutError.
    except (SQLAlchemyError, OSError, TimeoutError) as exc:
        pytest.skip(f"PostgreSQL no alcanzable en {value}: {exc.__class__.__name__}")
    finally:
        await engine.dispose()
    return value


async def test_migrate_crea_el_esquema_y_es_idempotente(url: str) -> None:
    """`upgrade head` crea el esquema; repetirlo no duplica nada."""
    cfg = _alembic_config()
    await _upgrade(cfg)
    await _upgrade(cfg)
    assert TABLAS_BASE <= await _tablas(url)


async def test_downgrade_limpia_el_esquema(url: str) -> None:
    cfg = _alembic_config()
    await _downgrade(cfg)
    assert TABLAS_BASE.isdisjoint(await _tablas(url))
    await _upgrade(cfg)  # deja la BD migrada para el siguiente paso
