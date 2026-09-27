"""Cliente HTTP compartido para las fuentes externas (FIRMS, USGS, Open-Meteo...).

Fuente de verdad: docs/GAIA_PROJECT_STRUCTURE.md §5.9 — `httpx2.AsyncClient` con
timeout de 5 s, 3 reintentos y headers comunes. Es `httpx2` y no `httpx` porque es lo
que exigen `starlette` 1.7 y `fastapi` 0.141 (DEPLOYMENT §8.2).

El seam de los tests es `build_client(transport=...)`: con un
`httpx2.MockTransport` un test de módulo corre sin tocar la red (ROADMAP 0.6.3).
El cliente de producción lo crea el lifespan de la app y vive en `app.state.http`,
así se cierra al apagar; ningún router lo instancia en el punto de llamada.

`RETRIES` va en el transporte, o sea que son reintentos de conexión. El backoff con
respuesta 5xx o 429 es cosa de cada módulo y llega con F2.
"""

import httpx2
from fastapi import Request

TIMEOUT_S = 5.0
RETRIES = 3
# User-Agent: NASA/Earthdata piden identificar al cliente en cada petición, y sin él
# alguna fuente rechaza el request.
HEADERS = {"User-Agent": "GAIA/1.0 (+https://github.com/CHIMIgb/GAIA)"}


def build_client(
    transport: httpx2.AsyncBaseTransport | None = None,
) -> httpx2.AsyncClient:
    """Cliente con la política común. Sin `transport` monta el de red con reintentos."""
    return httpx2.AsyncClient(
        timeout=TIMEOUT_S,
        headers=HEADERS,
        follow_redirects=True,
        transport=transport
        or httpx2.AsyncHTTPTransport(retries=RETRIES),
    )


def get_http(request: Request) -> httpx2.AsyncClient:
    """Cliente compartido de la app (el que creó el lifespan)."""
    return request.app.state.http
