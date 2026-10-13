# MileON Import Calculator

Full-stack Georgia → Russia car import calculator built with FastAPI, Next.js, PostgreSQL and Docker.

The application estimates the total cost of buying a vehicle in Georgia and importing it to Russia for personal use. It combines vehicle price, customs fees, unified customs duty, recycling fee, logistics and optional Russia-market comparison.

> **Important:** calculations are estimates. Customs and recycling rules change over time and must be verified against official sources for the actual declaration date.

## Features

- Personal-use import calculation for passenger cars
- Versioned 2026 customs and recycling rules
- Exact manufacture-date support with year-only estimation warnings
- ICE, hybrid, series-hybrid and EV calculation paths
- Official Bank of Russia exchange rates with source/staleness metadata
- myauto.ge vehicle import workflow
- Comparison with an equivalent vehicle price in Russia
- Authenticated calculation history
- Russian, English and Georgian UI
- Docker-based local and production environments
- Backend/frontend/PowerShell/production-Docker CI checks

## Stack

| Layer | Technology |
|---|---|
| Backend | Python 3.12, FastAPI, SQLAlchemy 2, Alembic |
| Database | PostgreSQL 16 |
| Frontend | Next.js 16, React, TypeScript, Tailwind CSS |
| Validation | Pydantic, Zod |
| Auth | JWT |
| i18n | next-intl |
| Reverse proxy / TLS | Caddy |
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

### Manual local Docker start

```bash
git clone https://github.com/kingofgeorgia/georgiancarbenefits.git
cd georgiancarbenefits
cp .env.example .env
docker compose up --build
```

Frontend: `http://localhost:3000`

API docs: `http://localhost:8000/docs`

## Production Docker

Production is isolated from the development Compose stack.

```bash
cp .env.production.example .env.production
# Edit APP_DOMAIN, FRONTEND_ORIGIN, SECRET_KEY and POSTGRES_PASSWORD.

docker compose --env-file .env.production -f docker-compose.prod.yml config
docker compose --env-file .env.production -f docker-compose.prod.yml build
docker compose --env-file .env.production -f docker-compose.prod.yml up -d postgres
docker compose --env-file .env.production -f docker-compose.prod.yml run --rm backend alembic upgrade head
docker compose --env-file .env.production -f docker-compose.prod.yml up -d
```

In production:

- Caddy is the only service publishing host ports (80/443);
- PostgreSQL is not exposed to the internet;
- FastAPI and Next.js are reachable only through the internal Docker network;
- Caddy terminates HTTPS and proxies `/api/*` to FastAPI;
- the backend refuses unsafe production secrets/origins.

See [`docs/production.md`](docs/production.md) for the complete deployment, update, backup and verification procedure.

## Development

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python -m pytest -q
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

The canonical calculation path is `backend/app/services/personal_import_customs.py`.

It calculates and records:

- vehicle customs value;
- customs processing fee;
- unified customs duty or EV aggregate customs payment;
- EV duty/excise/VAT breakdown when applicable;
- recycling coefficient and fee;
- exact/estimated vehicle age metadata;
- tariff ruleset version;
- exchange-rate source and effective date.

The public calculator endpoint is:

```text
POST /calculator/total
```

A one-off calculation does not require authentication. User-specific functionality such as calculation history remains authenticated.

## Testing

Regression tests cover representative calculation scenarios and boundary conditions. CI also validates the frontend build, PowerShell local-start script and production Docker configuration/images.

Run backend checks locally:

```bash
cd backend
ruff check app tests
python -m pytest -q
```

## Project structure

```text
georgiancarbenefits/
├── .github/workflows/ci.yml
├── backend/
│   ├── app/
│   ├── tests/
│   ├── alembic/
│   ├── Dockerfile
│   └── Dockerfile.prod
├── frontend/
│   ├── messages/
│   ├── src/
│   ├── Dockerfile
│   └── Dockerfile.prod
├── docs/
│   ├── calculation-rules.md
│   ├── legal-sources.md
│   └── production.md
├── Caddyfile
├── start-local.ps1
├── docker-compose.yml
├── docker-compose.prod.yml
├── .env.example
└── .env.production.example
```

## Security

- Never commit `.env`, `.env.production` or production secrets.
- Production rejects weak JWT/database credentials and non-HTTPS frontend origins.
- PostgreSQL has no published production host port.
- Production application containers run behind Caddy rather than being exposed directly.
- Treat external vehicle and exchange-rate data as untrusted input.

## Roadmap

- expand curated/learned vehicle specification coverage;
- add Russian-market comparable search and deal score;
- add MileON Cars lead-generation CTA;
- add production observability, backups and automated deployment;
- add branch protection / required CI checks for `main`.

## License

License not specified yet.
