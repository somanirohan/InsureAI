"""
Deterministic document and evidence precedence table for InsureAI.

HARD CONSTRAINT:
Document precedence (which source wins when amounts or dates conflict) is a
deterministic rule table in this single file, NEVER decided by a learned model.

Precedence order (highest to lowest priority):
  1. irda_guideline: Statutory regulatory cap (IRDAI) always supersedes policy terms on legal mandates.
  2. user_confirmed: Explicit user-confirmed or adjuster-overridden values.
  3. final_bill: Hospital signed and stamped final inpatient discharge bill.
  4. itemised_bills: Detailed line-item breakdown bills from hospital/pharmacy.
  5. preauth_approval_letter: Pre-authorization or cashless sanction letter issued by TPA/Insurer.
  6. discharge_summary: Clinical notes, dates, and diagnosis summary.
  7. pre_treatment_estimate: Initial preliminary cost estimate.
"""

from __future__ import annotations

from typing import Dict, List, Optional, Tuple

PRECEDENCE_RANKS: Dict[str, int] = {
    "irda_guideline": 100,
    "user_confirmed": 90,
    "final_bill": 80,
    "itemised_bills": 70,
    "preauth_approval_letter": 60,
    "discharge_summary": 50,
    "pre_treatment_estimate": 40,
    "unknown": 10,
}


def get_document_precedence_rank(doc_type: str) -> int:
    """Return numeric precedence rank for a document type (higher rank wins)."""
    return PRECEDENCE_RANKS.get(doc_type.lower().strip(), 10)


def resolve_conflicting_amounts(
    candidates: List[Tuple[str, float, str]],
) -> Tuple[str, float, str]:
    """
    Given a list of (source_type, amount, identifier), resolve the winning amount
    deterministically based strictly on the precedence table.

    Example:
      resolve_conflicting_amounts([
        ("pre_treatment_estimate", 120000.0, "est_1"),
        ("final_bill", 145000.0, "fb_1"),
        ("itemised_bills", 142000.0, "ib_1"),
      ]) -> ("final_bill", 145000.0, "fb_1")
    """
    if not candidates:
        raise ValueError("Candidates list cannot be empty")

    sorted_candidates = sorted(
        candidates,
        key=lambda c: get_document_precedence_rank(c[0]),
        reverse=True,
    )
    return sorted_candidates[0]


def resolve_conflicting_dates(
    candidates: List[Tuple[str, str, str]],
) -> Tuple[str, str, str]:
    """
    Given a list of (source_type, date_iso, identifier), resolve the winning date
    deterministically based strictly on the precedence table.
    """
    if not candidates:
        raise ValueError("Candidates list cannot be empty")

    sorted_candidates = sorted(
        candidates,
        key=lambda c: get_document_precedence_rank(c[0]),
        reverse=True,
    )
    return sorted_candidates[0]
