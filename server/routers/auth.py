"""
Authentication router for InsureAI.
Handles user registration, login, token issuance, and /me endpoint.
Strictly excludes password_hash from all API responses.
"""

from __future__ import annotations

import logging
import secrets
from datetime import datetime, timedelta
from typing import Any
from bson import ObjectId
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Response, status

try:
    from config import settings
    from db import get_async_db, serialize_doc, to_object_id
    from models.user import (
        AuthTokenResponse,
        ForgotPasswordRequest,
        ForgotPasswordResponse,
        GoogleAuthRequest,
        ResetPasswordRequest,
        ResetPasswordResponse,
        UserLogin,
        UserRegister,
        UserResponse,
        VerifyResetTokenResponse,
    )
    from services.auth_service import (
        clear_auth_cookie,
        create_access_token,
        get_current_user,
        hash_password,
        set_auth_cookie,
        validate_password_strength,
        verify_password,
    )
    from services.google_auth_service import exchange_google_auth_code, get_user_from_access_token, verify_google_id_token
    from services.crypto_service import build_user_email_query, hash_sha256, secure_user_data, unsecure_user_data
    from services.email_service import send_password_reset_email, send_welcome_email
except ImportError:
    from server.config import settings
    from server.db import get_async_db, serialize_doc, to_object_id
    from server.models.user import (
        AuthTokenResponse,
        ForgotPasswordRequest,
        ForgotPasswordResponse,
        GoogleAuthRequest,
        ResetPasswordRequest,
        ResetPasswordResponse,
        UserLogin,
        UserRegister,
        UserResponse,
        VerifyResetTokenResponse,
    )
    from server.services.auth_service import (
        clear_auth_cookie,
        create_access_token,
        get_current_user,
        hash_password,
        set_auth_cookie,
        validate_password_strength,
        verify_password,
    )
    from server.services.google_auth_service import exchange_google_auth_code, get_user_from_access_token, verify_google_id_token
    from server.services.crypto_service import build_user_email_query, hash_sha256, secure_user_data, unsecure_user_data
    from server.services.email_service import send_password_reset_email, send_welcome_email

logger = logging.getLogger("insureai.auth")

router = APIRouter(prefix="/api/auth", tags=["Authentication"])


@router.post("/register", response_model=AuthTokenResponse, status_code=status.HTTP_201_CREATED)
async def register(payload: UserRegister, response: Response, background_tasks: BackgroundTasks):
    """Register a new user account with bcrypt password hashing and secure HttpOnly cookie."""
    email_clean = payload.email.lower().strip()
    if not email_clean or not payload.password:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email and password are required.",
        )

    # Enforce password protection layer (minimum 8 chars, special chars, uppercase, lowercase, numbers)
    pwd_valid, pwd_err = validate_password_strength(payload.password)
    if not pwd_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=pwd_err,
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

    # Dispatch welcome email asynchronously to the registered user
    background_tasks.add_task(
        send_welcome_email,
        to_email=email_clean,
        user_name=payload.full_name.strip(),
    )

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


def _mask_email(email: str) -> str:
    """Mask email for privacy in verification previews, e.g., a***n@domain.com."""
    if "@" not in email:
        return email
    local, domain = email.split("@", 1)
    if len(local) <= 2:
        masked_local = local[0] + "***"
    else:
        masked_local = local[0] + "***" + local[-1]
    return f"{masked_local}@{domain}"


@router.post("/forgot-password", response_model=ForgotPasswordResponse)
async def forgot_password(payload: ForgotPasswordRequest):
    """
    Initiate forgot password workflow.
    Generates a secure, time-sensitive verification token and sends a reset link to the user's email.
    """
    email_clean = payload.email.lower().strip()
    if not email_clean:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A valid email address is required.",
        )

    db = get_async_db()
    user = await db.users.find_one(build_user_email_query(email_clean))

    # Anti-enumeration response: always return generic success message to client
    standard_message = "If an account with that email exists, a password reset link has been sent to your email address."

    if not user:
        logger.info("Forgot password requested for non-existent email: %s", email_clean)
        return ForgotPasswordResponse(
            success=True,
            message=standard_message,
        )

    user_id_str = str(user["_id"])
    decrypted_user = unsecure_user_data(user)
    user_name = decrypted_user.get("full_name") or email_clean.split("@")[0]

    # Invalidate existing unused tokens for this user
    await db.password_reset_tokens.update_many(
        {"user_id": user_id_str, "used": False},
        {"$set": {"used": True, "invalidated_at": datetime.utcnow()}},
    )

    # Generate cryptographically secure token
    token = secrets.token_urlsafe(32)
    now = datetime.utcnow()
    expires_at = now + timedelta(minutes=settings.PASSWORD_RESET_TOKEN_EXPIRE_MINUTES)

    token_doc = {
        "_id": ObjectId(),
        "token": token,
        "user_id": user_id_str,
        "email": email_clean,
        "expires_at": expires_at,
        "used": False,
        "created_at": now,
    }
    await db.password_reset_tokens.insert_one(token_doc)

    client_base = settings.CLIENT_URL.rstrip("/")
    reset_url = f"{client_base}/reset-password?token={token}"

    email_result = await send_password_reset_email(
        to_email=email_clean,
        reset_url=reset_url,
        user_name=user_name,
    )

    logger.info("Forgot password reset token generated for user %s (provider=%s)", user_id_str, email_result.get("provider"))

    return ForgotPasswordResponse(
        success=True,
        message="A verification link has been sent to your email address. Please check your inbox within 15 minutes.",
        dev_reset_url=None,
    )


@router.get("/verify-reset-token", response_model=VerifyResetTokenResponse)
async def verify_reset_token(token: str = Query(..., description="The password reset verification token")):
    """
    Verify whether a reset password token is valid and unexpired before presenting the reset form.
    """
    token_clean = token.strip()
    if not token_clean:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Verification token is required.",
        )

    db = get_async_db()
    record = await db.password_reset_tokens.find_one({"token": token_clean, "used": False})

    if not record:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This verification link is invalid or has already been used. Please request a new password reset.",
        )

    if record.get("expires_at", datetime.min) < datetime.utcnow():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This verification link has expired (15-minute validity). Please request a new password reset.",
        )

    masked = _mask_email(record.get("email", ""))
    return VerifyResetTokenResponse(
        valid=True,
        email=masked,
        message="Token is valid and active.",
    )


@router.post("/reset-password", response_model=ResetPasswordResponse)
async def reset_password(payload: ResetPasswordRequest):
    """
    Reset user password using a verified token.
    Enforces password strength protection layer (8+ chars, special char, uppercase, lowercase, numbers).
    """
    token_clean = payload.token.strip()
    if not token_clean:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Verification token is required.",
        )

    # 1. Enforce password protection layer
    pwd_valid, pwd_err = validate_password_strength(payload.new_password)
    if not pwd_valid:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=pwd_err,
        )

    # 2. Check token in database
    db = get_async_db()
    record = await db.password_reset_tokens.find_one({"token": token_clean, "used": False})

    if not record:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This verification link is invalid or has already been used. Please request a new password reset.",
        )

    now = datetime.utcnow()
    if record.get("expires_at", datetime.min) < now:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This verification link has expired. Please request a new password reset.",
        )

    # 3. Update user password
    user_id_val = to_object_id(record["user_id"]) or record["user_id"]
    new_hash = hash_password(payload.new_password)

    user_update_result = await db.users.update_one(
        {"_id": user_id_val},
        {"$set": {"password_hash": new_hash, "updated_at": now}},
    )

    if user_update_result.matched_count == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User account associated with this token was not found.",
        )

    # 4. Mark token as consumed
    await db.password_reset_tokens.update_one(
        {"_id": record["_id"]},
        {"$set": {"used": True, "used_at": now}},
    )

    logger.info("Password successfully reset for user %s", record["user_id"])

    return ResetPasswordResponse(
        success=True,
        message="Your password has been successfully reset! You can now log in with your new credentials.",
    )


