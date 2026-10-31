"""Back up legacy calculator data, seed the shared PostgreSQL directory, and reset it."""

import json
import os
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

from sqlalchemy import text

from app.core.db import SessionLocal
from app.models.calculation import Calculation
from app.models.vehicle_catalog_state import VehicleCatalogState
from app.models.vehicle_make_model import VehicleMakeModel
from app.models.vehicle_power_observation import VehiclePowerObservation


APP_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = APP_DIR / "data"
BACKUP_DIR = DATA_DIR / "backups"
CATALOG_PATH = DATA_DIR / "vehicle_catalog.json"
CATALOG_BACKUP_PATH = BACKUP_DIR / "vehicle_catalog_before_reset_2026-10-31.json"


def _write_json_atomic(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temp_path = path.with_suffix(path.suffix + ".tmp")
    with temp_path.open("w", encoding="utf-8", newline="\n") as stream:
        json.dump(payload, stream, ensure_ascii=False, indent=2, default=str)
        stream.write("\n")
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temp_path, path)


def _calculation_record(row: Calculation) -> dict[str, Any]:
    return {column.name: getattr(row, column.name) for column in Calculation.__table__.columns}


def _clear_legacy_technical_catalog() -> None:
    catalog = json.loads(CATALOG_PATH.read_text(encoding="utf-8"))
    for key in (
        "bmw_variants",
        "tesla_power_variants",
        "tesla_power_reference_rows",
        "vehicle_specifications",
    ):
        catalog[key] = []
    catalog["vehicle_specifications_version"] = date.today().isoformat()
    catalog["updated_at"] = date.today().isoformat()
    _write_json_atomic(CATALOG_PATH, catalog)


def main() -> None:
    if not CATALOG_BACKUP_PATH.is_file():
        raise SystemExit(f"Required verified catalog backup is missing: {CATALOG_BACKUP_PATH}")
    if not CATALOG_PATH.is_file():
        raise SystemExit(f"Active catalog file is missing: {CATALOG_PATH}")

    original_catalog = json.loads(CATALOG_BACKUP_PATH.read_text(encoding="utf-8"))
    make_model_records = original_catalog.get("make_model_records")
    if not isinstance(make_model_records, list) or not make_model_records:
        raise SystemExit("Catalog backup has no make/model directory; refusing to reset")

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    history_backup_path = BACKUP_DIR / f"postgres_before_reset_{timestamp}.json"
    if history_backup_path.exists():
        raise SystemExit(f"Calculation backup already exists: {history_backup_path}")

    db = SessionLocal()
    try:
        calculations = db.query(Calculation).order_by(Calculation.id).all()
        observations = db.query(VehiclePowerObservation).order_by(VehiclePowerObservation.id).all()
        make_models = db.query(VehicleMakeModel).order_by(VehicleMakeModel.id).all()
        catalog_state = db.query(VehicleCatalogState).filter(VehicleCatalogState.id == 1).first()
        backup_payload = {
            "schema_version": 2,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "database": "PostgreSQL",
            "tables": {
                "calculations": [_calculation_record(row) for row in calculations],
                "vehicle_power_observations": [
                    {column.name: getattr(row, column.name) for column in VehiclePowerObservation.__table__.columns}
                    for row in observations
                ],
                "vehicle_make_models": [
                    {column.name: getattr(row, column.name) for column in VehicleMakeModel.__table__.columns}
                    for row in make_models
                ],
                "vehicle_catalog_state": (
                    {"id": catalog_state.id, "payload": catalog_state.payload}
                    if catalog_state else None
                ),
            },
            "record_counts": {
                "calculations": len(calculations),
                "vehicle_power_observations": len(observations),
                "vehicle_make_models": len(make_models),
                "vehicle_catalog_state": int(catalog_state is not None),
            },
        }
        _write_json_atomic(history_backup_path, backup_payload)
        verified_backup = json.loads(history_backup_path.read_text(encoding="utf-8"))
        verified_tables = verified_backup.get("tables", {})
        verified_counts = verified_backup.get("record_counts", {})
        if any(
            verified_counts.get(name) != len(verified_tables.get(name, []))
            for name in ("calculations", "vehicle_power_observations", "vehicle_make_models")
        ):
            raise SystemExit("Calculation backup verification failed; database was not reset")

        if db.query(VehicleMakeModel).count() == 0:
            db.add_all(
                VehicleMakeModel(
                    make_id=int(item["make_id"]),
                    make=str(item["make"]).strip(),
                    model_id=int(item["model_id"]) if item.get("model_id") is not None else None,
                    model=str(item["model"]).strip(),
                    group_title=str(item.get("group_title") or "").strip(),
                )
                for item in make_model_records
                if item.get("make") and item.get("model")
            )

        if catalog_state is None:
            db.add(VehicleCatalogState(id=1, payload=json.loads(CATALOG_PATH.read_text(encoding="utf-8"))))
        # The make/model lookup remains available. Reset vehicle specifications and
        # both old histories only after their full PostgreSQL snapshot is verified.
        db.execute(text("TRUNCATE TABLE calculations, vehicle_power_observations RESTART IDENTITY"))
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()

    _clear_legacy_technical_catalog()
    print(f"Calculation history backup: {history_backup_path}")
    print(f"Backed up and cleared calculation history rows: {len(calculations)}")
    print(f"Backed up and cleared power observations: {len(observations)}")
    print(f"PostgreSQL make/model directory rows: {len(make_model_records)}")
    print("Vehicle catalogue and future calculation observations are stored in PostgreSQL.")


if __name__ == "__main__":
    main()
