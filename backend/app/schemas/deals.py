import math
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.core.public_urls import is_myauto_image_url, is_myauto_url
from app.schemas.calculator import CalculatorInput, CalculatorRequest, CalculatorResult
from app.services.vin_decoder import normalize_vin, validate_vin


class DealVehicleSnapshot(BaseModel):
    make: str | None = Field(default=None, max_length=80)
    model: str | None = Field(default=None, max_length=120)
    year: int | None = None
    mileage_km: int | None = None
    price_usd: float | None = None
    image_url: str | None = Field(default=None, max_length=1200)
    source_url: str | None = Field(default=None, max_length=1200)
    vin: str | None = Field(default=None, max_length=17)


class DealShareCreate(BaseModel):
    request: CalculatorRequest
    result: CalculatorResult
    vehicle: DealVehicleSnapshot | None = None


class DealVehicleInput(DealVehicleSnapshot):
    model_config = ConfigDict(allow_inf_nan=False, extra="forbid")
    year: int | None = Field(default=None, ge=1900, le=2100)
    mileage_km: int | None = Field(default=None, ge=0, le=10_000_000)
    price_usd: float | None = Field(default=None, gt=0, le=100_000_000)

    @field_validator("image_url")
    @classmethod
    def validate_image(cls, value):
        if value is not None and not is_myauto_image_url(value):
            raise ValueError("Unsupported vehicle image URL")
        return value

    @field_validator("source_url")
    @classmethod
    def validate_source(cls, value):
        if value is not None and not is_myauto_url(value):
            raise ValueError("Unsupported vehicle source URL")
        return value

    @field_validator("vin")
    @classmethod
    def validate_vin(cls, value):
        if value is not None:
            value = normalize_vin(value)
            if not validate_vin(value):
                raise ValueError("Invalid VIN")
        return value


class DealShareInput(DealShareCreate):
    model_config = ConfigDict(extra="forbid")
    request: CalculatorInput
    vehicle: DealVehicleInput | None = None

    @model_validator(mode="after")
    def validate_result_numbers(self):
        def check(value):
            if isinstance(value, float) and not math.isfinite(value):
                raise ValueError("Shared result must contain finite numbers")
            if isinstance(value, dict):
                for child in value.values():
                    check(child)
            elif isinstance(value, list):
                for child in value:
                    check(child)
        check(self.result.model_dump())
        return self


class DealShareOut(BaseModel):
    public_id: str
    schema_version: str
    snapshot: DealShareCreate
    created_at: datetime


class DealShareCreated(BaseModel):
    public_id: str
    created_at: datetime
