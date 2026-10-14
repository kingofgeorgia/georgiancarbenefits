from datetime import datetime, timezone

import pytest

from app.services.russian_market import (
    MarketComparisonStatus,
    MarketProviderError,
    MarketReferenceKind,
    _extract_drom_items,
    _parse_vehicle_id_map,
    parse_drom_search_response,
)


def _listing(listing_id: int, price: int, mileage: int) -> dict:
    return {
        "id": listing_id,
        "price": price,
        "mileageKm": mileage,
    }


def test_drom_uses_trimmed_statistical_median_as_reference() -> None:
    checked_at = datetime(2026, 10, 14, 9, 0, tzinfo=timezone.utc)
    payload = {
        "items": [
            _listing(1, 1_000_000, 40_000),
            _listing(2, 1_100_000, 45_000),
            _listing(3, 1_200_000, 50_000),
            _listing(4, 1_300_000, 55_000),
            _listing(5, 1_400_000, 60_000),
            _listing(6, 1_500_000, 65_000),
            _listing(7, 1_600_000, 70_000),
            _listing(8, 1_700_000, 75_000),
            _listing(9, 1_800_000, 80_000),
            _listing(10, 9_900_000, 85_000),
        ]
    }

    result = parse_drom_search_response(
        [payload],
        make="Tesla",
        model="Model Y",
        year=2023,
        mileage_km=60_000,
        min_samples=5,
        trim_fraction=0.10,
        mileage_filter_applied=True,
        checked_at=checked_at,
    )

    # Ten results -> trim one low and one high observation. The extreme
    # 9.9M listing therefore cannot distort the market reference.
    assert result.status == MarketComparisonStatus.AVAILABLE
    assert result.reference_kind == MarketReferenceKind.MEDIAN_LISTING_PRICE
    assert result.reference_price_rub == 1_450_000.0
    assert result.median_price_rub == 1_450_000.0
    assert result.average_price_rub == 1_450_000.0
    assert result.min_price_rub == 1_100_000.0
    assert result.max_price_rub == 1_800_000.0
    assert result.similar_count == 8
    assert result.average_mileage_km == 62_500.0
    assert result.is_mileage_adjusted is True
    assert result.source == "drom.ru"


def test_drom_deduplicates_listing_ids_and_reads_nested_payload() -> None:
    payload = {
        "data": {
            "bulls": [
                _listing(1, 2_000_000, 20_000),
                _listing(1, 2_000_000, 20_000),
                _listing(2, 2_100_000, 22_000),
                _listing(3, 2_200_000, 24_000),
                _listing(4, 2_300_000, 26_000),
                _listing(5, 2_400_000, 28_000),
            ]
        }
    }

    result = parse_drom_search_response(
        [payload],
        make="BMW",
        model="X5",
        year=2024,
        mileage_km=None,
        min_samples=5,
        trim_fraction=0.10,
        mileage_filter_applied=False,
    )

    assert result.status == MarketComparisonStatus.AVAILABLE
    assert result.similar_count == 5
    assert result.median_price_rub == 2_200_000.0


def test_drom_reports_insufficient_usable_listings() -> None:
    result = parse_drom_search_response(
        [{"items": [_listing(1, 2_000_000, 10_000), _listing(2, 2_100_000, 20_000)]}],
        make="Rare",
        model="Model",
        year=2025,
        mileage_km=15_000,
        min_samples=5,
        trim_fraction=0.10,
        mileage_filter_applied=True,
    )

    assert result.status == MarketComparisonStatus.INSUFFICIENT_DATA
    assert result.reference_price_rub is None
    assert result.similar_count == 2


def test_drom_vehicle_map_supports_nested_and_flat_formats() -> None:
    mapping = _parse_vehicle_id_map(
        """
        {
          "Tesla": {"firmId": 101, "models": {"Model Y": 202, "Model 3": 203}},
          "BMW|X5": {"firmId": 303, "modelId": 404}
        }
        """
    )

    assert mapping[("tesla", "modely")].firm_id == 101
    assert mapping[("tesla", "modely")].model_id == 202
    assert mapping[("bmw", "x5")].firm_id == 303
    assert mapping[("bmw", "x5")].model_id == 404


def test_drom_empty_object_is_empty_result_but_unknown_contract_is_error() -> None:
    assert _extract_drom_items({}) == []
    with pytest.raises(MarketProviderError):
        _extract_drom_items({"unexpected": "shape"})


def test_legacy_reference_kinds_are_retained_for_old_deal_snapshots() -> None:
    assert MarketReferenceKind("MILEAGE_ADJUSTED_AVERAGE") == MarketReferenceKind.MILEAGE_ADJUSTED_AVERAGE
    assert MarketReferenceKind("MIDDLE_BAND_MIDPOINT") == MarketReferenceKind.MIDDLE_BAND_MIDPOINT
