from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker

from app.config import settings

# The engine manages connections to Postgres. Creating it doesn't connect yet;
# pool_pre_ping checks a connection still works before using it.
engine = create_engine(settings.database_url, pool_pre_ping=True)
SessionLocal = sessionmaker(engine)


def get_session() -> Iterator[Session]:
    """Gives each request its own database session, closed when the request ends.
    Routes ask for it with `session: Session = Depends(get_session)`."""
    with SessionLocal() as session:
        yield session
