# Public API protection

All HTTP requests except `/health` pass through bounded ASGI request handling
before FastAPI parses JSON or calls providers. CORS wraps the guard, including
its error responses. The limit includes chunked bodies, not only Content-Length.

- Body: 64 KiB; total body-read deadline: 15 seconds.
- Headers: 16 KiB; path and query: 4096 bytes.
- Mutations require JSON; compressed request bodies are rejected.
- Invalid numeric values, including NaN/Infinity, return JSON 422 without
  reflecting the submitted input.
- Oversized bodies return 413; quotas return 429 with Retry-After.
- Unavailable quota storage returns 503, including in `/health`; it never
  silently switches to per-worker counters.

## Quotas

Defaults are configurable with the `API_RATE_*` settings shown in
`.env.production.example`. Fixed-window counters are implemented with
[limits](https://limits.readthedocs.io/en/stable/async.html).

| Budget | Per client | Across all clients |
| --- | --- | --- |
| All non-health requests | 120/minute | 3000/minute; 50000/day |
| MyAuto/VIN/catalog lookups combined | 20/minute; 200/day | 600/hour; 10000/day |
| Calculations | 60/minute | Overall budget |
| Public deal creation | 20/minute; 100/day | 500/hour; 1000/day |
| Registration/login combined | 10/minute; 50/hour | Overall budget |

Client identifiers are HMACs of the ASGI client address using SECRET_KEY.
IPv6 clients share a /64 budget. The guard does not independently trust incoming
X-Forwarded-For. Production Uvicorn trusts the private proxy network, so the API
must remain inaccessible directly and Caddy must remain the sole public ingress.
[Caddy overwrites untrusted forwarded headers by default](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy#headers).
If adding a CDN or another proxy, explicitly review trusted proxy configuration
before using its forwarded client addresses.

Production requires `async+redis://` or `async+rediss://` shared storage. The
production Compose stack provides an internal Redis with persistent counters,
128 MiB maximum memory and `noeviction`; exhausting it fails closed instead of
evicting quota keys. No Redis host port is published. Development defaults to
memory storage and must use a single backend process for meaningful quotas.
Keep the Redis volume when restarting. Changing SECRET_KEY resets client
identifiers; changing a quota creates a new fixed-window budget.

Fixed windows may allow bursts at window boundaries. These beta limits bound
provider calls and stored public deals, but do not replace upstream DDoS
protection or identity-based anti-abuse controls. Shared networks/NATs share
budgets. Revisit limits using production traffic before expanding the beta.

## External Data

MyAuto accepts only an ASCII positive ID (up to 10 digits) or a full official
`myauto.ge` / `www.myauto.ge` listing URL. URLs with credentials, nonstandard
ports or lookalike hosts are rejected. Only the extracted ID is sent to the
configured API endpoint; the submitted URL is never fetched. MyAuto provider
requests do not follow redirects.

Images are restricted to HTTPS `static.my.ge/myauto/photos/` and the legacy
`static.myauto.ge` CDN, without credentials or nonstandard ports. Each listing
has at most 30 images. Next image optimization uses the same host allowlist,
blocks local IPs and redirects, and caps response size (5 MB) and cache (100 MB).
Catalog images currently use direct browser loading rather than the optimizer.
VIN, model-directory and market caches have bounded entry counts; external
provider errors do not expose request URLs or authorization query parameters.

New share input is validated separately from historical snapshots. Old deals
remain readable without recalculating or modifying their financial data. Unsafe
legacy image/source URLs are removed only from the response, not stored data.
The daily global share budget limits growth; expiration/deletion of old public
deals is not introduced in this step.

## Verification

Backend tests cover malformed/streamed bodies, timeout, rate groups, forwarded
header spoofing, IPv6 budgets, global deal budgets, Redis worker sharing and
storage outage. CI provides isolated Redis; integration tests use unique key
prefixes and never flush existing databases. Browser E2E retains all prior
calculation/share/WhatsApp scenarios and checks localized protection errors
and rejected image-optimizer destinations.
