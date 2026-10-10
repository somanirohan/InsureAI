"""
Cryptographic Service for InsureAI MongoDB data security.
Provides:
  - Deterministic SHA-256 hashing for critical values (names, emails, phones, treatments, policy numbers)
    for high-speed lookups, uniqueness checks, and blind indexing.
  - Reversible AES-256-GCM authenticated encryption at rest for critical fields (names, emails, phones, treatments)
    allowing seamless decryption when serving authorized UI requests.
  - Transparent preservation of relational identifier keys (_id, user_id, claim_id, policy_id).
"""

from __future__ import annotations

import base64
import hashlib
import logging
import os
from typing import Any, Dict, List, Optional

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

try:
    from config import settings
except ImportError:
    from server.config import settings

logger = logging.getLogger("insureai.crypto")

# Prefix identifying encrypted values at rest
ENC_PREFIX = "enc:v1:"


def _get_encryption_key() -> bytes:
    """Derive a 256-bit (32-byte) key deterministically from the master secret."""
    master = getattr(settings, "ENCRYPTION_KEY", None) or getattr(settings, "JWT_SECRET", None) or "insureai_default_master_key_2026"
    return hashlib.sha256(master.encode("utf-8")).digest()


def hash_sha256(val: Optional[Any], normalize: bool = True) -> Optional[str]:
    """
    Compute a deterministic SHA-256 hexadecimal digest for indexing/lookup.
    Normalizes whitespace and converts to lowercase by default.
    """
    if val is None:
        return None
    val_str = str(val).strip()
    if not val_str:
        return None
    if normalize:
        val_str = val_str.lower()
    return hashlib.sha256(val_str.encode("utf-8")).hexdigest()


def encrypt_aes256(plaintext: Optional[Any]) -> Optional[str]:
    """
    Encrypt a plaintext string using AES-256-GCM authenticated encryption.
    Returns string prefixed with 'enc:v1:' followed by base64-encoded (nonce + ciphertext).
    Idempotent: if value is already encrypted, returns as-is.
    """
    if plaintext is None:
        return None
    text = str(plaintext).strip()
    if not text:
        return ""
    if text.startswith(ENC_PREFIX):
        return text

    try:
        key = _get_encryption_key()
        aesgcm = AESGCM(key)
        nonce = os.urandom(12)  # 96-bit standard nonce for GCM
        ct = aesgcm.encrypt(nonce, text.encode("utf-8"), None)
        encoded = base64.b64encode(nonce + ct).decode("utf-8")
        return f"{ENC_PREFIX}{encoded}"
    except Exception as exc:
        logger.error("Failed to encrypt value with AES-256: %s", exc)
        return text


def decrypt_aes256(ciphertext: Optional[Any]) -> Optional[str]:
    """
    Decrypt an AES-256-GCM encrypted string.
    Gracefully handles legacy unencrypted strings by returning them unchanged.
    """
    if ciphertext is None:
        return None
    if not isinstance(ciphertext, str):
        return str(ciphertext)
    if not ciphertext.startswith(ENC_PREFIX):
        return ciphertext

    try:
        payload = ciphertext[len(ENC_PREFIX):]
        raw = base64.b64decode(payload.encode("utf-8"))
        if len(raw) < 13:
            return ciphertext
        nonce = raw[:12]
        ct = raw[12:]
        key = _get_encryption_key()
        aesgcm = AESGCM(key)
        return aesgcm.decrypt(nonce, ct, None).decode("utf-8")
    except Exception as exc:
        logger.warning("Decryption failed for value (returning raw fallback): %s", exc)
        return ciphertext


# ── Document Transformers: Users ──────────────────────────────────────────────

def secure_user_data(user_dict: dict[str, Any]) -> dict[str, Any]:
    """
    Transform user dict for MongoDB storage:
      - Hashes 'email' with SHA-256 -> 'email_hash'
      - Hashes 'full_name' with SHA-256 -> 'full_name_hash'
      - Hashes 'phone' with SHA-256 -> 'phone_hash' (if present)
      - Encrypts 'email', 'full_name', 'phone' at rest with AES-256-GCM
      - Preserves _id, google_id, password_hash, auth_provider, is_active, timestamps.
    """
    if not user_dict:
        return {}
    res = dict(user_dict)

    if "email" in res and res["email"]:
        email_clean = str(res["email"]).strip()
        if not email_clean.startswith(ENC_PREFIX):
            res["email_hash"] = hash_sha256(email_clean, normalize=True)
            res["email"] = encrypt_aes256(email_clean)
        elif "email_hash" not in res:
            decrypted = decrypt_aes256(email_clean)
            if decrypted:
                res["email_hash"] = hash_sha256(decrypted, normalize=True)

    if "full_name" in res and res["full_name"]:
        name_clean = str(res["full_name"]).strip()
        if not name_clean.startswith(ENC_PREFIX):
            res["full_name_hash"] = hash_sha256(name_clean, normalize=True)
            res["full_name"] = encrypt_aes256(name_clean)
        elif "full_name_hash" not in res:
            decrypted = decrypt_aes256(name_clean)
            if decrypted:
                res["full_name_hash"] = hash_sha256(decrypted, normalize=True)

    if "phone" in res and res["phone"]:
        phone_clean = str(res["phone"]).strip()
        if not phone_clean.startswith(ENC_PREFIX):
            res["phone_hash"] = hash_sha256(phone_clean, normalize=True)
            res["phone"] = encrypt_aes256(phone_clean)
        elif "phone_hash" not in res:
            decrypted = decrypt_aes256(phone_clean)
            if decrypted:
                res["phone_hash"] = hash_sha256(decrypted, normalize=True)

    return res


def unsecure_user_data(user_dict: Optional[dict[str, Any]]) -> Optional[dict[str, Any]]:
    """
    Transform stored MongoDB user dict into decrypted plaintext fields for API responses.
    """
    if not user_dict:
        return None
    res = dict(user_dict)

    if "email" in res and res["email"]:
        res["email"] = decrypt_aes256(res["email"])
    if "full_name" in res and res["full_name"]:
        res["full_name"] = decrypt_aes256(res["full_name"])
    if "phone" in res and res["phone"]:
        res["phone"] = decrypt_aes256(res["phone"])

    return res


def build_user_email_query(email: str) -> dict[str, Any]:
    """
    Build MongoDB query to find user by email matching either SHA-256 email_hash or plaintext/hashed email.
    """
    clean_email = email.lower().strip()
    e_hash = hash_sha256(clean_email, normalize=True)
    return {
        "$or": [
            {"email_hash": e_hash},
            {"email": clean_email},
            {"email": e_hash},
        ]
    }


# ── Document Transformers: Claims ─────────────────────────────────────────────

def secure_claim_data(claim_dict: dict[str, Any]) -> dict[str, Any]:
    """
    Transform claim dict for MongoDB storage:
      - Hashes critical treatment name, patient name, doctor name, hospital, diagnosis with SHA-256
      - Encrypts clinical/patient details in 'treatment' with AES-256-GCM
      - PRESERVES _id, claim_id, user_id, policy_id, status unhashed.
    """
    if not claim_dict:
        return {}
    res = dict(claim_dict)

    treatment = res.get("treatment")
    if isinstance(treatment, dict):
        t_copy = dict(treatment)
        t_name = t_copy.get("name") or t_copy.get("treatment_type") or ""
        if t_name and not str(t_name).startswith(ENC_PREFIX):
            res["treatment_hash"] = hash_sha256(str(t_name).strip(), normalize=True)

        if "patient_name" in t_copy and t_copy["patient_name"]:
            val = str(t_copy["patient_name"]).strip()
            if not val.startswith(ENC_PREFIX):
                res["patient_name_hash"] = hash_sha256(val, normalize=True)

        if "doctor_name" in t_copy and t_copy["doctor_name"]:
            val = str(t_copy["doctor_name"]).strip()
            if not val.startswith(ENC_PREFIX):
                res["doctor_name_hash"] = hash_sha256(val, normalize=True)

        if "hospital" in t_copy and t_copy["hospital"]:
            val = str(t_copy["hospital"]).strip()
            if not val.startswith(ENC_PREFIX):
                res["hospital_hash"] = hash_sha256(val, normalize=True)

        if "diagnosis" in t_copy and t_copy["diagnosis"]:
            val = str(t_copy["diagnosis"]).strip()
            if not val.startswith(ENC_PREFIX):
                res["diagnosis_hash"] = hash_sha256(val, normalize=True)

        for field in ("name", "hospital", "hospital_city", "doctor_name", "patient_name", "diagnosis"):
            if field in t_copy and t_copy[field]:
                val = str(t_copy[field]).strip()
                if not val.startswith(ENC_PREFIX):
                    t_copy[field] = encrypt_aes256(val)
        res["treatment"] = t_copy

    return res


def unsecure_claim_data(claim_dict: Optional[dict[str, Any]]) -> Optional[dict[str, Any]]:
    """
    Transform stored MongoDB claim dict into decrypted plaintext fields for API responses.
    """
    if not claim_dict:
        return None
    res = dict(claim_dict)

    treatment = res.get("treatment")
    if isinstance(treatment, dict):
        t_copy = dict(treatment)
        for field in ("name", "hospital", "hospital_city", "doctor_name", "patient_name", "diagnosis"):
            if field in t_copy and t_copy[field]:
                t_copy[field] = decrypt_aes256(t_copy[field])
        res["treatment"] = t_copy

    return res


# ── Document Transformers: Policies ───────────────────────────────────────────

def secure_policy_data(policy_dict: dict[str, Any]) -> dict[str, Any]:
    """
    Transform policy dict for MongoDB storage:
      - Hashes 'policy_number' with SHA-256 -> 'policy_number_hash'
      - Encrypts 'policy_number' at rest with AES-256-GCM
    """
    if not policy_dict:
        return {}
    res = dict(policy_dict)

    if "policy_number" in res and res["policy_number"]:
        pol_num = str(res["policy_number"]).strip()
        if not pol_num.startswith(ENC_PREFIX):
            res["policy_number_hash"] = hash_sha256(pol_num, normalize=True)
            res["policy_number"] = encrypt_aes256(pol_num)
        elif "policy_number_hash" not in res:
            decrypted = decrypt_aes256(pol_num)
            if decrypted:
                res["policy_number_hash"] = hash_sha256(decrypted, normalize=True)

    return res


def unsecure_policy_data(policy_dict: Optional[dict[str, Any]]) -> Optional[dict[str, Any]]:
    """
    Transform stored MongoDB policy dict into decrypted plaintext fields for API responses.
    """
    if not policy_dict:
        return None
    res = dict(policy_dict)

    if "policy_number" in res and res["policy_number"]:
        res["policy_number"] = decrypt_aes256(res["policy_number"])

    return res


# ── Migration Utility ─────────────────────────────────────────────────────────

def migrate_database_records(db_instance) -> dict[str, int]:
    """
    Scans users, claims, and policies in MongoDB and updates unhashed/unencrypted
    records with SHA-256 hashes and AES-256 encryption.
    """
    counts = {"users": 0, "claims": 0, "policies": 0}

    # 1. Users
    for user in db_instance.users.find({}):
        needs_update = False
        raw_email = user.get("email")
        raw_name = user.get("full_name")
        raw_phone = user.get("phone")

        if not user.get("email_hash") or (raw_email and not str(raw_email).startswith(ENC_PREFIX)):
            needs_update = True
        if not user.get("full_name_hash") or (raw_name and not str(raw_name).startswith(ENC_PREFIX)):
            needs_update = True
        if raw_phone and (not user.get("phone_hash") or not str(raw_phone).startswith(ENC_PREFIX)):
            needs_update = True

        if needs_update:
            secured = secure_user_data(user)
            db_instance.users.update_one({"_id": user["_id"]}, {"$set": secured})
            counts["users"] += 1

    # 2. Claims
    for claim in db_instance.claims.find({}):
        treatment = claim.get("treatment")
        if isinstance(treatment, dict):
            needs_update = False
            t_name = treatment.get("name") or treatment.get("treatment_type")
            if t_name and not str(t_name).startswith(ENC_PREFIX):
                needs_update = True
            if not claim.get("treatment_hash"):
                needs_update = True

            if needs_update:
                secured = secure_claim_data(claim)
                db_instance.claims.update_one({"_id": claim["_id"]}, {"$set": secured})
                counts["claims"] += 1

    # 3. Policies
    for policy in db_instance.policies.find({}):
        pol_num = policy.get("policy_number")
        if pol_num and (not policy.get("policy_number_hash") or not str(pol_num).startswith(ENC_PREFIX)):
            secured = secure_policy_data(policy)
            db_instance.policies.update_one({"_id": policy["_id"]}, {"$set": secured})
            counts["policies"] += 1

    return counts
