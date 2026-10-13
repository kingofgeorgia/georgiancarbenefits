from datetime import datetime, timezone

from app.services.russian_market import (
    MarketComparisonStatus,
    MarketReferenceKind,
    _find_entity_id,
    parse_appraisal_response,
)


def _official_example_payload() -> dict:
    return {
        "priceCategories": {
            "low": {"min": 712503.8803752583, "max": 758470.9904281164},
            "middle": {"min": 758470.9904281164, "max": 804438.1004809744},
            "high": {"min": 804438.1004809744, "max": 850405.2105338325},
        },
        "correctedPriceCategories": {
            "low": {"min": 819235.2345497028, "max": 862327.744849901},
            "middle": {"min": 862327.744849901, "max": 905420.255150099},
            "high": {"min": 905420.255150099, "max": 948512.7654502972},
        },
        "similarCarsAvgMileage": 174539.63636363635,
        "similarCars": 11,
        "correctedAveragePriceMileage": 807589.7311976507,
        "removedParams": ["drive"],
        "complexEstimate": 3,
        "complexMdsDays": 25,
    }


def test_appraisal_uses_mileage_adjusted_average_as_reference() -> None:
    checked_at = datetime(2026, 10, 13, 20, 0, tzinfo=timezone.utc)
    result = parse_appraisal_response(
        _official_example_payload(),
        make="Opel",
        model="Insignia",
        year=2012,
        mileage_km=130000,
        checked_at=checked_at,
    )

    assert result.status == MarketComparisonStatus.AVAILABLE
    assert result.reference_kind == MarketReferenceKind.MILEAGE_ADJUSTED_AVERAGE
    assert result.reference_price_rub == 807589.73
    assert result.average_price_rub == 807589.73
    assert result.min_price_rub == 819235.23
    assert result.max_price_rub == 948512.77
    assert result.similar_count == 11
    assert result.median_price_rub is None
    assert result.removed_params == ("drive",)
    assert result.is_mileage_adjusted is True


def test_appraisal_does_not_invent_median_without_provider_value() -> None:
    payload = _official_example_payload()
    payload["correctedAveragePriceMileage"] = None
    payload["correctedPriceCategories"] = None

    result = parse_appraisal_response(
        payload,
        make="Opel",
        model="Insignia",
        year=2012,
        mileage_km=None,
    )

    expected_midpoint = round((758470.9904281164 + 804438.1004809744) / 2, 2)
    assert result.reference_kind == MarketReferenceKind.MIDDLE_BAND_MIDPOINT
    assert result.reference_price_rub == expected_midpoint
    assert result.market_midpoint_rub == expected_midpoint
    assert result.average_price_rub is None
    assert result.median_price_rub is None
    assert result.is_mileage_adjusted is False


def test_empty_provider_price_is_insufficient_data() -> None:
    result = parse_appraisal_response(
        {"similarCars": 3},
        make="Rare",
        model="Model",
        year=2025,
        mileage_km=100,
    )

    assert result.status == MarketComparisonStatus.INSUFFICIENT_DATA
    assert result.reference_price_rub is None
    assert result.similar_count == 3


def test_catalog_matching_ignores_spacing_and_punctuation() -> None:
    items = [
        {"id": 1, "text": "Mercedes-Benz"},
        {"id": 2, "text": "Land Rover"},
    ]
    assert _find_entity_id(items, "Mercedes Benz") == 1
    assert _find_entity_id(items, "land-rover") == 2
    assert _find_entity_id(items, "BMW") is None
