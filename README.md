# MileON Import Calculator

Full-stack Georgia → Russia car import calculator built with FastAPI, Next.js, PostgreSQL and Docker.

The application estimates the total cost of buying a vehicle in Georgia and importing it to Russia for personal use. It combines vehicle price, customs fees, unified customs duty, recycling fee, logistics and optional Russia-market comparison.

> **Important:** calculations are estimates. Customs and recycling rules change over time and must be verified against official sources for the actual declaration date.

## Features

- Personal-use import calculation for passenger cars
- 2026 customs fee bands
- Unified customs rate calculation by vehicle value, engine size and age
- Recycling-fee calculation using engine size, power and powertrain type
- ICE, hybrid, series-hybrid and EV support
- USD / EUR / GEL currency conversion
- myauto.ge vehicle import workflow
- Comparison with an equivalent vehicle price in Russia
- Authenticated calculation history
- Russian, English and Georgian UI
- Docker-based local environment
- Backend regression tests and GitHub Actions CI

## Stack

| Layer | Technology |
|---|---|
| Backend | Python 3.12, FastAPI, SQLAlchemy 2, Alembic |
| Database | PostgreSQL 16 |
| Frontend | Next.js 16, React, TypeScript, Tailwind CSS |
| Validation | Pydantic, Zod |
| Auth | JWT |
| i18n | next-intl |
| Containers | Docker Compose |
| Quality | pytest, Ruff, ESLint, TypeScript |

## Quick start

### Windows / PowerShell

After cloning or pulling the repository, start the complete local stack with:

```powershell
.\start-local.ps1
```

The script:

- verifies Docker and Docker Compose;
- creates `.env` from `.env.example` if necessary;
- builds backend and frontend images;
- starts PostgreSQL and waits until it is healthy;
- creates a SQL backup in `backups/` before database migrations;
- runs `alembic upgrade head` and verifies the migration head;
- starts backend and frontend;
- checks `http://localhost:8000/health`;
- opens the frontend in the default browser.

Optional flags:

```powershell
.\start-local.ps1 -SkipBuild
.\start-local.ps1 -SkipBackup
.\start-local.ps1 -NoBrowser
```

To stop containers without deleting PostgreSQL data:

```powershell
docker compose down
```

Do not use `docker compose down -v` unless you intentionally want to delete the local PostgreSQL volume.

### Manual Docker start

```bash
git clone https://github.com/kingofgeorgia/georgiancarbenefits.git
cd georgiancarbenefits
cp .env.example .env
docker compose up --build
```

Frontend: `http://localhost:3000`

API docs: `http://localhost:8000/docs`

## Development

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
pytest -q
ruff check app tests
uvicorn app.main:app --reload
```

### Frontend

```bash
cd frontend
npm ci
npm run lint
npm run typecheck
npm run build
npm run dev
```

## Calculation model

The current primary calculation path is `backend/app/services/personal_import_customs.py`.

It calculates:

- customs value in RUB / EUR
- customs processing fee
- unified customs duty
- recycling coefficient
- recycling fee
- matched value / engine / power bands for diagnostics

The public calculator endpoint is:

```text
POST /calculator/total
```

A one-off calculation does not require authentication. User-specific functionality such as calculation history can remain authenticated.

## Testing

Regression tests currently cover representative scenarios including:

- premium ICE vehicle control case
- hp → kW conversion
- customs-fee upper band
- 3000 cc boundary condition
- preferential low-power recycling coefficients
- EV with zero engine displacement

Run:

```bash
cd backend
pytest -q
```

## Project structure

```text
georgiancarbenefits/
├── .github/workflows/ci.yml
├── backend/
│   ├── app/
│   │   ├── api/
│   │   ├── core/
│   │   ├── models/
│   │   ├── schemas/
│   │   └── services/
│   ├── tests/
│   └── alembic/
├── frontend/
│   ├── messages/
│   └── src/
├── docs/
├── start-local.ps1
├── docker-compose.yml
└── .env.example
```

## Security

- Never commit `.env` or production secrets.
- Replace example credentials before deployment.
- Do not expose PostgreSQL directly to the internet in production.
- Treat external vehicle and exchange-rate data as untrusted input.

## Roadmap

- exact manufacture-date based age calculation
- official exchange-rate provider with timestamp/staleness metadata
- tariff rulesets moved from Python constants to versioned data files
- deeper myauto.ge enrichment and vehicle-spec lookup
- production Docker profile and reverse proxy
- MileON Cars lead-generation CTA

## License

License not specified yet.
