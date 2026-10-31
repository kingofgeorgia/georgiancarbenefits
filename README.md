# MileON Import Calculator

Full-stack Georgia → Russia car import calculator built with FastAPI, Next.js, PostgreSQL and Docker.

The application estimates the total cost of buying a vehicle in Georgia and importing it to Russia for personal use. It combines vehicle price, customs fees, unified customs duty, recycling fee, logistics and Russia-market comparison.

> **Important:** calculations are estimates. Customs and recycling rules change over time and must be verified against official sources for the actual declaration date.

## Development Roadmap

See [ROADMAP.md](ROADMAP.md) for the current development sequence, acceptance
criteria and approval gates. The next stage is the isolated OpenAI characteristics
pilot; its preparation is published, but no pilot API requests have been run yet.

## Features

- Personal-use import calculation for passenger cars
- Versioned 2026 customs and recycling rules
- Manufacture-month support with year-only estimation warnings
- ICE, hybrid, series-hybrid and EV calculation paths
- Official Bank of Russia exchange rates with source/staleness metadata
- myauto.ge vehicle import workflow by listing URL or listing ID
- Free NHTSA vPIC VIN decoder with calculator autofill
- Optional Russia-market comparison through Drom Search API after authorized access is confirmed
- Comparable-market metadata: sample size, min/median/average/max prices, mileage, source and check time
- Manual Russia-market price override for controlled scenarios
- MileON Deal Score (0–100), savings percentage and market-position rating
- Shareable immutable Deal Pages
- MileON lead CTA with prefilled calculation and vehicle context
- Authenticated calculation history
- Russian, English and Georgian UI
- Docker-based local and production environments
- Backend/frontend/PowerShell/production-Docker CI checks

Automatic Drom comparison is optional and intentionally disabled until authorized Drom API/database access is confirmed. Without Drom access, customs/import calculations continue to work and a manual Russia-market reference price can still be used for Deal Score.

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

### Vehicle input

The calculator supports two complementary vehicle-identification paths:

1. paste a `myauto.ge` listing URL **or numeric listing ID** to import listing price, mileage and normalized vehicle data;
2. enter a 17-character VIN to decode available make/model/year/engine/power data through the free NHTSA vPIC API.

VIN data is a convenience input. Exact customs-critical specifications should still be verified against vehicle documents. See [`docs/vin-decoder.md`](docs/vin-decoder.md).

### Optional Drom market comparison

The Drom provider is present but disabled by default:

```env
DROM_API_ACCESS_CONFIRMED=false
DROM_API_AUTH_QUERY_JSON={}
DROM_VEHICLE_ID_MAP_JSON={}
```

Drom documents `GET https://api.drom.ru/v1.2/bulls/search`, but Drom's usage rules restrict automated database extraction without authorized access. Do not enable the provider using scraped pages or reverse-engineered application secrets.

After Drom confirms access for this use case, configure any Drom-issued request parameters and the authorized `firmId`/`modelId` map, then set:

```env
DROM_API_ACCESS_CONFIRMED=true
```

See [`docs/russian-market-provider.md`](docs/russian-market-provider.md) for the complete activation checklist, matching policy, median-price calculation and status handling.

## Production Docker

Production is isolated from the development Compose stack.

```bash
cp .env.production.example .env.production
# Edit APP_DOMAIN, FRONTEND_ORIGIN, SECRET_KEY and POSTGRES_PASSWORD.
# Optionally configure authorized Drom access for automatic Russia-market comparison.

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
- the backend refuses unsafe production secrets/origins;
- `NEXT_PUBLIC_MILEON_CONTACT_URL` controls the public MileON CTA destination;
- any authorized Drom integration parameters remain server-side environment secrets.

See [`docs/production.md`](docs/production.md) for the complete deployment, update, backup and verification procedure.
For running beside the existing GLC Express IIS site through Cloudflare Tunnel, see [`docs/glc-cloudflare-tunnel.md`](docs/glc-cloudflare-tunnel.md) and use `docker-compose.glc-tunnel.yml` instead of publishing Caddy on ports 80/443.

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

### Full-stack E2E

The CI `e2e` job runs Chromium against the production frontend, real FastAPI
routes, and a fresh PostgreSQL database. Only MyAuto, NHTSA and exchange-rate
responses are replaced by deterministic fixtures in `e2e/provider_app.py`.
It covers URL/ID loading, VIN autofill, all four powertrain paths, tax totals,
immutable shared deals opened without authentication, WhatsApp links, and
visible error/recovery states. The `e2e-report` artifact includes the HTML
report, a mobile EV screenshot, and traces/screenshots for failures.

To reproduce against a dedicated local test database, migrate that database,
start the fixture API from the repository root with
`PYTHONPATH=backend uvicorn e2e.provider_app:app --port 8000`, then build/start
the frontend with `NEXT_PUBLIC_API_URL=http://localhost:8000`.
From `frontend`, run `npx playwright install chromium` and `npm run test:e2e`.
Set `E2E_BASE_URL` and `E2E_API_URL` when using different ports. Keep the fixture
API confined to test environments; normal local/production startup continues
to use `app.main:app` and live providers.

## Calculation model

The canonical customs calculation path is `backend/app/services/personal_import_customs.py`.

It calculates and records:

- vehicle customs value;
- customs processing fee;
- unified customs duty or EV aggregate customs payment;
- EV duty/excise/VAT breakdown when applicable;
- recycling coefficient and fee;
- exact/estimated vehicle age metadata;
- tariff ruleset version;
- exchange-rate source and effective date.

`backend/app/services/vin_decoder.py` normalizes VIN data from NHTSA vPIC and can prefill vehicle identity/specification fields before calculation.

`backend/app/services/russian_market.py` optionally requests comparable Drom listings for the known vehicle identity after authorized access is configured. It de-duplicates listings, removes configurable price-tail outliers, calculates min/median/average/max statistics and uses the statistical median as the Deal Score reference. A manual Russia-market price takes precedence when explicitly supplied.

When a Russia-market reference price is available, `backend/app/services/deal_score.py` additionally calculates:

- savings in RUB;
- savings percentage;
- MileON Deal Score from 0 to 100;
- qualitative deal rating;
- market position (below / at / above market).

See [`docs/deal-score.md`](docs/deal-score.md), [`docs/vin-decoder.md`](docs/vin-decoder.md) and [`docs/russian-market-provider.md`](docs/russian-market-provider.md).

The public calculator endpoint is:

```text
POST /calculator/total
```

A one-off calculation does not require authentication. User-specific functionality such as calculation history remains authenticated.

## Testing

Regression tests cover representative customs scenarios, boundary conditions, Deal Score behavior, VIN normalization, Drom market-result normalization and outlier-resistant median calculation. CI also validates the frontend build, PowerShell local-start script and production Docker configuration/images.

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
│   ├── deal-score.md
│   ├── legal-sources.md
│   ├── production.md
│   ├── russian-market-provider.md
│   └── vin-decoder.md
├── Caddyfile
├── start-local.ps1
├── docker-compose.yml
├── docker-compose.prod.yml
├── .env.example
└── .env.production.example
```

## Security

- Never commit `.env`, `.env.production`, API tokens or production secrets.
- Production rejects weak JWT/database credentials and non-HTTPS frontend origins.
- PostgreSQL has no published production host port.
- Production application containers run behind Caddy rather than being exposed directly.
- Treat external vehicle, market-price and exchange-rate data as untrusted input.
- Do not replace authorized Drom integration with public-page scraping or reverse-engineered application credentials.

## Roadmap

- expand vehicle specifications from make/model-only coverage to a reviewed make/model/year/market/trim catalog that can prefill exact engine displacement and verified power; record the source, units and verification date for each entry, require a unique variant match before autofill, and leave ambiguous or unsupported values for manual entry;
- for Tesla EVs, add summed maximum 30-minute motor power per exact version/year from OTTS, SBKTS, ZOETS or EPTS, preserving the motor breakdown and document source; do not reuse one value across variants or fill Cybertruck/Roadster until a matching document is verified;
- keep regulatory 30-minute electric power separate from peak/system power for EVs and series hybrids;
- improve comparable matching with richer generation/body/engine attributes when Drom/source data permits it;
- persist market-comparison snapshots in authenticated history;
- add production observability, external backups and automated deployment;
- add branch protection / required CI checks for `main`.

## License

License not specified yet.