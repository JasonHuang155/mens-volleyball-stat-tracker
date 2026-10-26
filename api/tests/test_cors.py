"""Which web pages a browser lets call the server."""

import pytest
from fastapi.testclient import TestClient

from app.config import Settings


def preflight(client: TestClient, origin: str) -> object:
    """What a browser asks before letting a page on `origin` upload: "may I POST with a login?" """
    return client.options(
        "/sync/upload",
        headers={
            "Origin": origin,
            "Access-Control-Request-Method": "POST",
            "Access-Control-Request-Headers": "authorization,content-type",
        },
    )


@pytest.mark.parametrize(
    "origin",
    ["https://jasonhuang155.github.io", "http://localhost:5173", "http://192.168.1.20:5173", "http://10.0.0.29:5173"],
)
def test_the_app_can_call_the_server(client: TestClient, origin: str) -> None:
    response = preflight(client, origin)
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == origin


@pytest.mark.parametrize("origin", ["https://example.com", "http://192.168.1.20.example.com", "https://localhost:5173"])
def test_other_sites_cant(client: TestClient, origin: str) -> None:
    response = preflight(client, origin)
    assert response.status_code == 400
    assert "access-control-allow-origin" not in response.headers


def test_the_hosted_server_only_allows_the_real_app() -> None:
    hosted = Settings(environment="production", jwt_secret="a-long-random-value-from-the-hosting-service")
    assert hosted.cors_origin_regex is None
    assert hosted.cors_origins == ["https://jasonhuang155.github.io"]
