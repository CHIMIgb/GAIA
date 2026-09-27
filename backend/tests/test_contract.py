"""Contrato universal (API_CONTRACT §3.2): TODA respuesta, incluidos errores, va envuelta.

El catálogo son 7 códigos con su status (API_CONTRACT §6); esta archivo comprueba que
la tabla de la app los cubre todos y que cada status vuelve envuelto y con su código.
"""

import pytest
from fastapi import HTTPException, Query

from app.models.response import CODE_BY_STATUS, ErrorCode

# API_CONTRACT §6 copiado a mano a propósito: si el test leyera el par status→código
# de la tabla de la app, un mapeo equivocado se validaría a sí mismo.
CATALOGO = [
    (400, "VALIDATION_ERROR"),
    (404, "NOT_FOUND"),
    (429, "UPSTREAM_RATE_LIMITED"),
    (500, "INTERNAL_SERVER_ERROR"),
    (502, "UPSTREAM_UNAVAILABLE"),
    (503, "CACHE_MISS"),
    (504, "UPSTREAM_TIMEOUT"),
]


def test_la_tabla_de_status_cubre_los_7_codigos_del_catalogo():
    assert set(CODE_BY_STATUS.values()) == set(ErrorCode)


def test_la_tabla_de_status_no_se_desvía_del_catalogo():
    esperado = {status: ErrorCode(code) for status, code in CATALOGO}

    assert CODE_BY_STATUS == esperado


# El 500 se queda fuera a propósito: un `HTTPException(500, detail=...)` sí dejaría
# el detalle en la respuesta, que es justo lo que impide
# `test_unhandled_error_is_wrapped`. Para un 500 de verdad (excepción sin controlar)
# el test dedicado de abajo ya comprueba que no se filtra nada.
@pytest.mark.parametrize(
    ("status", "code"), [(s, c) for s, c in CATALOGO if s != 500]
)
def test_cada_status_del_catalogo_vuelve_envuelto(client, status, code):
    @client.app.get(f"/_status/{status}")
    async def probe():
        raise HTTPException(status_code=status, detail="detalle del error")

    res = client.get(f"/_status/{status}")

    assert res.status_code == status
    assert res.json() == {
        "success": False,
        "data": None,
        "error": {
            "code": code,
            "message": "detalle del error",
            "details": None,
        },
    }


def test_unknown_route_is_wrapped(client, fake_redis):
    # `fake_redis` es imprescindible aquí y no por casualidad: `/api/...` pasa por
    # el rate-limit, que sin Redis real revienta con 500. La suite corre sin servicios
    # externos (DEPLOYMENT §3.4), igual que en el CI.
    res = client.get("/api/does-not-exist")

    assert res.status_code == 404
    body = res.json()
    assert body["success"] is False
    assert body["data"] is None
    assert body["error"]["code"] == "NOT_FOUND"


def test_validation_error_is_wrapped(client):
    @client.app.get("/_probe")
    async def probe(hours: int = Query(...)):
        return hours

    res = client.get("/_probe?hours=not-a-number")

    assert res.status_code == 400
    body = res.json()
    assert body["success"] is False
    assert body["data"] is None
    assert body["error"]["code"] == "VALIDATION_ERROR"


def test_unhandled_error_is_wrapped(client):
    @client.app.get("/_boom")
    async def boom():
        raise RuntimeError("boom")

    res = client.get("/_boom")

    assert res.status_code == 500
    body = res.json()
    assert body["success"] is False
    assert body["data"] is None
    assert body["error"]["code"] == "INTERNAL_SERVER_ERROR"
    # No se filtra el detalle interno al cliente.
    assert "boom" not in res.text
