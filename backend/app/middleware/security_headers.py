"""Headers de seguridad de las respuestas (ROADMAP 0.4.5, SECURITY §6.2).

ASGI puro, como `access_log`: interceptando `send` los headers se añaden a lo que
salga por las capas de dentro, erratas y 429 incluidos, sin depender de que la
respuesta pase por el handler global. Lo único que se escapa son los 500 no
manejados, que emite el `ServerErrorMiddleware` de Starlette por encima.

`Helmet` es una librería de Node y el stack fija FastAPI/Python, así que los
valores se montan aquí a mano: son cinco cabeceras fijas y una CSP, no un paquete.
"""

import secrets

from app.config import settings

# `script-src` de la CSP de §6.2. Se separa para no duplicar la política al
# derivar la variante de desarrollo.
SCRIPT_SRC = "'self' 'nonce-{nonce}'"

# Valor canónico de SECURITY §6.2, con el nonce por respuesta.
CSP = (
    f"default-src 'self'; script-src {SCRIPT_SRC}; "
    "style-src 'self' 'unsafe-inline'; "
    "img-src 'self' data: https://server.arcgisonline.com "
    "https://services.arcgisonline.com; "
    "object-src 'none'; frame-ancestors 'none'; base-uri 'self'"
)

# NOTA de §6.2: en modo dev el HMR y Swagger UI necesitan scripts inline, así que
# el nonce se sustituye por `'unsafe-inline'`. Solo con `DEBUG`; en producción la
# CSP de arriba es la que se aplica.
CSP_DEV = CSP.replace(SCRIPT_SRC, "'self' 'unsafe-inline'")

# Las cinco cabeceras fijas de §6.2. HSTS va siempre, también en local: los
# navegadores ignoran `Strict-Transport-Security` en respuestas que no llegan por
# HTTPS (RFC 6797 §7.2), así que no condicionarla a `DEBUG` solo añade ruido.
HEADERS = {
    "strict-transport-security": "max-age=31536000; includeSubDomains",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "strict-origin-when-cross-origin",
    "permissions-policy": "camera=(), microphone=(), geolocation=()",
}


class SecurityHeadersMiddleware:
    def __init__(self, app) -> None:
        self.app = app

    async def __call__(self, scope, receive, send) -> None:
        if scope["type"] != "http":  # lifespan, websocket
            await self.app(scope, receive, send)
            return

        csp = CSP_DEV if settings.DEBUG else CSP.format(nonce=secrets.token_urlsafe(16))
        cabeceras = {"content-security-policy": csp, **HEADERS}

        async def send_con_headers(message) -> None:
            if message["type"] == "http.response.start":
                message["headers"] += [
                    (nombre.encode(), valor.encode())
                    for nombre, valor in cabeceras.items()
                ]
            await send(message)

        await self.app(scope, receive, send_con_headers)
