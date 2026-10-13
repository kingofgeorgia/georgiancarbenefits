from datetime import date, datetime

from pydantic import BaseModel

from app.services.personal_import_customs import CustomsPaymentKind, PowertrainKind


class CalculatorRequest(BaseModel):
    car_price_usd: float
    engine_volume_cc: int
    car_year: int
    manufacture_date: date | None = None
    horse_power: float
    source_make: str | None = None
    source_model: str | None = None
    source_model_id: int | None = None
    powertrain_kind: PowertrainKind | None = None
    is_personal_use: bool = True
    logistics_cost_rub: float = 170_000.0
    rf_analog_price_rub: float | None = None
    note: str | None = None


class CurrencyRates(BaseModel):
    usd_to_rub: float
    eur_to_rub: float
    gel_to_rub: float
    source: str
    effective_date: date
    fetched_at: datetime
    is_stale: bool


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
    savings_vs_rf_rub: float | None = None
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
    horse_power: float | None = None
    util_coefficient: float | None = None
    powertrain_kind: PowertrainKind | None = None
    is_personal_use: bool = True
    logistics_cost_rub: float
    rf_analog_price_rub: float | None
    customs_duty_rub: float
    recycling_fee_rub: float
    total_cost_rub: float
    usd_to_rub: float
    eur_to_rub: float
    gel_to_rub: float
    note: str | None
    created_at: datetime

    model_config = {"from_attributes": True}
