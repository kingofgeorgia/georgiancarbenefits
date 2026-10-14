import asyncio
import time
from datetime import datetime, timezone

import httpx

from app.services import myauto, russian_market, vin_decoder


def test_vin_cache_evicts_oldest_and_removes_expired(monkeypatch):
    cached = vin_decoder.VinDecodeResult(status=vin_decoder.VinDecodeStatus.NOT_FOUND, vin="1HGCM82633A004352")
    cache = {f"old-{index}": (time.monotonic() + 1000, cached) for index in range(2048)}
    monkeypatch.setattr(vin_decoder, "_cache", cache)

    class Client:
        def __init__(self, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            pass

        async def get(self, *args, **kwargs):
            return httpx.Response(200, json={"Results": [{}]}, request=httpx.Request("GET", "https://vpic.example/test"))

    monkeypatch.setattr(vin_decoder.httpx, "AsyncClient", Client)
    asyncio.run(vin_decoder.decode_vin("1HGCM82633A004352"))
    assert len(cache) == 2048 and "old-0" not in cache
    cache["old-1"] = (0, cached)
    asyncio.run(vin_decoder.decode_vin("1HGCM82633A004353"))
    assert len(cache) == 2048 and "old-1" not in cache


def test_model_cache_does_not_grow_from_empty_ids(monkeypatch):
    directories = {index: [] for index in range(1, 257)}
    lookups = {index: {} for index in range(1, 257)}
    monkeypatch.setattr(myauto, "_models_directory_cache", directories)
    monkeypatch.setattr(myauto, "_models_cache", lookups)

    class Session:
        async def get(self, url, params, **kwargs):
            rows = [] if params["man_id"] == 999 else [{"model_id": 1, "title": "X3"}]
            return httpx.Response(200, json=rows)

    asyncio.run(myauto._load_models_directory(Session(), 999))
    assert 999 not in directories and 999 not in lookups
    asyncio.run(myauto._load_models_directory(Session(), 1000))
    assert len(directories) == len(lookups) == 256
    assert 1 not in directories and 1 not in lookups


def test_myauto_sessions_disable_redirects(monkeypatch):
    seen = []

    class Session:
        def __init__(self, **kwargs):
            seen.append(kwargs["allow_redirects"])

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            pass

        async def get(self, *args, **kwargs):
            raise httpx.ConnectError("fixture")

    monkeypatch.setattr(myauto, "AsyncSession", Session)
    async def scenario():
        await myauto.get_car_by_id(123)
        await myauto.search_cars()
        await myauto.get_makes()
        await myauto.get_models(123)
    asyncio.run(scenario())
    assert seen == [False, False, False, False]


def test_market_provider_error_does_not_expose_auth_query(monkeypatch):
    provider = russian_market.DromMarketProvider()
    provider.access_confirmed = True
    provider.vehicle_ids = russian_market._parse_vehicle_id_map('{"BMW|X3":{"firmId":1,"modelId":2}}')

    async def fail(*args, **kwargs):
        raise httpx.ConnectError("https://api.drom.ru/bulls/search?token=secret-value")

    monkeypatch.setattr(provider, "_search_pages", fail)
    result = asyncio.run(provider.compare(make="BMW", model="X3", year=2024, mileage_km=None))
    assert result.status == russian_market.MarketComparisonStatus.PROVIDER_ERROR
    assert "secret-value" not in result.reason


def test_market_cache_is_bounded(monkeypatch):
    cached = russian_market.MarketComparison(
        status=russian_market.MarketComparisonStatus.AVAILABLE, provider="fixture", source="fixture",
        checked_at=datetime.now(timezone.utc), scope="RU", reference_price_rub=100,
    )
    cache = {(str(index), "x3", 2024, None): (time.monotonic() + 1000, cached) for index in range(2048)}
    monkeypatch.setattr(russian_market, "_cache", cache)

    async def compare(*args, **kwargs):
        return cached

    monkeypatch.setattr(russian_market.DromMarketProvider, "compare", compare)
    result = asyncio.run(russian_market.get_market_comparison(make="BMW", model="X3", year=2024, mileage_km=10000))
    assert result == cached and len(cache) == 2048
    assert ("0", "x3", 2024, None) not in cache
