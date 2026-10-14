import asyncio
import json
import os
import uuid

import pytest
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.testclient import TestClient
from limits.aio.strategies import FixedWindowRateLimiter
from limits.storage import storage_from_string
from starlette.responses import JSONResponse

from app.core.config import Settings
from app.core.public_api import PublicAPIGuard


async def echo(scope, receive, send):
    body = (await receive()).get("body", b"")
    await JSONResponse({"bytes": len(body)})(scope, receive, send)


def guard(**overrides):
    return PublicAPIGuard(echo, Settings(_env_file=None, api_rate_storage_uri="async+memory://", **overrides))


async def request(app, *, path="/calculator/total", client="192.0.2.1", headers=None, chunks=None, delay=0):
    scope = {
        "type": "http", "asgi": {"version": "3.0"}, "http_version": "1.1",
        "method": "POST", "scheme": "http", "path": path, "raw_path": path.encode(),
        "query_string": b"", "client": (client, 5000), "server": ("test", 80),
        "headers": [(b"content-type", b"application/json"), *(headers or [])],
    }
    chunks = list(chunks if chunks is not None else [b"{}"])
    received = 0
    sent = []

    async def receive():
        nonlocal received
        received += 1
        if delay:
            await asyncio.sleep(delay)
        chunk = chunks.pop(0)
        return {"type": "http.request", "body": chunk, "more_body": bool(chunks)}

    async def send(message):
        sent.append(message)

    await app(scope, receive, send)
    start = next(item for item in sent if item["type"] == "http.response.start")
    body = b"".join(item.get("body", b"") for item in sent if item["type"] == "http.response.body")
    return start["status"], dict(start["headers"]), json.loads(body), received


def test_client_limits_retry_header_and_spoofed_forwarded_header():
    async def scenario():
        app = guard(api_rate_client="2/minute")
        assert (await request(app))[0] == 200
        assert (await request(app, headers=[(b"x-forwarded-for", b"198.51.100.2")]))[0] == 200
        status, headers, _, count = await request(app, headers=[(b"x-forwarded-for", b"198.51.100.3")])
        assert status == 429 and int(headers[b"retry-after"]) > 0 and count == 0
        assert (await request(app, client="192.0.2.2"))[0] == 200
        assert (await request(app, path="/health"))[0] == 200
    asyncio.run(scenario())


def test_ipv6_rotation_within_subnet_and_ipv4_mapped_addresses():
    app = guard()
    def scope(ip):
        return {"client": (ip, 1000)}
    assert app.client_key(scope("2001:db8:1::1")) == app.client_key(scope("2001:db8:1::ffff"))
    assert app.client_key(scope("2001:db8:1::1")) != app.client_key(scope("2001:db8:2::1"))
    assert app.client_key(scope("192.0.2.1")) == app.client_key(scope("::ffff:192.0.2.1"))


def test_shared_lookup_group_and_separate_share_budget():
    async def scenario():
        app = guard(api_rate_lookup_client="2/minute", api_rate_share_client="1/minute")
        assert (await request(app, path="/cars/from-url"))[0] == 200
        assert (await request(app, path="/cars/from-vin"))[0] == 200
        assert (await request(app, path="/cars/search"))[0] == 429
        assert (await request(app, path="/deals/"))[0] == 200
        assert (await request(app, path="/deals"))[0] == 429
        assert (await request(app))[0] == 200
    asyncio.run(scenario())


def test_global_share_budget_and_denied_client_does_not_drain_it():
    async def scenario():
        app = guard(api_rate_share_client="1/minute", api_rate_share_global="2/minute")
        assert (await request(app, path="/deals/"))[0] == 200
        for _ in range(4):
            assert (await request(app, path="/deals/"))[0] == 429
        assert (await request(app, path="/deals/", client="192.0.2.2"))[0] == 200
        assert (await request(app, path="/deals/", client="192.0.2.3"))[0] == 429
    asyncio.run(scenario())


@pytest.mark.parametrize("headers,expected", [
    ([(b"content-length", b"65537")], 413),
    ([(b"content-length", b"invalid")], 400),
    ([(b"content-length", b"9" * 5000)], 400),
    ([(b"content-length", b"2"), (b"content-length", b"2")], 400),
    ([(b"content-type", b"text/plain")], 415),
    ([(b"content-encoding", b"gzip")], 415),
    ([(b"x-long", b"x" * 17000)], 431),
])
def test_transport_rejection_happens_before_body_read(headers, expected):
    status, _, _, received = asyncio.run(request(guard(), headers=headers))
    assert status == expected and received == 0


def test_chunked_body_is_bounded_and_replayed_exactly_once():
    async def scenario():
        app = guard()
        status, _, body, count = await request(app, chunks=[b"abc", b"def"])
        assert status == 200 and body == {"bytes": 6} and count == 2
        assert (await request(app, chunks=[b"x" * 40000, b"x" * 40000]))[0] == 413
        assert (await request(app, path="/" + "x" * 4096))[0] == 414
        assert (await request(guard(api_body_timeout_seconds=0.01), delay=0.05))[0] == 408
    asyncio.run(scenario())


def test_storage_outage_fails_closed_without_exposing_secrets():
    async def scenario():
        app = guard()

        async def fail(scope):
            raise RuntimeError("redis://secret-password@host")

        app.quota = fail
        status, headers, body, _ = await request(app)
        assert status == 503 and headers[b"retry-after"] == b"5"
        assert "secret-password" not in json.dumps(body)
        assert (await request(app, path="/health"))[0] == 200
    asyncio.run(scenario())


def test_cors_headers_are_present_on_protection_errors():
    app = FastAPI()
    app.add_middleware(PublicAPIGuard, settings=Settings(_env_file=None, api_rate_client="1/minute"))
    app.add_middleware(CORSMiddleware, allow_origins=["https://cars.example.com"], expose_headers=["Retry-After"])

    @app.post("/calculator/total")
    async def calculate(request: Request):
        return await request.json()

    with TestClient(app) as client:
        headers = {"origin": "https://cars.example.com"}
        assert client.post("/calculator/total", json={}, headers=headers).status_code == 200
        response = client.post("/calculator/total", json={}, headers=headers)
        assert response.status_code == 429
        assert response.headers["access-control-allow-origin"] == headers["origin"]
        assert "Retry-After" in response.headers["access-control-expose-headers"]


@pytest.mark.skipif(not os.getenv("REDIS_TEST_URI"), reason="Requires isolated Redis test storage")
def test_two_workers_share_atomic_redis_budget():
    async def scenario():
        prefix = "GCB_TEST_" + uuid.uuid4().hex
        workers = [guard(api_rate_share_client="3/minute") for _ in range(2)]
        for worker in workers:
            worker._storage = storage_from_string(os.environ["REDIS_TEST_URI"], implementation="redispy", key_prefix=prefix)
            worker._limiter = FixedWindowRateLimiter(worker._storage)
        statuses = await asyncio.gather(*(request(workers[index % 2], path="/deals/") for index in range(12)))
        assert sum(result[0] == 200 for result in statuses) == 3
        assert sum(result[0] == 429 for result in statuses) == 9
        # A fresh worker uses the same counter, not a new in-memory allowance.
        restarted = guard(api_rate_share_client="3/minute")
        restarted._storage = storage_from_string(os.environ["REDIS_TEST_URI"], implementation="redispy", key_prefix=prefix)
        restarted._limiter = FixedWindowRateLimiter(restarted._storage)
        assert (await request(restarted, path="/deals/"))[0] == 429
    asyncio.run(scenario())
