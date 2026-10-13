from datetime import date, datetime

from pydantic import BaseModel, Field, model_validator

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

    @model_validator(mode="after")
    def validate_power_for_powertrain(self):
        powertrain = self.powertrain_kind or "ICE"
        if powertrain in ("EV", "SERIES_HYBRID"):
            if self.electric_power_kw is None or self.electric_power_kw <= 0:
                raise ValueError(
                    "electric_power_kw (maximum 30-minute traction power) is required for EV and series-hybrid calculations"
                )
        elif self.horse_power is None or self.horse_power <= 0:
            raise ValueError("horse_power is required for ICE and other-hybrid calculations")
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
    power_kw_used: float
    power_basis: str
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
