"""
Policy document validation and duplicate detection service for InsureAI.
Validates that uploaded PDF documents are legitimate insurance contracts
by inspecting domain-specific policy terminology (e.g., premium, cover,
sum insured, exclusions, waiting periods, claims) and computes cryptographic
hashes to prevent duplicate uploads.
"""

from __future__ import annotations

import hashlib
import logging
import re
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger("insureai.validator")

# Essential insurance terminology patterns
INSURANCE_KEYWORDS: dict[str, str] = {
    "premium": r"\bpremium(s)?\b",
    "cover": r"\b(cover|coverage|coverages|covered)\b",
    "policy": r"\b(policy|policyholder|policyholders|policy\s*schedule|policy\s*number|policy\s*period)\b",
    "insurance": r"\b(insurance|insurer|insurers|underwriting|underwriter)\b",
    "sum_insured": r"\b(sum\s*insured|sum\s*assured|insured\s*(person|amount|sum)?)\b",
    "claim": r"\b(claim|claims|claimant|cashless|reimbursement)\b",
    "exclusion": r"\b(exclusion|exclusions|excluded)\b",
    "waiting_period": r"\b(waiting\s*period|waiting\s*periods)\b",
    "deductible_copay": r"\b(deductible|co-?pay|co-?payment|copay|copayment)\b",
    "hospitalization": r"\b(hospital|hospitali[sz]ation|day\s*care|in-?patient|network\s*hospital)\b",
    "sub_limit": r"\b(sub-?limit|sub-?limits|room\s*rent|icu)\b",
    "regulatory_tpa": r"\b(irdai?|tpa|third\s*party\s*administrator|pre-?existing|domiciliary)\b",
}


def compute_bytes_sha256(data: bytes) -> str:
    """Compute SHA-256 hex digest for binary data."""
    return hashlib.sha256(data).hexdigest()


def compute_file_sha256(file_path: str) -> str:
    """Compute SHA-256 hex digest for a file on disk."""
    hasher = hashlib.sha256()
    with open(file_path, "rb") as f:
        while chunk := f.read(65536):
            hasher.update(chunk)
    return hasher.hexdigest()


def validate_policy_text(text: str) -> dict[str, Any]:
    """
    Validate that extracted document text contains genuine insurance contract wordings.

    Checks:
      1. Presence of 'premium' (or 'premiums')
      2. Presence of 'cover' (or 'coverage', 'covered')
      3. Presence of additional insurance terms (sum insured, exclusions, claims, policyholder, etc.)
      4. Total number of matched insurance concept categories (minimum 3 required)

    Returns:
      dict with keys:
        - is_valid (bool)
        - reason (str)
        - matched_terms (list[str])
        - missing_required (list[str])
    """
    if not text or not text.strip():
        return {
            "is_valid": False,
            "reason": "Document contains no readable text.",
            "matched_terms": [],
            "missing_required": ["premium", "cover", "policy"],
        }

    text_lower = text.lower()

    # Match each category
    matched_categories: list[str] = []
    for cat_name, pattern in INSURANCE_KEYWORDS.items():
        if re.search(pattern, text_lower):
            matched_categories.append(cat_name)

    has_premium = "premium" in matched_categories
    has_cover = "cover" in matched_categories

    missing_required: list[str] = []
    if not has_premium:
        missing_required.append("premium")
    if not has_cover:
        missing_required.append("cover / coverage")

    # Evaluate validation criteria:
    # A genuine insurance policy must contain:
    #   - 'premium' AND 'cover' (or 'coverage')
    #   - OR at least 4 strong insurance categories including 'policy' and ('sum_insured' or 'insurance')
    # AND have at least 3 total matched insurance concept categories.
    is_valid = True
    reasons: list[str] = []

    if not has_premium and not has_cover:
        is_valid = False
        reasons.append("Missing essential policy terms: 'premium' and 'cover'.")
    elif not has_premium:
        # Check if it has very strong insurance signal despite lacking the word premium (e.g. policy + sum insured + exclusions)
        if len(matched_categories) < 4 or "sum_insured" not in matched_categories:
            is_valid = False
            reasons.append("Missing required term: 'premium'.")
    elif not has_cover:
        # Check if it has strong alternative insurance signal
        if len(matched_categories) < 4:
            is_valid = False
            reasons.append("Missing required term: 'cover' or 'coverage'.")

    if len(matched_categories) < 3:
        is_valid = False
        reasons.append(
            f"Insufficient insurance terms detected ({len(matched_categories)} matched; minimum 3 required). "
            f"Expected terms like premium, cover, sum insured, exclusions, waiting period, or claims."
        )

    reason_str = " ".join(reasons) if not is_valid else "Valid insurance policy document."

    logger.info(
        "Policy text validation: is_valid=%s, matched=%d (%s), missing=%s",
        is_valid,
        len(matched_categories),
        matched_categories,
        missing_required,
    )

    return {
        "is_valid": is_valid,
        "reason": reason_str,
        "matched_terms": matched_categories,
        "missing_required": missing_required,
    }


async def check_duplicate_policy(
    db: Any,
    user_id: Any,
    file_hash: str,
    orig_filename: str,
    file_size_bytes: int,
) -> Optional[dict[str, Any]]:
    """
    Check if a policy has already been uploaded by this user in MongoDB.
    Detects duplicate files by SHA-256 hash or identical filename + file size.
    Ignores previously failed uploads so users can re-try.
    """
    query = {
        "user_id": user_id,
        "$or": [
            {"file_hash": file_hash},
            {"file_name": orig_filename, "file_size_bytes": file_size_bytes},
        ],
        "status": "ready",
    }

    existing = await db.policies.find_one(query)
    return existing
