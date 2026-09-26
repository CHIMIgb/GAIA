"""Criterio ROADMAP 0.2.1: GET /api/health -> 200 {success, data, error}.

Payload según DEPLOYMENT §3.3, ampliado con Redis en el Paso 0.2.2.
"""


def test_health_returns_contract_envelope(client, fake_redis):
    res = client.get("/api/health")

    assert res.status_code == 200
    assert res.json() == {
        "success": True,
        "data": {"status": "ok", "redis": "connected"},
        "error": None,
    }
