from typing import Any

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field

from app.calculation.age import resolve_vehicle_age
from app.core.public_urls import extract_myauto_car_id
from app.schemas.cars import CarListing, CarModelOption, VinDecodeOut, VinDecodeRequest
from app.schemas.budget import BudgetSearchRequest, BudgetSearchResult
from app.schemas.vehicle_specs import VehicleSpecificationSearch
from app.services import budget, currency, myauto, vehicle_specs, vin_decoder
from app.services.personal_import_customs import calculatePersonalImportCustoms

router = APIRouter(prefix="/cars", tags=["cars"])


@router.get("/specifications", response_model=VehicleSpecificationSearch)
async def specifications(
    make: str | None = Query(None, min_length=1, max_length=80),
    model: str | None = Query(None, min_length=1, max_length=80),
    year: int | None = Query(None, ge=1990, le=2100),
):
    return VehicleSpecificationSearch(
        version=vehicle_specs.CATALOG.version,
        items=vehicle_specs.find_specifications(make=make, model=model, year=year),
    )


class CarUrlRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    url: str = Field(min_length=1, max_length=2048)


def _extract_myauto_car_id(source: str) -> int | None:
    return extract_myauto_car_id(source)


def _has_required_power(car: CarListing) -> bool:
    if car.powertrain_kind in ("EV", "SERIES_HYBRID"):
        return bool(car.electric_power_kw and car.electric_power_kw > 0)
    return bool(car.horse_power and car.horse_power > 0)


@router.get("/search", response_model=list[CarListing])
async def search(
    make_id: int | None = Query(None, ge=1, le=10_000_000),
    model_id: int | None = Query(None, ge=1, le=10_000_000),
    year_from: int | None = Query(None, ge=1900, le=2100),
    year_to: int | None = Query(None, ge=1900, le=2100),
    price_usd_to: int | None = Query(None, gt=0, le=100_000_000),
    page: int = Query(1, ge=1, le=100),
    logistics_cost_rub: float = Query(170_000.0, ge=0, le=100_000_000, allow_inf_nan=False),
):
    if year_from and year_to and year_from > year_to:
        raise HTTPException(status_code=422, detail="Invalid year range")
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
        has_engine_data = car.powertrain_kind == "EV" or car.engine_volume_cc > 0
        if car.year and car.price_usd and _has_required_power(car) and has_engine_data:
            try:
                age = resolve_vehicle_age(car_year=car.year, manufacture_date=None)
                precise = calculatePersonalImportCustoms(
                    {
                        "price": car.price_usd,
                        "currencyToRubRate": usd_to_rub,
                        "eurToRubRate": eur_to_rub,
                        "engineCc": car.engine_volume_cc,
                        "horsePower": car.horse_power,
                        "electricPowerKw": car.electric_power_kw,
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
        elif car.powertrain_kind in ("EV", "SERIES_HYBRID"):
            car.estimate_warning = (
                "Maximum 30-minute electric traction power is required for a precise Russian import estimate. "
                "Peak/listing horsepower is not used for this calculation."
            )
        else:
            car.estimate_warning = "Horsepower or required vehicle data is missing; precise import total was not calculated."
        result.append(car)

    return result


@router.get("/makes")
async def get_makes() -> list[Any]:
    return await myauto.get_makes()


@router.post("/budget", response_model=BudgetSearchResult)
async def budget_search(payload: BudgetSearchRequest):
    try:
        return await budget.search_by_budget(payload)
    except currency.CurrencyUnavailableError as exc:
        raise HTTPException(status_code=503, detail={"code": "RATES_UNAVAILABLE"}) from exc
    except myauto.MyAutoUnavailableError as exc:
        raise HTTPException(status_code=503, detail={"code": "MYAUTO_UNAVAILABLE"}) from exc


@router.get("/models", response_model=list[CarModelOption])
async def get_models(make_id: int = Query(..., ge=1, le=10_000_000)) -> list[CarModelOption]:
    return [CarModelOption(**item) for item in await myauto.get_models(make_id)]


@router.post("/from-url", response_model=CarListing)
async def car_from_url(payload: CarUrlRequest):
    """Accept a myauto.ge listing URL or numeric listing ID and return normalized vehicle data."""
    car_id = _extract_myauto_car_id(payload.url)
    if car_id is None:
        raise HTTPException(
            status_code=422,
            detail=(
                "Некорректная ссылка или ID myauto.ge. Ожидается полный URL объявления "
                "или числовой ID, например 123673764"
            ),
        )
    raw = await myauto.get_car_by_id(car_id)
    if not raw:
        raise HTTPException(status_code=404, detail="Автомобиль не найден на myauto.ge")
    return myauto.parse_car(raw)


@router.post("/from-vin", response_model=VinDecodeOut)
async def car_from_vin(payload: VinDecodeRequest):
    """Decode a 17-character VIN through the public NHTSA vPIC API."""
    try:
        result = await vin_decoder.decode_vin(payload.vin)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        ) from exc
    return VinDecodeOut(**result.__dict__)
