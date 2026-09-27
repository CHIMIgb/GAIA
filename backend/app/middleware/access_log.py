"""Access log en base de datos (ROADMAP 0.3.3).

Una fila por petición a la API con método, ruta, código de estado, latencia y el
hash de la sesión. Lo que **no** se guarda: ni la IP ni la cookie cruda, por el
mismo criterio de privacidad que `session_events` (DATABASE §8.3, SECURITY §4).

Es ASGI puro y no `BaseHTTPMiddleware` a propósito: el 500 de una excepción no la
convierte `BaseHTTPMiddleware` (lo hace `ServerErrorMiddleware`, que está por
encima), así que un log de auditoría construido con ella no registraría nunca los
fallos. Interceptando `send` se ve el estado real que sale por el cable.

El log es accesorio: si la BD no responde, la petición se sirve igual. Sin esto,
una caída de la BD dejaría la API entera caída.
"""

import logging
import time

from sqlalchemy.exc import SQLAlchemyError

from app.db.api_log_store import log_request
from app.services.session import STATE_SESSION_HASH

logger = logging.getLogger(__name__)


class AccessLogMiddleware:
    def __init__(self, app) -> None:
        self.app = app

    async def __call__(self, scope, receive, send) -> None:
        if scope["type"] != "http":  # lifespan, websocket
            await self.app(scope, receive, send)
            return

        started = time.perf_counter()
        status_code = 500  # por si la excepción se resuelve por encima (ver docstring)

        async def send_envuelto(message) -> None:
            nonlocal status_code
            if message["type"] == "http.response.start":
                status_code = message["status"]
            await send(message)

        try:
            await self.app(scope, receive, send_envuelto)
        finally:
            await self._registrar(scope, status_code, (time.perf_counter() - started) * 1000)

    async def _registrar(self, scope, status_code: int, latency_ms: float) -> None:
        try:
            await log_request(
                method=scope["method"],
                path=scope["path"],  # sin query string: no aporta a la auditoría
                status_code=status_code,
                latency_ms=latency_ms,
                # Lo resuelve el middleware de sesión; None si no había cookie.
                session_hash=(scope.get("state") or {}).get(STATE_SESSION_HASH),
            )
        except (SQLAlchemyError, OSError, TimeoutError) as exc:
            logger.warning("No se pudo registrar la petición en `api_log`: %s", exc)
