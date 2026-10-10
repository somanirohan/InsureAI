"""
Google OAuth verification service for InsureAI.
Supports Google Identity Services (GIS) ID tokens and standard OAuth 2.0 Authorization Code exchange.
Keeps Google credentials securely configured on the server.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, Optional
import httpx

try:
    from config import settings
except ImportError:
    from server.config import settings

logger = logging.getLogger("insureai.google_auth")

GOOGLE_TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo"
GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo"


async def verify_google_id_token(id_token: str) -> Optional[dict[str, Any]]:
    """
    Verify a Google ID token (JWT) using Google's tokeninfo endpoint.
    Extracts verified user identity fields (email, name, picture, sub).
    """
    if not id_token or not id_token.strip():
        logger.warning("Empty Google ID token provided.")
        return None

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                GOOGLE_TOKENINFO_URL,
                params={"id_token": id_token.strip()},
            )
            if resp.status_code != 200:
                logger.warning(
                    "Google tokeninfo rejected token with status %d: %s",
                    resp.status_code,
                    resp.text[:200],
                )
                return None

            data = resp.json()

            # Verify audience matches client ID if configured
            expected_aud = settings.GOOGLE_CLIENT_ID
            aud = data.get("aud")
            if expected_aud and aud != expected_aud:
                logger.warning(
                    "Google token audience mismatch. Expected '%s', got '%s'",
                    expected_aud,
                    aud,
                )
                return None

            # Verify issuer
            iss = data.get("iss", "")
            if iss not in ("accounts.google.com", "https://accounts.google.com"):
                logger.warning("Google token invalid issuer: %s", iss)
                return None

            email = data.get("email")
            if not email:
                logger.warning("Google token missing email address.")
                return None

            return {
                "google_id": data.get("sub"),
                "email": email.lower().strip(),
                "full_name": data.get("name") or email.split("@")[0],
                "avatar_url": data.get("picture"),
                "email_verified": data.get("email_verified") in (True, "true"),
            }
    except Exception as exc:
        logger.exception("Error verifying Google ID token: %s", exc)
        return None


async def exchange_google_auth_code(
    code: str,
    redirect_uri: Optional[str] = None,
) -> Optional[dict[str, Any]]:
    """
    Exchange an authorization code for Google tokens and extract user identity.
    """
    if not code or not code.strip():
        return None

    client_id = settings.GOOGLE_CLIENT_ID
    client_secret = settings.GOOGLE_CLIENT_SECRET
    effective_redirect_uri = redirect_uri or settings.GOOGLE_REDIRECT_URI

    if not client_id or not client_secret:
        logger.error("Google OAuth client_id or client_secret is not configured on server.")
        return None

    try:
        async with httpx.AsyncClient(timeout=12.0) as client:
            token_resp = await client.post(
                GOOGLE_TOKEN_ENDPOINT,
                data={
                    "code": code.strip(),
                    "client_id": client_id,
                    "client_secret": client_secret,
                    "redirect_uri": effective_redirect_uri,
                    "grant_type": "authorization_code",
                },
            )

            if token_resp.status_code != 200:
                logger.warning(
                    "Google code exchange failed with status %d: %s",
                    token_resp.status_code,
                    token_resp.text[:200],
                )
                return None

            tokens = token_resp.json()
            id_token = tokens.get("id_token")
            access_token = tokens.get("access_token")

            # Try ID token verification first
            if id_token:
                user_info = await verify_google_id_token(id_token)
                if user_info:
                    return user_info

            # Fallback to fetching userinfo via access token
            if access_token:
                userinfo_resp = await client.get(
                    GOOGLE_USERINFO_URL,
                    headers={"Authorization": f"Bearer {access_token}"},
                )
                if userinfo_resp.status_code == 200:
                    u_data = userinfo_resp.json()
                    email = u_data.get("email")
                    if email:
                        return {
                            "google_id": u_data.get("sub"),
                            "email": email.lower().strip(),
                            "full_name": u_data.get("name") or email.split("@")[0],
                            "avatar_url": u_data.get("picture"),
                            "email_verified": u_data.get("email_verified", True),
                        }

            return None
    except Exception as exc:
        logger.exception("Error exchanging Google authorization code: %s", exc)
        return None
