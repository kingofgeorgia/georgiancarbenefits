import json
from datetime import date, timedelta

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pydantic import ValidationError

from app.api import cars
from app.core.public_api import PublicAPIGuard
from app.schemas.vehicle_specs import VehicleSpecification, VehicleSpecificationCatalog
from app.services import myauto, vehicle_specs


def identity(**changes):
    return {"make": "Toyota", "model": "RAV4", "year": 2024, "engine_cc": 2487,
            "trim": "LE", "market": "US", "fuel": "Gasoline", "drive": "FWD", **changes}


def test_catalog_validates_and_keeps_source_units():
    catalog = VehicleSpecificationCatalog.model_validate_json(vehicle_specs._DATA_FILE.read_text())
    assert len(catalog.items) == 12
    assert all(entry.source_url.scheme == "https" and entry.verified_on <= date.today() for entry in catalog.items)
    assert vehicle_specs.resolve_vehicle_spec_by_identity(**identity()).horse_power == 205.82
    bmw = vehicle_specs.find_specifications(make="BMW", model="M4", year=2021)[0]
    assert bmw.power_unit == "PS" and bmw.horse_power == 510
    raw = bmw.model_dump(exclude={"horse_power"}, mode="json")
    assert VehicleSpecification.model_validate({**raw, "power_value": 100, "power_unit": "KW"}).horse_power == 135.96


@pytest.mark.parametrize("changes", [
    {"make": None}, {"model": None}, {"year": None}, {"engine_cc": None}, {"trim": None},
    {"market": None}, {"fuel": None}, {"drive": None}, {"model": "RAV"},
    {"model": "RAV4 Prime"}, {"make": "Not Toyota"}, {"trim": "XLE"},
    {"trim": "Limited"}, {"year": 2023}, {"year": 2025}, {"engine_cc": 2500},
    {"market": "EU"}, {"fuel": "Hybrid"}, {"drive": "RWD"},
])
def test_incomplete_or_conflicting_identity_is_not_guessed(changes):
    assert vehicle_specs.resolve_vehicle_spec_by_identity(**identity(**changes)) is None


def test_normalized_identity_and_exact_trim_boundaries():
    spec = vehicle_specs.resolve_vehicle_spec_by_identity(**identity(make="TOYOTA", model=" rav4 ", trim="LE Premium", drive="Front-Wheel Drive"))
    assert spec.entry.id == "toyota-rav4-2024-us-le-25-fwd"
    assert vehicle_specs.resolve_vehicle_spec_by_identity(**identity(trim="XLE Premium")) is None


def test_nominal_liters_are_not_invented_as_exact_cc():
    camry = vehicle_specs.find_specifications(make="Toyota", model="Camry", year=2020)
    assert len(camry) == 8 and all(entry.engine_cc is None for entry in camry)
    assert vehicle_specs.resolve_vehicle_spec_by_identity(**identity(model="Camry", year=2020)) is None


def test_conflicting_catalog_rows_do_not_resolve_by_order(monkeypatch):
    entry = vehicle_specs.resolve_vehicle_spec_by_identity(**identity()).entry
    conflicting = entry.model_copy(update={"id": "conflicting-test", "power_value": 200})
    monkeypatch.setattr(vehicle_specs, "CATALOG", vehicle_specs.CATALOG.model_copy(update={"items": (entry, conflicting)}))
    assert vehicle_specs.resolve_vehicle_spec_by_identity(**identity()) is None


def test_hybrid_system_power_is_reference_only():
    entries = vehicle_specs.find_specifications(make="Toyota", model="RAV4", year=2024)
    hybrid = next(entry for entry in entries if entry.fuel == "HYBRID")
    assert hybrid.power_basis == "SYSTEM_MAX"
    assert vehicle_specs.resolve_vehicle_spec_by_identity(**identity(trim="Hybrid LE", fuel="Hybrid", drive="AWD")) is None


@pytest.mark.parametrize("changes", [
    {"source_url": "http://example.com"}, {"source_url": "https://user:pass@example.com"},
    {"source_url": "javascript:alert(1)"}, {"verified_on": str(date.today() + timedelta(days=1))},
    {"year_to": 1990}, {"power_value": float("nan")}, {"power_value": 0},
    {"trim_aliases": [""]}, {"power_basis": "SYSTEM_MAX"}, {"engine_cc": 9999},
])
def test_catalog_rejects_invalid_data(changes):
    entry = vehicle_specs.CATALOG.items[0].model_dump(exclude={"horse_power"}, mode="json")
    with pytest.raises(ValidationError):
        VehicleSpecification.model_validate({**entry, **changes})


def test_duplicate_ids_are_rejected():
    payload = json.loads(vehicle_specs._DATA_FILE.read_text())
    payload["items"].append(payload["items"][0])
    with pytest.raises(ValidationError):
        VehicleSpecificationCatalog.model_validate(payload)


def test_myauto_preserves_provider_power_and_only_enriches_strict_match():
    raw = {"car_id": 1, "man_name": "Toyota", "model_name": "RAV4", "prod_year": "2024",
           "engine_volume": "2487", "fuel_type_id": "2", "trim_name": "LE", "market": "US", "drive_type": "FWD"}
    car = myauto.parse_car(raw)
    assert car.horse_power == 205.82 and car.horse_power_source == "spec_catalog"
    assert car.power_reference.source_url.host == "www.toyota.com"
    supplied = myauto.parse_car({**raw, "horse_power": 150})
    assert supplied.horse_power == 150 and supplied.power_reference is None
    missing_market = myauto.parse_car({**raw, "market": None})
    assert missing_market.horse_power is None and missing_market.power_reference is None


def test_catalog_endpoint_is_local_bounded_and_validated(monkeypatch):
    async def forbidden(*args, **kwargs):
        raise AssertionError("Catalog must not call external providers")
    monkeypatch.setattr(myauto, "get_makes", forbidden)
    monkeypatch.setattr(myauto, "search_cars", forbidden)
    app = FastAPI()
    app.include_router(cars.router)
    with TestClient(app) as client:
        result = client.get("/cars/specifications?make=Toyota&model=RAV4&year=2024")
        assert result.status_code == 200 and len(result.json()["items"]) == 3
        assert result.json()["items"][0]["horse_power"] == 205.82
        assert client.get("/cars/specifications?model=Unknown").json()["items"] == []
        assert client.get("/cars/specifications?year=2101").status_code == 422
        assert client.get("/cars/specifications?make=" + "x" * 81).status_code == 422
    assert PublicAPIGuard.group({"path": "/cars/specifications/", "method": "GET"}) == "lookup"
