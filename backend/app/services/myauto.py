"""myauto.ge integration and normalization."""

import re
from typing import Any

from curl_cffi.requests import AsyncSession

from app.calculation.age import resolve_vehicle_age
from app.core.config import settings
from app.schemas.cars import CarListing
from app.services.personal_import_customs import (
    PowertrainKind,
    horsePowerToKw,
    resolveUtilCoefficient2026PersonalM1,
)
from app.services.vehicle_specs import resolve_vehicle_spec

_IMPERSONATE = "chrome120"
_mans_cache: dict[int, str] = {}
_models_cache: dict[int, dict[int, str]] = {}
_models_directory_cache: dict[int, list[dict[str, Any]]] = {}
_MYAUTO_IMAGE_BASE_URL = "https://static.my.ge/myauto/photos"
_FUEL_TYPE_LABELS: dict[int, str] = {
    1: "Gas",
    2: "Petrol",
    3: "Diesel",
    4: "Hybrid",
    5: "CNG",
    6: "LPG",
    7: "Electric",
    8: "Hydrogen",
    9: "Plug-in hybrid",
}
_HORSEPOWER_KEYS = {
    "hp",
    "horse_power",
    "horsepower",
    "engine_hp",
    "engine_horse_power",
    "engine_horsepower",
    "engine_power_hp",
    "max_power",
    "max_power_hp",
    "maximum_power",
    "maximum_power_hp",
    "power_hp",
}
_HP_VALUE_RE = re.compile(r"(-?\d+(?:[.,]\d+)?)")
_HP_UNIT_RE = re.compile(
    r"(-?\d+(?:[.,]\d+)?)\s*(?:hp|h\.?p\.?|ps|bhp|л\.?\s*с\.?|ცხ\.?\s*ძ\.?)",
    re.IGNORECASE,
)


def _resolve_fuel_type(raw: dict[str, Any]) -> str | None:
    fuel_type_id = int(raw.get("fuel_type_id", 0) or 0)
    return _FUEL_TYPE_LABELS.get(fuel_type_id) if fuel_type_id else None


def _resolve_powertrain_kind(
    raw: dict[str, Any], spec_kind: PowertrainKind | None
) -> PowertrainKind:
    if spec_kind:
        return spec_kind
    fuel_type_id = int(raw.get("fuel_type_id", 0) or 0)
    if fuel_type_id == 7:
        return "EV"
    if fuel_type_id in (4, 9):
        return "OTHER_HYBRID"
    return "ICE"


def _parse_horse_power_value(value: Any) -> int | None:
    if isinstance(value, bool) or value is None:
        return None
    if isinstance(value, (int, float)):
        number = float(value)
    else:
        text = str(value).strip()
        if not text:
            return None
        unit_match = _HP_UNIT_RE.search(text)
        match = unit_match or _HP_VALUE_RE.search(text)
        if not match:
            return None
        try:
            number = float(match.group(1).replace(",", "."))
        except ValueError:
            return None
    if not 1 <= number <= 2000:
        return None
    return int(round(number))


def _extract_listing_horse_power(raw: dict[str, Any]) -> tuple[int | None, str | None]:
    """Find horsepower across known MyAuto payload variants without guessing from kW.

    MyAuto payloads have changed field names over time and some details are nested.
    Only explicitly horsepower-like keys are accepted, so unrelated `power` values
    (for example battery or charger power in kW) are never treated as horsepower.
    """

    def walk(value: Any, depth: int = 0) -> tuple[int | None, str | None]:
        if depth > 4:
            return None, None
        if isinstance(value, dict):
            for key, child in value.items():
                normalized_key = str(key).strip().lower().replace("-", "_").replace(" ", "_")
                if normalized_key in _HORSEPOWER_KEYS:
                    parsed = _parse_horse_power_value(child)
                    if parsed is not None:
                        return parsed, f"listing_{normalized_key}"
            for child in value.values():
                if isinstance(child, (dict, list, tuple)):
                    found, source = walk(child, depth + 1)
                    if found is not None:
                        return found, source
        elif isinstance(value, (list, tuple)):
            for child in value:
                if isinstance(child, (dict, list, tuple)):
                    found, source = walk(child, depth + 1)
                    if found is not None:
                        return found, source
        return None, None

    return walk(raw)


async def _resolve_man_name(session: AsyncSession, man_id: int) -> str:
    global _mans_cache
    if not _mans_cache:
        try:
            response = await session.get(
                f"{settings.myauto_api_url}/vehicle/mans",
                params={"vehicle_types": "0.1.2"},
                headers={"Accept": "application/json"},
            )
            if response.status_code == 200:
                for item in response.json():
                    _mans_cache[int(item["man_id"])] = str(item["title"])
        except Exception:
            pass
    return _mans_cache.get(man_id, str(man_id))


async def _load_models_directory(session: AsyncSession, man_id: int) -> list[dict[str, Any]]:
    if not man_id:
        return []
    cached = _models_directory_cache.get(man_id)
    if cached is not None:
        return cached

    directory: list[dict[str, Any]] = []
    lookup: dict[int, str] = {}
    try:
        response = await session.get(
            f"{settings.myauto_api_url}/vehicle/models",
            params={"vehicle_types": "0.1.2", "man_id": man_id},
            headers={"Accept": "application/json"},
        )
        if response.status_code == 200:
            for model in response.json():
                title = str(model.get("title") or "").strip()
                if not title:
                    continue
                entry = {
                    "model_id": int(model["model_id"]),
                    "man_id": int(model.get("man_id") or man_id),
                    "title": title,
                    "group_title": model.get("group_title"),
                }
                directory.append(entry)
                lookup[entry["model_id"]] = title
    except Exception:
        pass

    _models_directory_cache[man_id] = directory
    _models_cache[man_id] = lookup
    return directory


async def _resolve_model_name(
    session: AsyncSession, man_id: int, model_id: int, raw_model_name: Any
) -> str:
    if man_id and model_id:
        if man_id not in _models_cache:
            await _load_models_directory(session, man_id)
        resolved = _models_cache.get(man_id, {}).get(model_id)
        if resolved:
            return resolved
    return str(raw_model_name or "").strip()


def _build_image_urls(raw: dict[str, Any]) -> list[str]:
    photo_path = str(raw.get("photo") or "").strip()
    car_id = int(raw.get("car_id", 0) or 0)
    pic_number = int(raw.get("pic_number", 0) or 0)
    photo_ver = int(raw.get("photo_ver", 0) or 0)
    if not photo_path or not car_id or pic_number <= 0:
        fallback = str(raw.get("photo") or "").strip()
        return [fallback] if fallback.startswith("http") else []
    version = f"?v={photo_ver}" if photo_ver else ""
    return [
        f"{_MYAUTO_IMAGE_BASE_URL}/{photo_path}/large/{car_id}_{index}.jpg{version}"
        for index in range(1, pic_number + 1)
    ]


async def search_cars(
    make_id: int | None = None,
    model_id: int | None = None,
    year_from: int | None = None,
    year_to: int | None = None,
    price_usd_to: int | None = None,
    page: int = 1,
) -> list[dict[str, Any]]:
    params: dict[str, Any] = {"Page": page, "SortOrder": 1, "CurrencyID": 3}
    if make_id:
        params["Mans"] = f"{make_id}.{model_id or 0}"
    if year_from:
        params["YearFrom"] = year_from
    if year_to:
        params["YearTo"] = year_to
    if price_usd_to:
        params["PriceTo"] = price_usd_to

    try:
        async with AsyncSession(impersonate=_IMPERSONATE, timeout=15) as client:
            response = await client.get(
                f"{settings.myauto_api_url}/products",
                params=params,
                headers={"Accept": "application/json"},
            )
            response.raise_for_status()
            items = response.json().get("data", {}).get("items", [])
            for item in items:
                man_id = int(item.get("man_id", 0) or 0)
                model_id_value = int(item.get("model_id", 0) or 0)
                item["man_name"] = await _resolve_man_name(client, man_id)
                item["model_name"] = await _resolve_model_name(
                    client, man_id, model_id_value, item.get("car_model")
                )
                item["km"] = item.get("car_run_km")
            return items
    except Exception:
        return []


def parse_car(raw: dict[str, Any]) -> CarListing:
    engine_cc = int(raw.get("engine_volume", 0) or 0)
    category_id = int(raw.get("category_id", 0) or 0) or None
    model_id = int(raw.get("model_id", 0) or 0) or None
    image_urls = _build_image_urls(raw)
    listing_hp, listing_hp_source = _extract_listing_horse_power(raw)
    spec = resolve_vehicle_spec(raw)
    horse_power = listing_hp if listing_hp is not None else (spec.horse_power if spec else None)
    horse_power_source = listing_hp_source if listing_hp is not None else (spec.source if spec else None)
    powertrain_kind = _resolve_powertrain_kind(raw, spec.powertrain_kind if spec else None)
    prod_year = int(raw.get("prod_year", 0) or 0)
    util_coefficient = None

    if horse_power and prod_year and (engine_cc > 0 or powertrain_kind == "EV"):
        try:
            age = resolve_vehicle_age(car_year=prod_year, manufacture_date=None)
            util_coefficient, _, _, _ = resolveUtilCoefficient2026PersonalM1(
                powertrain_kind=powertrain_kind,
                age_years=age.age_years,
                power_kw=horsePowerToKw(float(horse_power)),
                engine_cc=engine_cc,
            )
        except ValueError:
            pass

    return CarListing(
        car_id=int(raw.get("car_id", 0) or 0),
        category_id=category_id,
        make=str(raw.get("man_name") or ""),
        model_id=model_id,
        car_model=str(raw.get("car_model") or "").strip() or None,
        model=str(raw.get("model_name") or raw.get("car_model") or ""),
        year=prod_year,
        price_usd=float(raw.get("price", 0) or 0),
        engine_volume_cc=0 if powertrain_kind == "EV" else engine_cc,
        horse_power=horse_power,
        horse_power_source=horse_power_source,
        fuel_type=_resolve_fuel_type(raw),
        util_coefficient=util_coefficient,
        powertrain_kind=powertrain_kind,
        mileage_km=raw.get("km"),
        image_url=image_urls[0] if image_urls else None,
        image_urls=image_urls,
        url=f"https://www.myauto.ge/en/pr/{raw.get('car_id', '')}",
    )


async def get_car_by_id(car_id: int) -> dict[str, Any] | None:
    try:
        async with AsyncSession(impersonate=_IMPERSONATE, timeout=15) as client:
            response = await client.get(
                f"{settings.myauto_api_url}/products/{car_id}",
                headers={"Accept": "application/json"},
            )
            response.raise_for_status()
            info = response.json().get("data", {}).get("info")
            if not info:
                return None
            man_id = int(info.get("man_id", 0) or 0)
            model_id = int(info.get("model_id", 0) or 0)
            info["man_name"] = await _resolve_man_name(client, man_id)
            info["model_name"] = await _resolve_model_name(
                client, man_id, model_id, info.get("car_model")
            )
            info["km"] = info.get("car_run_km")
            return info
    except Exception:
        return None


async def get_makes() -> list[dict[str, Any]]:
    try:
        async with AsyncSession(impersonate=_IMPERSONATE, timeout=10) as client:
            response = await client.get(
                f"{settings.myauto_api_url}/vehicle/mans",
                params={"vehicle_types": "0.1.2"},
                headers={"Accept": "application/json"},
            )
            response.raise_for_status()
            return response.json()
    except Exception:
        return []


async def get_models(make_id: int) -> list[dict[str, Any]]:
    try:
        async with AsyncSession(impersonate=_IMPERSONATE, timeout=10) as client:
            return await _load_models_directory(client, make_id)
    except Exception:
        return []
