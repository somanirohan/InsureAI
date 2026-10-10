"""
Unit tests for InsureAI OWASP Security & Cookie Protection layer.
Tests:
- HttpOnly cookie setting and clearance
- Dual authentication fallback (Authorization header or HttpOnly cookie)
- SecurityHeadersMiddleware (OWASP headers & Cache-Control: no-store)
- CSRFProtectionMiddleware (origin verification and anti-CSRF header)
"""

import pytest
from fastapi import FastAPI, Response
from fastapi.testclient import TestClient
from starlette.requests import Request

from server.config import settings
from server.services.auth_service import (
    clear_auth_cookie,
    create_access_token,
    get_current_user,
    set_auth_cookie,
)
from server.middleware.security import (
    CSRFProtectionMiddleware,
    SecurityHeadersMiddleware,
)


def test_set_and_clear_auth_cookie():
    """Verify set_auth_cookie configures secure HttpOnly cookie and clear_auth_cookie invalidates it."""
    response = Response()
    test_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.dummy"
    set_auth_cookie(response, test_token)

    # Inspect Set-Cookie header
    cookie_header = response.headers.get("set-cookie")
    assert cookie_header is not None
    assert f"{settings.COOKIE_NAME}={test_token}" in cookie_header
    assert "HttpOnly" in cookie_header or "httponly" in cookie_header.lower()
    assert f"samesite={settings.COOKIE_SAMESITE}" in cookie_header.lower()

    # Now test clear_auth_cookie
    clear_resp = Response()
    clear_auth_cookie(clear_resp)
    clear_header = clear_resp.headers.get("set-cookie")
    assert clear_header is not None
    assert 'max-age=0' in clear_header.lower()


def test_security_headers_middleware():
    """Verify OWASP headers and no-store caching on sensitive routes."""
    test_app = FastAPI()
    test_app.add_middleware(SecurityHeadersMiddleware)

    @test_app.get("/api/auth/test")
    def auth_route():
        return {"ok": True}

    @test_app.get("/public")
    def public_route():
        return {"ok": True}

    client = TestClient(test_app)

    # 1. Test sensitive route
    res = client.get("/api/auth/test")
    assert res.status_code == 200
    assert res.headers.get("x-content-type-options") == "nosniff"
    assert res.headers.get("x-frame-options") == "DENY"
    assert res.headers.get("x-xss-protection") == "1; mode=block"
    assert "no-store" in res.headers.get("cache-control", "")

    # 2. Test public route
    res_pub = client.get("/public")
    assert res_pub.headers.get("x-content-type-options") == "nosniff"


def test_csrf_protection_middleware():
    """Verify CSRF blocking for state-changing requests with cookies but without origin or anti-CSRF headers."""
    test_app = FastAPI()
    test_app.add_middleware(CSRFProtectionMiddleware)

    @test_app.post("/api/policies/create")
    def create_policy():
        return {"created": True}

    client = TestClient(test_app)

    # Request with auth cookie from untrusted origin -> Should be rejected
    client.cookies.set(settings.COOKIE_NAME, "dummy_token")
    res_untrusted = client.post(
        "/api/policies/create",
        headers={"origin": "http://evil-attacker.com"},
    )
    assert res_untrusted.status_code == 403
    assert "CSRF" in res_untrusted.json().get("detail", "")

    # Request with auth cookie from allowed origin (e.g. client URL) -> Should pass
    res_trusted = client.post(
        "/api/policies/create",
        headers={"origin": settings.CLIENT_URL, "x-requested-with": "XMLHttpRequest"},
    )
    assert res_trusted.status_code == 200

    # Request with Bearer token header (API client) -> Should bypass cookie CSRF check
    res_api = client.post(
        "/api/policies/create",
        headers={"authorization": "Bearer sample_token", "origin": "http://other-client.com"},
    )
    assert res_api.status_code == 200
