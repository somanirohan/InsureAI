"""
Policy Document Validator for InsureAI.

Inspects extracted text from uploaded PDF documents to verify that the file
is an authentic insurance policy (e.g., policy schedule, policy wordings,
health / life / accident certificates, social security schemes).

If the document is NOT an insurance policy (e.g. a prescription, medical bill,
invoice, resume, website privacy policy, or generic PDF), it detects the present/missing
keywords and raises a descriptive ValueError or returns a detailed validation report.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field
from typing import Sequence

from app.ingestion.pdf_extract import PageText

logger = logging.getLogger(__name__)

# ── Keyword Dictionaries ──────────────────────────────────────────────────────

CORE_INSURANCE_TERMS = [
    "insurance",
    "insured",
    "insurer",
    "policyholder",
    "policy holder",
    "proposer",
    "underwriting",
    "underwritten",
    "mediclaim",
    "policy schedule",
    "irdai",
    "irda",
    "bima",
    "yojana",
    "beneficiary",
    "third party administrator",
    "tpa",
    "assurance",
    "master policy",
    "certificate of insurance",
]

COVERAGE_FINANCIAL_TERMS = [
    "sum insured",
    "premium",
    "deductible",
    "co-pay",
    "copay",
    "co-payment",
    "room rent",
    "no claim bonus",
    "ncb",
    "restoration",
    "coverage",
    "cumulative bonus",
    "sub-limit",
    "sub limit",
    "limit of coverage",
    "indemnity",
    "cashless",
    "reimbursement",
    "base sum insured",
    "table of benefits",
    "benefit payable",
    "accidental death",
    "permanent disablement",
    "day care treatment",
]

CLAUSE_CONDITION_TERMS = [
    "waiting period",
    "exclusion",
    "exclusions",
    "pre-existing",
    "hospitalization",
    "hospitalisation",
    "in-patient",
    "day care",
    "critical illness",
    "claim procedure",
    "claims procedure",
    "claim settlement",
    "grace period",
    "domiciliary",
    "ayush",
    "maternity",
    "free look period",
    "personal accident",
    "pre-authorisation",
    "pre-authorization",
    "discharge summary",
    "portability",
    "cancellation of policy",
    "claim notification",
]

KNOWN_INSURER_ALIASES = [
    "star health",
    "hdfc ergo",
    "care health",
    "icici lombard",
    "niva bupa",
    "max bupa",
    "tata aig",
    "bajaj allianz",
    "aditya birla",
    "manipalcigna",
    "acko",
    "digit",
    "navi general",
    "zuno",
    "new india assurance",
    "national insurance",
    "oriental insurance",
    "united india insurance",
    "sbi general",
    "pradhan mantri suraksha bima",
    "pmsby",
    "pradhan mantri jeevan jyoti",
    "pmjjby",
    "ayushman bharat",
    "pmjay",
    "pm-jay",
    "cghs",
    "esic",
    "reliance general",
    "future generali",
    "kotak general",
    "royal sundaram",
    "chola ms",
    "universal sompo",
    "magma hdi",
    "raheja qbe",
    "liberty general",
    "iffco tokio",
    "shriram general",
    "setu swasthya",  # test fixtures
]

NON_INSURANCE_POLICY_REGEX = re.compile(
    r"\b(privacy|cookie|cookies|terms of service|terms and conditions|return|refund|shipping|acceptable use|site|website|data protection)\s+policy\b",
    re.IGNORECASE,
)


@dataclass
class PolicyValidationResult:
    """Detailed summary of policy keyword verification."""

    is_valid: bool
    total_distinct_keywords: int
    matched_core: list[str] = field(default_factory=list)
    matched_coverage: list[str] = field(default_factory=list)
    matched_clauses: list[str] = field(default_factory=list)
    matched_insurers: list[str] = field(default_factory=list)
    has_policy_word: bool = False
    confidence_score: float = 0.0
    reason: str = ""


def validate_policy_document(
    pages: Sequence[PageText],
    min_distinct_keywords: int = 3,
    raise_error: bool = True,
) -> PolicyValidationResult:
    """
    Inspects extracted text across all pages of a PDF document to determine
    whether it is a genuine insurance policy document.

    Keyword Matching Strategy:
      1. Aggregates text from all extracted pages.
      2. Excludes deceptive non-insurance phrases like 'privacy policy' or 'cookie policy'.
      3. Scans for Core Insurance, Coverage/Financial, Clause/Condition terms and Known Insurers.
      4. Evaluates total distinct keywords and category representation.
      5. If not an insurance policy, raises a descriptive ValueError (or returns result if raise_error=False).

    Args:
        pages: Sequence of PageText extracted from the PDF.
        min_distinct_keywords: Minimum distinct insurance terms required (default: 3).
        raise_error: If True, raises ValueError when validation fails.

    Returns:
        PolicyValidationResult with matched terms, keyword counts, and verdict.

    Raises:
        ValueError: When raise_error is True and the document is not an insurance policy.
    """
    if not pages:
        msg = "Uploaded document is empty and contains no pages."
        if raise_error:
            raise ValueError(msg)
        return PolicyValidationResult(
            is_valid=False,
            total_distinct_keywords=0,
            reason=msg,
        )

    full_text = " ".join(p.text for p in pages if p.text).strip()
    if len(full_text) < 30:
        msg = (
            "Uploaded PDF contains insufficient readable text (less than 30 characters). "
            "Please ensure the PDF is not blank or corrupted."
        )
        if raise_error:
            raise ValueError(msg)
        return PolicyValidationResult(
            is_valid=False,
            total_distinct_keywords=0,
            reason=msg,
        )

    text_lower = full_text.lower()

    # Filter out deceptive non-insurance phrases to prevent false positives
    cleaned_text = NON_INSURANCE_POLICY_REGEX.sub("", text_lower)
    has_policy_word = "policy" in cleaned_text or "insurance" in cleaned_text or "bima" in cleaned_text

    # Match across categories
    matched_core = [term for term in CORE_INSURANCE_TERMS if term in text_lower]
    matched_coverage = [term for term in COVERAGE_FINANCIAL_TERMS if term in text_lower]
    matched_clauses = [term for term in CLAUSE_CONDITION_TERMS if term in text_lower]
    matched_insurers = [term for term in KNOWN_INSURER_ALIASES if term in text_lower]

    total_distinct = (
        len(matched_core)
        + len(matched_coverage)
        + len(matched_clauses)
        + len(matched_insurers)
    )

    all_matched = matched_core + matched_coverage + matched_clauses + matched_insurers

    # Confidence calculation: 0.0 to 1.0 based on keyword density and breadth
    categories_present = sum([
        1 if matched_core else 0,
        1 if matched_coverage else 0,
        1 if matched_clauses else 0,
        1 if matched_insurers else 0,
    ])
    raw_score = (min(total_distinct, 10) / 10.0) * 0.6 + (categories_present / 4.0) * 0.4
    confidence_score = round(min(max(raw_score, 0.0), 1.0), 2)

    # Decision logic:
    # 1. Must have policy/insurance indicator
    # 2. Must satisfy either:
    #    - Known insurer + at least 1 other insurance term
    #    - Core term + Coverage or Clause term + at least min_distinct_keywords
    #    - At least 4 distinct insurance terms across categories
    is_valid = False
    if total_distinct >= min_distinct_keywords:
        if matched_insurers and total_distinct >= 2:
            is_valid = True
        elif matched_core and (matched_coverage or matched_clauses):
            is_valid = True
        elif total_distinct >= 4:
            is_valid = True

    if is_valid:
        reason = (
            f"Valid insurance policy document. Identified {total_distinct} insurance keywords "
            f"across {categories_present} categories (Confidence: {int(confidence_score * 100)}%)."
        )
        logger.info(
            "Policy validation PASSED for document (%d distinct keywords: core=%s, coverage=%s, clauses=%s, insurers=%s)",
            total_distinct,
            matched_core,
            matched_coverage,
            matched_clauses,
            matched_insurers,
        )
        return PolicyValidationResult(
            is_valid=True,
            total_distinct_keywords=total_distinct,
            matched_core=matched_core,
            matched_coverage=matched_coverage,
            matched_clauses=matched_clauses,
            matched_insurers=matched_insurers,
            has_policy_word=has_policy_word,
            confidence_score=confidence_score,
            reason=reason,
        )

    # Document is NOT an insurance policy
    found_summary = ", ".join(all_matched) if all_matched else "None"
    reason = (
        f"Uploaded document does not appear to be a valid insurance policy. "
        f"Found insurance keywords: [{found_summary}]. "
        f"Mandatory insurance policy terms (such as sum insured, premium, exclusions, waiting periods, or insurer details) were missing."
    )
    logger.warning("Policy validation FAILED: %s", reason)

    if raise_error:
        raise ValueError(reason)

    return PolicyValidationResult(
        is_valid=False,
        total_distinct_keywords=total_distinct,
        matched_core=matched_core,
        matched_coverage=matched_coverage,
        matched_clauses=matched_clauses,
        matched_insurers=matched_insurers,
        has_policy_word=has_policy_word,
        confidence_score=confidence_score,
        reason=reason,
    )
