from datetime import date, datetime, timezone

from app.api.deals import _new_public_id
from app.schemas.deals import DealShareCreate


def _snapshot_payload() -> dict:
    now = datetime(2026, 10, 14, tzinfo=timezone.utc)
    return {
        "request": {
            "car_price_usd": 30000,
            "engine_volume_cc": 1998,
            "car_year": 2024,
            "horse_power": 250,
            "mileage_km": 25000,
            "powertrain_kind": "ICE",
            "is_personal_use": True,
            "source_make": "BMW",
            "source_model": "X3",
            "logistics_cost_rub": 170000,
            "auto_market_comparison": False,
        },
        "result": {
            "car_price_rub": 2700000,
            "customs_fee_rub": 49240,
            "customs_duty_rub": 1000000,
            "customs_payment_kind": "UNIFIED_RATE",
            "import_duty_rub": 0,
            "excise_rub": 0,
            "vat_rub": 0,
            "recycling_fee_rub": 3400,
            "customs_total_rub": 1052640,
            "logistics_cost_rub": 170000,
            "total_cost_rub": 3922640,
            "vehicle_age_years": 2.0,
            "age_is_estimated": True,
            "manufacture_date_used": date(2024, 7, 1),
            "calculation_date": date(2026, 10, 14),
            "calculation_rule_version": "ru-2026",
            "rates": {
                "usd_to_rub": 90,
                "eur_to_rub": 98,
                "gel_to_rub": 33,
                "source": "CBR",
                "effective_date": date(2026, 10, 14),
                "fetched_at": now,
                "is_stale": False,
            },
        },
        "vehicle": {
            "make": "BMW",
            "model": "X3",
            "year": 2024,
            "mileage_km": 25000,
            "price_usd": 30000,
            "source_url": "https://www.myauto.ge/example",
        },
    }


def test_deal_snapshot_round_trips_as_json() -> None:
    snapshot = DealShareCreate.model_validate(_snapshot_payload())
    encoded = snapshot.model_dump(mode="json")
    restored = DealShareCreate.model_validate(encoded)

    assert restored.request.source_make == "BMW"
    assert restored.result.total_cost_rub == 3922640
    assert restored.vehicle is not None
    assert restored.vehicle.model == "X3"


def test_public_deal_ids_are_short_and_non_sequential() -> None:
    values = {_new_public_id() for _ in range(20)}
    assert len(values) == 20
    assert all(10 <= len(value) <= 20 for value in values)
    assert all(value.replace("-", "").replace("_", "").isalnum() for value in values)
