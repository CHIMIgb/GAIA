"""CORS y headers de seguridad (ROADMAP 0.4.5).

Criterio del paso: `curl -i` muestra los headers y un origen no permitido recibe
bloqueo CORS. Valores: tabla de `docs/GAIA_SECURITY.md` §6.2, repetida aquí como
constantes para que el test falle si el código se desvía, y allowlist de
`CORS_ORIGINS` de `docs/GAIA_DEPLOYMENT.md` §4.1.
"""

from fastapi.testclient import TestClient

from app.config import settings

# El primer origen de la allowlist configurada, no un literal: lo que se prueba es
# "permitido vs no permitido", y el valor por defecto vive en DEPLOYMENT §4.1.
ORIGEN_OK = settings.CORS_ORIGINS.split(",")[0].strip()
ORIGEN_MALO = "https://evil.example"

CABECERAS_6_2 = {
    "strict-transport-security": "max-age=31536000; includeSubDomains",
    "x-content-type-options": "nosniff",
    "x-frame-options": "DENY",
    "referrer-policy": "strict-origin-when-cross-origin",
    "permissions-policy": "camera=(), microphone=(), geolocation=()",
}


def _nonce(csp: str) -> str:
    return csp.split("'nonce-")[1].split("'")[0]


def test_las_cinco_cabeceras_fijas_de_6_2(client: TestClient, fake_redis) -> None:
    cabeceras = client.get("/api/health").headers

    for nombre, valor in CABECERAS_6_2.items():
        assert cabeceras[nombre] == valor, nombre


def test_csp_canonica_con_nonce_distinto_en_cada_respuesta(
    client: TestClient, fake_redis
) -> None:
    primero = client.get("/api/health").headers["content-security-policy"]
    segundo = client.get("/api/health").headers["content-security-policy"]

    assert "default-src 'self'" in primero
    assert "img-src 'self' data: https://server.arcgisonline.com" in primero
    assert "object-src 'none'" in primero
    assert "frame-ancestors 'none'" in primero
    assert "base-uri 'self'" in primero
    # El nonce no se puede adivinar ni reutilizar entre respuestas.
    assert _nonce(primero) != _nonce(segundo)


def test_hsts_no_depende_de_debug(client: TestClient, fake_redis, monkeypatch) -> None:
    monkeypatch.setattr(settings, "DEBUG", True)

    assert "strict-transport-security" in client.get("/api/health").headers


def test_en_debug_la_csp_permite_scripts_inline(
    client: TestClient, fake_redis, monkeypatch
) -> None:
    # NOTA de §6.2: en modo dev se permite `'unsafe-inline'`; el nonce se sustituye,
    # no se acumula, para que la CSP no quede contradictoria.
    monkeypatch.setattr(settings, "DEBUG", True)

    csp = client.get("/api/health").headers["content-security-policy"]

    assert "script-src 'self' 'unsafe-inline'" in csp
    assert "nonce-" not in csp


def test_los_headers_llegan_tambien_a_los_404(client: TestClient, fake_redis) -> None:
    # El header no puede depender de que la respuesta sea "feliz": la capa más
    # externa los añade a lo que salga, erratas incluidas.
    assert "content-security-policy" in client.get("/api/no-existe").headers


def test_origen_permitido_recibe_allow_origin_y_credenciales(
    client: TestClient, fake_redis
) -> None:
    respuesta = client.get("/api/health", headers={"Origin": ORIGEN_OK})

    assert respuesta.headers["access-control-allow-origin"] == ORIGEN_OK
    # Sin credenciales la cookie `gaia_session` no viajaría nunca (SECURITY §3.1).
    assert respuesta.headers["access-control-allow-credentials"] == "true"


def test_origen_no_permitido_no_recibe_allow_origin(
    client: TestClient, fake_redis
) -> None:
    respuesta = client.get("/api/health", headers={"Origin": ORIGEN_MALO})

    # El bloqueo real lo aplica el navegador al no ver el header; el backend no
    # puede impedir que un script servidor a servidor llame a la API.
    assert "access-control-allow-origin" not in respuesta.headers


def test_preflight_de_origen_permitido_anuncia_solo_get(client: TestClient) -> None:
    respuesta = client.options(
        "/api/health",
        headers={"Origin": ORIGEN_OK, "Access-Control-Request-Method": "GET"},
    )

    assert respuesta.status_code == 200
    # API de solo lectura (SECURITY §3.2): la allowlist de métodos se lo anuncia al
    # navegador, que ya no tiene que preguntar por un método no permitido.
    assert respuesta.headers["access-control-allow-methods"] == "GET, OPTIONS"
    assert respuesta.headers["access-control-allow-origin"] == ORIGEN_OK


def test_preflight_de_origen_no_permitido_es_400(client: TestClient) -> None:
    respuesta = client.options(
        "/api/health",
        headers={
            "Origin": ORIGEN_MALO,
            "Access-Control-Request-Method": "GET",
        },
    )

    assert respuesta.status_code == 400
    assert "access-control-allow-origin" not in respuesta.headers


def test_docs_y_openapi_no_se_montan_sin_debug(client: TestClient) -> None:
    # El gate de `DEBUG` se evalúa al importar la app, así que aquí solo se
    # comprueba el estado por defecto (producción); la rama de dev se prueba en
    # desarrollo con `DEBUG=true`.
    assert client.get("/docs").status_code == 404
    assert client.get("/openapi.json").status_code == 404
