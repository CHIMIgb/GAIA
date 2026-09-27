"""Punto de entrada: FastAPI app + router común de módulos + middleware global de errores.

El middleware envuelve TODA respuesta en el contrato universal
(docs/GAIA_API_CONTRACT.md §3.2 y §5.2).
"""

import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.middleware.cors import CORSMiddleware

from app.cache.redis_client import close_redis
from app.config import settings
from app.middleware.access_log import AccessLogMiddleware
from app.middleware.rate_limit import RateLimitMiddleware
from app.middleware.security_headers import SecurityHeadersMiddleware
from app.models.response import CODE_BY_STATUS, APIResponse, ErrorCode
from app.routers import health
from app.services.session import SessionMiddleware

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    yield
    await close_redis()


# `/docs` y el esquema solo en desarrollo: publicar la API en producción es
# superficie de ataque gratis, y su JS (inline y CDN) no sobrevive a la CSP de
# §6.2 salvo en la variante de dev que activa `DEBUG`. El CSP con nonce real del
# HTML lo pone el plugin de Vite del frontend (NOTA de SECURITY §6.2), no este
# backend: aquí solo se sirve JSON.
app = FastAPI(
    title="GAIA API",
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/docs" if settings.DEBUG else None,
    openapi_url="/openapi.json" if settings.DEBUG else None,
)

# Router común de módulos (Paso 0.2.1): cada módulo se registra aquí.
api_router = APIRouter(prefix="/api")
api_router.include_router(health.router)
app.include_router(api_router)

# El último `add_middleware` es el más externo.
app.add_middleware(SessionMiddleware)  # más interna: envuelve al handler
app.add_middleware(RateLimitMiddleware)  # en medio: un 429 no crea sesión
app.add_middleware(AccessLogMiddleware)  # ve el estado real que sale, incluidos los 429
# CORS por fuera del rate-limit: un preflight no debe gastar cuota ni crear
# sesión. A cambio, los preflight no quedan en el access log.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in settings.CORS_ORIGINS.split(",") if o.strip()],
    allow_credentials=True,  # sin esto la cookie `gaia_session` no viaja (SECURITY §3.1)
    # La API es de solo lectura (SECURITY §3.2): la allowlist de métodos y de
    # cabeceras es la mínima que necesita el cliente.
    allow_methods=["GET", "OPTIONS"],
    allow_headers=["Content-Type"],
)
# La más externa de las que se registran aquí: sus headers llegan a los 4xx, a los
# 429 y a los preflight que cortan las capas de dentro. Los 500 no manejados los
# emite el `ServerErrorMiddleware` de Starlette, por encima de esta capa, y su
# cuerpo es JSON (sin HTML que proteger).
app.add_middleware(SecurityHeadersMiddleware)


@app.exception_handler(RequestValidationError)
async def handle_validation_error(
    request: Request, exc: RequestValidationError
) -> JSONResponse:
    return JSONResponse(
        status_code=400,
        content=APIResponse.fail(
            ErrorCode.VALIDATION_ERROR,
            "Invalid request parameters.",
            jsonable_encoder(exc.errors()),
        ).model_dump(mode="json"),
    )


@app.exception_handler(StarletteHTTPException)
async def handle_http_exception(
    request: Request, exc: StarletteHTTPException
) -> JSONResponse:
    code = CODE_BY_STATUS.get(exc.status_code, ErrorCode.INTERNAL_SERVER_ERROR)
    return JSONResponse(
        status_code=exc.status_code,
        content=APIResponse.fail(code, str(exc.detail)).model_dump(mode="json"),
        headers=exc.headers,
    )


@app.exception_handler(Exception)
async def handle_unexpected_error(request: Request, exc: Exception) -> JSONResponse:
    logger.exception(
        "Unhandled error",
        extra={
            "path": request.url.path,
            "method": request.method,
            "error_type": type(exc).__name__,
        },
    )
    return JSONResponse(
        status_code=500,
        content=APIResponse.fail(
            ErrorCode.INTERNAL_SERVER_ERROR, "An unexpected error occurred."
        ).model_dump(mode="json"),
    )
