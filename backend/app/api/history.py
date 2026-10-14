from datetime import date

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.calculation.age import resolve_vehicle_age
from app.calculation.tariffs import get_calculation_rule_version
from app.core.db import get_db
from app.models.calculation import Calculation
from app.models.user import User
from app.schemas.calculator import CalculationOut, CalculatorInput
from app.services import currency
from app.services.personal_import_customs import calculatePersonalImportCustoms

router = APIRouter(prefix="/history", tags=["history"])


@router.post("/", response_model=CalculationOut, status_code=status.HTTP_201_CREATED)
async def save_calculation(
    payload: CalculatorInput,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        snapshot = await currency.get_rate_snapshot()
        age = resolve_vehicle_age(
            car_year=payload.car_year,
            manufacture_date=payload.manufacture_date,
            calculation_date=date.today(),
        )
        precise = calculatePersonalImportCustoms(
            {
                "price": payload.car_price_usd,
                "currencyToRubRate": snapshot.rates["USD"],
                "eurToRubRate": snapshot.rates["EUR"],
                "engineCc": payload.engine_volume_cc,
                "horsePower": payload.horse_power,
                "electricPowerKw": payload.electric_power_kw,
                "ageYears": age.age_years,
                "isPersonalUse": payload.is_personal_use,
                "powertrainKind": payload.powertrain_kind,
            }
        )
    except (ValueError, currency.CurrencyUnavailableError) as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    total = round(
        payload.car_price_usd * snapshot.rates["USD"]
        + precise["total"]
        + payload.logistics_cost_rub,
        2,
    )

    calc = Calculation(
        user_id=current_user.id,
        car_price_usd=payload.car_price_usd,
        engine_volume_cc=payload.engine_volume_cc,
        car_year=payload.car_year,
        manufacture_date=payload.manufacture_date,
        horse_power=payload.horse_power,
        electric_power_kw=payload.electric_power_kw,
        util_coefficient=precise["utilCoefficient"],
        powertrain_kind=payload.powertrain_kind or "ICE",
        is_personal_use=payload.is_personal_use,
        age_is_estimated=age.age_is_estimated,
        logistics_cost_rub=payload.logistics_cost_rub,
        rf_analog_price_rub=payload.rf_analog_price_rub,
        customs_fee_rub=precise["customsFee"],
        customs_duty_rub=precise["unifiedRate"],
        customs_payment_kind=precise["details"]["customsPaymentKind"],
        import_duty_rub=precise["importDuty"],
        excise_rub=precise["excise"],
        vat_rub=precise["vat"],
        recycling_fee_rub=precise["utilFee"],
        customs_total_rub=precise["total"],
        total_cost_rub=total,
        calculation_rule_version=get_calculation_rule_version(),
        usd_to_rub=snapshot.rates["USD"],
        eur_to_rub=snapshot.rates["EUR"],
        gel_to_rub=snapshot.rates["GEL"],
        currency_source=snapshot.source,
        currency_effective_date=snapshot.effective_date,
        note=payload.note,
    )
    db.add(calc)
    db.commit()
    db.refresh(calc)
    return calc


@router.get("/", response_model=list[CalculationOut])
def list_calculations(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return (
        db.query(Calculation)
        .filter(Calculation.user_id == current_user.id)
        .order_by(Calculation.created_at.desc())
        .all()
    )


@router.delete("/{calc_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_calculation(
    calc_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    calc = (
        db.query(Calculation)
        .filter(Calculation.id == calc_id, Calculation.user_id == current_user.id)
        .first()
    )
    if not calc:
        raise HTTPException(status_code=404, detail="Calculation not found")
    db.delete(calc)
    db.commit()
