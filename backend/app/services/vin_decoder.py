import asyncio
import re
import time
from dataclasses import dataclass
from enum import StrEnum
from typing import Any

import httpx

from app.core.config import settings
from app.services.personal_import_customs import PowertrainKind
from app.services.vehicle_specs import resolve_vehicle_spec_by_identity


VIN_RE = re.compile(r"^[A-HJ-NPR-Z0-9]{17}$")
METRIC_HP_PER_KW = 1.3596216173


class VinDecodeStatus(StrEnum):
    COMPLETE = "COMPLETE"
    PARTIAL = "PARTIAL"
    NOT_FOUND = "NOT_FOUND"
    PROVIDER_ERROR = "PROVIDER_ERROR"


@dataclass(frozen=True)
class VinDecodeResult:
    status: VinDecodeStatus
    vin: str
    make: str | None = None
    model: str | None = None
    model_year: int | None = None
    trim: str | None = None
    series: str | None = None
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
    horse_power_source: str | None = None
    drive_type: str | None = None
    transmission_style: str | None = None
    plant_country: str | None = None
    plant_city: str | None = None
    powertrain_kind: PowertrainKind | None = None
    complete_for_calculator: bool = False
    error_code: str | None = None
    error_text: str | None = None
    warning: str | None = None
    source: str = "NHTSA vPIC"


_cache: dict[str, tuple[float, VinDecodeResult]] = {}
_cache_lock = asyncio.Lock()


def normalize_vin(vin: str) -> str:
    return vin.strip().upper().replace(" ", "")


def validate_vin(vin: str) -> bool:
    return bool(VIN_RE.fullmatch(normalize_vin(vin)))


def _text(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text or text.casefold() == "not applicable":
        return None
    return text


def _float(value: Any) -> float | None:
    text = _text(value)
    if text is None:
        return None
    try:
        number = float(text)
    except (TypeError, ValueError):
        return None
    return number if number >= 0 else None


def _int(value: Any) -> int | None:
    number = _float(value)
    if number is None:
        return None
    return int(round(number))


def _resolve_powertrain(row: dict[str, Any]) -> PowertrainKind | None:
    fuel = (_text(row.get("FuelTypePrimary")) or "").casefold()
    secondary = (_text(row.get("FuelTypeSecondary")) or "").casefold()
    electrification = (_text(row.get("ElectrificationLevel")) or "").casefold()

    if "bev" in electrification or "battery electric" in electrification:
        return "EV"
    if fuel == "electric" and not secondary:
        return "EV"
    if any(token in electrification for token in ("hybrid", "hev", "phev")):
        return "OTHER_HYBRID"
    if "electric" in fuel or "electric" in secondary:
        return "OTHER_HYBRID"
    if fuel:
        return "ICE"
    return None


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
    trim = _text(row.get("Trim"))
    series = _text(row.get("Series"))
    powertrain_kind = _resolve_powertrain(row)

    if not any((make, model, model_year)):
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
    if powertrain_kind == "EV":
        displacement_cc = 0

    engine_kw = _float(row.get("EngineKW"))
    horse_power = _float(row.get("EngineHP"))
    horse_power_source = "nhtsa_engine_hp" if horse_power is not None else None

    # vPIC exposes an EngineHP_to field as well. Some manufacturer records fill
    # only this side of the horsepower range, so do not discard it.
    if horse_power is None:
        horse_power = _float(row.get("EngineHP_to"))
        if horse_power is not None:
            horse_power_source = "nhtsa_engine_hp_to"

    if horse_power is None and engine_kw is not None:
        horse_power = round(engine_kw * METRIC_HP_PER_KW, 2)
        horse_power_source = "nhtsa_engine_kw"

    # NHTSA often identifies the exact vehicle but omits power. For curated
    # vehicles, reuse our verified spec catalog rather than leaving the field blank.
    if horse_power is None:
        spec = resolve_vehicle_spec_by_identity(
            make=make,
            model=model,
            year=model_year,
            engine_cc=displacement_cc,
            trim=trim,
            series=series,
        )
        if spec is not None:
            horse_power = float(spec.horse_power)
            horse_power_source = spec.source
            if powertrain_kind is None and spec.powertrain_kind is not None:
                powertrain_kind = spec.powertrain_kind
                if powertrain_kind == "EV":
                    displacement_cc = 0

    complete_for_calculator = bool(
        make
        and model
        and model_year
        and horse_power
        and (powertrain_kind == "EV" or (displacement_cc is not None and displacement_cc > 0))
    )
    status = VinDecodeStatus.COMPLETE if complete_for_calculator else VinDecodeStatus.PARTIAL
    warning = None
    if status == VinDecodeStatus.PARTIAL:
        warning = (
            "VIN decoded partially. Review missing calculator fields manually. "
            "NHTSA vPIC can be incomplete for vehicles not intended for the U.S. market."
        )

    return VinDecodeResult(
        status=status,
        vin=vin,
        make=make,
        model=model,
        model_year=model_year,
        trim=trim,
        series=series,
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
        horse_power_source=horse_power_source,
        drive_type=_text(row.get("DriveType")),
        transmission_style=_text(row.get("TransmissionStyle")),
        plant_country=_text(row.get("PlantCountry")),
        plant_city=_text(row.get("PlantCity")),
        powertrain_kind=powertrain_kind,
        complete_for_calculator=complete_for_calculator,
        error_code=error_code,
        error_text=error_text,
        warning=warning,
    )


async def decode_vin(vin: str) -> VinDecodeResult:
    normalized = normalize_vin(vin)
    if not validate_vin(normalized):
        raise ValueError("VIN must contain exactly 17 valid VIN characters")

    now = time.monotonic()
    async with _cache_lock:
        cached = _cache.get(normalized)
        if cached and cached[0] > now:
            return cached[1]

    url = f"{settings.nhtsa_vpic_api_url.rstrip('/')}/vehicles/DecodeVinValuesExtended/{normalized}"
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(settings.nhtsa_vpic_timeout_seconds)) as client:
            response = await client.get(url, params={"format": "json"}, headers={"Accept": "application/json"})
            response.raise_for_status()
            payload = response.json()
    except (httpx.HTTPError, ValueError) as exc:
        return VinDecodeResult(
            status=VinDecodeStatus.PROVIDER_ERROR,
            vin=normalized,
            error_text=f"NHTSA vPIC is temporarily unavailable: {exc}",
        )

    if not isinstance(payload, dict):
        result = VinDecodeResult(
            status=VinDecodeStatus.PROVIDER_ERROR,
            vin=normalized,
            error_text="NHTSA vPIC returned an invalid response",
        )
    else:
        result = parse_vpic_result(payload, normalized)

    if result.status in {VinDecodeStatus.COMPLETE, VinDecodeStatus.PARTIAL, VinDecodeStatus.NOT_FOUND}:
        async with _cache_lock:
            _cache[normalized] = (now + settings.nhtsa_vpic_cache_ttl_seconds, result)
    return result
