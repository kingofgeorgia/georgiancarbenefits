# PostgreSQL vehicle catalogue reset

The active make/model directory, vehicle catalogue payload, customs history, and
calculation observations use the same PostgreSQL database configured by
`DATABASE_URL`.

Before resetting, the legacy JSON vehicle catalogue was copied to
`backend/app/data/backups/vehicle_catalog_before_reset_2026-10-31.json`.
The reset command creates a timestamped PostgreSQL export in the same backup
folder before deleting any rows from `calculations` or
`vehicle_power_observations`. It retains users, tariff data, make/model lookup
records, and the PostgreSQL catalogue row.

Apply the migration and perform the one-time reset from the project directory:

```powershell
docker compose exec backend alembic upgrade head
docker compose exec backend python -m app.scripts.backup_reset_legacy_data
```

Each successful `/calculator/total` calculation and each saved history
calculation appends the complete request and result to
`vehicle_power_observations`. Missing horsepower can be filled only when make,
model, year, engine displacement, and powertrain match exactly. Conflicting
power values remain unresolved and are reported to the calculator.
