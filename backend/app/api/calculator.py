from datetime import date

from fastapi import APIRouter, HTTPException, status

from app.calculation.age import resolve_vehicle_age
from app.calculation.tariffs import get_calculation_rule_version
from app.schemas.calculator import (
    CalculatorRequest,
    CalculatorResult,
    CurrencyRates,
    DealAssessmentOut,
    MarketComparisonOut,
)
from app.services import currency
from app.services.deal_score import calculate_deal_assessment
from app.services.personal_import_customs import calculatePersonalImportCustoms
from app.services.russian_market import (
    MarketComparison,
    MarketComparisonStatus,
    get_market_comparison,
)

router = APIRouter(prefix="/calculator", tags=["calculator"])


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


def _market_comparison_model(result: MarketComparison) -> MarketComparisonOut:
    return MarketComparisonOut(
        status=result.status,
        provider=result.provider,
        source=result.source,
        checked_at=result.checked_at,
        scope=result.scope,
        reference_price_rub=result.reference_price_rub,
        reference_kind=result.reference_kind,
        min_price_rub=result.min_price_rub,
        median_price_rub=result.median_price_rub,
        average_price_rub=result.average_price_rub,
        market_midpoint_rub=result.market_midpoint_rub,
        max_price_rub=result.max_price_rub,
        similar_count=result.similar_count,
        average_mileage_km=result.average_mileage_km,
        removed_params=list(result.removed_params),
        is_mileage_adjusted=result.is_mileage_adjusted,
        make=result.make,
        model=result.model,
        year=result.year,
        mileage_km=result.mileage_km,
        reason=result.reason,
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

    try:
        precise = calculatePersonalImportCustoms(
            {
                "price": payload.car_price_usd,
                "currencyToRubRate": snapshot.rates["USD"],
                "eurToRubRate": snapshot.rates["EUR"],
                "engineCc": payload.engine_volume_cc,
                "horsePower": payload.horse_power,
                "electricPowerKw": payload.electric_power_kw,
                "ageYears": vehicle_age.age_years,
                "isPersonalUse": payload.is_personal_use,
                "powertrainKind": payload.powertrain_kind,
            }
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc

    car_price_rub = round(payload.car_price_usd * snapshot.rates["USD"], 2)
    customs_total_rub = precise["total"]
    total = round(car_price_rub + customs_total_rub + payload.logistics_cost_rub, 2)

    market_comparison = None
    deal_assessment = None
    savings = None
    deal_reference_source = None
    reference_price = payload.rf_analog_price_rub

    if reference_price is not None:
        deal_reference_source = "MANUAL"
    elif payload.auto_market_comparison:
        market_result = await get_market_comparison(
            make=payload.source_make,
            model=payload.source_model,
            year=payload.car_year,
            mileage_km=payload.mileage_km,
        )
        market_comparison = _market_comparison_model(market_result)
        if market_result.status == MarketComparisonStatus.AVAILABLE:
            reference_price = market_result.reference_price_rub
            deal_reference_source = "AUTO_RU_BUSINESS"

    if reference_price is not None:
        try:
            assessment = calculate_deal_assessment(
                total_cost_rub=total,
                reference_price_rub=reference_price,
            )
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=str(exc),
            ) from exc
        savings = assessment.savings_rub
        deal_assessment = DealAssessmentOut(
            reference_price_rub=assessment.reference_price_rub,
            savings_rub=assessment.savings_rub,
            savings_percent=assessment.savings_percent,
            score=assessment.score,
            rating=assessment.rating,
            market_position=assessment.market_position,
        )

    return CalculatorResult(
        car_price_rub=car_price_rub,
        customs_fee_rub=precise["customsFee"],
        customs_duty_rub=precise["unifiedRate"],
        customs_payment_kind=precise["details"]["customsPaymentKind"],
        import_duty_rub=precise["importDuty"],
        excise_rub=precise["excise"],
        vat_rub=precise["vat"],
        recycling_fee_rub=precise["utilFee"],
        customs_total_rub=customs_total_rub,
        logistics_cost_rub=payload.logistics_cost_rub,
        total_cost_rub=total,
        power_kw_used=precise["details"]["powerKwUsed"],
        power_basis=precise["details"]["powerBasis"],
        savings_vs_rf_rub=savings,
        deal_assessment=deal_assessment,
        market_comparison=market_comparison,
        deal_reference_source=deal_reference_source,
        vehicle_age_years=vehicle_age.age_years,
        age_is_estimated=vehicle_age.age_is_estimated,
        age_estimation_method=vehicle_age.estimation_method,
        manufacture_date_used=vehicle_age.manufacture_date_used,
        calculation_date=vehicle_age.calculation_date,
        calculation_rule_version=get_calculation_rule_version(),
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
