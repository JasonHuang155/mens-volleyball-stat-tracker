"""Checks that the migrations themselves are sound, using a throwaway database."""

from collections.abc import Iterator

import pytest
from alembic import command
from alembic.autogenerate import compare_metadata
from alembic.migration import MigrationContext
from sqlalchemy import Engine, create_engine, inspect, text
from sqlalchemy.engine import make_url

from app.models import Base
from tests.conftest import TEST_DATABASE_URL, alembic_config

SCRATCH_DATABASE = "volleyball_migration_check"


@pytest.fixture
def scratch_url(engine: Engine) -> Iterator[str]:
    """A brand-new empty database for this test, dropped afterwards."""
    # CREATE DATABASE can't run inside a transaction, hence AUTOCOMMIT.
    admin = engine.execution_options(isolation_level="AUTOCOMMIT")
    with admin.connect() as connection:
        connection.execute(text(f"DROP DATABASE IF EXISTS {SCRATCH_DATABASE} WITH (FORCE)"))
        connection.execute(text(f"CREATE DATABASE {SCRATCH_DATABASE}"))
    yield make_url(TEST_DATABASE_URL).set(database=SCRATCH_DATABASE).render_as_string(hide_password=False)
    with admin.connect() as connection:
        connection.execute(text(f"DROP DATABASE IF EXISTS {SCRATCH_DATABASE} WITH (FORCE)"))


def table_names(url: str) -> set[str]:
    scratch = create_engine(url)
    try:
        return set(inspect(scratch).get_table_names()) - {"alembic_version"}
    finally:
        scratch.dispose()


def test_migrations_build_the_tables_and_can_be_undone(scratch_url: str) -> None:
    config = alembic_config(scratch_url)

    command.upgrade(config, "head")
    assert table_names(scratch_url) == {"users", "teams", "team_members", "players", "matches", "events"}

    command.downgrade(config, "base")
    assert table_names(scratch_url) == set()

    command.upgrade(config, "head")  # and back up again, cleanly
    assert "events" in table_names(scratch_url)


def test_every_change_to_the_models_has_a_migration(engine: Engine) -> None:
    # The test database was built by the migrations. If app/models.py says something
    # different, someone changed a model without running `alembic revision --autogenerate`.
    with engine.connect() as connection:
        differences = compare_metadata(MigrationContext.configure(connection), Base.metadata)
    assert differences == []
