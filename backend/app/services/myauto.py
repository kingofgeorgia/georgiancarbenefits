"""
Сервис интеграции с myauto.ge API.
Документация: https://api2.myauto.ge (публичный, без ключа).
"""

from typing import Any

import httpx

from app.core.config import settings
from app.schemas.cars import CarListing


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
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.get(
                f"{settings.myauto_api_url}/products/cars",
                params=params,
                headers={"Accept": "application/json"},
            )
            resp.raise_for_status()
            data = resp.json()
            return data.get("data", {}).get("items", [])
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


async def get_makes() -> list[dict[str, Any]]:
    """Список марок с myauto.ge."""
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.get(f"{settings.myauto_api_url}/makes")
            resp.raise_for_status()
            return resp.json().get("data", [])
    except Exception:
        return []
