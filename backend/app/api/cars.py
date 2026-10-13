import re
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel

from app.calculation.age import resolve_vehicle_age
from app.schemas.cars import CarListing, CarModelOption
from app.services import currency, myauto
from app.services.personal_import_customs import calculatePersonalImportCustoms

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
    logistics_cost_rub: float = Query(170_000.0),
):
    raw_list = await myauto.search_cars(
        make_id=make_id,
        model_id=model_id,
        year_from=year_from,
        year_to=year_to,
        price_usd_to=price_usd_to,
        page=page,
    )

    snapshot = await currency.get_rate_snapshot()
    usd_to_rub = snapshot.rates["USD"]
    eur_to_rub = snapshot.rates["EUR"]

    result: list[CarListing] = []
    for raw in raw_list:
        car = myauto.parse_car(raw)
        if car.year and car.price_usd and car.horse_power and (
            car.engine_volume_cc > 0 or car.powertrain_kind == "EV"
        ):
            try:
                age = resolve_vehicle_age(car_year=car.year, manufacture_date=None)
                precise = calculatePersonalImportCustoms(
                    {
                        "price": car.price_usd,
                        "currencyToRubRate": usd_to_rub,
                        "eurToRubRate": eur_to_rub,
                        "engineCc": car.engine_volume_cc,
                        "horsePower": car.horse_power,
                        "ageYears": age.age_years,
                        "isPersonalUse": True,
                        "powertrainKind": car.powertrain_kind,
                    }
                )
                car.estimated_total_rub = round(
                    car.price_usd * usd_to_rub + precise["total"] + logistics_cost_rub,
                    2,
                )
                if age.age_is_estimated:
                    car.estimate_warning = "Vehicle age is estimated from model year; exact manufacture date may change customs band."
            except ValueError as exc:
                car.estimate_warning = str(exc)
        else:
            car.estimate_warning = "Horsepower or required vehicle data is missing; precise import total was not calculated."
        result.append(car)

    return result


@router.get("/makes")
async def get_makes() -> list[Any]:
    return await myauto.get_makes()


@router.get("/models", response_model=list[CarModelOption])
async def get_models(make_id: int = Query(..., ge=1)) -> list[CarModelOption]:
    return [CarModelOption(**item) for item in await myauto.get_models(make_id)]


@router.post("/from-url", response_model=CarListing)
async def car_from_url(payload: CarUrlRequest):
    """Accept a myauto.ge listing URL and return normalized vehicle data."""
    match = re.search(r"/pr/(\d+)", payload.url.strip())
    if not match:
        raise HTTPException(
            status_code=422,
            detail="Некорректная ссылка myauto.ge. Ожидается формат: https://www.myauto.ge/.../pr/12345",
        )
    car_id = int(match.group(1))
    raw = await myauto.get_car_by_id(car_id)
    if not raw:
        raise HTTPException(status_code=404, detail="Автомобиль не найден на myauto.ge")
    return myauto.parse_car(raw)
