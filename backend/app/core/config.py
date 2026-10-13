from typing import Literal

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_env: Literal["development", "test", "production"] = "development"

    postgres_user: str = "gcb_user"
    postgres_password: str = "gcb_password"
    postgres_db: str = "gcb_db"
    postgres_host: str = "localhost"
    postgres_port: int = 5432

    secret_key: str = "change_me"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60

    frontend_origin: str = "http://localhost:3000"

    exchange_api_url: str = "https://www.cbr.ru/scripts/XML_daily.asp"
    exchange_cache_ttl_seconds: int = 3600

    myauto_api_url: str = "https://api2.myauto.ge/ka"

    auto_ru_business_api_url: str = "https://appraisal.api.cm.expert/v1"
    auto_ru_business_token: str | None = None
    auto_ru_business_sources: str = "auto_ru"
    auto_ru_business_liquidity_region_id: int = 1960671
    auto_ru_business_timeout_seconds: float = 10.0
    auto_ru_market_similar_threshold: int = 10
    auto_ru_market_cache_ttl_seconds: int = 3600

    @model_validator(mode="after")
    def validate_production_security(self):
        if self.app_env != "production":
            return self

        if self.secret_key == "change_me" or len(self.secret_key) < 32:
            raise ValueError("SECRET_KEY must be replaced with at least 32 random characters in production")

        weak_db_passwords = {"gcb_password", "postgres", "password", "changeme", "change_me"}
        if self.postgres_password.lower() in weak_db_passwords or len(self.postgres_password) < 16:
            raise ValueError("POSTGRES_PASSWORD must be a strong password of at least 16 characters in production")

        if "localhost" in self.frontend_origin or "127.0.0.1" in self.frontend_origin:
            raise ValueError("FRONTEND_ORIGIN must be the public HTTPS origin in production")

        if not self.frontend_origin.startswith("https://"):
            raise ValueError("FRONTEND_ORIGIN must use HTTPS in production")

        return self

    @property
    def database_url(self) -> str:
        return (
            f"postgresql://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )


settings = Settings()
