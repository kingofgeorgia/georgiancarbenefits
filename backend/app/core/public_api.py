"""Bound request work before parsing and share quotas across API workers."""

import asyncio
import hashlib
import hmac
import ipaddress
import logging
import math
import time
from email.message import Message

from limits import parse_many
from limits.aio.strategies import FixedWindowRateLimiter
from limits.storage import storage_from_string
from starlette.responses import JSONResponse

from app.core.config import Settings

logger = logging.getLogger(__name__)


class PublicAPIGuard:
    def __init__(self, app, settings: Settings):
        self.app = app
        self.settings = settings
        self._storage = None
        self._limiter = None
        self.client_limits = parse_many(settings.api_rate_client)
        self.global_limits = parse_many(settings.api_rate_global)
        self.group_client = {
            "lookup": parse_many(settings.api_rate_lookup_client),
            "calculator": parse_many(settings.api_rate_calculator_client),
            "share": parse_many(settings.api_rate_share_client),
            "auth": parse_many(settings.api_rate_auth_client),
        }
        self.group_global = {
            "lookup": parse_many(settings.api_rate_lookup_global),
            "share": parse_many(settings.api_rate_share_global),
        }

    @property
    def storage(self):
        if self._storage is None:
            options = {}
            if not self.settings.api_rate_storage_uri.startswith("async+memory://"):
                options = {"implementation": "redispy", "socket_connect_timeout": 1, "socket_timeout": 1}
            self._storage = storage_from_string(self.settings.api_rate_storage_uri, **options)
            self._limiter = FixedWindowRateLimiter(self._storage)
        return self._storage

    def client_key(self, scope):
        host = (scope.get("client") or ("unknown", 0))[0]
        try:
            address = ipaddress.ip_address(host)
            if isinstance(address, ipaddress.IPv6Address):
                host = str(address.ipv4_mapped or ipaddress.ip_network(f"{address}/64", strict=False))
            else:
                host = str(address)
        except ValueError:
            host = "unknown"
        return hmac.new(self.settings.secret_key.encode(), host.encode(), hashlib.sha256).hexdigest()

    @staticmethod
    def group(scope):
        path = scope["path"].rstrip("/")
        if path in {"/cars/from-url", "/cars/from-vin", "/cars/search", "/cars/makes", "/cars/models"}:
            return "lookup"
        if scope["method"] == "POST":
            if path == "/calculator/total":
                return "calculator"
            if path == "/deals":
                return "share"
            if path in {"/auth/login", "/auth/register"}:
                return "auth"
        return None

    async def quota(self, scope):
        self.storage
        client = self.client_key(scope)
        group = self.group(scope)
        client_rules = [(limit, "client", client) for limit in self.client_limits]
        global_rules = [(limit, "global") for limit in self.global_limits]
        if group:
            client_rules += [(limit, group, client) for limit in self.group_client[group]]
            global_rules += [(limit, group, "global") for limit in self.group_global.get(group, [])]
        # Reject an exhausted client before consuming any shared capacity.
        rules = client_rules + global_rules
        for limit, *keys in rules:
            if not await self._limiter.test(limit, *keys):
                window = await self._limiter.get_window_stats(limit, *keys)
                return max(1, math.ceil(window.reset_time - time.time()))
        for limit, *keys in rules:
            if not await self._limiter.hit(limit, *keys):
                window = await self._limiter.get_window_stats(limit, *keys)
                return max(1, math.ceil(window.reset_time - time.time()))
        return None

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        scope.setdefault("state", {})["api_rate_storage"] = self.storage
        if scope["path"] == "/health":
            return await self.app(scope, receive, send)

        async def reject(code, detail, headers=None):
            await JSONResponse({"detail": detail}, status_code=code, headers=headers)(scope, receive, send)

        headers = scope.get("headers", [])
        if sum(len(key) + len(value) for key, value in headers) > 16 * 1024:
            return await reject(431, "Request headers are too large")
        if len(scope.get("raw_path", scope["path"].encode())) + len(scope.get("query_string", b"")) > 4096:
            return await reject(414, "Request URL is too long")
        lengths = [value for key, value in headers if key.lower() == b"content-length"]
        if lengths:
            if len(lengths) != 1 or len(lengths[0]) > 20 or not lengths[0].isdigit():
                return await reject(400, "Invalid Content-Length")
            if int(lengths[0]) > self.settings.api_max_body_bytes:
                return await reject(413, "Request body is too large", {"Connection": "close"})
        header_map = dict(headers)
        if header_map.get(b"content-encoding", b"identity").lower() != b"identity":
            return await reject(415, "Encoded request bodies are not supported")
        if scope["method"] in {"POST", "PUT", "PATCH"}:
            content_type = Message()
            content_type["content-type"] = header_map.get(b"content-type", b"").decode("latin-1")
            mime = content_type.get_content_type()
            if mime != "application/json" and not (mime.startswith("application/") and mime.endswith("+json")):
                return await reject(415, "A JSON request body is required")
        try:
            retry_after = await self.quota(scope)
        except Exception:
            logger.error("API rate storage unavailable")
            return await reject(503, "Request protection is temporarily unavailable", {"Retry-After": "5"})
        if retry_after is not None:
            return await reject(429, "Too many requests", {"Retry-After": str(retry_after)})

        body = bytearray()
        try:
            async with asyncio.timeout(self.settings.api_body_timeout_seconds):
                while True:
                    message = await receive()
                    if message["type"] == "http.disconnect":
                        return
                    chunk = message.get("body", b"")
                    if len(body) + len(chunk) > self.settings.api_max_body_bytes:
                        return await reject(413, "Request body is too large", {"Connection": "close"})
                    body.extend(chunk)
                    if not message.get("more_body", False):
                        break
        except TimeoutError:
            return await reject(408, "Request body timed out", {"Connection": "close"})

        replayed = False

        async def replay():
            nonlocal replayed
            if not replayed:
                replayed = True
                return {"type": "http.request", "body": bytes(body), "more_body": False}
            return await receive()

        await self.app(scope, replay, send)
