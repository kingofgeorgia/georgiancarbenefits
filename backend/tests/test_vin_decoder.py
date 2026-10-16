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
    assert normalize_vin("7SАYGDEF4PF665873") == "7SAYGDEF4PF665873"
    assert validate_vin("5YJ3E1EA0SF004091") is True
    assert validate_vin("7SАYGDEF4PF665873") is True
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
    assert result.horse_power_source == "nhtsa_engine_kw_reference"


def test_vpic_uses_verified_spec_only_with_complete_identity() -> None:
    payload = {
        "Results": [
            {
                "Make": "Toyota",
                "Model": "RAV4",
                "ModelYear": "2024",
                "Trim": "LE",
                "FuelTypePrimary": "Gasoline",
                "DisplacementCC": "2487",
                "DriveType": "FWD/Front-Wheel Drive",
            }
        ]
    }

    result = parse_vpic_result(payload, "WBS43AZ09RCP00001")

    assert result.status == VinDecodeStatus.COMPLETE
    assert result.horse_power == 205.82
    assert result.horse_power_source == "spec_catalog"
    assert result.power_reference.id == "toyota-rav4-2024-us-le-25-fwd"


def test_vpic_does_not_reuse_old_broad_bmw_power_record() -> None:
    result = parse_vpic_result({"Results": [{
        "Make": "BMW", "Model": "M4", "ModelYear": "2024", "Trim": "Competition xDrive",
        "FuelTypePrimary": "Gasoline", "DisplacementCC": "3000",
    }]}, "WBS43AZ09RCP00001")
    assert result.status == VinDecodeStatus.PARTIAL
    assert result.horse_power is None
    assert result.power_reference is None


def test_vpic_hybrid_cannot_receive_power_from_ice_catalog_record() -> None:
    result = parse_vpic_result({"Results": [{
        "Make": "Toyota", "Model": "RAV4", "ModelYear": "2024", "Trim": "LE",
        "FuelTypePrimary": "Gasoline", "FuelTypeSecondary": "Electric",
        "DisplacementCC": "2487", "DriveType": "AWD",
    }]}, "1HGCM82633A004352")
    assert result.powertrain_kind == "OTHER_HYBRID"
    assert result.horse_power is None and result.power_reference is None


def test_vpic_ev_reference_power_does_not_become_regulatory_power() -> None:
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

    assert result.status == VinDecodeStatus.PARTIAL
    assert result.powertrain_kind == "EV"
    assert result.displacement_cc == 0
    assert result.horse_power == pytest.approx(282.80, abs=0.01)
    assert result.horse_power_source == "nhtsa_engine_kw_reference"
    assert result.electric_power_kw is None
    assert result.complete_for_calculator is False
    assert "30-minute" in (result.warning or "")


def test_user_tesla_model_y_vin_is_normalized_and_identified_as_performance() -> None:
    payload = {
        "Results": [
            {
                "Make": "TESLA",
                "Model": "Model Y",
                "ModelYear": "2023",
                "FuelTypePrimary": "Electric",
                "ElectrificationLevel": "BEV (Battery Electric Vehicle)",
                "ErrorCode": "0",
            }
        ]
    }

    result = parse_vpic_result(payload, "7SАYGDEF4PF665873")

    assert result.vin == "7SAYGDEF4PF665873"
    assert result.make == "TESLA"
    assert result.model == "Model Y"
    assert result.model_year == 2023
    assert result.trim == "Performance AWD"
    assert result.drive_type == "AWD/All-Wheel Drive"
    assert result.powertrain_kind == "EV"
    assert result.electric_power_kw is None
    assert result.status == VinDecodeStatus.PARTIAL


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
