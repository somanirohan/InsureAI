import pytest
import uuid
from httpx import AsyncClient, ASGITransport
from server.main import app
from server.services.auth_service import validate_password_strength


def test_password_strength_criteria():
    """Verify that validate_password_strength strictly checks special characters, numbers, cases, and length."""
    # Too short
    valid, err = validate_password_strength("Short1!")
    assert not valid
    assert "at least 8 characters" in err

    # Missing special character
    valid, err = validate_password_strength("NoSpecialChar123")
    assert not valid
    assert "special character" in err

    # Missing uppercase
    valid, err = validate_password_strength("lowercase123!@#")
    assert not valid
    assert "uppercase letter" in err

    # Missing lowercase
    valid, err = validate_password_strength("UPPERCASE123!@#")
    assert not valid
    assert "lowercase letter" in err

    # Missing number
    valid, err = validate_password_strength("NoNumbersHere!@#")
    assert not valid
    assert "number" in err

    # Fully valid strong password
    valid, err = validate_password_strength("SecureP@ssw0rd!2026")
    assert valid
    assert err is None


@pytest.mark.asyncio
async def test_register_enforces_password_protection():
    """Verify registration rejects passwords without special characters or too weak."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Weak password lacking special character
        res = await client.post(
            "/api/auth/register",
            json={
                "full_name": "Test Weak",
                "email": f"weak_{uuid.uuid4().hex[:6]}@example.com",
                "password": "PasswordWithoutSpecial123",
            },
        )
        assert res.status_code == 400
        assert "special character" in res.json().get("detail", "")

        # Valid strong password with special character
        unique_email = f"strong_{uuid.uuid4().hex[:6]}@example.com"
        res_ok = await client.post(
            "/api/auth/register",
            json={
                "full_name": "Test Strong",
                "email": unique_email,
                "password": "StrongPassword@123!",
            },
        )
        assert res_ok.status_code == 201
        assert "token" in res_ok.json()


@pytest.mark.asyncio
async def test_forgot_and_reset_password_flow():
    """Verify complete forgot password workflow: request verification link, verify token, reset password."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Register a test user
        email = f"reset_test_{uuid.uuid4().hex[:6]}@example.com"
        orig_pass = "InitialPass@123!"
        reg = await client.post(
            "/api/auth/register",
            json={"full_name": "Reset Test User", "email": email, "password": orig_pass},
        )
        assert reg.status_code == 201

        # 2. Trigger forgot password
        forgot_res = await client.post(
            "/api/auth/forgot-password",
            json={"email": email},
        )
        assert forgot_res.status_code == 200
        forgot_data = forgot_res.json()
        assert forgot_data["success"] is True

        # Retrieve generated token from DB (since reset link is sent via email and not exposed in API response)
        try:
            from db import get_async_db
        except ImportError:
            from server.db import get_async_db
        db = get_async_db()
        token_doc = await db.password_reset_tokens.find_one({"email": email, "used": False})
        assert token_doc is not None
        token = token_doc["token"]

        # 3. Verify token
        verify_res = await client.get(f"/api/auth/verify-reset-token?token={token}")
        assert verify_res.status_code == 200
        assert verify_res.json()["valid"] is True

        # 4. Attempt to reset with weak password (missing special character)
        weak_reset = await client.post(
            "/api/auth/reset-password",
            json={"token": token, "new_password": "NewWeakPassword123"},
        )
        assert weak_reset.status_code == 400
        assert "special character" in weak_reset.json().get("detail", "")

        # 5. Reset with valid strong password
        new_pass = "BrandNewSecurePass@2026!"
        good_reset = await client.post(
            "/api/auth/reset-password",
            json={"token": token, "new_password": new_pass},
        )
        assert good_reset.status_code == 200
        assert good_reset.json()["success"] is True

        # 6. Verify token is now consumed (replay attack prevention)
        replay_res = await client.post(
            "/api/auth/reset-password",
            json={"token": token, "new_password": new_pass},
        )
        assert replay_res.status_code == 400

        # 7. Login with old password fails
        old_login = await client.post(
            "/api/auth/login",
            json={"email": email, "password": orig_pass},
        )
        assert old_login.status_code == 401

        # 8. Login with new password succeeds
        new_login = await client.post(
            "/api/auth/login",
            json={"email": email, "password": new_pass},
        )
        assert new_login.status_code == 200
        assert "token" in new_login.json()
