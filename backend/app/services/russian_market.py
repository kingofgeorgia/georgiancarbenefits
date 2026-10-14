import asyncio
import json
import re
import statistics
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
    # Legacy values are retained so old immutable Deal Page snapshots remain readable.
    MILEAGE_ADJUSTED_AVERAGE = "MILEAGE_ADJUSTED_AVERAGE"
    MIDDLE_BAND_MIDPOINT = "MIDDLE_BAND_MIDPOINT"
    MEDIAN_LISTING_PRICE = "MEDIAN_LISTING_PRICE"


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


@dataclass(frozen=True)
class DromVehicleIds:
    firm_id: int
    model_id: int


class MarketProviderError(RuntimeError):
    pass


_PROVIDER_NAME = "Drom Search API"
_SOURCE_NAME = "drom.ru"
_cache: dict[tuple[str, str, int, int | None], tuple[float, MarketComparison]] = {}
_cache_lock = asyncio.Lock()


def _normalize_name(value: str) -> str:
    return re.sub(r"[\W_]+", "", value.casefold(), flags=re.UNICODE)


def _safe_float(value: Any) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        number = float(value)
        return number if number > 0 else None
    if isinstance(value, str):
        cleaned = value.strip().replace("\u00a0", " ").replace(" ", "").replace(",", ".")
        cleaned = re.sub(r"[^0-9.\-]", "", cleaned)
        try:
            number = float(cleaned)
        except ValueError:
            return None
        return number if number > 0 else None
    if isinstance(value, dict):
        for key in ("value", "amount", "rub", "price"):
            if key in value:
                parsed = _safe_float(value[key])
                if parsed is not None:
                    return parsed
    return None


def _value_from_keys(row: dict[str, Any], *keys: str) -> float | None:
    for key in keys:
        if key in row:
            value = _safe_float(row[key])
            if value is not None:
                return value
    return None


def _is_ruble_listing(row: dict[str, Any]) -> bool:
    currency = row.get("currency")
    if currency is None:
        return True
    if isinstance(currency, (int, float)):
        # Drom documents currency as an integer ID but does not publish the ID
        # mapping on the public Search API page. Authorized integrations can
        # therefore rely on the account/API contract for numeric currency IDs.
        return True
    if isinstance(currency, str):
        normalized = currency.strip().casefold().replace(".", "")
        return normalized in {"rub", "rur", "руб", "₽", "russian ruble"}
    return False


def _extract_drom_items(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]

    if not isinstance(payload, dict):
        raise MarketProviderError("Drom returned an unsupported response type")

    if any(key in payload for key in ("price", "priceRub", "priceRur", "price_rub")):
        return [payload]

    for key in ("items", "bulls", "results", "list", "data"):
        if key not in payload:
            continue
        nested = payload[key]
        if isinstance(nested, list):
            return [item for item in nested if isinstance(item, dict)]
        if isinstance(nested, dict):
            return _extract_drom_items(nested)

    # An explicitly empty object is treated as an empty result set. A non-empty
    # unknown object is an API-contract mismatch and should not silently become
    # "no comparable cars".
    if not payload:
        return []
    raise MarketProviderError("Drom response shape is not recognized")


def _parse_json_object(raw: str, *, setting_name: str) -> dict[str, Any]:
    try:
        value = json.loads(raw or "{}")
    except json.JSONDecodeError as exc:
        raise MarketProviderError(f"{setting_name} is not valid JSON") from exc
    if not isinstance(value, dict):
        raise MarketProviderError(f"{setting_name} must contain a JSON object")
    return value


def _parse_vehicle_id_map(raw: str) -> dict[tuple[str, str], DromVehicleIds]:
    data = _parse_json_object(raw, setting_name="DROM_VEHICLE_ID_MAP_JSON")
    result: dict[tuple[str, str], DromVehicleIds] = {}

    for key, value in data.items():
        if not isinstance(value, dict):
            continue

        firm_id = value.get("firmId")
        model_id = value.get("modelId")
        if isinstance(firm_id, int) and isinstance(model_id, int) and "|" in key:
            make, model = key.split("|", 1)
            result[(_normalize_name(make), _normalize_name(model))] = DromVehicleIds(
                firm_id=firm_id,
                model_id=model_id,
            )
            continue

        models = value.get("models")
        if not isinstance(firm_id, int) or not isinstance(models, dict):
            continue
        for model_name, nested_model_id in models.items():
            if isinstance(model_name, str) and isinstance(nested_model_id, int):
                result[(_normalize_name(key), _normalize_name(model_name))] = DromVehicleIds(
                    firm_id=firm_id,
                    model_id=nested_model_id,
                )

    return result


def _parse_auth_query(raw: str) -> dict[str, str | int | float | bool]:
    data = _parse_json_object(raw, setting_name="DROM_API_AUTH_QUERY_JSON")
    result: dict[str, str | int | float | bool] = {}
    for key, value in data.items():
        if isinstance(key, str) and isinstance(value, (str, int, float, bool)):
            result[key] = value
    return result


def _trim_price_outliers(
    rows: list[tuple[float, float | None]],
    *,
    trim_fraction: float,
    min_samples: int,
) -> list[tuple[float, float | None]]:
    ordered = sorted(rows, key=lambda row: row[0])
    if len(ordered) < max(min_samples + 2, 8) or trim_fraction <= 0:
        return ordered

    cut = max(1, int(len(ordered) * trim_fraction))
    if len(ordered) - (cut * 2) < min_samples:
        return ordered
    return ordered[cut:-cut]


def parse_drom_search_response(
    payloads: list[Any],
    *,
    make: str,
    model: str,
    year: int,
    mileage_km: int | None,
    min_samples: int,
    trim_fraction: float,
    mileage_filter_applied: bool,
    removed_params: tuple[str, ...] = (),
    checked_at: datetime | None = None,
) -> MarketComparison:
    checked_at = checked_at or datetime.now(timezone.utc)
    raw_items: list[dict[str, Any]] = []
    for payload in payloads:
        raw_items.extend(_extract_drom_items(payload))

    samples: list[tuple[float, float | None]] = []
    seen_ids: set[str] = set()
    for item in raw_items:
        item_id = item.get("id") or item.get("bullId") or item.get("bull_id")
        if item_id is not None:
            marker = str(item_id)
            if marker in seen_ids:
                continue
            seen_ids.add(marker)

        if not _is_ruble_listing(item):
            continue
        price = _value_from_keys(item, "priceRub", "priceRur", "price_rub", "price")
        if price is None:
            continue
        mileage = _value_from_keys(item, "mileageKm", "mileage_km", "mileage")
        samples.append((price, mileage))

    if len(samples) < min_samples:
        return MarketComparison(
            status=MarketComparisonStatus.INSUFFICIENT_DATA,
            provider=_PROVIDER_NAME,
            source=_SOURCE_NAME,
            checked_at=checked_at,
            scope="RU_DROM_LISTINGS",
            make=make,
            model=model,
            year=year,
            mileage_km=mileage_km,
            similar_count=len(samples),
            removed_params=removed_params,
            is_mileage_adjusted=mileage_filter_applied,
            reason=f"Only {len(samples)} usable Drom listings were returned; at least {min_samples} are required",
        )

    filtered = _trim_price_outliers(
        samples,
        trim_fraction=max(0.0, min(trim_fraction, 0.40)),
        min_samples=min_samples,
    )
    prices = [row[0] for row in filtered]
    mileages = [row[1] for row in filtered if row[1] is not None]

    median_price = round(float(statistics.median(prices)), 2)
    average_price = round(float(statistics.fmean(prices)), 2)
    average_mileage = round(float(statistics.fmean(mileages)), 2) if mileages else None

    return MarketComparison(
        status=MarketComparisonStatus.AVAILABLE,
        provider=_PROVIDER_NAME,
        source=_SOURCE_NAME,
        checked_at=checked_at,
        scope="RU_DROM_LISTINGS",
        reference_price_rub=median_price,
        reference_kind=MarketReferenceKind.MEDIAN_LISTING_PRICE,
        min_price_rub=round(min(prices), 2),
        median_price_rub=median_price,
        average_price_rub=average_price,
        market_midpoint_rub=None,
        max_price_rub=round(max(prices), 2),
        similar_count=len(filtered),
        average_mileage_km=average_mileage,
        removed_params=removed_params,
        is_mileage_adjusted=mileage_filter_applied,
        make=make,
        model=model,
        year=year,
        mileage_km=mileage_km,
    )


class DromMarketProvider:
    def __init__(self) -> None:
        self.base_url = settings.drom_api_url.rstrip("/")
        self.access_confirmed = settings.drom_api_access_confirmed
        self.timeout_seconds = settings.drom_market_timeout_seconds
        self.pages = max(1, min(settings.drom_market_pages, 10))
        self.min_samples = max(3, settings.drom_market_min_samples)
        self.trim_fraction = max(0.0, min(settings.drom_market_trim_fraction, 0.40))
        self.mileage_window_percent = max(0.0, settings.drom_market_mileage_window_percent)
        self.mileage_window_min_km = max(0, settings.drom_market_mileage_window_min_km)
        self.vehicle_ids = _parse_vehicle_id_map(settings.drom_vehicle_id_map_json)
        self.auth_query = _parse_auth_query(settings.drom_api_auth_query_json)

    @property
    def configured(self) -> bool:
        return self.access_confirmed

    def _resolve_vehicle(self, make: str, model: str) -> DromVehicleIds | None:
        return self.vehicle_ids.get((_normalize_name(make), _normalize_name(model)))

    async def _get_json(self, client: httpx.AsyncClient, params: dict[str, Any]) -> Any:
        query = {**params, **self.auth_query}
        response = await client.get(
            f"{self.base_url}/bulls/search",
            params=query,
            headers={
                "Accept": "application/json",
                "User-Agent": "MileON Import Calculator (authorized Drom market comparison)",
            },
        )
        if response.status_code in {401, 403}:
            raise PermissionError("Drom API authorization failed")
        if response.status_code == 404:
            raise LookupError("Drom search endpoint or vehicle was not found")
        response.raise_for_status()
        return response.json()

    def _base_params(self, ids: DromVehicleIds, year: int) -> dict[str, Any]:
        return {
            "firmId": ids.firm_id,
            "modelId": ids.model_id,
            "minYear": year,
            "maxYear": year,
            "isDamaged": "false",
            "withoutDocuments": "false",
            "unsold": "true",
        }

    def _mileage_bounds(self, mileage_km: int) -> tuple[int, int]:
        radius = max(
            self.mileage_window_min_km,
            int(round(mileage_km * self.mileage_window_percent)),
        )
        return max(0, mileage_km - radius), mileage_km + radius

    async def _search_pages(
        self,
        client: httpx.AsyncClient,
        *,
        ids: DromVehicleIds,
        year: int,
        mileage_km: int | None,
    ) -> list[Any]:
        base = self._base_params(ids, year)
        if mileage_km is not None:
            min_mileage, max_mileage = self._mileage_bounds(mileage_km)
            base["minMileageKm"] = min_mileage
            base["maxMileageKm"] = max_mileage

        payloads: list[Any] = []
        for page in range(1, self.pages + 1):
            payloads.append(await self._get_json(client, {**base, "page": page}))
        return payloads

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
                scope="RU_DROM_LISTINGS",
                make=make,
                model=model,
                year=year,
                mileage_km=mileage_km,
                reason=(
                    "Drom automatic access is disabled until authorized API/database access is confirmed. "
                    "Set DROM_API_ACCESS_CONFIRMED=true only after Drom permission is obtained."
                ),
            )

        ids = self._resolve_vehicle(make, model)
        if ids is None:
            return MarketComparison(
                status=MarketComparisonStatus.VEHICLE_NOT_FOUND,
                provider=_PROVIDER_NAME,
                source=_SOURCE_NAME,
                checked_at=checked_at,
                scope="RU_DROM_LISTINGS",
                make=make,
                model=model,
                year=year,
                mileage_km=mileage_km,
                reason="Drom firmId/modelId mapping is not configured for this make/model",
            )

        timeout = httpx.Timeout(self.timeout_seconds)
        try:
            async with httpx.AsyncClient(timeout=timeout) as client:
                payloads = await self._search_pages(
                    client,
                    ids=ids,
                    year=year,
                    mileage_km=mileage_km,
                )
                result = parse_drom_search_response(
                    payloads,
                    make=make,
                    model=model,
                    year=year,
                    mileage_km=mileage_km,
                    min_samples=self.min_samples,
                    trim_fraction=self.trim_fraction,
                    mileage_filter_applied=mileage_km is not None,
                    checked_at=checked_at,
                )

                if result.status == MarketComparisonStatus.INSUFFICIENT_DATA and mileage_km is not None:
                    relaxed_payloads = await self._search_pages(
                        client,
                        ids=ids,
                        year=year,
                        mileage_km=None,
                    )
                    result = parse_drom_search_response(
                        relaxed_payloads,
                        make=make,
                        model=model,
                        year=year,
                        mileage_km=mileage_km,
                        min_samples=self.min_samples,
                        trim_fraction=self.trim_fraction,
                        mileage_filter_applied=False,
                        removed_params=("mileage",),
                        checked_at=checked_at,
                    )
                return result
        except PermissionError as exc:
            return MarketComparison(
                status=MarketComparisonStatus.AUTH_ERROR,
                provider=_PROVIDER_NAME,
                source=_SOURCE_NAME,
                checked_at=checked_at,
                scope="RU_DROM_LISTINGS",
                make=make,
                model=model,
                year=year,
                mileage_km=mileage_km,
                reason=str(exc),
            )
        except LookupError as exc:
            return MarketComparison(
                status=MarketComparisonStatus.VEHICLE_NOT_FOUND,
                provider=_PROVIDER_NAME,
                source=_SOURCE_NAME,
                checked_at=checked_at,
                scope="RU_DROM_LISTINGS",
                make=make,
                model=model,
                year=year,
                mileage_km=mileage_km,
                reason=str(exc),
            )
        except (httpx.HTTPError, ValueError, MarketProviderError, json.JSONDecodeError):
            return MarketComparison(
                status=MarketComparisonStatus.PROVIDER_ERROR,
                provider=_PROVIDER_NAME,
                source=_SOURCE_NAME,
                checked_at=checked_at,
                scope="RU_DROM_LISTINGS",
                make=make,
                model=model,
                year=year,
                mileage_km=mileage_km,
                reason="Market provider is temporarily unavailable",
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
            scope="RU_DROM_LISTINGS",
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

    result = await DromMarketProvider().compare(
        make=make,
        model=model,
        year=year,
        mileage_km=mileage_km,
    )
    if result.status == MarketComparisonStatus.AVAILABLE:
        async with _cache_lock:
            expired = [key for key, (expires, _) in _cache.items() if expires <= monotonic_now]
            for key in expired:
                del _cache[key]
            if cache_key not in _cache and len(_cache) >= 2048:
                del _cache[next(iter(_cache))]
            _cache[cache_key] = (
                monotonic_now + settings.drom_market_cache_ttl_seconds,
                result,
            )
    return result
