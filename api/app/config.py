from pydantic import model_validator
from pydantic_settings import BaseSettings

DEV_ONLY_SECRET = "dev-only-secret-not-for-the-hosted-server"

# The app while you're building it: on this computer, or on a phone on your home Wi-Fi
# (addresses like 192.168.x.x and 10.x.x.x only exist inside a home or office network).
LOCAL_APP_ADDRESSES = (
    r"http://(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}"
    r"|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(:\d+)?"
)


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

    # Web pages allowed to call the server from a browser (CORS). Browsers block a page from
    # calling a server at a different address unless the server names it here.
    # The default is the app on GitHub Pages; set CORS_ORIGINS='["https://..."]' to change it.
    cors_origins: list[str] = ["https://jasonhuang155.github.io"]

    @property
    def cors_origin_regex(self) -> str | None:
        """Local copies of the app are allowed too, but only on development servers."""
        return LOCAL_APP_ADDRESSES if self.environment == "development" else None

    @model_validator(mode="after")
    def production_needs_a_real_secret(self) -> Settings:
        if self.environment == "production" and self.jwt_secret == DEV_ONLY_SECRET:
            raise ValueError("Set JWT_SECRET to a long random value before running in production")
        return self


settings = Settings()
