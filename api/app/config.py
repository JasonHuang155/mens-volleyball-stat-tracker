from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Settings come from environment variables, so each place the server runs
    (your laptop, GitHub's tests, the hosting service) can pass its own."""

    # The local Docker database from docker-compose.yml (port 5433 on your laptop).
    # The hosting service sets its own DATABASE_URL.
    database_url: str = "postgresql+psycopg://volleyball:volleyball@localhost:5433/volleyball"


settings = Settings()
