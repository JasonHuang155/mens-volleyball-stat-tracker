import pytest
from pydantic import ValidationError

from app.config import Settings


def test_production_refuses_to_start_with_the_development_secret() -> None:
    with pytest.raises(ValidationError, match="Set JWT_SECRET"):
        Settings(environment="production")


def test_production_starts_with_its_own_secret() -> None:
    settings = Settings(environment="production", jwt_secret="a-long-random-value-from-the-hosting-service")
    assert settings.environment == "production"
