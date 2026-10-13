import pytest

from app.services.vin_decoder import (
    METRIC_HP_PER_KW,
    VinDecodeStatus,
    normalize_vin,
    parse_vpic_result,
    validate_vin,
)


def test_vin_validation_normalizes_case_and_rejects_forbidden_letters() -> None:
    assert normalize_vin(" 5yj3e1ea0sf004091 ") == "5YJ3E1EA0SF004091"
    assert validate_vin("5YJ3E1EA0SF004091") is True
    assert validate_vin("5YJ3E1IA0SF004091") is False
    assert validate_vin("SHORTVIN") is False


def test_vpic_parses_complete_ice_vehicle_and_extra_metadata() -> None:
    payload = {
        "Results": [
            {
                "ErrorCode": "0",
                "Make": "BMW",
                "Model": "X5",
                "ModelYear": "2024",
                "Trim": "xDrive40i",
                "Series": "G05",
                "Manufacturer": "BMW MANUFACTURER CORPORATION / BMW NORTH AMERICA",
                "BodyClass": "Sport Utility Vehicle (SUV)/Multi-Purpose Vehicle (MPV)",
                "VehicleType": "MULTIPURPOSE PASSENGER VEHICLE (MPV)",
                "FuelTypePrimary": "Gasoline",
                "EngineCylinders": "6",
                "DisplacementL": "3.0",
                "DisplacementCC": "2998.0",
                "EngineKW": "250",
                "EngineHP": "375",
                "DriveType": "AWD/All-Wheel Drive",
                "TransmissionStyle": "Automatic",
                "PlantCountry": "UNITED STATES (USA)",
            }
        ]
    }

    result = parse_vpic_result(payload, "5UXCR6C08P9P00001")

    assert result.status == VinDecodeStatus.COMPLETE
    assert result.make == "BMW"
    assert result.model == "X5"
    assert result.model_year == 2024
    assert result.trim == "xDrive40i"
    assert result.series == "G05"
    assert result.displacement_cc == 2998
    assert result.horse_power == 375.0
    assert result.horse_power_source == "nhtsa_engine_hp"
    assert result.engine_cylinders == 6
    assert result.powertrain_kind == "ICE"
    assert result.complete_for_calculator is True
    assert result.warning is None


def test_vpic_uses_engine_hp_to_when_lower_bound_is_missing() -> None:
    payload = {
        "Results": [
            {
                "Make": "FORD",
                "Model": "Example",
                "ModelYear": "2022",
                "FuelTypePrimary": "Gasoline",
                "DisplacementCC": "3500",
                "EngineHP": "",
                "EngineHP_to": "400",
            }
        ]
    }

    result = parse_vpic_result(payload, "1FTFW1E50NFA00001")

    assert result.status == VinDecodeStatus.COMPLETE
    assert result.horse_power == 400.0
    assert result.horse_power_source == "nhtsa_engine_hp_to"


def test_vpic_uses_metric_hp_conversion_when_engine_hp_is_missing() -> None:
    payload = {
        "Results": [
            {
                "Make": "Example",
                "Model": "Car",
                "ModelYear": "2024",
                "FuelTypePrimary": "Gasoline",
                "DisplacementL": "2.0",
                "EngineKW": "150",
            }
        ]
    }

    result = parse_vpic_result(payload, "1HGCM82633A004352")

    assert result.status == VinDecodeStatus.COMPLETE
    assert result.displacement_cc == 2000
    assert result.horse_power == round(150 * METRIC_HP_PER_KW, 2)
    assert result.horse_power == 203.94
    assert result.horse_power_source == "nhtsa_engine_kw"


def test_vpic_uses_curated_spec_when_nhtsa_omits_power() -> None:
    payload = {
        "Results": [
            {
                "Make": "BMW",
                "Model": "M4",
                "ModelYear": "2024",
                "Trim": "Competition xDrive",
                "FuelTypePrimary": "Gasoline",
                "DisplacementCC": "3000",
            }
        ]
    }

    result = parse_vpic_result(payload, "WBS43AZ09RCP00001")

    assert result.status == VinDecodeStatus.COMPLETE
    assert result.horse_power == 530.0
    assert result.horse_power_source == "spec_catalog"


def test_vpic_ev_sets_zero_engine_volume_and_metric_hp() -> None:
    payload = {
        "Results": [
            {
                "Make": "TESLA",
                "Model": "Model 3",
                "ModelYear": "2025",
                "FuelTypePrimary": "Electric",
                "ElectrificationLevel": "BEV (Battery Electric Vehicle)",
                "EngineKW": "208",
                "ErrorCode": "0",
            }
        ]
    }

    result = parse_vpic_result(payload, "5YJ3E1EA0SF004091")

    assert result.status == VinDecodeStatus.COMPLETE
    assert result.powertrain_kind == "EV"
    assert result.displacement_cc == 0
    assert result.horse_power == pytest.approx(282.80, abs=0.01)
    assert result.horse_power_source == "nhtsa_engine_kw"
    assert result.complete_for_calculator is True


def test_vpic_partial_vehicle_never_fabricates_missing_power() -> None:
    payload = {
        "Results": [
            {
                "Make": "TOYOTA",
                "Model": "LAND CRUISER",
                "ModelYear": "2024",
                "FuelTypePrimary": "Gasoline",
                "ErrorCode": "0",
            }
        ]
    }

    result = parse_vpic_result(payload, "JTMCY7AJ0R4000001")

    assert result.status == VinDecodeStatus.PARTIAL
    assert result.horse_power is None
    assert result.horse_power_source is None
    assert result.complete_for_calculator is False
    assert result.warning is not None


def test_vpic_empty_decode_is_not_found() -> None:
    result = parse_vpic_result(
        {"Results": [{"ErrorCode": "7", "ErrorText": "VIN decoded with errors"}]},
        "1HGCM82633A004352",
    )

    assert result.status == VinDecodeStatus.NOT_FOUND
    assert result.error_code == "7"
