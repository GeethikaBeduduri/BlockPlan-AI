"""API tests for service identity and liveness endpoints."""

from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app


def _client() -> TestClient:
    settings = Settings(
        app_title="SIH26027 Block Planning API",
        app_version="0.1.0",
        environment="test",
        debug=False,
    )
    return TestClient(create_app(settings))


def test_root_returns_service_identity() -> None:
    response = _client().get("/")
    assert response.status_code == 200
    payload = response.json()
    assert payload["service"] == "SIH26027 Block Planning API"
    assert payload["version"] == "0.1.0"
    assert payload["environment"] == "test"
    assert payload["docs"] == "/docs"


def test_health_returns_healthy() -> None:
    response = _client().get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "healthy"}


def test_favicon_returns_no_content() -> None:
    response = _client().get("/favicon.ico")
    assert response.status_code == 204
