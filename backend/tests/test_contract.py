"""Contrato universal (API_CONTRACT §3.2): TODA respuesta, incluidos errores, va envuelta."""

from fastapi import Query


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
