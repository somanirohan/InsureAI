"""
Unit tests for InsureAI SHA-256 hashing and MongoDB cryptographic security layer.
"""

import pytest
from server.services.crypto_service import (
    ENC_PREFIX,
    build_user_email_query,
    decrypt_aes256,
    encrypt_aes256,
    hash_sha256,
    secure_claim_data,
    secure_policy_data,
    secure_user_data,
    unsecure_claim_data,
    unsecure_policy_data,
    unsecure_user_data,
)


def test_hash_sha256_properties():
    # Deterministic 64-hex char digest
    digest1 = hash_sha256("test@example.com")
    digest2 = hash_sha256("TEST@EXAMPLE.COM ")
    assert digest1 is not None
    assert len(digest1) == 64
    assert digest1 == digest2  # Normalized by default

    assert hash_sha256(None) is None
    assert hash_sha256("") is None


def test_aes256_roundtrip_and_idempotency():
    original = "Sensitive Patient Record - John Doe"
    encrypted = encrypt_aes256(original)
    assert encrypted is not None
    assert encrypted.startswith(ENC_PREFIX)
    assert encrypted != original

    # Decrypt
    decrypted = decrypt_aes256(encrypted)
    assert decrypted == original

    # Idempotent encryption: double encryption does not double prefix
    re_encrypted = encrypt_aes256(encrypted)
    assert re_encrypted == encrypted

    # Legacy unencrypted fallback
    assert decrypt_aes256("plain_unencrypted_value") == "plain_unencrypted_value"


def test_secure_and_unsecure_user_data():
    raw_user = {
        "_id": "507f1f77bcf86cd799439011",
        "full_name": "Dr. Arjun Verma",
        "email": "arjun.verma@example.com",
        "phone": "+91 98765 43210",
        "password_hash": "$2b$12$securepasswordhash",
        "is_active": True,
    }

    secured = secure_user_data(raw_user)

    # Hashes must exist and be 64 characters (SHA-256)
    assert "email_hash" in secured
    assert len(secured["email_hash"]) == 64
    assert secured["email_hash"] == hash_sha256("arjun.verma@example.com")

    assert "full_name_hash" in secured
    assert len(secured["full_name_hash"]) == 64

    assert "phone_hash" in secured
    assert len(secured["phone_hash"]) == 64

    # Critical values must be encrypted
    assert secured["email"].startswith(ENC_PREFIX)
    assert secured["full_name"].startswith(ENC_PREFIX)
    assert secured["phone"].startswith(ENC_PREFIX)

    # Identifiers and security metadata preserved
    assert secured["_id"] == raw_user["_id"]
    assert secured["password_hash"] == raw_user["password_hash"]
    assert secured["is_active"] is True

    # Unsecure restores original data
    unsecured = unsecure_user_data(secured)
    assert unsecured["full_name"] == raw_user["full_name"]
    assert unsecured["email"] == raw_user["email"]
    assert unsecured["phone"] == raw_user["phone"]


def test_build_user_email_query():
    query = build_user_email_query("DEMO@insurai.com ")
    assert "$or" in query
    expected_hash = hash_sha256("demo@insurai.com")
    conditions = query["$or"]
    assert {"email_hash": expected_hash} in conditions
    assert {"email": "demo@insurai.com"} in conditions


def test_secure_and_unsecure_claim_data():
    raw_claim = {
        "claim_id": "claim-xyz-123",
        "user_id": "user-456",
        "policy_id": "pol-789",
        "status": "draft",
        "treatment": {
            "name": "Coronary Angioplasty",
            "hospital": "Apollo Speciality Hospitals",
            "doctor_name": "Dr. Ramesh Gupta",
            "patient_name": "Suresh Patel",
            "diagnosis": "Severe Angina Pectoris",
            "room_type": "Single Private AC",
        },
    }

    secured = secure_claim_data(raw_claim)

    # Hashes present
    assert "treatment_hash" in secured
    assert secured["treatment_hash"] == hash_sha256("Coronary Angioplasty")
    assert "patient_name_hash" in secured
    assert secured["patient_name_hash"] == hash_sha256("Suresh Patel")
    assert "doctor_name_hash" in secured
    assert secured["doctor_name_hash"] == hash_sha256("Dr. Ramesh Gupta")
    assert "hospital_hash" in secured
    assert secured["hospital_hash"] == hash_sha256("Apollo Speciality Hospitals")

    # Critical patient & doctor values in treatment dict must be encrypted
    t = secured["treatment"]
    assert t["name"].startswith(ENC_PREFIX)
    assert t["hospital"].startswith(ENC_PREFIX)
    assert t["doctor_name"].startswith(ENC_PREFIX)
    assert t["patient_name"].startswith(ENC_PREFIX)
    assert t["diagnosis"].startswith(ENC_PREFIX)

    # Non-sensitive field unchanged
    assert t["room_type"] == "Single Private AC"

    # Preserved relational IDs
    assert secured["claim_id"] == "claim-xyz-123"
    assert secured["user_id"] == "user-456"
    assert secured["policy_id"] == "pol-789"
    assert secured["status"] == "draft"

    # Unsecure restores readability
    unsecured = unsecure_claim_data(secured)
    assert unsecured["treatment"]["name"] == "Coronary Angioplasty"
    assert unsecured["treatment"]["patient_name"] == "Suresh Patel"
    assert unsecured["treatment"]["doctor_name"] == "Dr. Ramesh Gupta"


def test_secure_and_unsecure_policy_data():
    raw_policy = {
        "policy_number": "POL-STAR-2026-9988",
        "insurer_name": "Star Health",
    }

    secured = secure_policy_data(raw_policy)
    assert "policy_number_hash" in secured
    assert secured["policy_number_hash"] == hash_sha256("POL-STAR-2026-9988")
    assert secured["policy_number"].startswith(ENC_PREFIX)

    unsecured = unsecure_policy_data(secured)
    assert unsecured["policy_number"] == "POL-STAR-2026-9988"
