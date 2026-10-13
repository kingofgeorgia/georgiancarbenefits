from datetime import datetime

from pydantic import BaseModel, Field

from app.schemas.calculator import CalculatorRequest, CalculatorResult


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


class DealShareOut(BaseModel):
    public_id: str
    schema_version: str
    snapshot: DealShareCreate
    created_at: datetime


class DealShareCreated(BaseModel):
    public_id: str
    created_at: datetime
