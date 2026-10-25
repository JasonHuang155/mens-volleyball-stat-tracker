"""Shared test setup. pytest runs this automatically before the tests.

Tests talk to a real Postgres, but a separate database (volleyball_test) so they
never touch your development data. Start it with `docker compose up -d db`.

At the start of a test run, the test database is emptied and the migrations build
the tables from scratch. Each test then runs inside a transaction that's rolled back
at the end, so tests can't see each other's data.
"""

import os
from collections.abc import Iterator
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import Engine, create_engine, text
from sqlalchemy.orm import Session

from app.db import get_session
from app.main import app

TEST_DATABASE_URL = os.environ.get(
    "TEST_DATABASE_URL",
    "postgresql+psycopg://volleyball:volleyball@localhost:5433/volleyball_test",
)
API_DIR = Path(__file__).resolve().parents[1]


def alembic_config(database_url: str) -> Config:
    """Alembic's settings from alembic.ini, pointed at the given database."""
    config = Config(str(API_DIR / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", database_url)
    return config


@pytest.fixture(scope="session")
def engine() -> Iterator[Engine]:
    test_engine = create_engine(TEST_DATABASE_URL)
    with test_engine.begin() as connection:
        connection.execute(text("DROP SCHEMA public CASCADE"))
        connection.execute(text("CREATE SCHEMA public"))
    command.upgrade(alembic_config(TEST_DATABASE_URL), "head")
    yield test_engine
    test_engine.dispose()


@pytest.fixture
def session(engine: Engine) -> Iterator[Session]:
    """A database session whose changes are all undone when the test ends."""
    connection = engine.connect()
    transaction = connection.begin()
    # Commits inside the test only release a savepoint; the outer transaction is rolled back below.
    test_session = Session(bind=connection, join_transaction_mode="create_savepoint")
    yield test_session
    test_session.close()
    transaction.rollback()
    connection.close()


@pytest.fixture
def client(session: Session) -> Iterator[TestClient]:
    """A pretend browser for calling the API, using the test's database session."""

    def test_session() -> Iterator[Session]:
        yield session

    app.dependency_overrides[get_session] = test_session
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()
