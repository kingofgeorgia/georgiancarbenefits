# Shared PostgreSQL vehicle catalog and calculation records

The vehicle make/model directory, saved calculation history, and learned vehicle-power observations use the same PostgreSQL database configured by `POSTGRES_DB`.

- `vehicle_make_models` holds the make/model directory needed by the calculator selectors.
- `calculations` remains the user's saved tax-calculation history.
- `vehicle_power_observations` appends a snapshot after each successful calculation. It also acts as the learned power catalog.

The calculator fills horsepower or electric power only when make, model, year, engine displacement, and powertrain match exactly after case and whitespace normalization. If previous calculations for that exact key disagree on power, the calculator leaves the field empty and shows a warning.

## Initial backup and reset

The legacy unified catalog is backed up to `backend/app/data/backups/vehicle_catalog_before_reset_2026-10-31.json`. After the PostgreSQL migration, run this one-time script to export calculation history, seed the make/model directory into PostgreSQL, clear the legacy technical catalog, and empty the old calculation history:

```powershell
docker compose exec backend alembic upgrade head
docker compose exec backend python -m app.scripts.backup_reset_legacy_data
docker compose restart backend frontend
```

The script refuses to reset if the new observation table already contains records. Calculation history is exported to a timestamped JSON file in `backend/app/data/backups` before the table is truncated. The make/model directory is retained in PostgreSQL so the calculator selectors keep working; the legacy technical specifications are cleared.
