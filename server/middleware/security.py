"""
Security middleware suite for InsureAI FastAPI backend.
Provides:
  1. SecurityHeadersMiddleware - OWASP security headers & cache controls
  2. CSRFProtectionMiddleware - Origin and Referer validation for state-changing requests
  3. RateLimitMiddleware - Sliding-window rate limiter for brute-force protection
"""

from __future__ import annotations

import time
import logging
from collections import defaultdict, deque
from typing import Dict, Tuple
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

try:
    from config import settings
except ImportError:
    from server.config import settings

logger = logging.getLogger("insureai.security")


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """
    Enforces modern browser security headers and sensitive data cache prevention.
    Protects against XSS, clickjacking, MIME-type sniffing, and sensitive data leakage.
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        response = await call_next(request)

        # ── Core Browser Security Headers ─────────────────────────────────────
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=(), payment=()"

        # ── Production Strict Transport Security ──────────────────────────────
        if settings.ENVIRONMENT == "production":
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains; preload"

        # ── Sensitive Data Cache Prevention ───────────────────────────────────
        # Ensure browsers never cache sensitive medical data, documents, or auth tokens
        path = request.url.path.lower()
        if any(prefix in path for prefix in ("/api/auth", "/api/policies", "/api/cost", "/api/chat")):
            response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, max-age=0"
            response.headers["Pragma"] = "no-cache"

        return response


class CSRFProtectionMiddleware(BaseHTTPMiddleware):
    """
    Validates Origin and Referer headers for state-changing requests.
    Prevents Cross-Site Request Forgery (CSRF) on cookie-authenticated requests.
    """

    SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}

    async def dispatch(self, request: Request, call_next) -> Response:
        if request.method in self.SAFE_METHODS:
            return await call_next(request)

        # If request uses explicit Bearer token header, it is an API/CLI client
        auth_header = request.headers.get("authorization", "")
        if auth_header.lower().startswith("bearer "):
            return await call_next(request)

        # Check origin / referer for cookie-based browser requests
        origin = request.headers.get("origin")
        referer = request.headers.get("referer")
        if not origin and referer:
            try:
                from urllib.parse import urlparse
                ref_parsed = urlparse(referer)
                origin = f"{ref_parsed.scheme}://{ref_parsed.netloc}"
            except Exception:
                origin = None

        allowed = set(settings.ALLOWED_ORIGINS if isinstance(settings.ALLOWED_ORIGINS, list) else [settings.CLIENT_URL])
        # Also allow same host as server and test harnesses
        server_host = request.base_url.netloc
        if server_host:
            allowed.add(f"http://{server_host}")
            allowed.add(f"https://{server_host}")
        allowed.add("http://testserver")
        allowed.add("https://testserver")

        # Check custom anti-CSRF header
        has_custom_header = bool(
            request.headers.get("x-requested-with")
            or request.headers.get("x-csrf-token")
        )

        has_auth_cookie = bool(
            settings.COOKIE_NAME in request.cookies or "insureai_token" in request.cookies
        )

        if "*" in allowed:
            return await call_next(request)

        path = request.url.path.lower()
        if origin:
            # Origin must be explicitly allowed or a local development port
            normalized_origin = origin.rstrip("/")
            is_valid = any(
                normalized_origin == allowed_orig.rstrip("/")
                for allowed_orig in allowed
            ) or bool(re.match(r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$", normalized_origin))
            if not is_valid:
                logger.warning("CSRF block: Untrusted origin '%s' on %s", origin, request.url.path)
                return JSONResponse(
                    status_code=403,
                    content={"detail": "Cross-Site Request Forgery (CSRF) validation failed. Untrusted origin."},
                )
        AUTH_PUBLIC_PATHS = (
            "/api/auth/login",
            "/api/auth/register",
            "/api/auth/forgot-password",
            "/api/auth/reset-password",
            "/api/auth/verify-reset-token",
            "/api/auth/google",
        )
        if path not in AUTH_PUBLIC_PATHS and has_auth_cookie and not has_custom_header:
            logger.warning("CSRF block: Missing Origin/Referer and anti-CSRF header on cookie request %s", request.url.path)
            return JSONResponse(
                status_code=403,
                content={"detail": "CSRF validation failed: Missing origin verification."},
            )

        return await call_next(request)


class RateLimitMiddleware(BaseHTTPMiddleware):
    """
    Sliding-window in-memory rate limiter per IP address.
    Protects authentication endpoints from brute force and credential stuffing.
    """

    def __init__(self, app):
        super().__init__(app)
        # Store deque of timestamps keyed by (client_ip, bucket_type)
        self._history: Dict[Tuple[str, str], deque] = defaultdict(deque)

    def _clean_and_count(self, key: Tuple[str, str], now: float, window: float = 60.0) -> int:
        dq = self._history[key]
        cutoff = now - window
        while dq and dq[0] < cutoff:
            dq.popleft()
        return len(dq)

    async def dispatch(self, request: Request, call_next) -> Response:
        if not settings.RATE_LIMIT_ENABLED:
            return await call_next(request)

        path = request.url.path.lower()

        # Skip health check and documentation
        if path in ("/api/health", "/docs", "/redoc", "/openapi.json"):
            return await call_next(request)

        # Determine client IP (handles standard X-Forwarded-For if reverse proxy present)
        client_ip = request.headers.get("x-forwarded-for")
        if client_ip:
            client_ip = client_ip.split(",")[0].strip()
        else:
            client_ip = request.client.host if request.client else "127.0.0.1"

        now = time.time()

        # Strict rate limit on sensitive authentication routes
        AUTH_SENSITIVE_PATHS = (
            "/api/auth/login",
            "/api/auth/register",
            "/api/auth/forgot-password",
            "/api/auth/reset-password",
        )
        if path in AUTH_SENSITIVE_PATHS:
            key = (client_ip, "auth")
            count = self._clean_and_count(key, now, window=60.0)
            if count >= settings.RATE_LIMIT_AUTH_MAX_REQUESTS:
                logger.warning("Rate limit exceeded for IP %s on %s (%d requests/min)", client_ip, path, count)
                return JSONResponse(
                    status_code=429,
                    headers={"Retry-After": "60"},
                    content={
                        "detail": "Too many authentication attempts. Please wait 60 seconds before trying again.",
                    },
                )
            self._history[key].append(now)
        elif path.startswith("/api/"):
            key = (client_ip, "api")
            count = self._clean_and_count(key, now, window=60.0)
            if count >= settings.RATE_LIMIT_API_MAX_REQUESTS:
                return JSONResponse(
                    status_code=429,
                    headers={"Retry-After": "60"},
                    content={
                        "detail": "API rate limit exceeded. Please slow down your requests.",
                    },
                )
            self._history[key].append(now)

        return await call_next(request)
