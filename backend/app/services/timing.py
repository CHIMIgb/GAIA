"""Duración por endpoint en los logs del backend (ROADMAP 0.7.2).

El paso pide "log de duración por endpoint (nominal/p95) en dev": una línea por
petición con el promedio y la p95 de la ventana de ese endpoint. Solo con `DEBUG`
(DEPLOYMENT §4.1), porque en producción esto es ruido y el histórico ya está
persistente en `api_log` con una fila por petición (0.3.3, `AccessLogMiddleware`).

Decisiones que fija este módulo y no inventa:
- **nominal = promedio** de la ventana; la p95 se calcula aparte, ordenando.
- **Una línea por petición**, no un resumen al llenarse la ventana: el criterio del
  paso es que los tiempos se vean, y con dos llamadas ya se ven.
- Solo rutas `/api/`: lo que se timingea es el contrato de API, no los assets ni
  `/docs`, que no dicen nada del coste de un endpoint.
"""

import logging
from collections import deque

from app.config import settings

logger = logging.getLogger(__name__)

# ponytail: 100 muestras por endpoint en memoria, sin persistir. Suficiente para que la
# p95 sea estable en dev. Si algún día hace falta histórico, `api_log` ya lo tiene y
# esta capa sobraría.
WINDOW_SAMPLES = 100

# ponytail: tope de endpoints seguida. Las claves del dict salen de la URL, así que sin
# tope un escáner de rutas inventadas crece la memoria sin límite; al llegar al tope se
# deja de medir en vez de evictar (en dev da igual, y en prod no se loguea).
MAX_ENDPOINTS = 64

_ventanas: dict[str, deque[float]] = {}


def reset() -> None:
    """Vacía las ventanas. Lo usan los tests; en la API no se llama nunca."""
    _ventanas.clear()


def registra(method: str, path: str, ms: float) -> str | None:
    """Suma una muestra y devuelve la línea de log, o `None` si esa ruta no se mide."""
    if not path.startswith("/api/"):
        return None
    if path not in _ventanas and len(_ventanas) >= MAX_ENDPOINTS:
        return None

    ventana = _ventanas.setdefault(path, deque(maxlen=WINDOW_SAMPLES))
    ventana.append(ms)
    return _linea(method, path, ventana)


def log_duracion(method: str, path: str, ms: float) -> None:
    """Punto de entrada del middleware. Solo escribe con `DEBUG` activo."""
    if not settings.DEBUG:
        return
    linea = registra(method, path, ms)
    if linea is not None:
        logger.info("duración %s", linea)


def _linea(method: str, path: str, ventana: deque[float]) -> str:
    promedio = sum(ventana) / len(ventana)
    ordenadas = sorted(ventana)
    p95 = ordenadas[min(len(ordenadas) - 1, int(len(ordenadas) * 0.95))]
    return f"{method} {path} avg={promedio:.1f}ms p95={p95:.1f}ms n={len(ventana)}"
