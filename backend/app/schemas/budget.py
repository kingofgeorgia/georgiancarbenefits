from datetime import date
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.calculator import CurrencyRates
from app.schemas.cars import CarListing

BudgetMode = Literal["GEORGIA_PURCHASE", "RUSSIA_TOTAL"]
BudgetCurrency = Literal["USD", "RUB", "GEL"]


class BudgetSearchRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)

    mode: BudgetMode
    budget_amount: float = Field(gt=0, le=100_000_000_000)
    budget_currency: BudgetCurrency
    logistics_cost_rub: float | None = Field(default=None, ge=0, le=100_000_000)
    registration_cost_rub: float | None = Field(default=None, ge=0, le=100_000_000)
    make_id: int | None = Field(default=None, ge=1, le=10_000_000)
    year_from: int | None = Field(default=None, ge=1900, le=2100)
    year_to: int | None = Field(default=None, ge=1900, le=2100)
    mileage_km_to: int | None = Field(default=None, ge=0, le=10_000_000)
    page: int = Field(default=1, ge=1, le=100)

    @model_validator(mode="after")
    def validate_budget(self):
        if self.year_from and self.year_to and self.year_from > self.year_to:
            raise ValueError("Invalid year range")
        if self.year_from and self.year_from > date.today().year:
            raise ValueError("Year cannot be in the future")
        if self.mode == "RUSSIA_TOTAL" and (self.logistics_cost_rub is None or self.registration_cost_rub is None):
            raise ValueError("Russia total requires explicit logistics and registration costs")
        return self


class BudgetCostBreakdown(BaseModel):
    purchase_rub: float
    customs_fee_rub: float
    customs_duty_rub: float
    import_duty_rub: float
    excise_rub: float
    vat_rub: float
    recycling_fee_rub: float
    logistics_cost_rub: float
    registration_cost_rub: float
    total_rub: float
    minimum_total_rub: float
    calculation_rule_version: str


class BudgetCandidate(BaseModel):
    car: CarListing
    status: Literal["WITHIN_BUDGET", "NEEDS_DETAILS"]
    cost_in_budget_currency: float | None = None
    remaining_budget: float | None = None
    breakdown: BudgetCostBreakdown | None = None
    reason: Literal["ELECTRIC_POWER", "HORSEPOWER", "ENGINE", "MILEAGE", "VEHICLE_DATA"] | None = None


class BudgetSearchResult(BaseModel):
    request: BudgetSearchRequest
    matches: list[BudgetCandidate]
    needs_details: list[BudgetCandidate]
    checked_count: int
    skipped_count: int
    has_more: bool
    next_page: int | None = None
    rates: CurrencyRates | None = None
    calculation_date: date
