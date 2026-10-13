from datetime import date

from fastapi import APIRouter, HTTPException, status

from app.calculation.age import resolve_vehicle_age
from app.schemas.calculator import CalculatorRequest, CalculatorResult, CurrencyRates
from app.services import currency
from app.services.personal_import_customs import calculatePersonalImportCustoms

router = APIRouter(prefix="/calculator", tags=["calculator"])

CALCULATION_RULE_VERSION = "ru-personal-import-2026-v1"


def _currency_rates_model(snapshot: currency.CurrencySnapshot) -> CurrencyRates:
    return CurrencyRates(
        usd_to_rub=snapshot.rates["USD"],
        eur_to_rub=snapshot.rates["EUR"],
        gel_to_rub=snapshot.rates["GEL"],
        source=snapshot.source,
        effective_date=snapshot.effective_date,
        fetched_at=snapshot.fetched_at,
        is_stale=snapshot.is_stale,
    )


@router.post("/total", response_model=CalculatorResult)
async def calculate_total(payload: CalculatorRequest):
    """Public calculator for personal passenger-car import estimates."""
    try:
        snapshot = await currency.get_rate_snapshot()
    except currency.CurrencyUnavailableError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc

    try:
        vehicle_age = resolve_vehicle_age(
            car_year=payload.car_year,
            manufacture_date=payload.manufacture_date,
            calculation_date=date.today(),
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc

    usd_to_rub = snapshot.rates["USD"]
    eur_to_rub = snapshot.rates["EUR"]

    precise = calculatePersonalImportCustoms(
        {
            "price": payload.car_price_usd,
            "currencyToRubRate": usd_to_rub,
            "eurToRubRate": eur_to_rub,
            "engineCc": payload.engine_volume_cc,
            "horsePower": payload.horse_power,
            "ageYears": vehicle_age.age_years,
            "isPersonalUse": payload.is_personal_use,
            "powertrainKind": payload.powertrain_kind,
        }
    )

    car_price_rub = round(payload.car_price_usd * usd_to_rub, 2)
    customs_fee_rub = precise["customsFee"]
    duty_rub = precise["unifiedRate"]
    recycling_rub = precise["utilFee"]
    customs_total_rub = precise["total"]
    total = round(car_price_rub + customs_total_rub + payload.logistics_cost_rub, 2)

    savings = None
    if payload.rf_analog_price_rub is not None:
        savings = round(payload.rf_analog_price_rub - total, 2)

    return CalculatorResult(
        car_price_rub=car_price_rub,
        customs_fee_rub=customs_fee_rub,
        customs_duty_rub=duty_rub,
        recycling_fee_rub=recycling_rub,
        customs_total_rub=customs_total_rub,
        logistics_cost_rub=payload.logistics_cost_rub,
        total_cost_rub=total,
        savings_vs_rf_rub=savings,
        vehicle_age_years=vehicle_age.age_years,
        age_is_estimated=vehicle_age.age_is_estimated,
        age_estimation_method=vehicle_age.estimation_method,
        manufacture_date_used=vehicle_age.manufacture_date_used,
        calculation_date=vehicle_age.calculation_date,
        calculation_rule_version=CALCULATION_RULE_VERSION,
        rates=_currency_rates_model(snapshot),
    )


@router.get("/rates", response_model=CurrencyRates)
async def get_rates():
    try:
        snapshot = await currency.get_rate_snapshot()
    except currency.CurrencyUnavailableError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    return _currency_rates_model(snapshot)
