"""
Сервис интеграции с myauto.ge API.
Документация: https://api2.myauto.ge (публичный, без ключа).
"""

from typing import Any

from curl_cffi.requests import AsyncSession

from app.core.config import settings
from app.schemas.cars import CarListing

_IMPERSONATE = "chrome120"
_mans_cache: dict[int, str] = {}


async def _resolve_man_name(session: AsyncSession, man_id: int) -> str:
    """Возвращает название производителя по man_id, используя кеш."""
    global _mans_cache
    if not _mans_cache:
        try:
            r = await session.get(
                f"{settings.myauto_api_url}/vehicle/mans",
                params={"vehicle_types": "0.1.2"},
                headers={"Accept": "application/json"},
            )
            if r.status_code == 200:
                for m in r.json():
                    _mans_cache[int(m["man_id"])] = m["title"]
        except Exception:
            pass
    return _mans_cache.get(man_id, str(man_id))


async def search_cars(
    make_id: int | None = None,
    model_id: int | None = None,
    year_from: int | None = None,
    year_to: int | None = None,
    price_usd_to: int | None = None,
    page: int = 1,
) -> list[dict[str, Any]]:
    """Возвращает сырые данные с myauto.ge."""
    params: dict[str, Any] = {"Page": page, "SortOrder": 1}
    if make_id:
        params["Mans"] = f"{make_id}.{model_id or 0}"
    if year_from:
        params["YearFrom"] = year_from
    if year_to:
        params["YearTo"] = year_to
    if price_usd_to:
        params["PriceTo"] = price_usd_to
    params["CurrencyID"] = 3  # USD

    try:
        async with AsyncSession(impersonate=_IMPERSONATE, timeout=15) as client:
            resp = await client.get(
                f"{settings.myauto_api_url}/products",
                params=params,
                headers={"Accept": "application/json"},
            )
            resp.raise_for_status()
            items = resp.json().get("data", {}).get("items", [])
            for item in items:
                item["man_name"] = await _resolve_man_name(client, int(item.get("man_id", 0)))
                item["model_name"] = item.get("car_model", "")
                item["km"] = item.get("car_run_km")
            return items
    except Exception:
        return []


def parse_car(raw: dict[str, Any]) -> CarListing:
    engine_cc = int(raw.get("engine_volume", 0) or 0)
    return CarListing(
        car_id=raw.get("car_id", 0),
        make=raw.get("man_name", ""),
        model=raw.get("model_name", ""),
        year=raw.get("prod_year", 0),
        price_usd=float(raw.get("price", 0) or 0),
        engine_volume_cc=engine_cc,
        mileage_km=raw.get("km", None),
        image_url=raw.get("photo", None),
        url=f"https://www.myauto.ge/en/pr/{raw.get('car_id', '')}",
    )


async def get_car_by_id(car_id: int) -> dict[str, Any] | None:
    """Получить данные одного автомобиля по car_id."""
    try:
        async with AsyncSession(impersonate=_IMPERSONATE, timeout=15) as client:
            resp = await client.get(
                f"{settings.myauto_api_url}/products/{car_id}",
                headers={"Accept": "application/json"},
            )
            resp.raise_for_status()
            info = resp.json().get("data", {}).get("info")
            if not info:
                return None
            # Resolve manufacturer name (single-car endpoint has man_id, not man_name)
            man_name = await _resolve_man_name(client, int(info.get("man_id", 0)))
            # Normalise to the same field names parse_car() expects
            info["man_name"] = man_name
            info["model_name"] = info.get("car_model", "")
            info["km"] = info.get("car_run_km")
            return info
    except Exception:
        return None


async def get_makes() -> list[dict[str, Any]]:
    """Список марок с myauto.ge."""
    try:
        async with AsyncSession(impersonate=_IMPERSONATE, timeout=10) as client:
            resp = await client.get(f"{settings.myauto_api_url}/makes")
            resp.raise_for_status()
            return resp.json().get("data", [])
    except Exception:
        return []
