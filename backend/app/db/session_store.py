"""Registro anonimizado de sesiones en `session_events`.

Esquema y veredicto en docs/GAIA_DATABASE.md §3.1 y §8.4: se guarda **solo** el
sha256 del token (nunca la cookie cruda), sin IP, con familia de navegador en
lugar del User-Agent completo, y `country_code` en NULL (no hay fuente de
geolocalización definida en los docs).

La API es de solo lectura (docs/GAIA_SECURITY.md §3.2), así que esto no muta
estado: es contabilidad para métricas agregadas y depuración de abuso.
"""

import hashlib
from datetime import UTC, datetime

from sqlalchemy.dialects.postgresql import insert

from app.db.engine import get_sessionmaker
from app.db.models import SessionEvent

# country_code queda NULL a propósito: sin IP y sin fuente de geo-IP documentada.
COUNTRY_CODE = None


def session_key(cookie_value: str) -> str:
    """Clave de sesión: sha256 del token, irreversible. Nunca el valor original.

    Es la clave que se guarda tanto en Redis como en `session_events`
    (docs/GAIA_DATABASE.md §8.4).
    """
    return hashlib.sha256(cookie_value.encode()).hexdigest()


async def upsert_session_event(
    session_hash: str,
    requests: int,
    user_agent_family: str | None,
    seen_at: datetime | None = None,
) -> None:
    """Inserta la sesión o actualiza sus contadores (idempotente por session_hash)."""
    now = seen_at or datetime.now(UTC)
    values = {
        "session_hash": session_hash,
        "first_seen": now,
        "last_seen": now,
        "request_count": requests,
        "user_agent_family": user_agent_family,
        "country_code": COUNTRY_CODE,
    }
    stmt = insert(SessionEvent).values(**values)
    stmt = stmt.on_conflict_do_update(
        index_elements=[SessionEvent.session_hash],
        set_={
            "last_seen": now,
            "request_count": requests,
            "user_agent_family": user_agent_family,
        },
    )
    factory = get_sessionmaker()
    async with factory() as session:
        await session.execute(stmt)
        await session.commit()
