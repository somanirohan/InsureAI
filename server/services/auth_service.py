"""
Authentication service for InsureAI FastAPI backend.
Handles bcrypt password hashing and verification, JWT token issuance and decoding,
and user dependency extraction.
"""

from __future__ import annotations

import re
import logging
from datetime import datetime, timedelta
from typing import Any, Dict, Optional
import bcrypt
import jwt
from bson import ObjectId
from fastapi import HTTPException, Request, Response, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

try:
    from config import settings
except ImportError:
    from server.config import settings

try:
    from db import get_async_db, to_object_id
except ImportError:
    from server.db import get_async_db, to_object_id

logger = logging.getLogger("insureai.auth")

security = HTTPBearer(auto_error=False)

INSECURE_DEFAULT_SECRETS = {
    "medshield_super_secret_jwt_key_2026",
    "secret",
    "jwt_secret",
    "changeme",
}


def _parse_duration(duration_str: str) -> timedelta:
    """
    Parse a duration string such as '7d', '24h', '60m', '3600s' into a timedelta.
    Defaults to 7 days if parsing fails.
    """
    if not duration_str:
        return timedelta(days=7)
    match = re.fullmatch(r"(\d+)\s*([dhms])", duration_str.strip().lower())
    if not match:
        return timedelta(days=7)
    val = int(match.group(1))
    unit = match.group(2)
    if unit == "d":
        return timedelta(days=val)
    elif unit == "h":
        return timedelta(hours=val)
    elif unit == "m":
        return timedelta(minutes=val)
    elif unit == "s":
        return timedelta(seconds=val)
    return timedelta(days=7)


import hashlib

def hash_password(password: str) -> str:
    """Hash password using industry-standard bcrypt with a fresh random salt."""
    salt = bcrypt.gensalt()
    return bcrypt.hashpw(password.encode("utf-8"), salt).decode("utf-8")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify plain text password against bcrypt hash with legacy sha256 compatibility."""
    if not plain_password or not hashed_password:
        return False

    # Check bcrypt hash first
    try:
        if hashed_password.startswith("$2b$") or hashed_password.startswith("$2a$"):
            return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
    except Exception:
        pass

    # Legacy sha256 fallback
    try:
        salted = f"{plain_password}_{settings.JWT_SECRET}".encode("utf-8")
        if hashlib.sha256(salted).hexdigest() == hashed_password:
            return True
    except Exception:
        pass

    # Generic bcrypt fallback
    try:
        return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
    except Exception:
        return False


def create_access_token(user_id: str, email: Optional[str] = None) -> str:
    """
    Create a signed JWT access token.
    Payload standard:
      sub: user_id (str)
      email: email (str)
      exp: expiration timestamp
      iat: issued-at timestamp
    """
    if settings.ENVIRONMENT == "production" and settings.JWT_SECRET in INSECURE_DEFAULT_SECRETS:
        raise RuntimeError("Insecure default JWT_SECRET cannot be used in production environment.")

    expire_delta = _parse_duration(settings.JWT_EXPIRES_IN)
    now = datetime.utcnow()
    payload: dict[str, Any] = {
        "sub": str(user_id),
        "user_id": str(user_id),
        "iat": now,
        "exp": now + expire_delta,
    }
    if email:
        payload["email"] = email

    return jwt.encode(payload, settings.JWT_SECRET, algorithm="HS256")


def set_auth_cookie(response: Response, token: str) -> None:
    """Set secure HttpOnly authentication cookie."""
    expire_delta = _parse_duration(settings.JWT_EXPIRES_IN)
    max_age_seconds = int(expire_delta.total_seconds())
    secure = settings.COOKIE_SECURE or (settings.ENVIRONMENT == "production")
    response.set_cookie(
        key=settings.COOKIE_NAME,
        value=token,
        max_age=max_age_seconds,
        expires=max_age_seconds,
        httponly=True,
        secure=secure,
        samesite=settings.COOKIE_SAMESITE,
        domain=settings.COOKIE_DOMAIN,
        path="/",
    )


def clear_auth_cookie(response: Response) -> None:
    """Clear HttpOnly authentication cookie upon logout."""
    secure = settings.COOKIE_SECURE or (settings.ENVIRONMENT == "production")
    for cookie_key in {settings.COOKIE_NAME, "access_token", "insureai_token"}:
        response.delete_cookie(
            key=cookie_key,
            path="/",
            domain=settings.COOKIE_DOMAIN,
            httponly=True,
            secure=secure,
            samesite=settings.COOKIE_SAMESITE,
        )


async def get_current_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Security(security),
) -> Dict[str, Any]:
    """
    FastAPI dependency to extract and authenticate the current user.
    Supports Dual Authentication:
      1. HTTP Bearer Authorization header (for APIs, tests, external clients)
      2. Secure HttpOnly cookie (for browser web application session)
    """
    token: Optional[str] = None
    if credentials and credentials.credentials:
        token = credentials.credentials
    elif request and settings.COOKIE_NAME in request.cookies:
        token = request.cookies.get(settings.COOKIE_NAME)
    elif request and "insureai_token" in request.cookies:
        token = request.cookies.get("insureai_token")

    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authentication required. Please log in.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=["HS256"])
        user_id_str = payload.get("sub") or payload.get("user_id")
        if not user_id_str:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid token payload: missing user identifier.",
            )
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization token has expired.",
        )
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired authorization token.",
        )

    db = get_async_db()
    oid = to_object_id(user_id_str)
    query = {"_id": oid} if oid else {"_id": user_id_str}
    user = await db.users.find_one(query)

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User account not found.",
        )

    if not user.get("is_active", True):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User account is deactivated.",
        )

    # Sanitize user dict for security: never expose password_hash
    user["_id"] = str(user["_id"])
    user.pop("password_hash", None)
    return user
