"""Production Security & Hardening Middlewares for ORVEX.

Implements:
1. SecurityHeadersMiddleware: X-Content-Type-Options, X-Frame-Options, CSP, Referrer-Policy, HSTS.
2. ContentLengthLimitMiddleware: Rejection of oversized payloads (HTTP 413) to prevent DoS.
3. RateLimitMiddleware: In-memory sliding window rate limiting per client IP (HTTP 429).
"""

from __future__ import annotations

import time
from collections import defaultdict
from collections.abc import Callable
from typing import Awaitable

from fastapi import Request, Response
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, environment: str = "development") -> None:
        super().__init__(app)
        self.environment = environment

    async def dispatch(
        self, request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        response = await call_next(request)

        # Essential Defense-in-Depth HTTP Security Headers
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "geolocation=(), microphone=(), camera=()"
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline'; "
            "style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data:; "
            "connect-src 'self' ws: wss: http: https:; "
            "frame-ancestors 'none';"
        )

        # Enforce HSTS if running behind TLS or reverse proxy with https
        if request.url.scheme == "https" or request.headers.get("x-forwarded-proto") == "https":
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"

        return response


class ContentLengthLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, max_bytes: int = 2_097_152) -> None:
        super().__init__(app)
        self.max_bytes = max_bytes

    async def dispatch(
        self, request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        content_length = request.headers.get("content-length")
        if content_length:
            try:
                length = int(content_length)
                if length > self.max_bytes:
                    return JSONResponse(
                        status_code=413,
                        content={
                            "detail": f"Payload too large. Maximum allowed size is {self.max_bytes} bytes."
                        },
                    )
            except ValueError:
                pass

        return await call_next(request)


class RateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(
        self,
        app,
        enabled: bool = True,
        requests_per_minute: int = 120,
        exempt_paths: tuple[str, ...] = ("/health", "/api/v1/system/status"),
    ) -> None:
        super().__init__(app)
        self.enabled = enabled
        self.requests_per_minute = requests_per_minute
        self.exempt_paths = exempt_paths
        # client_ip -> list of request timestamps within the current sliding window
        self._history: dict[str, list[float]] = defaultdict(list)
        self._last_cleanup = time.time()

    async def dispatch(
        self, request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        if not self.enabled:
            return await call_next(request)

        # Health and system status probes are exempt from rate limiting
        path = request.url.path
        if any(path.startswith(exempt) for exempt in self.exempt_paths):
            return await call_next(request)

        client_ip = request.client.host if request.client else "unknown"
        now = time.time()
        window_start = now - 60.0

        # Periodic cleanup of stale client entries every 5 minutes
        if now - self._last_cleanup > 300.0:
            for ip in tuple(self._history):
                self._history[ip] = [t for t in self._history[ip] if t >= window_start]
                if not self._history[ip]:
                    self._history.pop(ip, None)
            self._last_cleanup = now

        # Prune timestamps older than 60s for current IP
        timestamps = [t for t in self._history[client_ip] if t >= window_start]
        self._history[client_ip] = timestamps

        if len(timestamps) >= self.requests_per_minute:
            return JSONResponse(
                status_code=429,
                content={
                    "detail": f"Rate limit exceeded. Maximum {self.requests_per_minute} requests per minute allowed.",
                },
                headers={"Retry-After": "60"},
            )

        self._history[client_ip].append(now)
        return await call_next(request)
