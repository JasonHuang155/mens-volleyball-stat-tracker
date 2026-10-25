"""Runs migrations. Alembic calls this for every `alembic upgrade`, `downgrade`, or `revision` command."""

from logging.config import fileConfig

from alembic import context
from sqlalchemy import create_engine

from app.config import settings
from app.models import Base

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name, disable_existing_loggers=False)

# What the tables should look like. `alembic revision --autogenerate` compares this
# with the real database and writes a migration for the differences.
target_metadata = Base.metadata

# Tests pass their own database address; otherwise use the app's (DATABASE_URL).
database_url = config.get_main_option("sqlalchemy.url") or settings.database_url


def run_migrations_offline() -> None:
    """Writes the migration SQL to the screen instead of running it (`alembic upgrade head --sql`)."""
    context.configure(url=database_url, target_metadata=target_metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Connects to the database and runs the migrations."""
    engine = create_engine(database_url)
    with engine.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()
    engine.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
