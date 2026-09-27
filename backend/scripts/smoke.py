"""Smoke test de la plataforma (ROADMAP 0.5.1, criterio del paso).

Recorre el flujo base contra un backend y un frontend ya levantados
(docs/GAIA_DEPLOYMENT.md §3.2):

1. `GET /api/health` responde con el contrato universal y Redis conectado.
2. El rate-limit global corta un burst con `UPSTREAM_RATE_LIMITED`.
3. El frontend sirve su página y el bundle de JS que esa página carga.

Solo stdlib y sale con 1 si algo falla, para poder encadenarlo en el CI. Lo que
necesita un navegador de verdad (consola, canvas, workers) es el smoke de
Playwright del paso 0.6.9, no esto.

    python backend/scripts/smoke.py --api http://localhost:8000 --frontend http://localhost:5173
"""

import argparse
import json
import re
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin
from urllib.request import urlopen

# El bucket global del rate-limit tiene capacidad 240 y recarga 120/min
# (SECURITY §4.1), así que hacen falta más de 240 peticiones seguidas para que
# salte. El burst no lleva tope fijo —recargar es lo que lo hace variable—: se
# corta en cuanto llega el 429, con techo de peticiones y de segundos para que un
# backend lentísimo no deje el smoke colgado.
MAX_PETICIONES = 600
MAX_SEGUNDOS = 120
# Path que NO está exento del rate-limit. En F0 el único endpoint montado es
# `/api/health`, que sí lo está, así que el burst va contra uno inexistente;
# cuando existan endpoints de módulo (F2+) conviene apuntar a uno real.
PATH_SIN_EXENCION = "/api/no-existe"

BUNDLE_JS = re.compile(r'src="([^"]+\.js)"')

fallos = 0


def check(nombre: str, ok: bool, detalle: str = "") -> None:
    global fallos
    sufijo = f" — {detalle}" if detalle else ""
    print(f"{'OK   ' if ok else 'FALLA'} {nombre}{sufijo}")
    if not ok:
        fallos += 1


def get(url: str, timeout: int = 10) -> tuple[int, bytes]:
    """(status, cuerpo) también para 4xx/5xx; `URLError` si no hay servidor."""
    try:
        with urlopen(url, timeout=timeout) as respuesta:
            return respuesta.status, respuesta.read()
    except HTTPError as error:
        return error.code, error.read()


def check_health(api: str) -> None:
    try:
        status, cuerpo = get(f"{api}/api/health")
    except URLError as error:
        check("health responde", False, str(error.reason))
        return

    check("health responde 200", status == 200, f"status {status}")
    try:
        datos = json.loads(cuerpo)
    except json.JSONDecodeError:
        check("health devuelve JSON", False, cuerpo[:80].decode("utf-8", "replace"))
        return
    check(
        "health cumple el contrato universal",
        datos.get("success") is True and datos.get("error") is None,
    )
    check(
        "Redis conectado",
        datos.get("data", {}).get("redis") == "connected",
        str(datos.get("data", {}).get("redis")),
    )


def check_rate_limit(api: str) -> None:
    url = f"{api}{PATH_SIN_EXENCION}"
    limite = time.monotonic() + MAX_SEGUNDOS
    for intento in range(1, MAX_PETICIONES + 1):
        try:
            status, cuerpo = get(url)
        except URLError as error:
            check("el backend responde durante el burst", False, str(error.reason))
            return
        if status == 429:
            check(f"el rate-limit corta en la petición {intento}", True)
            try:
                cuerpo_429 = json.loads(cuerpo)
                codigo = cuerpo_429["error"]["code"]
            except (json.JSONDecodeError, KeyError, TypeError):
                check(
                    "el 429 cumple el contrato",
                    False,
                    cuerpo[:80].decode("utf-8", "replace"),
                )
                return
            check(
                "el 429 cumple el contrato universal",
                cuerpo_429.get("success") is False
                and codigo == "UPSTREAM_RATE_LIMITED",
                codigo,
            )
            return
        if time.monotonic() > limite:
            break
    check(
        f"el rate-limit corta antes de {MAX_PETICIONES} peticiones",
        False,
        f"nunca llegó el 429 en {MAX_SEGUNDOS} s",
    )


def check_frontend(frontend: str) -> None:
    try:
        status, cuerpo = get(frontend)
    except URLError as error:
        check("el frontend responde", False, str(error.reason))
        return

    check("el frontend responde 200", status == 200, f"status {status}")
    html = cuerpo.decode("utf-8", "replace")
    check("la página monta el root de React", 'id="root"' in html)

    bundle = BUNDLE_JS.search(html)
    if bundle is None:
        check("la página carga un bundle de JS", False, "no hay src=*.js en el HTML")
        return
    try:
        status_js, cuerpo_js = get(urljoin(f"{frontend}/", bundle.group(1)))
    except URLError as error:
        check("el bundle de JS responde", False, str(error.reason))
        return
    check(
        "el bundle de JS responde 200",
        status_js == 200,
        f"{len(cuerpo_js)} bytes",
    )


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Smoke test de la plataforma (ROADMAP 0.5.1)"
    )
    parser.add_argument(
        "--api", default="http://localhost:8000", help="Base del backend"
    )
    parser.add_argument(
        "--frontend", default="http://localhost:5173", help="Base del frontend servido"
    )
    args = parser.parse_args()
    api, frontend = args.api.rstrip("/"), args.frontend.rstrip("/")

    check_health(api)
    check_rate_limit(api)
    check_frontend(frontend)

    print("SMOKE OK" if fallos == 0 else f"SMOKE FALLIDO: {fallos} comprobación(es)")
    return 1 if fallos else 0


if __name__ == "__main__":
    sys.exit(main())
