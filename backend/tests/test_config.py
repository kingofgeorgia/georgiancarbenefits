import pytest
from pydantic import ValidationError

from app.core.config import Settings


STRONG_SECRET = "s" * 48
STRONG_DB_PASSWORD = "database-password-2026"


def production_settings(**overrides: object) -> Settings:
    values: dict[str, object] = {
        "app_env": "production",
        "secret_key": STRONG_SECRET,
        "postgres_password": STRONG_DB_PASSWORD,
        "frontend_origin": "https://cars.example.com",
    }
    values.update(overrides)
    return Settings(_env_file=None, **values)


def test_development_defaults_remain_available() -> None:
    settings = Settings(_env_file=None)
    assert settings.app_env == "development"


def test_production_accepts_strong_settings() -> None:
    settings = production_settings()
    assert settings.app_env == "production"
    assert settings.frontend_origin == "https://cars.example.com"


def test_production_rejects_default_secret_key() -> None:
    with pytest.raises(ValidationError, match="SECRET_KEY"):
        production_settings(secret_key="change_me")


def test_production_rejects_weak_database_password() -> None:
    with pytest.raises(ValidationError, match="POSTGRES_PASSWORD"):
        production_settings(postgres_password="gcb_password")


def test_production_rejects_localhost_origin() -> None:
    with pytest.raises(ValidationError, match="FRONTEND_ORIGIN"):
        production_settings(frontend_origin="https://localhost:3000")


def test_production_requires_https_origin() -> None:
    with pytest.raises(ValidationError, match="FRONTEND_ORIGIN"):
        production_settings(frontend_origin="http://cars.example.com")
