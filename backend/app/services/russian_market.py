import asyncio
import re
import time
from dataclasses import dataclass
from datetime import datetime, timezone
from enum import StrEnum
from typing import Any

import httpx

from app.core.config import settings


class MarketComparisonStatus(StrEnum):
    AVAILABLE = "AVAILABLE"
    NOT_CONFIGURED = "NOT_CONFIGURED"
    MISSING_VEHICLE_DATA = "MISSING_VEHICLE_DATA"
    VEHICLE_NOT_FOUND = "VEHICLE_NOT_FOUND"
    INSUFFICIENT_DATA = "INSUFFICIENT_DATA"
    AUTH_ERROR = "AUTH_ERROR"
    PROVIDER_ERROR = "PROVIDER_ERROR"


class MarketReferenceKind(StrEnum):
    MILEAGE_ADJUSTED_AVERAGE = "MILEAGE_ADJUSTED_AVERAGE"
    MIDDLE_BAND_MIDPOINT = "MIDDLE_BAND_MIDPOINT"


@dataclass(frozen=True)
class MarketComparison:
    status: MarketComparisonStatus
    provider: str
    source: str
    checked_at: datetime
    scope: str
    reference_price_rub: float | None = None
    reference_kind: MarketReferenceKind | None = None
    min_price_rub: float | None = None
    median_price_rub: float | None = None
    average_price_rub: float | None = None
    market_midpoint_rub: float | None = None
    max_price_rub: float | None = None
    similar_count: int | None = None
    average_mileage_km: float | None = None
    removed_params: tuple[str, ...] = ()
    is_mileage_adjusted: bool = False
    make: str | None = None
    model: str | None = None
    year: int | None = None
    mileage_km: int | None = None
    reason: str | None = None


class MarketProviderError(RuntimeError):
    pass


_PROVIDER_NAME = "Auto.ru Business Appraisal.API"
_SOURCE_NAME = "auto.ru"
_cache: dict[tuple[str, str, int, int | None], tuple[float, MarketComparison]] = {}
_cache_lock = asyncio.Lock()


def _normalize_name(value: str) -> str:
    return re.sub(r"[\W_]+", "", value.casefold(), flags=re.UNICODE)


def _find_entity_id(items: list[dict[str, Any]], name: str) -> int | None:
    wanted = _normalize_name(name)
    for item in items:
        text = item.get("text")
        entity_id = item.get("id")
        if isinstance(text, str) and isinstance(entity_id, int) and _normalize_name(text) == wanted:
            return entity_id
    return None


def _safe_price(value: Any) -> float | None:
    if isinstance(value, (int, float)) and value > 0:
        return round(float(value), 2)
    return None


def parse_appraisal_response(
    payload: dict[str, Any],
    *,
    make: str,
    model: str,
    year: int,
    mileage_km: int | None,
    checked_at: datetime | None = None,
) -> MarketComparison:
    """Normalize the official Auto.ru Business appraisal response.

    Appraisal.API does not expose a statistical median. We intentionally keep
    `median_price_rub=None` instead of fabricating one. `market_midpoint_rub`
    is the midpoint of the provider's middle price band and is named as such.
    """
    checked_at = checked_at or datetime.now(timezone.utc)
    corrected_average = _safe_price(payload.get("correctedAveragePriceMileage"))
    corrected_categories = payload.get("correctedPriceCategories")
    raw_categories = payload.get("priceCategories")

    categories = corrected_categories if corrected_average and isinstance(corrected_categories, dict) else raw_categories
    if not isinstance(categories, dict):
        categories = {}

    low = categories.get("low") if isinstance(categories.get("low"), dict) else {}
    middle = categories.get("middle") if isinstance(categories.get("middle"), dict) else {}
    high = categories.get("high") if isinstance(categories.get("high"), dict) else {}

    min_price = _safe_price(low.get("min"))
    middle_min = _safe_price(middle.get("min"))
    middle_max = _safe_price(middle.get("max"))
    max_price = _safe_price(high.get("max"))
    midpoint = None
    if middle_min is not None and middle_max is not None:
        midpoint = round((middle_min + middle_max) / 2, 2)

    if corrected_average is not None:
        reference = corrected_average
        reference_kind = MarketReferenceKind.MILEAGE_ADJUSTED_AVERAGE
    else:
        reference = midpoint
        reference_kind = MarketReferenceKind.MIDDLE_BAND_MIDPOINT if midpoint is not None else None

    similar_count = payload.get("similarCars")
    if not isinstance(similar_count, int):
        similar_count = None

    average_mileage = payload.get("similarCarsAvgMileage")
    if not isinstance(average_mileage, (int, float)):
        average_mileage = None

    removed_params = payload.get("removedParams")
    if not isinstance(removed_params, list):
        removed_params = []

    if reference is None:
        return MarketComparison(
            status=MarketComparisonStatus.INSUFFICIENT_DATA,
            provider=_PROVIDER_NAME,
            source=_SOURCE_NAME,
            checked_at=checked_at,
            scope="RU_ALL_REGIONS",
            make=make,
            model=model,
            year=year,
            mileage_km=mileage_km,
            similar_count=similar_count,
            reason="Provider returned no usable market price",
        )

    return MarketComparison(
        status=MarketComparisonStatus.AVAILABLE,
        provider=_PROVIDER_NAME,
        source=_SOURCE_NAME,
        checked_at=checked_at,
        scope="RU_ALL_REGIONS",
        reference_price_rub=reference,
        reference_kind=reference_kind,
        min_price_rub=min_price,
        median_price_rub=None,
        average_price_rub=corrected_average,
        market_midpoint_rub=midpoint,
        max_price_rub=max_price,
        similar_count=similar_count,
        average_mileage_km=round(float(average_mileage), 2) if average_mileage is not None else None,
        removed_params=tuple(str(value) for value in removed_params),
        is_mileage_adjusted=corrected_average is not None,
        make=make,
        model=model,
        year=year,
        mileage_km=mileage_km,
    )


class AutoRuBusinessMarketProvider:
    def __init__(self) -> None:
        self.base_url = settings.auto_ru_business_api_url.rstrip("/")
        self.token = settings.auto_ru_business_token
        self.similar_threshold = settings.auto_ru_market_similar_threshold
        self.liquidity_region_id = settings.auto_ru_business_liquidity_region_id
        self.sources = tuple(
            part.strip() for part in settings.auto_ru_business_sources.split(",") if part.strip()
        ) or ("auto_ru",)

    @property
    def configured(self) -> bool:
        return bool(self.token)

    def _headers(self) -> dict[str, str]:
        return {
            "Accept": "application/json",
            "Authorization": f"Bearer {self.token}",
            "User-Agent": "MileON Import Calculator (market-comparison)",
        }

    async def _get_json(
        self,
        client: httpx.AsyncClient,
        path: str,
        *,
        params: list[tuple[str, str | int]] | dict[str, str | int] | None = None,
    ) -> Any:
        response = await client.get(f"{self.base_url}{path}", params=params, headers=self._headers())
        if response.status_code in {401, 403}:
            raise PermissionError("Auto.ru Business API authorization failed")
        if response.status_code == 422:
            raise LookupError("Auto.ru Business API has insufficient market data")
        response.raise_for_status()
        return response.json()

    async def _resolve_brand_model(
        self,
        client: httpx.AsyncClient,
        *,
        make: str,
        model: str,
    ) -> tuple[int, int] | None:
        brands_payload = await self._get_json(client, "/autocatalog/brands")
        brands = brands_payload.get("brands", []) if isinstance(brands_payload, dict) else []
        if not isinstance(brands, list):
            return None
        brand_id = _find_entity_id(brands, make)
        if brand_id is None:
            return None

        models_payload = await self._get_json(
            client,
            "/autocatalog/models",
            params={"brand": brand_id},
        )
        models = models_payload.get("models", []) if isinstance(models_payload, dict) else []
        if not isinstance(models, list):
            return None
        model_id = _find_entity_id(models, model)
        if model_id is None:
            return None
        return brand_id, model_id

    async def _all_region_ids(self, client: httpx.AsyncClient) -> list[int]:
        payload = await self._get_json(client, "/regions")
        if not isinstance(payload, list):
            return []
        ids = [row.get("regionId") for row in payload if isinstance(row, dict)]
        return [value for value in ids if isinstance(value, int)]

    async def compare(
        self,
        *,
        make: str,
        model: str,
        year: int,
        mileage_km: int | None,
    ) -> MarketComparison:
        checked_at = datetime.now(timezone.utc)
        if not self.configured:
            return MarketComparison(
                status=MarketComparisonStatus.NOT_CONFIGURED,
                provider=_PROVIDER_NAME,
                source=_SOURCE_NAME,
                checked_at=checked_at,
                scope="RU_ALL_REGIONS",
                make=make,
                model=model,
                year=year,
                mileage_km=mileage_km,
                reason="AUTO_RU_BUSINESS_TOKEN is not configured",
            )

        timeout = httpx.Timeout(settings.auto_ru_business_timeout_seconds)
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                ids = await self._resolve_brand_model(client, make=make, model=model)
                if ids is None:
                    return MarketComparison(
                        status=MarketComparisonStatus.VEHICLE_NOT_FOUND,
                        provider=_PROVIDER_NAME,
                        source=_SOURCE_NAME,
                        checked_at=checked_at,
                        scope="RU_ALL_REGIONS",
                        make=make,
                        model=model,
                        year=year,
                        mileage_km=mileage_km,
                        reason="Make/model was not found in Auto.ru Business catalog",
                    )
                brand_id, model_id = ids
                region_ids = await self._all_region_ids(client)
                if not region_ids:
                    raise MarketProviderError("Auto.ru Business regions catalog is empty")

                params: list[tuple[str, str | int]] = [
                    ("brand", brand_id),
                    ("model", model_id),
                    ("creationYear", year),
                    ("liquidityRegionId", self.liquidity_region_id),
                    ("similarThreshold", self.similar_threshold),
                ]
                if mileage_km is not None:
                    params.append(("mileage", mileage_km))
                params.extend(("regionId", region_id) for region_id in region_ids)
                params.extend(("sources", source) for source in self.sources)

                payload = await self._get_json(client, "/appraisal/similar/simple", params=params)
                if not isinstance(payload, dict):
                    raise MarketProviderError("Auto.ru Business returned a non-object response")
                return parse_appraisal_response(
                    payload,
                    make=make,
                    model=model,
                    year=year,
                    mileage_km=mileage_km,
                    checked_at=checked_at,
                )
        except PermissionError as exc:
            return MarketComparison(
                status=MarketComparisonStatus.AUTH_ERROR,
                provider=_PROVIDER_NAME,
                source=_SOURCE_NAME,
                checked_at=checked_at,
                scope="RU_ALL_REGIONS",
                make=make,
                model=model,
                year=year,
                mileage_km=mileage_km,
                reason=str(exc),
            )
        except LookupError as exc:
            return MarketComparison(
                status=MarketComparisonStatus.INSUFFICIENT_DATA,
                provider=_PROVIDER_NAME,
                source=_SOURCE_NAME,
                checked_at=checked_at,
                scope="RU_ALL_REGIONS",
                make=make,
                model=model,
                year=year,
                mileage_km=mileage_km,
                reason=str(exc),
            )
        except (httpx.HTTPError, ValueError, MarketProviderError) as exc:
            return MarketComparison(
                status=MarketComparisonStatus.PROVIDER_ERROR,
                provider=_PROVIDER_NAME,
                source=_SOURCE_NAME,
                checked_at=checked_at,
                scope="RU_ALL_REGIONS",
                make=make,
                model=model,
                year=year,
                mileage_km=mileage_km,
                reason=str(exc),
            )


async def get_market_comparison(
    *,
    make: str | None,
    model: str | None,
    year: int,
    mileage_km: int | None,
) -> MarketComparison:
    now = datetime.now(timezone.utc)
    if not make or not model:
        return MarketComparison(
            status=MarketComparisonStatus.MISSING_VEHICLE_DATA,
            provider=_PROVIDER_NAME,
            source=_SOURCE_NAME,
            checked_at=now,
            scope="RU_ALL_REGIONS",
            make=make,
            model=model,
            year=year,
            mileage_km=mileage_km,
            reason="Vehicle make/model is required for automatic market comparison",
        )

    cache_key = (_normalize_name(make), _normalize_name(model), year, mileage_km)
    monotonic_now = time.monotonic()
    async with _cache_lock:
        cached = _cache.get(cache_key)
        if cached and cached[0] > monotonic_now:
            return cached[1]

    result = await AutoRuBusinessMarketProvider().compare(
        make=make,
        model=model,
        year=year,
        mileage_km=mileage_km,
    )
    if result.status == MarketComparisonStatus.AVAILABLE:
        async with _cache_lock:
            _cache[cache_key] = (
                monotonic_now + settings.auto_ru_market_cache_ttl_seconds,
                result,
            )
    return result
