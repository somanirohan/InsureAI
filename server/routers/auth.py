"""
Authentication router for InsureAI.
Handles user registration, login, token issuance, and /me endpoint.
Strictly excludes password_hash from all API responses.
"""

from __future__ import annotations

import logging
from datetime import datetime
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, status

try:
    from config import settings
    from db import get_async_db, serialize_doc
    from models.user import AuthTokenResponse, GoogleAuthRequest, UserLogin, UserRegister, UserResponse
    from services.auth_service import create_access_token, get_current_user, hash_password, verify_password
    from services.google_auth_service import exchange_google_auth_code, verify_google_id_token
except ImportError:
    from server.config import settings
    from server.db import get_async_db, serialize_doc
    from server.models.user import AuthTokenResponse, GoogleAuthRequest, UserLogin, UserRegister, UserResponse
    from server.services.auth_service import create_access_token, get_current_user, hash_password, verify_password
    from server.services.google_auth_service import exchange_google_auth_code, verify_google_id_token

logger = logging.getLogger("insureai.auth")

router = APIRouter(prefix="/api/auth", tags=["Authentication"])


@router.post("/register", response_model=AuthTokenResponse, status_code=status.HTTP_201_CREATED)
async def register(payload: UserRegister):
    """Register a new user account with bcrypt password hashing."""
    email_clean = payload.email.lower().strip()
    if not email_clean or not payload.password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email and password are required.",
        )

    db = get_async_db()
    existing = await db.users.find_one({"email": email_clean})
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An account with this email address already exists.",
        )

    now = datetime.utcnow()
    user_oid = ObjectId()
    pwd_hash = hash_password(payload.password)

    user_doc = {
        "_id": user_oid,
        "full_name": payload.full_name.strip(),
        "email": email_clean,
        "password_hash": pwd_hash,
        "phone": payload.phone,
        "is_active": True,
        "created_at": now,
        "last_login_at": now,
    }

    await db.users.insert_one(user_doc)
    user_id_str = str(user_oid)

    token = create_access_token(user_id=user_id_str, email=email_clean)

    # Sanitize user dict for response
    safe_user = {
        "_id": user_id_str,
        "full_name": user_doc["full_name"],
        "email": user_doc["email"],
        "phone": user_doc["phone"],
        "is_active": True,
        "created_at": user_doc["created_at"],
    }

    return {
        "token": token,
        "user": safe_user,
    }


@router.post("/login", response_model=AuthTokenResponse)
async def login(payload: UserLogin):
    """Authenticate existing user and issue a JWT access token."""
    email_clean = payload.email.lower().strip()
    db = get_async_db()

    user = await db.users.find_one({"email": email_clean})
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

    safe_user = {
        "_id": user_id_str,
        "full_name": user.get("full_name", ""),
        "email": user.get("email", ""),
        "phone": user.get("phone"),
        "is_active": user.get("is_active", True),
        "created_at": user.get("created_at"),
    }

    return {
        "token": token,
        "user": safe_user,
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
async def google_auth(payload: GoogleAuthRequest):
    """
    Authenticate user via Google OAuth 2.0.
    Supports either:
      1. Google ID token credential from Google Identity Services (GIS popup / One-Tap)
      2. Authorization code from standard OAuth 2.0 code exchange
    Finds or creates the user in MongoDB, and returns an InsurAI JWT access token.
    """
    google_user = None

    if payload.credential:
        google_user = await verify_google_id_token(payload.credential)
    elif payload.code:
        google_user = await exchange_google_auth_code(
            code=payload.code,
            redirect_uri=payload.redirect_uri,
        )

    if not google_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Google authentication failed. Invalid token or authorization code.",
        )

    email_clean = google_user["email"].lower().strip()
    google_id = google_user.get("google_id")
    full_name = google_user.get("full_name") or email_clean.split("@")[0]
    avatar_url = google_user.get("avatar_url")

    db = get_async_db()
    existing_user = await db.users.find_one({"$or": [{"email": email_clean}, {"google_id": google_id}]})

    now = datetime.utcnow()

    if existing_user:
        if not existing_user.get("is_active", True):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Account is inactive.",
            )

        user_id_str = str(existing_user["_id"])
        update_fields = {
            "last_login_at": now,
        }
        if google_id and not existing_user.get("google_id"):
            update_fields["google_id"] = google_id
        if avatar_url and not existing_user.get("avatar_url"):
            update_fields["avatar_url"] = avatar_url
        if not existing_user.get("auth_provider"):
            update_fields["auth_provider"] = "google"

        await db.users.update_one({"_id": existing_user["_id"]}, {"$set": update_fields})

        safe_user = {
            "_id": user_id_str,
            "full_name": existing_user.get("full_name", full_name),
            "email": existing_user.get("email", email_clean),
            "phone": existing_user.get("phone"),
            "avatar_url": existing_user.get("avatar_url") or avatar_url,
            "auth_provider": existing_user.get("auth_provider", "google"),
            "is_active": True,
            "created_at": existing_user.get("created_at"),
        }
    else:
        # Create new user record
        user_oid = ObjectId()
        user_id_str = str(user_oid)
        new_user = {
            "_id": user_oid,
            "full_name": full_name,
            "email": email_clean,
            "password_hash": None,
            "google_id": google_id,
            "avatar_url": avatar_url,
            "auth_provider": "google",
            "phone": None,
            "is_active": True,
            "created_at": now,
            "last_login_at": now,
        }
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

    return {
        "token": token,
        "user": safe_user,
    }

