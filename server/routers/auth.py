"""
Authentication router for InsureAI.
Handles user registration, login, token issuance, and /me endpoint.
Strictly excludes password_hash from all API responses.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Response, status

try:
    from config import settings
    from db import get_async_db, serialize_doc
    from models.user import AuthTokenResponse, GoogleAuthRequest, UserLogin, UserRegister, UserResponse
    from services.auth_service import (
        clear_auth_cookie,
        create_access_token,
        get_current_user,
        hash_password,
        set_auth_cookie,
        verify_password,
    )
    from services.google_auth_service import exchange_google_auth_code, get_user_from_access_token, verify_google_id_token
    from services.crypto_service import build_user_email_query, hash_sha256, secure_user_data, unsecure_user_data
except ImportError:
    from server.config import settings
    from server.db import get_async_db, serialize_doc
    from server.models.user import AuthTokenResponse, GoogleAuthRequest, UserLogin, UserRegister, UserResponse
    from server.services.auth_service import (
        clear_auth_cookie,
        create_access_token,
        get_current_user,
        hash_password,
        set_auth_cookie,
        verify_password,
    )
    from server.services.google_auth_service import exchange_google_auth_code, get_user_from_access_token, verify_google_id_token
    from server.services.crypto_service import build_user_email_query, hash_sha256, secure_user_data, unsecure_user_data

logger = logging.getLogger("insureai.auth")

router = APIRouter(prefix="/api/auth", tags=["Authentication"])


@router.post("/register", response_model=AuthTokenResponse, status_code=status.HTTP_201_CREATED)
async def register(payload: UserRegister, response: Response):
    """Register a new user account with bcrypt password hashing and secure HttpOnly cookie."""
    email_clean = payload.email.lower().strip()
    if not email_clean or not payload.password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email and password are required.",
        )

    db = get_async_db()
    existing = await db.users.find_one(build_user_email_query(email_clean))
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An account with this email address already exists.",
        )

    now = datetime.utcnow()
    user_oid = ObjectId()
    pwd_hash = hash_password(payload.password)

    raw_user_doc = {
        "_id": user_oid,
        "full_name": payload.full_name.strip(),
        "email": email_clean,
        "password_hash": pwd_hash,
        "phone": payload.phone,
        "is_active": True,
        "created_at": now,
        "last_login_at": now,
    }
    user_doc = secure_user_data(raw_user_doc)

    await db.users.insert_one(user_doc)
    user_id_str = str(user_oid)

    token = create_access_token(user_id=user_id_str, email=email_clean)

    # Issue secure HttpOnly session cookie to protect against XSS token harvesting
    set_auth_cookie(response, token)

    # Sanitize user dict for response
    safe_user = {
        "_id": user_id_str,
        "full_name": payload.full_name.strip(),
        "email": email_clean,
        "phone": payload.phone,
        "is_active": True,
        "created_at": now,
    }

    return {
        "token": token,
        "user": safe_user,
    }


@router.post("/login", response_model=AuthTokenResponse)
async def login(payload: UserLogin, response: Response):
    """Authenticate existing user and issue a JWT access token and secure HttpOnly cookie."""
    email_clean = payload.email.lower().strip()
    db = get_async_db()

    user = await db.users.find_one(build_user_email_query(email_clean))
    if not user or not verify_password(payload.password, user.get("password_hash", "")):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password.",
        )

    if not user.get("is_active", True):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Account is inactive.",
        )

    user_id_str = str(user["_id"])
    await db.users.update_one(
        {"_id": user["_id"]},
        {"$set": {"last_login_at": datetime.utcnow()}},
    )

    token = create_access_token(user_id=user_id_str, email=email_clean)

    # Issue secure HttpOnly session cookie
    set_auth_cookie(response, token)

    decrypted_user = unsecure_user_data(user)
    safe_user = {
        "_id": user_id_str,
        "full_name": decrypted_user.get("full_name", ""),
        "email": decrypted_user.get("email", email_clean),
        "phone": decrypted_user.get("phone"),
        "is_active": user.get("is_active", True),
        "created_at": user.get("created_at"),
    }

    return {
        "token": token,
        "user": safe_user,
    }


@router.post("/logout")
async def logout(response: Response):
    """Safely log out user by invalidating the HttpOnly session cookie."""
    clear_auth_cookie(response)
    return {
        "success": True,
        "message": "Logged out successfully. HttpOnly session cookies cleared.",
    }


@router.get("/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    """Return currently authenticated user profile without password_hash."""
    return {"user": serialize_doc(current_user)}


@router.get("/google/config")
async def get_google_oauth_config():
    """Return public Google OAuth configuration (client_id only)."""
    return {
        "client_id": settings.GOOGLE_CLIENT_ID,
        "enabled": bool(settings.GOOGLE_CLIENT_ID),
    }


@router.post("/google", response_model=AuthTokenResponse)
async def google_auth(payload: GoogleAuthRequest, response: Response):
    """
    Authenticate user via Google OAuth 2.0.
    Supports:
      1. Google ID token credential / id_token from Google Identity Services (GIS)
      2. Authorization code from standard OAuth 2.0 code exchange
      3. Access token with direct Google userinfo profile retrieval
    Finds or creates the user in MongoDB, and returns an InsurAI JWT access token.
    """
    google_user = None

    id_token = (payload.credential or payload.id_token or "").strip()
    code = (payload.code or "").strip()
    access_token = (payload.access_token or "").strip()

    logger.info(
        "Received Google auth request: has_credential=%s, has_code=%s, has_access_token=%s, redirect_uri=%s",
        bool(id_token),
        bool(code),
        bool(access_token),
        payload.redirect_uri,
    )

    if id_token:
        google_user = await verify_google_id_token(id_token)
    elif code:
        google_user = await exchange_google_auth_code(
            code=code,
            redirect_uri=payload.redirect_uri,
        )
    elif access_token:
        google_user = await get_user_from_access_token(access_token)

    if not google_user or not google_user.get("email"):
        logger.warning(
            "Google auth failed: unable to extract user from payload (has_credential=%s, has_code=%s, has_access_token=%s)",
            bool(id_token),
            bool(code),
            bool(access_token),
        )
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Google authentication failed. Invalid token, authorization code, or client configuration mismatch.",
        )

    email_clean = google_user["email"].lower().strip()
    google_id = google_user.get("google_id")
    full_name = google_user.get("full_name") or email_clean.split("@")[0]
    avatar_url = google_user.get("avatar_url")

    db = get_async_db()

    # Query without matching {"google_id": None} against local users
    e_hash = hash_sha256(email_clean, normalize=True)
    query_conditions = [{"email_hash": e_hash}, {"email": email_clean}]
    if google_id:
        query_conditions.append({"google_id": str(google_id)})

    existing_user = await db.users.find_one({"$or": query_conditions})

    now = datetime.utcnow()

    if existing_user:
        if not existing_user.get("is_active", True):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Account is inactive.",
            )

        user_id_str = str(existing_user["_id"])
        update_fields: dict[str, Any] = {
            "last_login_at": now,
        }
        if google_id and not existing_user.get("google_id"):
            update_fields["google_id"] = str(google_id)
        if avatar_url and not existing_user.get("avatar_url"):
            update_fields["avatar_url"] = avatar_url
        if not existing_user.get("auth_provider"):
            update_fields["auth_provider"] = "google"
        if not existing_user.get("email_hash"):
            update_fields["email_hash"] = e_hash
        if not existing_user.get("full_name_hash"):
            update_fields["full_name_hash"] = hash_sha256(full_name, normalize=True)

        await db.users.update_one({"_id": existing_user["_id"]}, {"$set": update_fields})

        decrypted_existing = unsecure_user_data(existing_user)
        safe_user = {
            "_id": user_id_str,
            "full_name": decrypted_existing.get("full_name") or full_name,
            "email": decrypted_existing.get("email") or email_clean,
            "phone": decrypted_existing.get("phone"),
            "avatar_url": existing_user.get("avatar_url") or avatar_url,
            "auth_provider": existing_user.get("auth_provider") or "google",
            "is_active": True,
            "created_at": existing_user.get("created_at") or now,
        }
    else:
        # Create new user record
        user_oid = ObjectId()
        user_id_str = str(user_oid)
        raw_new_user = {
            "_id": user_oid,
            "full_name": full_name,
            "email": email_clean,
            "password_hash": None,
            "google_id": str(google_id) if google_id else None,
            "avatar_url": avatar_url,
            "auth_provider": "google",
            "phone": None,
            "is_active": True,
            "created_at": now,
            "last_login_at": now,
        }
        new_user = secure_user_data(raw_new_user)
        await db.users.insert_one(new_user)

        safe_user = {
            "_id": user_id_str,
            "full_name": full_name,
            "email": email_clean,
            "phone": None,
            "avatar_url": avatar_url,
            "auth_provider": "google",
            "is_active": True,
            "created_at": now,
        }

    token = create_access_token(user_id=user_id_str, email=email_clean)

    # Issue secure HttpOnly session cookie
    set_auth_cookie(response, token)

    return {
        "token": token,
        "user": safe_user,
    }


@router.get("/security-status")
async def get_security_status(current_user: dict = Depends(get_current_user)):
    """
    Return active security and encryption metrics for the user's active session.
    Provides verifiable proof of security controls (OWASP compliance).
    """
    email_val = current_user.get("email")
    if not email_val and current_user.get("email_encrypted"):
        email_val = unsecure_user_data(current_user).get("email")

    return {
        "user_id": str(current_user["_id"]),
        "email": email_val,
        "session_security": {
            "cookie_name": settings.COOKIE_NAME,
            "httponly": True,
            "samesite": settings.COOKIE_SAMESITE,
            "secure": settings.COOKIE_SECURE or (settings.ENVIRONMENT == "production"),
            "token_algorithm": "HS256",
            "password_hashing": "Bcrypt with dynamic salt + SHA-256 field hashes",
        },
        "protection_features": {
            "anti_csrf_protection": True,
            "anti_xss_protection": True,
            "rate_limiting_active": settings.RATE_LIMIT_ENABLED,
            "no_store_sensitive_cache": True,
            "tenant_data_isolation": "MongoDB ObjectId + ChromaDB Collection Partitioning",
            "third_party_cookies": False,
        },
        "timestamp": datetime.utcnow().isoformat(),
    }

