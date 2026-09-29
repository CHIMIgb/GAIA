"""Motor asíncrono de SQLAlchemy (docs/GAIA_DATABASE.md §6.1 y §6.4).

Se crea de forma perezosa (no abre conexión al importar) para que importar el
paquete `app` no dependa de que PostgreSQL esté accesible.
"""

from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker, create_async_engine

from app.config import settings

_engine: AsyncEngine | None = None
_factory: async_sessionmaker[AsyncSession] | None = None


def get_engine() -> AsyncEngine:
    global _engine
    if _engine is None:
        _engine = create_async_engine(settings.DATABASE_URL, pool_pre_ping=True)
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
    """
    global _engine, _factory
    if _engine is not None:
        await _engine.dispose()
    _engine = None
    _factory = None
