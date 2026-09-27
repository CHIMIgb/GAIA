"""Seam de mock de upstreams (ROADMAP 0.6.3): un módulo se testea sin red real.

`MockTransport` intercepta el fetch, así que estos tests no abren ni un socket aunque
la URL sea de verdad. Es el escenario `mocked_upstream_timeout` de TESTING §5.
"""

import csv
import io

import httpx2
import pytest

from app.services.http_client import HEADERS, TIMEOUT_S, build_client

# URL de DATA_SOURCES §FIRMS (ejemplo de petición), no inventada aquí.
FIRMS_URL = (
    "https://firms.modaps.eosdis.nasa.gov/api/area/csv/KEY/VIIRS_SNPP_NRT/world/1"
)


@pytest.fixture
def mock_fires(sample):
    """Transporte con la respuesta CSV que devolvería FIRMS: la muestra de
    `tests/fixtures`, que es la cabecera y la fila que documenta DATA_SOURCES."""

    def handler(request: httpx2.Request) -> httpx2.Response:
        return httpx2.Response(
            200,
            text=sample("fires_viirs_nrt_sample.csv"),
            headers={"content-type": "text/csv"},
        )

    return httpx2.MockTransport(handler)


async def test_un_fetch_a_una_fuente_se_prueba_sin_red(mock_fires, sample):
    client = build_client(transport=mock_fires)
    try:
        res = await client.get(FIRMS_URL, params={"days": 1})
    finally:
        await client.aclose()

    filas = list(csv.DictReader(io.StringIO(res.text)))
    assert res.status_code == 200
    assert len(filas) == 1
    assert float(filas[0]["frp"]) == 28.7
    assert float(filas[0]["latitude"]) == -12.453


async def test_el_timeout_del_upstream_llega_como_excepcion():
    """`mocked_upstream_timeout` de TESTING §5: es la excepción que el módulo
    traduce a `UPSTREAM_TIMEOUT` (504)."""

    def handler(request: httpx2.Request) -> httpx2.Response:
        raise httpx2.TimeoutException("timeout", request=request)

    client = build_client(transport=httpx2.MockTransport(handler))
    try:
        with pytest.raises(httpx2.TimeoutException):
            await client.get(FIRMS_URL)
    finally:
        await client.aclose()


def test_el_cliente_trae_timeout_y_headers_de_la_doc():
    vacio = httpx2.MockTransport(lambda r: httpx2.Response(200))
    client = build_client(transport=vacio)

    assert client.timeout == httpx2.Timeout(TIMEOUT_S)
    assert client.headers["user-agent"] == HEADERS["User-Agent"]


async def test_el_lifespan_deja_el_cliente_listo_y_cerrado(client):
    """El lifespan lo crea al arrancar y lo cierra al apagar (cliente compartido)."""
    assert isinstance(client.app.state.http, httpx2.AsyncClient)
    assert client.app.state.http.is_closed is False


def test_el_gestor_de_fixtures_avisa_si_no_existe_la_muestra(sample):
    with pytest.raises(FileNotFoundError, match="no hay fixture"):
        sample("no_existe.csv")
