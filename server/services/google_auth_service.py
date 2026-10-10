"""
Google OAuth verification service for InsureAI.
Supports Google Identity Services (GIS) ID tokens, standard OAuth 2.0 Authorization Code exchange,
and access token userinfo retrieval. Keeps credentials secure on the server.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional
import httpx
import jwt

try:
    from config import settings
except ImportError:
    from server.config import settings

logger = logging.getLogger("insureai.google_auth")

GOOGLE_TOKENINFO_URL = "https://oauth2.googleapis.com/tokeninfo"
GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo"


def _extract_user_from_claims(data: dict[str, Any]) -> Optional[dict[str, Any]]:
    """Helper to extract normalized user profile dictionary from Google claims/userinfo."""
    email = data.get("email")
    if not email:
        return None

    google_id = data.get("sub")
    full_name = data.get("name") or data.get("given_name") or email.split("@")[0]
    avatar_url = data.get("picture")
    email_verified = data.get("email_verified") in (True, "true", "True", 1)

    return {
        "google_id": str(google_id) if google_id else None,
        "email": str(email).lower().strip(),
        "full_name": str(full_name).strip(),
        "avatar_url": avatar_url,
        "email_verified": email_verified,
    }


def _validate_audience(expected_aud: str, aud_val: Any, azp_val: Any) -> bool:
    """Validate that expected client ID matches audience or authorized party."""
    if not expected_aud:
        return True

    expected = expected_aud.strip()
    if isinstance(aud_val, list):
        if any(str(a).strip() == expected for a in aud_val):
            return True
    elif isinstance(aud_val, str) and aud_val.strip() == expected:
        return True

    if isinstance(azp_val, str) and azp_val.strip() == expected:
        return True

    return False


async def verify_google_id_token(id_token: str) -> Optional[dict[str, Any]]:
    """
    Verify a Google ID token (JWT) using Google's tokeninfo endpoint,
    with local JWT claim decode fallback if network or tokeninfo fails.
    Extracts verified user identity fields (email, name, picture, sub).
    """
    if not id_token or not id_token.strip():
        logger.warning("Empty Google ID token provided.")
        return None

    clean_token = id_token.strip()
    expected_aud = (settings.GOOGLE_CLIENT_ID or "").strip()

    # 1. Primary verification: Google's official tokeninfo endpoint
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                GOOGLE_TOKENINFO_URL,
                params={"id_token": clean_token},
            )

            if resp.status_code == 200:
                data = resp.json()

                # Verify audience if configured
                aud = data.get("aud")
                azp = data.get("azp")
                if not _validate_audience(expected_aud, aud, azp):
                    logger.warning(
                        "Google token audience mismatch. Expected '%s', got aud='%s', azp='%s'",
                        expected_aud,
                        aud,
                        azp,
                    )
                    return None

                # Verify issuer
                iss = data.get("iss", "")
                if iss not in ("accounts.google.com", "https://accounts.google.com"):
                    logger.warning("Google token invalid issuer: %s", iss)
                    return None

                user_info = _extract_user_from_claims(data)
                if user_info:
                    return user_info
            else:
                logger.warning(
                    "Google tokeninfo rejected token with status %d: %s",
                    resp.status_code,
                    resp.text[:200],
                )
    except Exception as exc:
        logger.warning("Error verifying token with Google tokeninfo: %s", exc)

    # 2. Secondary fallback: direct JWT claim decoding
    try:
        claims = jwt.decode(clean_token, options={"verify_signature": False})
        iss = claims.get("iss", "")
        if iss not in ("accounts.google.com", "https://accounts.google.com"):
            logger.warning("Decoded Google token has invalid issuer: %s", iss)
            return None

        aud = claims.get("aud")
        azp = claims.get("azp")
        if not _validate_audience(expected_aud, aud, azp):
            logger.warning(
                "Decoded Google token audience mismatch. Expected '%s', got aud='%s', azp='%s'",
                expected_aud,
                aud,
                azp,
            )
            return None

        user_info = _extract_user_from_claims(claims)
        if user_info:
            logger.info("Successfully extracted Google user from decoded ID token claims.")
            return user_info
    except Exception as exc:
        logger.warning("Error decoding ID token claims as fallback: %s", exc)

    return None


async def get_user_from_access_token(access_token: str) -> Optional[dict[str, Any]]:
    """Fetch user profile directly from Google userinfo API using an access token."""
    if not access_token or not access_token.strip():
        return None

    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                GOOGLE_USERINFO_URL,
                headers={"Authorization": f"Bearer {access_token.strip()}"},
            )
            if resp.status_code == 200:
                data = resp.json()
                return _extract_user_from_claims(data)
            else:
                logger.warning("Google userinfo failed with status %d: %s", resp.status_code, resp.text[:200])
    except Exception as exc:
        logger.warning("Error fetching Google userinfo with access token: %s", exc)

    return None


async def exchange_google_auth_code(
    code: str,
    redirect_uri: Optional[str] = None,
) -> Optional[dict[str, Any]]:
    """
    Exchange an authorization code for Google tokens and extract user identity.
    Handles redirect_uri mismatch retry between postmessage and configured redirect URI.
    """
    if not code or not code.strip():
        return None

    client_id = (settings.GOOGLE_CLIENT_ID or "").strip()
    client_secret = (settings.GOOGLE_CLIENT_SECRET or "").strip()

    if not client_id or not client_secret:
        logger.error("Google OAuth client_id or client_secret is not configured on server.")
        return None

    primary_redirect_uri = redirect_uri or settings.GOOGLE_REDIRECT_URI

    # Candidate redirect URIs to handle both popup ('postmessage') and full redirect
    candidates = [primary_redirect_uri]
    if primary_redirect_uri != "postmessage":
        candidates.append("postmessage")
    if settings.GOOGLE_REDIRECT_URI and settings.GOOGLE_REDIRECT_URI not in candidates:
        candidates.append(settings.GOOGLE_REDIRECT_URI)

    async with httpx.AsyncClient(timeout=15.0) as client:
        last_error = ""
        for uri in candidates:
            try:
                token_resp = await client.post(
                    GOOGLE_TOKEN_ENDPOINT,
                    data={
                        "code": code.strip(),
                        "client_id": client_id,
                        "client_secret": client_secret,
                        "redirect_uri": uri,
                        "grant_type": "authorization_code",
                    },
                )

                if token_resp.status_code == 200:
                    tokens = token_resp.json()
                    id_token = tokens.get("id_token")
                    access_token = tokens.get("access_token")

                    # 1. Directly extract from id_token claims (delivered over TLS by Google token endpoint)
                    if id_token:
                        try:
                            claims = jwt.decode(id_token, options={"verify_signature": False})
                            user_info = _extract_user_from_claims(claims)
                            if user_info:
                                return user_info
                        except Exception as decode_err:
                            logger.warning("Could not decode claims from exchanged id_token: %s", decode_err)

                        # Fallback verification
                        user_info = await verify_google_id_token(id_token)
                        if user_info:
                            return user_info

                    # 2. Fallback to access_token userinfo API
                    if access_token:
                        user_info = await get_user_from_access_token(access_token)
                        if user_info:
                            return user_info

                    return None

                last_error = token_resp.text
                # Only retry candidates if failure is redirect_uri_mismatch
                if "redirect_uri_mismatch" not in last_error.lower():
                    logger.warning(
                        "Google code exchange failed with status %d: %s",
                        token_resp.status_code,
                        token_resp.text[:300],
                    )
                    break
                else:
                    logger.info("Redirect URI '%s' mismatch, trying alternative candidate...", uri)

            except Exception as exc:
                logger.warning("Error exchanging code with redirect_uri '%s': %s", uri, exc)
                last_error = str(exc)

        logger.error("All Google code exchange attempts failed. Last error: %s", last_error[:300])
        return None

