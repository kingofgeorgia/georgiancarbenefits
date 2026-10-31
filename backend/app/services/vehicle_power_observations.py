import re
import unicodedata
from decimal import Decimal
from typing import Any

from sqlalchemy.orm import Session

from app.models.vehicle_power_observation import VehiclePowerObservation
from app.schemas.calculator import CalculatorInput, CalculatorResult


def normalize_vehicle_name(value: str) -> str:
    """Normalize case and whitespace while retaining exact punctuation and wording."""
    normalized = unicodedata.normalize("NFKC", value).casefold()
    return re.sub(r"\s+", " ", normalized).strip()


def record_calculation_observation(
    db: Session,
    payload: CalculatorInput,
    result: CalculatorResult | dict[str, Any],
) -> VehiclePowerObservation | None:
    make = (payload.source_make or "").strip() or None
    model = (payload.source_model or "").strip() or None

    powertrain_kind = str(payload.powertrain_kind or "ICE")
    is_electric_regulatory_power = powertrain_kind in {"EV", "SERIES_HYBRID"}
    request_snapshot = payload.model_dump(mode="json")
    result_snapshot = (
        result.model_dump(mode="json") if isinstance(result, CalculatorResult) else result
    )
    observation = VehiclePowerObservation(
        make=make,
        model=model,
        make_key=normalize_vehicle_name(make) if make else None,
        model_key=normalize_vehicle_name(model) if model else None,
        car_year=payload.car_year,
        engine_volume_cc=payload.engine_volume_cc,
        powertrain_kind=powertrain_kind,
        horse_power=None if is_electric_regulatory_power else payload.horse_power,
        electric_power_kw=payload.electric_power_kw if is_electric_regulatory_power else None,
        source_trim=payload.source_trim,
        source_url=payload.source_url,
        calculation_snapshot={"request": request_snapshot, "result": result_snapshot},
    )
    db.add(observation)
    db.flush()
    return observation


def lookup_calculated_power(
    db: Session,
    *,
    make: str,
    model: str,
    car_year: int,
    engine_volume_cc: int,
    powertrain_kind: str,
) -> dict[str, Any]:
    rows = (
        db.query(VehiclePowerObservation)
        .filter(
            VehiclePowerObservation.make_key == normalize_vehicle_name(make),
            VehiclePowerObservation.model_key == normalize_vehicle_name(model),
            VehiclePowerObservation.car_year == car_year,
            VehiclePowerObservation.engine_volume_cc == engine_volume_cc,
            VehiclePowerObservation.powertrain_kind == powertrain_kind,
        )
        .order_by(VehiclePowerObservation.created_at.desc(), VehiclePowerObservation.id.desc())
        .all()
    )
    power_field = "electric_power_kw" if powertrain_kind in {"EV", "SERIES_HYBRID"} else "horse_power"
    values = sorted(
        {
            Decimal(str(value)).quantize(Decimal("0.01"))
            for row in rows
            if (value := getattr(row, power_field)) is not None
        }
    )
    common = {
        "make": make,
        "model": model,
        "car_year": car_year,
        "engine_volume_cc": engine_volume_cc,
        "powertrain_kind": powertrain_kind,
        "matching_calculations": len(rows),
    }
    if not values:
        return {**common, "status": "NOT_FOUND", "horse_power": None, "electric_power_kw": None, "options": []}
    if len(values) > 1:
        return {
            **common,
            "status": "CONFLICT",
            "horse_power": None,
            "electric_power_kw": None,
            "options": [float(value) for value in values],
        }
    power = float(values[0])
    return {
        **common,
        "status": "MATCH",
        "horse_power": None if power_field != "horse_power" else power,
        "electric_power_kw": None if power_field != "electric_power_kw" else power,
        "options": [power],
    }
