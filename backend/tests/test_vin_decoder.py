from app.services.vin_decoder import (
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


def test_vpic_parses_basic_vehicle_and_prefers_engine_hp() -> None:
    payload = {
        "Results": [
            {
                "ErrorCode": "0",
                "Make": "BMW",
                "Model": "X5",
                "ModelYear": "2023",
                "Manufacturer": "BMW MANUFACTURER CORPORATION / BMW NORTH AMERICA",
                "BodyClass": "Sport Utility Vehicle (SUV)/Multi-Purpose Vehicle (MPV)",
                "VehicleType": "MULTIPURPOSE PASSENGER VEHICLE (MPV)",
                "FuelTypePrimary": "Gasoline",
                "EngineCylinders": "6",
                "DisplacementL": "3.0",
                "DisplacementCC": "2998.0",
                "EngineKW": "250",
                "EngineHP": "335.0",
                "DriveType": "4WD/4-Wheel Drive/4x4",
                "PlantCountry": "UNITED STATES (USA)",
            }
        ]
    }

    result = parse_vpic_result(payload, "5UXCR6C08P9P00001")

    assert result.status == VinDecodeStatus.AVAILABLE
    assert result.make == "BMW"
    assert result.model == "X5"
    assert result.model_year == 2023
    assert result.displacement_cc == 2998
    assert result.horse_power == 335.0
    assert result.engine_cylinders == 6


def test_vpic_converts_kw_to_hp_when_engine_hp_is_missing() -> None:
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

    assert result.displacement_cc == 2000
    assert result.horse_power == 203.94


def test_vpic_keeps_electrification_metadata() -> None:
    payload = {
        "Results": [
            {
                "Make": "TESLA",
                "Model": "Model 3",
                "ModelYear": "2025",
                "FuelTypePrimary": "Electric",
                "ElectrificationLevel": "BEV (Battery Electric Vehicle)",
            }
        ]
    }

    result = parse_vpic_result(payload, "5YJ3E1EA0SF004091")

    assert result.status == VinDecodeStatus.AVAILABLE
    assert result.fuel_type == "Electric"
    assert result.electrification_level == "BEV (Battery Electric Vehicle)"
    assert result.displacement_cc is None


def test_vpic_empty_decode_is_not_found() -> None:
    result = parse_vpic_result(
        {"Results": [{"ErrorCode": "7", "ErrorText": "VIN decoded with errors"}]},
        "1HGCM82633A004352",
    )

    assert result.status == VinDecodeStatus.NOT_FOUND
    assert result.error_code == "7"
