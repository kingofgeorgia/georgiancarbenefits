"""Reviewed, source-linked modifications. Missing identity never means a match."""

import re
import unicodedata
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from app.schemas.vehicle_specs import VehicleSpecification, VehicleSpecificationCatalog


@dataclass(frozen=True)
class ResolvedVehicleSpec:
    entry: VehicleSpecification
    source: str = "spec_catalog"

    @property
    def horse_power(self) -> float:
        return self.entry.horse_power

    @property
    def powertrain_kind(self):
        return self.entry.powertrain_kind


_DATA_FILE = Path(__file__).resolve().parent.parent / "data" / "vehicle_specs.json"
CATALOG = VehicleSpecificationCatalog.model_validate_json(_DATA_FILE.read_text(encoding="utf-8"))


def _normalize(value: Any) -> str:
    text = unicodedata.normalize("NFKD", str(value or "").casefold())
    return " ".join(re.sub(r"[^a-z0-9]+", " ", text).split())


def _contains(text: str, token: str) -> bool:
    return f" {_normalize(token)} " in f" {_normalize(text)} "


def find_specifications(*, make: str | None = None, model: str | None = None, year: int | None = None) -> list[VehicleSpecification]:
    return [entry for entry in CATALOG.items
            if (not make or _normalize(entry.make) == _normalize(make))
            and (not model or _normalize(entry.model) == _normalize(model))
            and (year is None or entry.year_from <= year <= entry.year_to)]


def _drive(value: str | None) -> str | None:
    normalized = _normalize(value)
    return {
        "fwd": "FWD", "front wheel drive": "FWD", "fwd front wheel drive": "FWD",
        "rwd": "RWD", "rear wheel drive": "RWD", "rwd rear wheel drive": "RWD",
        "awd": "AWD", "4wd": "AWD", "4x4": "AWD",
        "awd all wheel drive": "AWD", "all wheel drive": "AWD",
        "4wd 4 wheel drive 4x4": "AWD",
    }.get(normalized)


def resolve_vehicle_spec_by_identity(
    *, make: str | None, model: str | None, year: int | None,
    engine_cc: int | None = None, trim: str | None = None, series: str | None = None,
    market: str | None = None, fuel: str | None = None, drive: str | None = None,
) -> ResolvedVehicleSpec | None:
    if not all((make, model, year, engine_cc, market, fuel, drive)):
        return None
    fuel_kind = {"gasoline": "PETROL", "petrol": "PETROL", "diesel": "DIESEL"}.get(_normalize(fuel))
    candidates = []
    for entry in find_specifications(make=make, model=model, year=year):
        if entry.powertrain_kind != "ICE" or entry.power_basis != "ENGINE_NET":
            continue
        if entry.engine_cc is None or entry.engine_cc != engine_cc:
            continue
        if entry.market != str(market).upper() or entry.fuel != fuel_kind or entry.drive != _drive(drive):
            continue
        identity = " ".join(part for part in (trim, series) if part)
        if any(_contains(identity, alias) for alias in entry.trim_aliases):
            candidates.append(entry)
    # A growing catalogue must not resolve conflicts by row order or score.
    return ResolvedVehicleSpec(candidates[0]) if len(candidates) == 1 else None


def resolve_vehicle_spec(raw: dict[str, Any]) -> ResolvedVehicleSpec | None:
    try:
        year = int(raw.get("prod_year") or 0)
        engine_cc = int(raw.get("engine_volume") or 0)
        fuel_id = int(raw.get("fuel_type_id") or 0)
    except (ValueError, TypeError, OverflowError):
        return None
    return resolve_vehicle_spec_by_identity(
        make=raw.get("man_name") or raw.get("make"),
        model=raw.get("model_name") or raw.get("car_model"),
        year=year, engine_cc=engine_cc,
        trim=raw.get("trim_name"), series=raw.get("series"),
        market=raw.get("market"), fuel={2: "Petrol", 3: "Diesel"}.get(fuel_id),
        drive=raw.get("drive_type"),
    )
