"""Motor asíncrono de SQLAlchemy (docs/GAIA_DATABASE.md §6.1 y §6.4).

Se crea de forma perezosa (no abre conexión al importar) para que importar el
paquete `app` no dependa de que PostgreSQL esté accesible.
"""

import logging
import os

from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.pool import AsyncAdaptedQueuePool, NullPool

from app.config import settings

logger = logging.getLogger(__name__)

_engine: AsyncEngine | None = None
_factory: async_sessionmaker[AsyncSession] | None = None


def get_engine() -> AsyncEngine:
    global _engine
    if _engine is None:
        # El motor es un singleton y las conexiones de un pool viven atadas al event
        # loop que las abrió. En producción hay uno solo durante toda la vida del
        # proceso, pero en tests cada `TestClient` abre el suyo: una conexión
        # heredada revienta con "Event loop is closed" al terminarla, y el fallo
        # sale en pleno request (500 en texto plano, fuera del handler JSON). Sin
        # pool no hay conexión que heredar; en local ni se nota porque sin PostgreSQL
        # `log_request` falla abierto y el pool nunca llega a abrir nada.
        poolclass = NullPool if "PYTEST_CURRENT_TEST" in os.environ else AsyncAdaptedQueuePool
        _engine = create_async_engine(
            settings.DATABASE_URL, pool_pre_ping=True, poolclass=poolclass
        )
    return _engine


def get_sessionmaker() -> async_sessionmaker[AsyncSession]:
    global _factory
    if _factory is None:
        _factory = async_sessionmaker(get_engine(), expire_on_commit=False)
    return _factory


async def dispose_engine() -> None:
    """Libera el pool y suelta los singletons (lo llama el lifespan al apagar).

    Sin esto el pool sobrevive al apagado, y en tests es peor: cada `TestClient`
    abre su propio event loop y el siguiente hereda un pool con conexiones atadas
    al loop anterior, que muere con "got Future attached to a different loop" y
    convierte cualquier request en 500.

    Los singletons se sueltan siempre, también si `dispose()` falla: un motor
    envenenado en la variable de módulo hace fallar todos los tests siguientes, y
    una conexión de asyncpg solo se puede cerrar en el loop que la abrió, que aquí
    puede ya estar cerrado. El aviso va al log, que es donde se busca cuando un
    pool se queda sin cerrar.
    """
    global _engine, _factory
    motor, _engine, _factory = _engine, None, None
    if motor is None:
        return
    try:
        await motor.dispose()
    except Exception as exc:  # noqa: BLE001 - un cierre fallido no puede romper el apagado
        logger.warning("No se pudo liberar el pool de la BD: %s", exc)
