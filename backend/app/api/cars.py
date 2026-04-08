import re
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.api.deps import get_current_user
from app.models.user import User
from app.schemas.cars import CarListing
from app.services import currency, customs, myauto, recycling

router = APIRouter(prefix="/cars", tags=["cars"])


class CarUrlRequest(BaseModel):
    url: str


@router.get("/search", response_model=list[CarListing])
async def search(
    make_id: int | None = Query(None),
    model_id: int | None = Query(None),
    year_from: int | None = Query(None),
    year_to: int | None = Query(None),
    price_usd_to: int | None = Query(None),
    page: int = Query(1, ge=1),
    logistics_cost_rub: float = Query(80_000.0),
    _: User = Depends(get_current_user),
):
    raw_list = await myauto.search_cars(
        make_id=make_id,
        model_id=model_id,
        year_from=year_from,
        year_to=year_to,
        price_usd_to=price_usd_to,
        page=page,
    )

    rates = await currency.get_rates()
    usd_to_rub = rates["USD"]
    eur_to_rub = rates["EUR"]
    usd_to_eur = eur_to_rub / usd_to_rub

    result: list[CarListing] = []
    for raw in raw_list:
        car = myauto.parse_car(raw)
        if car.engine_volume_cc and car.year and car.price_usd:
            duty = customs.calculate_customs_duty(
                price_usd=car.price_usd,
                engine_cc=car.engine_volume_cc,
                car_year=car.year,
                usd_to_eur=usd_to_eur,
                eur_to_rub=eur_to_rub,
            )
            rec = recycling.calculate_recycling_fee(car.engine_volume_cc, car.year)
            total = round(car.price_usd * usd_to_rub + duty + rec + logistics_cost_rub, 2)
            car.estimated_total_rub = total
        result.append(car)

    return result


@router.get("/makes")
async def get_makes(_: User = Depends(get_current_user)) -> list[Any]:
    return await myauto.get_makes()


@router.post("/from-url", response_model=CarListing)
async def car_from_url(
    payload: CarUrlRequest,
    _: User = Depends(get_current_user),
):
    """Принять ссылку на авто с myauto.ge, вернуть данные авто."""
    match = re.search(r"/pr/(\d+)", payload.url)
    if not match:
        raise HTTPException(status_code=422, detail="Некорректная ссылка myauto.ge. Ожидается формат: https://www.myauto.ge/.../pr/12345")
    car_id = int(match.group(1))
    raw = await myauto.get_car_by_id(car_id)
    if not raw:
        raise HTTPException(status_code=404, detail="Автомобиль не найден на myauto.ge")
    return myauto.parse_car(raw)
