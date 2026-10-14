from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.services.deal_score import DealRating, MarketPosition
from app.services.personal_import_customs import CustomsPaymentKind, PowertrainKind
from app.services.russian_market import MarketComparisonStatus, MarketReferenceKind


class CalculatorRequest(BaseModel):
    car_price_usd: float
    engine_volume_cc: int
    car_year: int
    manufacture_date: date | None = None
    horse_power: float | None = None
    electric_power_kw: float | None = None
    mileage_km: int | None = None
    source_make: str | None = None
    source_model: str | None = None
    source_model_id: int | None = None
    powertrain_kind: PowertrainKind | None = None
    is_personal_use: bool = True
    logistics_cost_rub: float = 170_000.0
    rf_analog_price_rub: float | None = None
    auto_market_comparison: bool = True
    note: str | None = None


class CalculatorInput(CalculatorRequest):
    # Tighten new input without changing immutable historical snapshot schemas.
    model_config = ConfigDict(allow_inf_nan=False, extra="forbid")
    car_price_usd: float = Field(gt=0, le=100_000_000)
    engine_volume_cc: int = Field(ge=0, le=20_000)
    car_year: int = Field(ge=1900, le=2100)
    horse_power: float | None = Field(default=None, gt=0, le=5000)
    electric_power_kw: float | None = Field(default=None, gt=0, le=5000)
    mileage_km: int | None = Field(default=None, ge=0, le=10_000_000)
    source_make: str | None = Field(default=None, max_length=80)
    source_model: str | None = Field(default=None, max_length=120)
    source_model_id: int | None = Field(default=None, gt=0, le=10_000_000)
    logistics_cost_rub: float = Field(default=170_000, ge=0, le=100_000_000)
    rf_analog_price_rub: float | None = Field(default=None, gt=0, le=100_000_000_000)
    note: str | None = Field(default=None, max_length=2000)

    @model_validator(mode="after")
    def validate_current_vehicle(self):
        if self.car_year > date.today().year:
            raise ValueError("Vehicle year cannot be in the future")
        if self.manufacture_date and self.manufacture_date > date.today():
            raise ValueError("Manufacture date cannot be in the future")
        if not self.is_personal_use:
            raise ValueError("Only personal imports are supported")
        if self.powertrain_kind in ("EV", "SERIES_HYBRID"):
            if not self.electric_power_kw:
                raise ValueError("Maximum 30-minute electric power is required")
        elif not self.horse_power or not self.engine_volume_cc:
            raise ValueError("Engine volume and horsepower are required")
        return self


class CurrencyRates(BaseModel):
    usd_to_rub: float
    eur_to_rub: float
    gel_to_rub: float
    source: str
    effective_date: date
    fetched_at: datetime
    is_stale: bool


class DealAssessmentOut(BaseModel):
    reference_price_rub: float
    savings_rub: float
    savings_percent: float
    score: int
    rating: DealRating
    market_position: MarketPosition


class MarketComparisonOut(BaseModel):
    status: MarketComparisonStatus
    provider: str
    source: str
    checked_at: datetime
    scope: str
    reference_price_rub: float | None = None
    reference_kind: MarketReferenceKind | None = None
    min_price_rub: float | None = None
    median_price_rub: float | None = None
    average_price_rub: float | None = None
    market_midpoint_rub: float | None = None
    max_price_rub: float | None = None
    similar_count: int | None = None
    average_mileage_km: float | None = None
    removed_params: list[str] = Field(default_factory=list)
    is_mileage_adjusted: bool = False
    make: str | None = None
    model: str | None = None
    year: int | None = None
    mileage_km: int | None = None
    reason: str | None = None


class CalculatorResult(BaseModel):
    car_price_rub: float
    customs_fee_rub: float
    customs_duty_rub: float
    customs_payment_kind: CustomsPaymentKind
    import_duty_rub: float
    excise_rub: float
    vat_rub: float
    recycling_fee_rub: float
    customs_total_rub: float
    logistics_cost_rub: float
    total_cost_rub: float
    # Nullable/defaulted so immutable Deal Page snapshots created before this
    # field existed remain readable. New calculations always populate both.
    power_kw_used: float | None = None
    power_basis: str | None = None
    savings_vs_rf_rub: float | None = None
    deal_assessment: DealAssessmentOut | None = None
    market_comparison: MarketComparisonOut | None = None
    deal_reference_source: str | None = None
    vehicle_age_years: float
    age_is_estimated: bool
    age_estimation_method: str | None = None
    manufacture_date_used: date
    calculation_date: date
    calculation_rule_version: str
    rates: CurrencyRates


class CalculationOut(BaseModel):
    id: int
    car_price_usd: float
    engine_volume_cc: int
    car_year: int
    manufacture_date: date | None = None
    horse_power: float | None = None
    electric_power_kw: float | None = None
    util_coefficient: float | None = None
    powertrain_kind: PowertrainKind | None = None
    is_personal_use: bool = True
    age_is_estimated: bool = True
    logistics_cost_rub: float
    rf_analog_price_rub: float | None
    customs_fee_rub: float | None = None
    customs_duty_rub: float
    customs_payment_kind: CustomsPaymentKind | None = None
    import_duty_rub: float | None = None
    excise_rub: float | None = None
    vat_rub: float | None = None
    recycling_fee_rub: float
    customs_total_rub: float | None = None
    total_cost_rub: float
    calculation_rule_version: str | None = None
    usd_to_rub: float
    eur_to_rub: float
    gel_to_rub: float
    currency_source: str | None = None
    currency_effective_date: date | None = None
    note: str | None
    created_at: datetime

    model_config = {"from_attributes": True}
