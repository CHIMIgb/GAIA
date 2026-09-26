import pytest
from fastapi.testclient import TestClient

from app.main import app


@pytest.fixture
def client() -> TestClient:
    # raise_server_exceptions=False: deja que el handler global de 500 se pruebe de verdad.
    return TestClient(app, raise_server_exceptions=False)
