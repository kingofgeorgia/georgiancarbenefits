from datetime import date

from fastapi import APIRouter

from app.schemas.calculator import CalculatorRequest, CalculatorResult, CurrencyRates
from app.services import currency
from app.services.personal_import_customs import calculatePersonalImportCustoms

router = APIRouter(prefix="/calculator", tags=["calculator"])


@router.post("/total", response_model=CalculatorResult)
async def calculate_total(payload: CalculatorRequest):
    """Public calculator for personal passenger-car import estimates."""
    rates = await currency.get_rates()
    usd_to_rub = rates["USD"]
    eur_to_rub = rates["EUR"]
    gel_to_rub = rates["GEL"]

    age_years = max(0, date.today().year - payload.car_year)
    precise = calculatePersonalImportCustoms(
        {
            "price": payload.car_price_usd,
            "currencyToRubRate": usd_to_rub,
            "eurToRubRate": eur_to_rub,
            "engineCc": payload.engine_volume_cc,
            "horsePower": payload.horse_power,
            "ageYears": age_years,
            "isPersonalUse": payload.is_personal_use,
            "powertrainKind": payload.powertrain_kind,
        }
    )

    car_price_rub = round(payload.car_price_usd * usd_to_rub, 2)
    customs_fee_rub = precise["customsFee"]
    duty_rub = precise["unifiedRate"]
    recycling_rub = precise["utilFee"]
    total = round(
        car_price_rub
        + customs_fee_rub
        + duty_rub
        + recycling_rub
        + payload.logistics_cost_rub,
        2,
    )

    savings = None
    if payload.rf_analog_price_rub is not None:
        savings = round(payload.rf_analog_price_rub - total, 2)

    return CalculatorResult(
        car_price_rub=car_price_rub,
        customs_fee_rub=customs_fee_rub,
        customs_duty_rub=duty_rub,
        recycling_fee_rub=recycling_rub,
        logistics_cost_rub=payload.logistics_cost_rub,
        total_cost_rub=total,
        savings_vs_rf_rub=savings,
        rates=CurrencyRates(
            usd_to_rub=usd_to_rub,
            eur_to_rub=eur_to_rub,
            gel_to_rub=gel_to_rub,
        ),
    )


@router.get("/rates", response_model=CurrencyRates)
async def get_rates():
    rates = await currency.get_rates()
    return CurrencyRates(
        usd_to_rub=rates["USD"],
        eur_to_rub=rates["EUR"],
        gel_to_rub=rates["GEL"],
    )
