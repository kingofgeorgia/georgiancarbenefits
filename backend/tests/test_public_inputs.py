import math
from datetime import date

import pytest
from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.api import calculator, cars
from app.core.public_urls import extract_myauto_car_id, is_myauto_image_url
from app.main import validation_error
from app.schemas.calculator import CalculatorInput
from app.services import currency, myauto


@pytest.fixture
def client(monkeypatch):
    async def forbidden(*args, **kwargs):
        raise AssertionError("Invalid input must not reach external providers")
    monkeypatch.setattr(myauto, "get_car_by_id", forbidden)
    monkeypatch.setattr(myauto, "search_cars", forbidden)
    monkeypatch.setattr(currency, "get_rate_snapshot", forbidden)
    app = FastAPI()
    app.include_router(cars.router)
    app.include_router(calculator.router)
    app.add_exception_handler(RequestValidationError, validation_error)
    with TestClient(app) as client:
        yield client


@pytest.mark.parametrize("value", [
    "https://evil.example/pr/123", "https://myauto.ge.evil.example/pr/123",
    "https://evil.example/?next=https://myauto.ge/pr/123", "http://127.0.0.1/pr/123",
    "http://169.254.169.254/pr/123", "ftp://myauto.ge/pr/123", "https://user@myauto.ge/pr/123",
    "https://myauto.ge:8080/pr/123", "https://myauto.ge/ru/pr/123\n/extra",
    "https://myauto.ge\\@evil.example/pr/123", "//myauto.ge/pr/123", "12345678901",
    "１２３", "²", "-123", "0", "https://myauto.ge/ru/pr/0", "https://myauto.ge/../pr/123",
])
def test_untrusted_myauto_url_is_rejected_before_provider(client, value):
    assert extract_myauto_car_id(value) is None
    assert client.post("/cars/from-url", json={"url": value}).status_code == 422


@pytest.mark.parametrize("value", [
    "123", " 123 ", "https://myauto.ge/ru/pr/123/vehicle?offerType=basic",
    "https://www.myauto.ge/en/pr/123", "http://myauto.ge/pr/123/", "https://myauto.ge:443/ka/pr/123",
])
def test_myauto_id_and_official_urls_remain_supported(value):
    assert extract_myauto_car_id(value) == 123


@pytest.mark.parametrize("query", [
    "logistics_cost_rub=nan", "logistics_cost_rub=inf", "page=101", "make_id=-1",
    "model_id=10000001", "year_from=2025&year_to=2020", "price_usd_to=-1",
])
def test_bad_catalog_filters_do_not_call_providers(client, query):
    assert client.get("/cars/search?" + query).status_code == 422


def calculator_payload():
    return {"car_price_usd": 30000, "engine_volume_cc": 1998, "car_year": 2024, "horse_power": 150}


@pytest.mark.parametrize("field,value", [
    ("car_price_usd", math.nan), ("car_price_usd", math.inf), ("horse_power", math.inf),
    ("logistics_cost_rub", math.nan), ("car_price_usd", 0), ("car_price_usd", 1e100),
    ("mileage_km", -1), ("mileage_km", 10000001), ("engine_volume_cc", 20001),
    ("horse_power", 0), ("horse_power", 5001), ("car_year", date.today().year + 1),
    ("note", "x" * 2001), ("is_personal_use", False),
])
def test_invalid_calculation_returns_json_422_not_500(client, field, value):
    import json
    payload = {**calculator_payload(), field: value}
    response = client.post("/calculator/total", content=json.dumps(payload), headers={"content-type": "application/json"})
    assert response.status_code == 422
    assert response.json()["detail"]
    assert "input" not in response.text


@pytest.mark.parametrize("kind", ["ICE", "OTHER_HYBRID", "EV", "SERIES_HYBRID"])
def test_valid_powertrains_preserve_required_power_rules(kind):
    payload = {**calculator_payload(), "powertrain_kind": kind}
    if kind in {"EV", "SERIES_HYBRID"}:
        payload.update(electric_power_kw=153, horse_power=None)
        if kind == "EV":
            payload["engine_volume_cc"] = 0
    parsed = CalculatorInput.model_validate(payload)
    assert parsed.powertrain_kind == kind
    if kind in {"EV", "SERIES_HYBRID"}:
        with pytest.raises(ValidationError):
            CalculatorInput.model_validate({**payload, "electric_power_kw": None})


@pytest.mark.parametrize("value", [
    "http://static.my.ge/myauto/photos/x.jpg", "https://127.0.0.1/x.jpg",
    "https://static.my.ge.evil.example/myauto/photos/x.jpg", "https://user@static.my.ge/myauto/photos/x.jpg",
    "https://static.my.ge:444/myauto/photos/x.jpg", "https://static.my.ge/private/x.jpg",
    "https://static.my.ge/myauto/photos/%2e%2e/private.jpg", "https://other.myauto.ge/x.jpg",
])
def test_only_trusted_https_image_cdn_is_accepted(value):
    assert not is_myauto_image_url(value)


def test_images_have_bounded_count_and_safe_path():
    images = myauto._build_image_urls({"photo": "2026/10/14", "car_id": 123, "pic_number": 1000000})
    assert len(images) == 30 and all(is_myauto_image_url(url) for url in images)
    assert myauto._build_image_urls({"photo": "https://127.0.0.1/private.jpg"}) == []
    assert myauto._build_image_urls({"photo": "../private", "car_id": 123, "pic_number": 3}) == []
    assert myauto._build_image_urls({"photo": "2026", "car_id": "invalid", "pic_number": 3}) == []
    trusted = "https://static.my.ge/myauto/photos/2026/x.jpg?v=1"
    assert myauto._build_image_urls({"photo": trusted}) == [trusted]
