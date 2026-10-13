from datetime import date

import pytest

from app.calculation.age import resolve_vehicle_age
from app.calculation.tariffs import get_calculation_rule_version, get_recycling_2026
from app.integrations.cbr import parse_cbr_daily_xml
from app.services.personal_import_customs import (
    calculatePersonalImportCustoms,
    resolveUtilCoefficient2026PersonalM1,
)


def test_exact_age_crosses_three_year_boundary_by_one_day() -> None:
    exact_three = resolve_vehicle_age(
        car_year=2023,
        manufacture_date=date(2023, 10, 13),
        calculation_date=date(2026, 10, 13),
    )
    day_after = resolve_vehicle_age(
        car_year=2023,
        manufacture_date=date(2023, 10, 12),
        calculation_date=date(2026, 10, 13),
    )
    assert exact_three.age_years == 3.0
    assert day_after.age_years > 3.0
    assert exact_three.age_is_estimated is False


def test_year_only_age_is_explicitly_estimated() -> None:
    age = resolve_vehicle_age(
        car_year=2024,
        manufacture_date=None,
        calculation_date=date(2026, 10, 13),
    )
    assert age.age_is_estimated is True
    assert age.estimation_method == "year_start"
    assert age.manufacture_date_used == date(2024, 1, 1)


def test_cbr_xml_parser_normalizes_nominal() -> None:
    xml = """<?xml version='1.0' encoding='windows-1251'?>
    <ValCurs Date='13.10.2026' name='Foreign Currency Market'>
      <Valute ID='R01235'><NumCode>840</NumCode><CharCode>USD</CharCode><Nominal>1</Nominal><Name>US Dollar</Name><Value>81,2500</Value></Valute>
      <Valute ID='R01239'><NumCode>978</NumCode><CharCode>EUR</CharCode><Nominal>1</Nominal><Name>Euro</Name><Value>94,5000</Value></Valute>
      <Valute ID='R01210'><NumCode>981</NumCode><CharCode>GEL</CharCode><Nominal>10</Nominal><Name>Lari</Name><Value>301,0000</Value></Valute>
    </ValCurs>"""
    snapshot = parse_cbr_daily_xml(xml)
    assert snapshot.effective_date == date(2026, 10, 13)
    assert snapshot.rates_to_rub == {"EUR": 94.5, "GEL": 30.1, "USD": 81.25}


def test_2026_low_power_3001_3500_coefficient_is_not_future_year_value() -> None:
    coefficient, _, engine_band, _ = resolveUtilCoefficient2026PersonalM1(
        powertrain_kind="ICE",
        age_years=1,
        power_kw=100,
        engine_cc=3500,
    )
    assert coefficient == 129.2
    assert engine_band == "3001–3500 cc"


def test_2026_low_power_over_3500_coefficient() -> None:
    coefficient, _, engine_band, _ = resolveUtilCoefficient2026PersonalM1(
        powertrain_kind="ICE",
        age_years=1,
        power_kw=100,
        engine_cc=4000,
    )
    assert coefficient == 164.53
    assert engine_band == "> 3500 cc"


def test_pure_ev_uses_30_minute_power_for_aggregate_payment() -> None:
    result = calculatePersonalImportCustoms(
        {
            "price": 52_590,
            "currencyToRubRate": 91,
            "eurToRubRate": 98,
            "engineCc": 0,
            "electricPowerKw": 153,
            "ageYears": 4,
            "isPersonalUse": True,
            "powertrainKind": "EV",
        }
    )
    assert result["details"]["customsPaymentKind"] == "AGGREGATE_PAYMENT"
    assert result["details"]["powerKwUsed"] == 153
    assert result["details"]["powerBasis"] == "MAX_30_MINUTE_ELECTRIC_POWER_KW"
    assert result["importDuty"] == 717_853.5
    assert result["excise"] == 208_852.08
    assert result["vat"] == 1_256_727.03
    assert result["unifiedRate"] == 2_183_432.61


def test_pure_ev_rejects_peak_horsepower_without_30_minute_power() -> None:
    with pytest.raises(ValueError, match="electricPowerKw is required"):
        calculatePersonalImportCustoms(
            {
                "price": 52_590,
                "currencyToRubRate": 91,
                "eurToRubRate": 98,
                "engineCc": 0,
                "horsePower": 455,
                "ageYears": 4,
                "isPersonalUse": True,
                "powertrainKind": "EV",
            }
        )


def test_tariff_data_has_versions() -> None:
    assert get_recycling_2026()["version"] == "ru-recycling-2026-v1"
    assert "ru-customs-2026-v1" in get_calculation_rule_version()
