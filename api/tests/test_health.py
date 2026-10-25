from collections.abc import Iterator

from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session

from app.db import get_session
from app.main import app


def test_health_reports_ok_when_the_database_is_reachable(client: TestClient) -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok", "database": "ok"}


def test_health_reports_a_problem_when_the_database_is_down() -> None:
    # Nothing listens on port 1, so connecting fails like it would if Postgres had crashed.
    unreachable = create_engine("postgresql+psycopg://nobody:nothing@127.0.0.1:1/none?connect_timeout=2")

    def broken_session() -> Iterator[Session]:
        with Session(unreachable) as session:
            yield session

    app.dependency_overrides[get_session] = broken_session
    try:
        response = TestClient(app).get("/health")
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 503
    assert response.json() == {"detail": "The database isn't reachable"}
