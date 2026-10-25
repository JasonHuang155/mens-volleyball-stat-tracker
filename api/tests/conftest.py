"""Shared test setup. pytest runs this automatically before the tests.

Tests talk to a real Postgres, but a separate database (volleyball_test) so they
never touch your development data. Start it with `docker compose up -d db`.
"""

import os
from collections.abc import Iterator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import Session

from app.db import get_session
from app.main import app

TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql+psycopg://volleyball:volleyball@localhost:5433/volleyball_test",
)


@pytest.fixture(scope="session")
def engine() -> Iterator[Engine]:
    test_engine = create_engine(TEST_DATABASE_URL)
    yield test_engine
    test_engine.dispose()


@pytest.fixture
def client(engine: Engine) -> Iterator[TestClient]:
    """A pretend browser for calling the API, wired to the test database."""

    def test_session() -> Iterator[Session]:
        with Session(engine) as session:
            yield session

    app.dependency_overrides[get_session] = test_session
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
