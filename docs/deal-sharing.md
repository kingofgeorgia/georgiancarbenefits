# Shareable Deal Pages

MileON calculations can be turned into public, immutable snapshots that are safe to send to a client in WhatsApp, Telegram, email or another channel.

## Flow

1. Calculate the vehicle import cost.
2. Click **Share calculation**.
3. The frontend sends the exact calculator request/result currently shown on screen plus a small vehicle snapshot to `POST /deals/`.
4. The backend stores that data unchanged and generates a random URL-safe public id.
5. The public page is available at `/{locale}/deal/{public_id}` without authentication.

The copied link and the shared page's WhatsApp message both use the current
browser origin, including its protocol, hostname and port. Local links stay
local; production links follow the HTTPS domain used to open the application.
No `NEXT_PUBLIC_APP_ORIGIN` build variable is required. `APP_DOMAIN` configures
Caddy, while the matching `FRONTEND_ORIGIN` configures backend CORS; neither is
used as a hard-coded browser share URL.

If the browser cannot write to the clipboard, the created URL stays visible
under the share button as a normal link. It can be copied manually or opened
by the user even when automatic popup windows are blocked.

## Snapshot semantics

A shared deal is intentionally immutable. Opening it later does not recalculate customs, exchange rates, logistics or market data. This makes the link reproducible even after tariffs, currency rates or the source listing change.

The snapshot contains:

- calculator request fields used for the calculation;
- complete calculator result and tariff/rate metadata;
- Deal Score and market comparison when available;
- make/model/year, mileage, purchase price, VIN, source URL and primary image when available.

It does **not** include account email, password, access token or other authentication data.

## API

Create:

```text
POST /deals/
```

Read:

```text
GET /deals/{public_id}
```

There is deliberately no public update endpoint.

## Security

- public ids are generated with `secrets.token_urlsafe` and are not sequential;
- the request is validated through structured Pydantic models rather than accepting arbitrary JSON;
- snapshots are limited to 64 KiB;
- public GET accepts only a short id;
- no user/auth data is required or stored by this feature.

The create endpoint is public to preserve the product rule that one-off calculations and sharing do not require an account. Rate limiting can be added at the reverse proxy/API layer before higher-volume public launch.
