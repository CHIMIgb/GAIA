"""Criterio ROADMAP 0.2.1: GET /api/health -> 200 {success, data, error}."""


def test_health_returns_contract_envelope(client):
    res = client.get("/api/health")

    assert res.status_code == 200
    assert res.json() == {"success": True, "data": {"ok": True}, "error": None}
