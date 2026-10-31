# MileON behind the GLC Express Cloudflare Tunnel

This deployment keeps the existing GLC Express IIS site on ports 80 and 443.
MileON runs in the production Docker stack, and a separate Caddy container listens
only on `127.0.0.1:8081`. Cloudflare Tunnel can route `auto.glcexpress.com` to
`http://localhost:8081` without taking over IIS ports.

## One-time setup

1. Create `.env.production` from `.env.production.example`, then set
   `APP_DOMAIN=auto.glcexpress.com` and
   `FRONTEND_ORIGIN=https://auto.glcexpress.com`. Fill in the database password
   and application secret. Keep this file private; do not commit it.
2. In Cloudflare Tunnel, add a public hostname for `auto.glcexpress.com` with
   service `http://localhost:8081`.
3. Keep the existing GLC Express hostname and IIS origin unchanged.

## Start and update MileON

From the MileON repository root, start the data services and apply migrations
without starting the production Caddy service that binds ports 80/443:

```powershell
docker compose --env-file .env.production -f docker-compose.prod.yml up -d postgres redis
docker compose --env-file .env.production -f docker-compose.prod.yml run --rm backend alembic upgrade head
docker compose --env-file .env.production -f docker-compose.prod.yml up -d backend frontend
docker compose -f docker-compose.glc-tunnel.yml up -d
```

For updates, rebuild/restart the application services, then restart the tunnel
proxy if `Caddyfile.glc-tunnel` changed:

```powershell
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build postgres redis backend frontend
docker compose -f docker-compose.glc-tunnel.yml up -d
```

## Request routing

- `/api/*` is stripped and forwarded to FastAPI on the internal Docker network.
- Other paths are forwarded to Next.js on the internal Docker network.
- PostgreSQL, Redis, FastAPI and Next.js are not published on host ports.
- Only the loopback address `127.0.0.1:8081` is published for the tunnel proxy.

The app uses its existing locale routes, including
`/ru/vehicle-catalog`, `/en/vehicle-catalog`, and `/ka/vehicle-catalog`.
Add the GLC Express navigation link only after the hostname and app are reachable.
