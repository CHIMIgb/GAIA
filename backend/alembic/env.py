"""Entorno Alembic async (docs/GAIA_DATABASE.md §6.1).

El DSN sale de `settings.DATABASE_URL`; el driver es asyncpg (async), por eso la
migración corre con `connection.run_sync` sobre un engine asíncrono.
"""

import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy import Connection, pool
from sqlalchemy.ext.asyncio import async_engine_from_config

from app.config import settings
from app.db import models  # noqa: F401 — registra las tablas en Base.metadata
from app.db.base import Base

config = context.config
config.set_main_option("sqlalchemy.url", settings.DATABASE_URL)

if config.config_file_name is not None:
    # disable_existing_loggers=False: por defecto `fileConfig` apaga todos los loggers
    # que ya existían, y en los tests (donde `test_migrations` migra en el mismo
    # proceso que la app) eso dejaba mudos `app.middleware.rate_limit` y
    # `app.services.timing` para el resto de la sesión: sus avisos y su línea de
    # duración no llegaban a ningún sitio y los tests que los comprueban veían un
    # log vacío. En el CLI es un proceso aparte y no se nota, pero el valor por
    # defecto es el equivocado aquí.
    fileConfig(config.config_file_name, disable_existing_loggers=False)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    context.configure(
        url=settings.DATABASE_URL,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection: Connection) -> None:
    context.configure(connection=connection, target_metadata=target_metadata)
    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)
    await connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
