from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.db import get_db
from app.models.calculation import Calculation
from app.models.user import User
from app.schemas.calculator import CalculationOut, CalculatorRequest
from app.services import currency, customs, recycling

router = APIRouter(prefix="/history", tags=["history"])


@router.post("/", response_model=CalculationOut, status_code=status.HTTP_201_CREATED)
async def save_calculation(
    payload: CalculatorRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rates = await currency.get_rates()
    usd_to_rub = rates["USD"]
    eur_to_rub = rates["EUR"]
    gel_to_rub = rates["GEL"]
    usd_to_eur = eur_to_rub / usd_to_rub

    duty = customs.calculate_customs_duty(
        price_usd=payload.car_price_usd,
        engine_cc=payload.engine_volume_cc,
        car_year=payload.car_year,
        usd_to_eur=usd_to_eur,
        eur_to_rub=eur_to_rub,
    )
    rec = recycling.calculate_recycling_fee(payload.engine_volume_cc, payload.car_year)
    total = round(
        payload.car_price_usd * usd_to_rub + duty + rec + payload.logistics_cost_rub, 2
    )

    calc = Calculation(
        user_id=current_user.id,
        car_price_usd=payload.car_price_usd,
        engine_volume_cc=payload.engine_volume_cc,
        car_year=payload.car_year,
        logistics_cost_rub=payload.logistics_cost_rub,
        rf_analog_price_rub=payload.rf_analog_price_rub,
        customs_duty_rub=duty,
        recycling_fee_rub=rec,
        total_cost_rub=total,
        usd_to_rub=usd_to_rub,
        eur_to_rub=eur_to_rub,
        gel_to_rub=gel_to_rub,
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
