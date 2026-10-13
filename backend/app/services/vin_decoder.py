from dataclasses import dataclass
from enum import StrEnum
import re
from typing import Any

import httpx


VPIC_BASE_URL = "https://vpic.nhtsa.dot.gov/api/vehicles"
VIN_RE = re.compile(r"^[A-HJ-NPR-Z0-9]{17}$")


class VinDecodeStatus(StrEnum):
    AVAILABLE = "AVAILABLE"
    INVALID_VIN = "INVALID_VIN"
    NOT_FOUND = "NOT_FOUND"
    PROVIDER_ERROR = "PROVIDER_ERROR"


@dataclass(frozen=True)
class VinDecodeResult:
    status: VinDecodeStatus
    vin: str
    make: str | None = None
    model: str | None = None
    model_year: int | None = None
    manufacturer: str | None = None
    body_class: str | None = None
    vehicle_type: str | None = None
    fuel_type: str | None = None
    electrification_level: str | None = None
    engine_cylinders: int | None = None
    displacement_l: float | None = None
    displacement_cc: int | None = None
    engine_kw: float | None = None
    horse_power: float | None = None
    drive_type: str | None = None
    transmission_style: str | None = None
    plant_country: str | None = None
    plant_city: str | None = None
    error_code: str | None = None
    error_text: str | None = None
    source: str = "NHTSA vPIC"


def normalize_vin(vin: str) -> str:
    return vin.strip().upper().replace(" ", "")


def validate_vin(vin: str) -> bool:
    return bool(VIN_RE.fullmatch(normalize_vin(vin)))


def _text(value: Any) -> str | None:
    if isinstance(value, str):
        value = value.strip()
        return value or None
    return None


def _float(value: Any) -> float | None:
    if value in (None, "", "Not Applicable"):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _int(value: Any) -> int | None:
    number = _float(value)
    if number is None:
        return None
    return int(round(number))


def parse_vpic_result(payload: dict[str, Any], vin: str) -> VinDecodeResult:
    results = payload.get("Results")
    if not isinstance(results, list) or not results or not isinstance(results[0], dict):
        return VinDecodeResult(
            status=VinDecodeStatus.NOT_FOUND,
            vin=vin,
            error_text="NHTSA vPIC returned no decoded vehicle data",
        )

    row = results[0]
    error_code = _text(row.get("ErrorCode"))
    error_text = _text(row.get("ErrorText"))

    make = _text(row.get("Make"))
    model = _text(row.get("Model"))
    model_year = _int(row.get("ModelYear"))

    if not make and not model and not model_year:
        return VinDecodeResult(
            status=VinDecodeStatus.NOT_FOUND,
            vin=vin,
            error_code=error_code,
            error_text=error_text or "VIN could not be decoded",
        )

    displacement_l = _float(row.get("DisplacementL"))
    displacement_cc = _int(row.get("DisplacementCC"))
    if displacement_cc is None and displacement_l is not None:
        displacement_cc = int(round(displacement_l * 1000))

    engine_kw = _float(row.get("EngineKW"))
    engine_hp = _float(row.get("EngineHP"))
    horse_power = engine_hp
    if horse_power is None and engine_kw is not None:
        horse_power = round(engine_kw * 1.3596216173, 2)

    return VinDecodeResult(
        status=VinDecodeStatus.AVAILABLE,
        vin=vin,
        make=make,
        model=model,
        model_year=model_year,
        manufacturer=_text(row.get("Manufacturer")),
        body_class=_text(row.get("BodyClass")),
        vehicle_type=_text(row.get("VehicleType")),
        fuel_type=_text(row.get("FuelTypePrimary")),
        electrification_level=_text(row.get("ElectrificationLevel")),
        engine_cylinders=_int(row.get("EngineCylinders")),
        displacement_l=displacement_l,
        displacement_cc=displacement_cc,
        engine_kw=engine_kw,
        horse_power=horse_power,
        drive_type=_text(row.get("DriveType")),
        transmission_style=_text(row.get("TransmissionStyle")),
        plant_country=_text(row.get("PlantCountry")),
        plant_city=_text(row.get("PlantCity")),
        error_code=error_code,
        error_text=error_text,
    )


async def decode_vin(vin: str) -> VinDecodeResult:
    normalized = normalize_vin(vin)
    if not validate_vin(normalized):
        return VinDecodeResult(
            status=VinDecodeStatus.INVALID_VIN,
            vin=normalized,
            error_text="VIN must contain exactly 17 valid VIN characters",
        )

    url = f"{VPIC_BASE_URL}/DecodeVinValuesExtended/{normalized}"
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(10.0)) as client:
            response = await client.get(url, params={"format": "json"})
            response.raise_for_status()
            payload = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        return VinDecodeResult(
            status=VinDecodeStatus.PROVIDER_ERROR,
            vin=normalized,
            error_text=str(exc),
        )

    if not isinstance(payload, dict):
        return VinDecodeResult(
            status=VinDecodeStatus.PROVIDER_ERROR,
            vin=normalized,
            error_text="NHTSA vPIC returned an invalid response",
        )
    return parse_vpic_result(payload, normalized)
