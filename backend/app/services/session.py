"""Sesión anónima por cookie, sin cuentas de usuario.

Diseño en docs/GAIA_SECURITY.md §3.1 y veredicto en docs/GAIA_DATABASE.md §8.4:

- La cookie `gaia_session` lleva un **token opaco** de 256 bits (UUIDv4). No
  contiene información del usuario.
- El servidor guarda **solo** `sha256(token)`, con TTL 30 días, en Redis.
- `session_events` es el registro anonimizado de la sesión (hash, contadores,
  familia de navegador). Nunca la cookie cruda ni la IP.
- La API es de solo lectura, así que no hay mutaciones y por tanto no hace falta
  token CSRF (§3.2).
"""

import logging
import uuid
from datetime import UTC, datetime

from fastapi import Request, Response
from redis.exceptions import RedisError
from sqlalchemy.exc import SQLAlchemyError
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint

from app.cache.redis_client import get_redis
from app.config import settings
from app.db.session_store import session_key, upsert_session_event

logger = logging.getLogger(__name__)

COOKIE_NAME = settings.SESSION_COOKIE_NAME
MAX_AGE = settings.SESSION_TTL_SECONDS

# Clave de Redis: hash sha256 completo, nunca el token. Patrón de redis-core.
_KEY = "gaia:session:{}"
_FIELD_HASH = "hash"
_FIELD_REQUESTS = "requests"
_FIELD_LAST_SEEN = "last_seen"
_FIELD_UA = "ua"

# Familias de navegador: se registra la familia, nunca el User-Agent completo
# (docs/GAIA_DATABASE.md §8.3 — el UA crudo ayuda a reidentificar).
_UA_FAMILIES = (
    ("Edg/", "Edge"),
    ("OPR/", "Opera"),
    ("Chrome/", "Chrome"),
    ("Firefox/", "Firefox"),
    ("Version/", "Safari"),
)

# Clave en `scope["state"]` donde se deja el hash resuelto, para que el access
# log (ROADMAP 0.3.3) pueda correlacionar la peticion con la sesion.
STATE_SESSION_HASH = "session_hash"

# Inyectable en tests.
_DB_FLUSH_EVERY = settings.SESSION_DB_FLUSH_EVERY


def new_token() -> str:
    """Token opaco de 256 bits (UUIDv4 aleatorio), sin dato alguno del usuario."""
    return str(uuid.uuid4())


def user_agent_family(user_agent: str | None) -> str | None:
    """Familia del navegador a partir del User-Agent; None si no se reconoce."""
    if not user_agent:
        return None
    for marker, family in _UA_FAMILIES:
        if marker in user_agent:
            return family
    return "otro"


def _redis_key(digest: str) -> str:
    return _KEY.format(digest)


async def _create_redis_session(digest: str, user_agent: str | None) -> None:
    redis = get_redis()
    key = _redis_key(digest)
    await redis.hset(
        key,
        mapping={
            _FIELD_HASH: digest,
            _FIELD_REQUESTS: 1,
            _FIELD_LAST_SEEN: datetime.now(UTC).isoformat(timespec="seconds"),
            _FIELD_UA: user_agent_family(user_agent) or "",
        },
    )
    await redis.expire(key, MAX_AGE)


async def _touch_redis_session(digest: str) -> int:
    """Suma una petición y renueva el TTL ('se renueva con uso', §3.1)."""
    redis = get_redis()
    key = _redis_key(digest)
    requests = await redis.hincrby(key, _FIELD_REQUESTS, 1)
    await redis.expire(key, MAX_AGE)
    return int(requests)


def set_session_cookie(response: Response, token: str) -> None:
    """Emite la cookie con los atributos de SECURITY §3.1."""
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        max_age=MAX_AGE,
        httponly=True,
        samesite="lax",
        secure=settings.SESSION_COOKIE_SECURE,
        path="/",
    )


async def _register(
    digest: str, requests: int, user_agent: str | None
) -> None:
    """Vuelca el estado de la sesión en `session_events` sin romper la navegación.

    La API es de solo lectura: si la BD no responde, la petición sigue sirviéndose
    y el registro se recupera en el próximo refresco.
    """
    try:
        await upsert_session_event(digest, requests, user_agent_family(user_agent))
    except (SQLAlchemyError, OSError, TimeoutError) as exc:
        logger.warning("No se pudo registrar la sesión en la BD: %s", exc)


class SessionMiddleware(BaseHTTPMiddleware):
    """Emite y renueva la cookie `gaia_session` (SECURITY §3.1).

    La sesión es accesoria: si Redis no responde, la petición se sirve igual y sin
    cookie (degradar, no romper). Los 429 del rate-limit tampoco crean sesión.
    """

    async def dispatch(
        self, request: Request, call_next: RequestResponseEndpoint
    ) -> Response:
        try:
            token = await self._session_token(request)
        except (RedisError, OSError, TimeoutError) as exc:
            logger.warning("Sesión no disponible (Redis): %s", exc)
            token = None

        response = await call_next(request)
        if token:
            set_session_cookie(response, token)
        return response

    async def _session_token(self, request: Request) -> str | None:
        """Devuelve el token de la sesión (nuevo si no había una válida) o None."""
        redis = get_redis()
        user_agent = request.headers.get("user-agent")
        token = request.cookies.get(COOKIE_NAME)
        digest = session_key(token) if token else None

        if digest and await redis.exists(_redis_key(digest)):
            requests = await _touch_redis_session(digest)
            if requests % max(_DB_FLUSH_EVERY, 1) == 0:
                await _register(digest, requests, user_agent)
            request.state.session_hash = digest
            return token

        token = new_token()
        digest = session_key(token)
        await _create_redis_session(digest, user_agent)
        await _register(digest, 1, user_agent)
        request.state.session_hash = digest
        return token
