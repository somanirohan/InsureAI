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
    from db import get_async_db, serialize_doc
    from models.user import AuthTokenResponse, UserLogin, UserRegister, UserResponse
    from services.auth_service import create_access_token, get_current_user, hash_password, verify_password
except ImportError:
    from server.db import get_async_db, serialize_doc
    from server.models.user import AuthTokenResponse, UserLogin, UserRegister, UserResponse
    from server.services.auth_service import create_access_token, get_current_user, hash_password, verify_password

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
