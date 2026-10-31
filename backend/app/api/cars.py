from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.orm import Session

from app.calculation.age import resolve_vehicle_age
from app.core.db import get_db
from app.core.public_urls import extract_myauto_car_id
from app.schemas.cars import CarListing, CarModelOption, LearnedVehiclePowerOut, VinDecodeOut, VinDecodeRequest
from app.schemas.budget import BudgetSearchRequest, BudgetSearchResult
from app.schemas.vehicle_specs import VehicleSpecification, VehicleSpecificationSearch
from app.services import budget, currency, myauto, vehicle_power_observations, vin_decoder
from app.models.vehicle_catalog_state import VehicleCatalogState
from app.models.vehicle_make_model import VehicleMakeModel
from app.models.vehicle_power_observation import VehiclePowerObservation
from app.services.personal_import_customs import calculatePersonalImportCustoms

router = APIRouter(prefix="/cars", tags=["cars"])


@router.get("/learned-power", response_model=LearnedVehiclePowerOut)
def learned_power(
    make: str = Query(..., min_length=1, max_length=80),
    model: str = Query(..., min_length=1, max_length=120),
    car_year: int = Query(..., ge=1900, le=2100),
    engine_volume_cc: int = Query(..., ge=0, le=20_000),
    powertrain_kind: str = Query(..., pattern="^(ICE|OTHER_HYBRID|EV|SERIES_HYBRID)$"),
    db: Session = Depends(get_db),
) -> LearnedVehiclePowerOut:
    return LearnedVehiclePowerOut(**vehicle_power_observations.lookup_calculated_power(
        db,
        make=make,
        model=model,
        car_year=car_year,
        engine_volume_cc=engine_volume_cc,
        powertrain_kind=powertrain_kind,
    ))


@router.get("/catalog")
def get_vehicle_catalog(db: Session = Depends(get_db)) -> dict[str, Any]:
    state = db.query(VehicleCatalogState).filter(VehicleCatalogState.id == 1).first()
    catalog = dict(state.payload) if state else {
        "schema_version": 1,
        "updated_at": "",
        "bmw_variants": [],
        "tesla_power_variants": [],
        "tesla_power_reference_rows": [],
        "vehicle_specifications": [],
        "vehicle_specifications_version": "2026-10-31",
    }
    catalog["make_model_records"] = [
        {
            "make_id": row.make_id,
            "make": row.make,
            "model_id": row.model_id,
            "model": row.model,
            "group_title": row.group_title,
        }
        for row in db.query(VehicleMakeModel).order_by(
            VehicleMakeModel.make, VehicleMakeModel.model, VehicleMakeModel.group_title
        )
    ]
    # Calculator observations live in the same PostgreSQL database, but are a
    # separate table from the make/model directory and the curated spec data.
    observations = (
        db.query(
            VehiclePowerObservation.make,
            VehiclePowerObservation.model,
            VehiclePowerObservation.make_key,
            VehiclePowerObservation.model_key,
            VehiclePowerObservation.car_year,
            VehiclePowerObservation.engine_volume_cc,
            VehiclePowerObservation.powertrain_kind,
            VehiclePowerObservation.horse_power,
            VehiclePowerObservation.electric_power_kw,
            VehiclePowerObservation.created_at,
        )
        .filter(VehiclePowerObservation.make_key.is_not(None), VehiclePowerObservation.model_key.is_not(None))
        .order_by(VehiclePowerObservation.created_at.desc(), VehiclePowerObservation.id.desc())
        .all()
    )
    grouped: dict[tuple[str, str, int, int, str], dict[str, Any]] = {}
    for row in observations:
        key = (row.make_key, row.model_key, row.car_year, row.engine_volume_cc, row.powertrain_kind)
        entry = grouped.setdefault(key, {
            "make": row.make, "model": row.model, "year": row.car_year,
            "engine_volume_cc": row.engine_volume_cc, "powertrain_kind": row.powertrain_kind,
            "horse_powers": set(), "electric_powers_kw": set(), "observation_count": 0,
            "latest_at": row.created_at.isoformat(),
        })
        entry["observation_count"] += 1
        if row.horse_power is not None:
            entry["horse_powers"].add(float(row.horse_power))
        if row.electric_power_kw is not None:
            entry["electric_powers_kw"].add(float(row.electric_power_kw))
    catalog["learned_vehicle_observations"] = []
    for entry in grouped.values():
        powers = entry["electric_powers_kw"] if entry["powertrain_kind"] in {"EV", "SERIES_HYBRID"} else entry["horse_powers"]
        catalog["learned_vehicle_observations"].append({
            "make": entry["make"], "model": entry["model"], "year": entry["year"],
            "engine_volume_cc": entry["engine_volume_cc"], "powertrain_kind": entry["powertrain_kind"],
            "horse_power": next(iter(entry["horse_powers"])) if len(entry["horse_powers"]) == 1 else None,
            "electric_power_kw": next(iter(entry["electric_powers_kw"])) if len(entry["electric_powers_kw"]) == 1 else None,
            "status": "CONFLICT" if len(powers) > 1 else "MATCH" if powers else "NO_POWER",
            "power_options": sorted(powers), "observation_count": entry["observation_count"],
            "latest_at": entry["latest_at"],
        })
    return catalog


@router.get("/specifications", response_model=VehicleSpecificationSearch)
async def specifications(
    make: str | None = Query(None, min_length=1, max_length=80),
    model: str | None = Query(None, min_length=1, max_length=80),
    year: int | None = Query(None, ge=1990, le=2100),
    db: Session = Depends(get_db),
):
    state = db.query(VehicleCatalogState).filter(VehicleCatalogState.id == 1).first()
    payload = state.payload if state else {}
    specifications = [VehicleSpecification.model_validate(item) for item in payload.get("vehicle_specifications", [])]
    selected = [
        item for item in specifications
        if (not make or item.make.casefold() == make.casefold())
        and (not model or item.model.casefold() == model.casefold())
        and (year is None or item.year_from <= year <= item.year_to)
    ]
    return VehicleSpecificationSearch(
        version=payload.get("vehicle_specifications_version", "2026-10-31"),
        items=selected,
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
async def car_from_url(payload: CarUrlRequest, db: Session = Depends(get_db)):
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
    car = myauto.parse_car(raw)
    powertrain_kind = car.powertrain_kind or "ICE"
    uses_electric_regulatory_power = powertrain_kind in {"EV", "SERIES_HYBRID"}
    engine_volume_cc = 0 if powertrain_kind == "EV" else car.engine_volume_cc
    power_is_missing = (
        car.electric_power_kw is None or car.electric_power_kw <= 0
        if uses_electric_regulatory_power
        else car.horse_power is None or car.horse_power <= 0
    )

    if power_is_missing and car.make.strip() and car.model.strip() and car.year >= 1900:
        learned = vehicle_power_observations.lookup_calculated_power(
            db,
            make=car.make,
            model=car.model,
            car_year=car.year,
            engine_volume_cc=engine_volume_cc,
            powertrain_kind=powertrain_kind,
        )
        if learned["status"] == "MATCH":
            if uses_electric_regulatory_power and learned["electric_power_kw"] is not None:
                car.electric_power_kw = learned["electric_power_kw"]
                car.electric_power_kw_source = "previous_exact_calculation"
            elif not uses_electric_regulatory_power and learned["horse_power"] is not None:
                car.horse_power = learned["horse_power"]
                car.horse_power_source = "previous_exact_calculation"

    return car


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
