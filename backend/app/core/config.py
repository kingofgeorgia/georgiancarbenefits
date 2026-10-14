from typing import Literal

from limits import parse_many
from pydantic import Field, model_validator
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

    api_rate_storage_uri: str = "async+memory://"
    api_rate_client: str = "120/minute"
    api_rate_global: str = "3000/minute;50000/day"
    api_rate_lookup_client: str = "20/minute;200/day"
    api_rate_lookup_global: str = "600/hour;10000/day"
    api_rate_calculator_client: str = "60/minute"
    api_rate_share_client: str = "20/minute;100/day"
    api_rate_share_global: str = "500/hour;1000/day"
    api_rate_auth_client: str = "10/minute;50/hour"
    api_max_body_bytes: int = Field(default=64 * 1024, ge=1024, le=1024 * 1024)
    api_body_timeout_seconds: float = Field(default=15, gt=0, le=60, allow_inf_nan=False)

    @model_validator(mode="after")
    def validate_api_limits(self):
        if not self.api_rate_storage_uri.startswith(("async+memory://", "async+redis://", "async+rediss://")):
            raise ValueError("API_RATE_STORAGE_URI must use asynchronous memory or Redis storage")
        for name in type(self).model_fields:
            if name.startswith("api_rate_") and name != "api_rate_storage_uri":
                limits = parse_many(getattr(self, name))
                if not limits or any(limit.amount <= 0 for limit in limits):
                    raise ValueError(f"{name} must contain positive rate limits")
        return self

    exchange_api_url: str = "https://www.cbr.ru/scripts/XML_daily.asp"
    exchange_cache_ttl_seconds: int = 3600

    myauto_api_url: str = "https://api2.myauto.ge/ka"

    nhtsa_vpic_api_url: str = "https://vpic.nhtsa.dot.gov/api"
    nhtsa_vpic_timeout_seconds: float = 10.0
    nhtsa_vpic_cache_ttl_seconds: int = 86400

    # Drom Search API. Automatic extraction from Drom is only enabled after
    # authorized API/database access has been confirmed with Drom.
    drom_api_url: str = "https://api.drom.ru/v1.2"
    drom_api_access_confirmed: bool = False
    drom_api_auth_query_json: str = "{}"
    drom_vehicle_id_map_json: str = "{}"
    drom_market_timeout_seconds: float = 10.0
    drom_market_pages: int = 3
    drom_market_min_samples: int = 5
    drom_market_trim_fraction: float = 0.10
    drom_market_mileage_window_percent: float = 0.35
    drom_market_mileage_window_min_km: int = 30_000
    drom_market_cache_ttl_seconds: int = 3600

    @model_validator(mode="after")
    def validate_production_security(self):
        if self.app_env != "production":
            return self

        if self.api_rate_storage_uri.startswith("async+memory://"):
            raise ValueError("Production requires shared Redis API rate storage")

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
