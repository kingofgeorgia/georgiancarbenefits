from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, HttpUrl, computed_field, model_validator


class VehicleSpecification(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True, allow_inf_nan=False)

    id: str = Field(pattern=r"^[a-z0-9][a-z0-9-]{0,95}$")
    make: str = Field(min_length=1, max_length=80)
    model: str = Field(min_length=1, max_length=80)
    modification: str = Field(min_length=1, max_length=160)
    year_from: int = Field(ge=1990, le=2100)
    year_to: int = Field(ge=1990, le=2100)
    market: Literal["US", "EU"]
    fuel: Literal["PETROL", "DIESEL", "HYBRID", "ELECTRIC"]
    powertrain_kind: Literal["ICE", "OTHER_HYBRID", "EV", "SERIES_HYBRID"]
    drive: Literal["FWD", "RWD", "AWD"]
    engine_liters: float = Field(ge=0, le=20)
    engine_cc: int | None = Field(default=None, ge=0, le=20000)
    power_value: float = Field(gt=0, le=5000)
    power_unit: Literal["PS", "SAE_HP", "KW"]
    power_basis: Literal["ENGINE_NET", "SYSTEM_MAX", "ELECTRIC_PEAK"]
    trim_aliases: tuple[str, ...] = Field(min_length=1, max_length=20)
    source_title: str = Field(min_length=1, max_length=200)
    source_url: HttpUrl
    engine_source_url: HttpUrl | None = None
    verified_on: date

    @model_validator(mode="after")
    def validate_specification(self):
        if self.year_from > self.year_to:
            raise ValueError("Invalid model-year interval")
        if self.verified_on > date.today():
            raise ValueError("Verification date must not be in the future")
        if any(url and (url.scheme != "https" or url.username or url.password) for url in (self.source_url, self.engine_source_url)):
            raise ValueError("Sources must be credential-free HTTPS URLs")
        if self.powertrain_kind == "ICE" and (self.fuel not in {"PETROL", "DIESEL"} or self.power_basis != "ENGINE_NET"):
            raise ValueError("ICE records require engine-net power and combustion fuel")
        if self.powertrain_kind != "ICE" and self.power_basis == "ENGINE_NET":
            raise ValueError("Initial non-ICE catalog stores reference system/peak power only")
        if self.engine_cc is not None and abs(self.engine_cc / 1000 - self.engine_liters) > 0.1:
            raise ValueError("Exact and nominal displacement disagree")
        if not all(alias.strip() for alias in self.trim_aliases):
            raise ValueError("Empty modification aliases are not allowed")
        return self

    @computed_field
    @property
    def horse_power(self) -> float:
        # Russian metric horsepower is not US mechanical/SAE horsepower.
        factor = {"PS": 1, "SAE_HP": 745.6998715822702 / 735.49875, "KW": 1000 / 735.49875}[self.power_unit]
        return round(self.power_value * factor, 2)


class VehicleSpecificationCatalog(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    version: date
    items: tuple[VehicleSpecification, ...] = Field(min_length=1, max_length=500)

    @model_validator(mode="after")
    def unique_ids(self):
        if len({entry.id for entry in self.items}) != len(self.items):
            raise ValueError("Duplicate modification IDs")
        return self


class VehicleSpecificationSearch(BaseModel):
    version: date
    items: list[VehicleSpecification]
