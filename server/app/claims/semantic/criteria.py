"""
Verification criteria and output contracts for semantic policy evidence matching.

Enforces HARD CONSTRAINTS:
- Verdicts: 'supports' | 'contradicts' | 'ambiguous' | 'conflicting_evidence' | 'no_match'
- Confidence labels: 'high' | 'medium' | 'needs_review' (no numeric probability shown)
- Verbatim excerpt verification: The excerpt MUST be a verbatim substring of the clause text
  (whitespace-normalized). If not, force needs_review.
- Exact arithmetic and precedence stay strictly outside the model.
"""

from __future__ import annotations

import re
from typing import Literal, Optional
from pydantic import BaseModel, Field

VerdictType = Literal["supports", "contradicts", "ambiguous", "conflicting_evidence", "no_match"]
ConfidenceLabel = Literal["high", "medium", "needs_review"]


def normalize_whitespace(s: str) -> str:
    """Normalize repeated whitespace, tabs, and newlines into single spaces."""
    if not s:
        return ""
    return re.sub(r"\s+", " ", s).strip()


def is_verbatim_substring(excerpt: str, clause_text: str) -> bool:
    """
    Check if the excerpt is an exact verbatim substring of the clause text
    after normalizing whitespace. Case-insensitive comparison allowed, but characters must match.
    """
    if not excerpt or not clause_text:
        return False
    norm_excerpt = normalize_whitespace(excerpt).lower()
    norm_clause = normalize_whitespace(clause_text).lower()
    return norm_excerpt in norm_clause


class SemanticMatchResult(BaseModel):
    """
    Structured outcome of matching and verifying a bill/treatment item against policy evidence.
    """
    match_id: str
    clause_id: str
    clause_title: str
    clause_type: str  # exclusion | waiting_period | sub_limit | room_rent | copay
    page: int
    supporting_excerpt: str
    verdict: VerdictType
    confidence: ConfidenceLabel
    review_reason: Optional[str] = None
    similarity_score: Optional[float] = None
    is_fallback: bool = False
    fallback_notice: Optional[str] = None


def enforce_verbatim_excerpt_contract(result: SemanticMatchResult, clause_text: str) -> SemanticMatchResult:
    """
    Enforces the verbatim substring constraint:
    If supporting_excerpt is non-empty and not a verbatim substring of clause_text,
    downgrade confidence to 'needs_review' and append review_reason.
    """
    if result.verdict == "no_match" or not result.supporting_excerpt.strip():
        return result

    if not is_verbatim_substring(result.supporting_excerpt, clause_text):
        result.confidence = "needs_review"
        reason = "Supporting excerpt is not a verbatim substring of policy clause text."
        if result.review_reason:
            result.review_reason = f"{result.review_reason}; {reason}"
        else:
            result.review_reason = reason

    return result
