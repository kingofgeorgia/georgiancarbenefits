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
- Safe Windows `start-local.ps1` startup/migration/backup workflow.
- Production-specific backend and frontend Dockerfiles.
- Production Docker Compose stack with Caddy HTTPS reverse proxy and internal-only database/application ports.
- Production environment template and deployment/backup documentation.
- Production configuration tests and production-Docker CI validation.
- MileON Deal Score with savings percentage, rating and Russia-market position.
- MileON lead-generation CTA with prefilled vehicle/calculation context.
- Configurable `NEXT_PUBLIC_MILEON_CONTACT_URL` for production lead routing.
- Deal Score formula and API documentation.
- Official Auto.ru Business Appraisal.API provider for automatic Russia-market comparison.
- Russia-market comparison metadata: sample size, market boundaries, mileage-adjusted average, middle-band midpoint, source and check time.
- Explicit market-provider statuses so market-data failures never block customs calculations.
- Market-provider regression tests based on the documented Auto.ru Business appraisal response.
- Russian-market provider setup and data-policy documentation.
- Free NHTSA vPIC VIN decoder with normalized make/model/year, engine, power and electrification metadata.
- Public `POST /cars/from-vin` endpoint and calculator VIN autofill workflow.
- VIN decoder regression tests and provider documentation.
- GitHub Actions CI for backend, frontend and PowerShell syntax.
- Frontend typecheck script.

### Changed
- Public calculator no longer requires authentication.
- myauto make/model/from-URL flows can support the public calculator without login.
- Catalog estimates now use the same canonical calculation engine as the calculator.
- Saved history now uses and stores the same calculation path shown to the user.
- Calculator UI now collects horsepower, powertrain type, optional manufacture date and optional mileage.
- Calculator can use either myauto.ge listing data or VIN-decoded make/model as vehicle identity for market comparison.
- Results display customs processing fee, total customs cost, age-estimation warning, tariff version and exchange-rate source metadata.
- Russia-market reference price now powers a structured Deal Score while preserving `savings_vs_rf_rub` compatibility.
- When no manual reference is supplied, the calculator can automatically obtain a Russia-market reference from Auto.ru Business.
- Manual Russia-market price is now an explicit override over automatic market appraisal.
- Deal Score results identify whether the reference was manual or supplied by Auto.ru Business.
- Appraisal.API median is no longer implied: statistical median remains `null`; middle-band midpoint is exposed under its own name.
- Pure EVs no longer pass through the ICE EUR/cc unified-rate formula.
- Corrected 2026 low-power recycling coefficients for 3001–3500 cc and >3500 cc personal imports.
- Exchange rates no longer silently fall back to hard-coded RUB values.
- Next.js supports standalone production output.
- Production backend fails fast on weak JWT/database secrets and unsafe frontend origins.

### Removed
- Obsolete `backend/app/services/customs.py` legacy calculation path.
- Obsolete `backend/app/services/recycling.py` legacy calculation path.

### Planned
- Shareable public Deal Page with vehicle, calculation, Deal Score and MileON CTA.
- Expand curated/learned vehicle specification coverage.
- Improve comparable matching with richer generation/body/engine attributes.
- Persist market-comparison snapshots in authenticated history.
- Production observability, external backups and automated deployment.
