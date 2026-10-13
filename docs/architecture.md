# Architecture

MileON Import Calculator is a modular monolith with three primary runtime components:

1. Next.js frontend
2. FastAPI backend
3. PostgreSQL database

## Backend

The backend is split into:

- `app/api` — HTTP routes and request/response orchestration
- `app/core` — configuration, database and security
- `app/models` — SQLAlchemy persistence models
- `app/schemas` — Pydantic API contracts
- `app/services` — calculation and external integration logic

The current personal-import calculation engine is isolated in `app/services/personal_import_customs.py`. It is deterministic and does not perform network requests.

## Frontend

The frontend uses the Next.js App Router and next-intl. Server state is handled through TanStack Query; forms use react-hook-form and Zod.

## External data

External providers such as myauto.ge and exchange-rate APIs must stay outside pure calculation logic. Network failures must not silently change customs formulas.

## Target direction

The next architectural step is to move tariff tables into versioned data files and introduce explicit integration providers for exchange rates and vehicle-data enrichment.
