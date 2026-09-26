"""Registro de peticiones a la API y purga por antigüedad (ROADMAP 0.3.3).

El ROADMAP pide registrar las peticiones en `api_log` con retención de 90 días y
un job de limpieza. Lo que se guarda es lo mínimo para auditar: método, ruta,
código de estado, latencia y el **hash** de la sesión. Ni IP ni cookie cruda, por
el mismo motivo que `session_events` (DATABASE §8.3, SECURITY §4).

La purga es un `DELETE` por antigüedad, no una retention policy de TimescaleDB:
la extensión no está instalada en el PostgreSQL de desarrollo y una tabla plana
no necesita hipertabla. Se ejecuta con `python -m app.db.api_log_store`.
"""

import asyncio
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, func, insert, select

from app.db.engine import get_engine
from app.db.models import ApiLog

# Retención del log: 90 días (ROADMAP 0.3.3; DATABASE §8.3 admite el rango 30-90).
RETENTION_DAYS = 90


async def log_request(
    method: str,
    path: str,
    status_code: int,
    latency_ms: float,
    session_hash: str | None = None,
    logged_at: datetime | None = None,
) -> None:
    """Inserta una petición. `logged_at` se puede fijar para probar la purga."""
    values: dict = {
        "method": method,
        "path": path,
        "status_code": status_code,
        "latency_ms": latency_ms,
        "session_hash": session_hash,
    }
    if logged_at is not None:
        values["logged_at"] = logged_at
    async with get_engine().begin() as conn:
        await conn.execute(insert(ApiLog).values(**values))


async def purge_api_log(retention_days: int = RETENTION_DAYS) -> int:
    """Borra las entradas con más de `retention_days` días. Devuelve las borradas."""
    cutoff = datetime.now(UTC) - timedelta(days=retention_days)
    async with get_engine().begin() as conn:
        result = await conn.execute(
            delete(ApiLog).where(ApiLog.logged_at < cutoff)
        )
    return int(result.rowcount or 0)


async def count_api_log() -> int:
    """Filas actuales; el job las imprime para que se vea qué ha hecho."""
    async with get_engine().connect() as conn:
        return int(await conn.scalar(select(func.count()).select_from(ApiLog)))


async def _main() -> None:
    borradas = await purge_api_log()
    restantes = await count_api_log()
    print(
        f"api_log: {borradas} entradas de más de {RETENTION_DAYS} días borradas; "
        f"{restantes} restantes."
    )


if __name__ == "__main__":
    asyncio.run(_main())
