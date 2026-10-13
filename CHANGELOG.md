# Changelog

All notable changes to this project will be documented in this file.

## Unreleased

### Added
- Precise personal-use import calculation path for 2026 scenarios.
- Horsepower and powertrain-aware recycling-fee calculation.
- Pure-EV aggregate customs-payment calculation with separate import duty, excise and VAT.
- Optional exact manufacture date with explicit year-only estimation metadata.
- Versioned Russia tariff data under `backend/app/data/tariffs/ru/`.
- Official Bank of Russia exchange-rate integration with effective date and stale-cache metadata.
- Richer myauto.ge normalization, model directory support, image lists and curated vehicle-spec fallbacks.
- Precise calculation snapshot fields and Alembic migration for history reproducibility.
- Regression tests for customs/recycling boundaries, exact vehicle age, CBR parsing and EV calculations.
- Legal/data-source documentation.
- GitHub Actions CI for backend and frontend.
- Frontend typecheck script.

### Changed
- Public calculator no longer requires authentication.
- myauto make/model/from-URL flows can support the public calculator without login.
- Catalog estimates now use the same canonical calculation engine as the calculator.
- Saved history now uses and stores the same calculation path shown to the user.
- Calculator UI now collects horsepower, powertrain type and optional manufacture date.
- Results display customs processing fee, total customs cost, age-estimation warning, tariff version and exchange-rate source metadata.
- Pure EVs no longer pass through the ICE EUR/cc unified-rate formula.
- Corrected 2026 low-power recycling coefficients for 3001–3500 cc and >3500 cc personal imports.
- Exchange rates no longer silently fall back to hard-coded RUB values.

### Removed
- Obsolete `backend/app/services/customs.py` legacy calculation path.
- Obsolete `backend/app/services/recycling.py` legacy calculation path.

### Planned
- Production-specific Docker configuration and stricter production secret validation.
- Expand curated/learned vehicle specification coverage.
