from __future__ import annotations

import asyncio
import re
import time
from dataclasses import dataclass
from enum import StrEnum
from typing import TYPE_CHECKING, Any, Literal

import httpx

from app.core.config import settings
from app.services.personal_import_customs import PowertrainKind

if TYPE_CHECKING:
    from app.schemas.vehicle_specs import VehicleSpecification


VIN_RE = re.compile(r"^[A-HJ-NPR-Z0-9]{17}$")
METRIC_HP_PER_KW = 1.3596216173
# Common Cyrillic lookalikes that can appear when VINs are copied/typed with a RU keyboard.
_CYRILLIC_VIN_TRANSLATION = str.maketrans(
    {
        "А": "A",
        "В": "B",
        "С": "C",
        "Е": "E",
        "Н": "H",
        "К": "K",
        "М": "M",
        "Р": "P",
        "Т": "T",
        "Х": "X",
        "а": "A",
        "в": "B",
        "с": "C",
        "е": "E",
        "н": "H",
        "к": "K",
        "м": "M",
        "р": "P",
        "т": "T",
        "х": "X",
    }
)


class VinDecodeStatus(StrEnum):
    COMPLETE = "COMPLETE"
    PARTIAL = "PARTIAL"
    NOT_FOUND = "NOT_FOUND"
    PROVIDER_ERROR = "PROVIDER_ERROR"


VinTrimSource = Literal["NHTSA_VPIC", "VIN_PATTERN"]


@dataclass(frozen=True)
class VinDecodeResult:
    status: VinDecodeStatus
    vin: str
    make: str | None = None
    model: str | None = None
    model_year: int | None = None
    trim: str | None = None
    trim_secondary: str | None = None
    trim_source: VinTrimSource | None = None
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
    power_reference: VehicleSpecification | None = None
    electric_power_kw: float | None = None
    electric_power_kw_source: str | None = None
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
    return vin.translate(_CYRILLIC_VIN_TRANSLATION).strip().upper().replace(" ", "")


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


def _trim_text(value: Any) -> str | None:
    text = _text(value)
    if text is None or text.casefold() in {"n/a", "unknown", "not available", "not provided", "null", "none"}:
        return None
    return text


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


def _known_trim_from_vin(vin: str, make: str | None, model: str | None, model_year: int | None) -> tuple[str | None, str | None]:
    normalized_make = (make or "").strip().casefold()
    normalized_model = (model or "").strip().casefold()
    # Tesla manufacturer/VIN-pattern data identifies 7SAYGDEF + model-year code
    # as Model Y Performance for the pre-Juniper US-market generation.
    if (
        normalized_make == "tesla"
        and normalized_model == "model y"
        and vin.startswith("7SAYGDEF")
        and model_year is not None
        and 2022 <= model_year <= 2025
    ):
        return "Performance AWD", "AWD/All-Wheel Drive"
    return None, None


def parse_vpic_result(payload: dict[str, Any], vin: str) -> VinDecodeResult:
    from app.services.vehicle_specs import resolve_vehicle_spec_by_identity

    vin = normalize_vin(vin)
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
    trim = _trim_text(row.get("Trim"))
    trim_secondary = _trim_text(row.get("Trim2"))
    if trim is None:
        trim, trim_secondary = trim_secondary, None
    if trim and trim_secondary and trim.casefold() == trim_secondary.casefold():
        trim_secondary = None
    trim_source: VinTrimSource | None = "NHTSA_VPIC" if trim else None
    series = _text(row.get("Series"))
    powertrain_kind = _resolve_powertrain(row)

    if not any((make, model, model_year)):
        return VinDecodeResult(
            status=VinDecodeStatus.NOT_FOUND,
            vin=vin,
            error_code=error_code,
            error_text=error_text or "VIN could not be decoded",
        )

    known_trim, known_drive = _known_trim_from_vin(vin, make, model, model_year)
    if trim is None and known_trim is not None:
        trim = known_trim
        trim_source = "VIN_PATTERN"

    displacement_l = _float(row.get("DisplacementL"))
    displacement_cc = _int(row.get("DisplacementCC"))
    if displacement_cc is None and displacement_l is not None:
        displacement_cc = int(round(displacement_l * 1000))
    if powertrain_kind == "EV":
        displacement_cc = 0

    engine_kw = _float(row.get("EngineKW"))
    horse_power = _float(row.get("EngineHP"))
    horse_power_source = "nhtsa_engine_hp" if horse_power is not None else None

    if horse_power is None:
        horse_power = _float(row.get("EngineHP_to"))
        if horse_power is not None:
            horse_power_source = "nhtsa_engine_hp_to"

    if horse_power is None and engine_kw is not None:
        horse_power = round(engine_kw * METRIC_HP_PER_KW, 2)
        horse_power_source = "nhtsa_engine_kw_reference"

    # Curated horsepower is useful as a reference for ICE vehicles. For EVs it
    # must never be treated as the Russian regulatory 30-minute traction power.
    power_reference = None
    if horse_power is None and powertrain_kind == "ICE":
        spec = resolve_vehicle_spec_by_identity(
            make=make,
            model=model,
            year=model_year,
            engine_cc=displacement_cc,
            trim=trim,
            series=series,
            market="US",
            fuel=_text(row.get("FuelTypePrimary")),
            drive=_text(row.get("DriveType")),
        )
        if spec is not None:
            horse_power = float(spec.horse_power)
            horse_power_source = spec.source
            power_reference = spec.entry
            if powertrain_kind is None and spec.powertrain_kind is not None:
                powertrain_kind = spec.powertrain_kind
                if powertrain_kind == "EV":
                    displacement_cc = 0

    # vPIC's EngineKW/EngineHP are not guaranteed to be the maximum 30-minute
    # traction power required by Russian EV excise/recycling rules. Keep the
    # regulatory field empty unless a future authoritative provider supplies it.
    electric_power_kw = None
    electric_power_kw_source = None

    if powertrain_kind in ("EV", "SERIES_HYBRID"):
        complete_for_calculator = bool(make and model and model_year and electric_power_kw)
    else:
        complete_for_calculator = bool(
            make
            and model
            and model_year
            and horse_power
            and displacement_cc is not None
            and displacement_cc > 0
        )

    status = VinDecodeStatus.COMPLETE if complete_for_calculator else VinDecodeStatus.PARTIAL
    warning = None
    if status == VinDecodeStatus.PARTIAL:
        if powertrain_kind in ("EV", "SERIES_HYBRID"):
            warning = (
                "VIN decoded. Russian EV calculations require the maximum 30-minute traction power "
                "from OTTS/SBKTS/ZOETS/EPTS; advertised or peak power is not substituted automatically."
            )
        else:
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
        trim_secondary=trim_secondary,
        trim_source=trim_source,
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
        power_reference=power_reference,
        electric_power_kw=electric_power_kw,
        electric_power_kw_source=electric_power_kw_source,
        drive_type=_text(row.get("DriveType")) or known_drive,
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
    except (httpx.HTTPError, ValueError):
        return VinDecodeResult(
            status=VinDecodeStatus.PROVIDER_ERROR,
            vin=normalized,
            error_text="NHTSA vPIC is temporarily unavailable",
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
            expired = [key for key, (expires, _) in _cache.items() if expires <= now]
            for key in expired:
                del _cache[key]
            if normalized not in _cache and len(_cache) >= 2048:
                del _cache[next(iter(_cache))]
            _cache[normalized] = (now + settings.nhtsa_vpic_cache_ttl_seconds, result)
    return result
