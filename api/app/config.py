from pydantic import model_validator
from pydantic_settings import BaseSettings

DEV_ONLY_SECRET = "dev-only-secret-not-for-the-hosted-server"


class Settings(BaseSettings):
    """Settings come from environment variables, so each place the server runs
    (your laptop, GitHub's tests, the hosting service) can pass its own."""

    # "development" on laptops and in tests; the hosting service sets ENVIRONMENT=production.
    environment: str = "development"

    # The local Docker database from docker-compose.yml (port 5433 on your laptop).
    # The hosting service sets its own DATABASE_URL.
    database_url: str = "postgresql+psycopg://volleyball:volleyball@localhost:5433/volleyball"

    # Signs login tokens. Anyone who knows it could make fake tokens, so the hosted
    # server must set its own long random JWT_SECRET.
    jwt_secret: str = DEV_ONLY_SECRET
    # How long a login lasts. Long, because the app is often offline courtside.
    token_lifetime_days: int = 30

    @model_validator(mode="after")
    def production_needs_a_real_secret(self) -> Settings:
        if self.environment == "production" and self.jwt_secret == DEV_ONLY_SECRET:
            raise ValueError("Set JWT_SECRET to a long random value before running in production")
        return self


settings = Settings()
