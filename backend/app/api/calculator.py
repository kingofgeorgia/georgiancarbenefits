from fastapi import APIRouter, Depends

from app.api.deps import get_current_user
from app.models.user import User
from app.schemas.calculator import CalculatorRequest, CalculatorResult, CurrencyRates
from app.services import customs, currency, recycling

router = APIRouter(prefix="/calculator", tags=["calculator"])


@router.post("/total", response_model=CalculatorResult)
async def calculate_total(
    payload: CalculatorRequest,
    _: User = Depends(get_current_user),
):
    rates = await currency.get_rates()
    usd_to_rub = rates["USD"]
    eur_to_rub = rates["EUR"]
    gel_to_rub = rates["GEL"]
    usd_to_eur = eur_to_rub / usd_to_rub

    car_price_rub = round(payload.car_price_usd * usd_to_rub, 2)

    duty_rub = customs.calculate_customs_duty(
        price_usd=payload.car_price_usd,
        engine_cc=payload.engine_volume_cc,
        car_year=payload.car_year,
        usd_to_eur=usd_to_eur,
        eur_to_rub=eur_to_rub,
    )

    recycling_rub = recycling.calculate_recycling_fee(
        engine_cc=payload.engine_volume_cc,
        car_year=payload.car_year,
    )

    total = round(
        car_price_rub + duty_rub + recycling_rub + payload.logistics_cost_rub, 2
    )

    savings = None
    if payload.rf_analog_price_rub is not None:
        savings = round(payload.rf_analog_price_rub - total, 2)

    return CalculatorResult(
        car_price_rub=car_price_rub,
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
async def get_rates(_: User = Depends(get_current_user)):
    rates = await currency.get_rates()
    return CurrencyRates(
        usd_to_rub=rates["USD"],
        eur_to_rub=rates["EUR"],
        gel_to_rub=rates["GEL"],
    )
