# Production deployment

The production stack is intentionally separate from the local development stack.

- Local development: `docker-compose.yml`
- Production: `docker-compose.prod.yml`
- Public entry point: Caddy on ports 80/443
- PostgreSQL, Redis, FastAPI and Next.js are not published directly on host ports

## Prerequisites

- Linux server with Docker Engine and the Docker Compose plugin
- A domain name with its DNS `A`/`AAAA` record pointing to the server
- Inbound ports 80 and 443 open for HTTP/HTTPS
- SSH access for administration

## First deployment

Clone the repository and create the production environment file:

```bash
git clone https://github.com/kingofgeorgia/georgiancarbenefits.git
cd georgiancarbenefits
cp .env.production.example .env.production
```

Edit `.env.production` before starting anything. At minimum replace:

- `APP_DOMAIN`
- `POSTGRES_PASSWORD`
- `SECRET_KEY`
- `FRONTEND_ORIGIN`

`APP_DOMAIN` must match the public domain and `FRONTEND_ORIGIN` must be its HTTPS origin, for example:

```text
APP_DOMAIN=cars.example.com
FRONTEND_ORIGIN=https://cars.example.com
```

The backend refuses to start in production when the JWT secret, database password,
frontend origin or shared Redis rate storage is unsafe. See
[public API protection](public-api-protection.md) for configurable beta quotas.

Validate the Compose configuration:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml config
```

Build production images:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml build
```

Start PostgreSQL and shared quota storage first:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml up -d postgres redis
```

Apply database migrations:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml run --rm backend alembic upgrade head
```

Start the complete stack:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml up -d
```

Caddy will request and renew the TLS certificate automatically after DNS and ports 80/443 are correctly configured.

## Verify deployment

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml ps
```

Check backend logs:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml logs --tail=100 backend
```

Check Caddy/TLS logs:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml logs --tail=100 caddy
```

The application should be available at:

```text
https://<APP_DOMAIN>/
```

The browser-facing API prefix is:

```text
https://<APP_DOMAIN>/api/
```

Caddy strips `/api` before proxying requests to FastAPI.

## Database backup

Create a SQL backup before application/database upgrades:

```bash
mkdir -p backups
docker compose --env-file .env.production -f docker-compose.prod.yml exec -T postgres \
  sh -lc 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  > "backups/mileon-$(date +%Y%m%d-%H%M%S).sql"
```

Keep production backups outside the repository and preferably copy them to a separate storage location.

## Application update

Before updating, create a database backup. Then:

```bash
git pull --ff-only origin main
docker compose --env-file .env.production -f docker-compose.prod.yml build
docker compose --env-file .env.production -f docker-compose.prod.yml run --rm backend alembic upgrade head
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --remove-orphans
```

Verify status and logs after every update.

## Stop / restart

Restart:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml restart
```

Stop containers while keeping persistent volumes:

```bash
docker compose --env-file .env.production -f docker-compose.prod.yml down
```

Do not use `down -v` unless permanent deletion of PostgreSQL and Caddy persistent volumes is intentional.

## Security notes

- Never commit `.env.production`.
- Only Caddy publishes host ports in the production Compose file.
- Do not publish PostgreSQL port 5432 to the internet.
- Do not publish Redis port 6379; retain its volume across updates so quotas persist.
- Use a long random `SECRET_KEY` and database password.
- Keep the server, Docker Engine and base images updated.
- Restrict SSH access and use a host firewall/security group.
- Review regulatory tariff data before deploying rule changes.
