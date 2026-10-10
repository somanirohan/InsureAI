"""
Deterministic Claim Readiness and Flag Aggregation Engine.
Produces qualitative completeness summaries without any numeric percentages or risk scores.
Guards the transition to 'ready_to_submit' strictly enforcing that all required items
are complete and zero blocking flags remain.
"""

from __future__ import annotations

from typing import Any, Dict, List, Tuple
from pydantic import BaseModel, Field

from app.claims.models import Claim, EligibilityFlag


class ReadinessSummary(BaseModel):
    total_items: int = 0
    complete_items: int = 0
    flagged_items: int = 0
    missing_items: int = 0
    qualitative_label: str
    all_flags: List[EligibilityFlag] = Field(default_factory=list)
    blocking_flags_count: int = 0
    can_submit: bool = False
    submission_blockers: List[str] = Field(default_factory=list)


def compute_claim_readiness(claim: Claim) -> ReadinessSummary:
    """
    Compute qualitative readiness counts and aggregated flags for a claim.
    Never produces numeric scores or percentages.
    """
    checklist = claim.checklist or []
    total_items = len(checklist)
    complete_items = 0
    flagged_items = 0
    missing_items = 0

    for item in checklist:
        if item.status == "validated":
            complete_items += 1
        elif item.status in ("flagged", "needs_confirmation"):
            flagged_items += 1
        else:  # 'required' or 'uploaded'
            missing_items += 1

    # Format qualitative summary string
    if total_items == 0:
        qualitative_label = "Checklist not initialized"
    else:
        parts = [f"{complete_items} of {total_items} items complete"]
        if flagged_items > 0:
            parts.append(f"{flagged_items} flagged")
        if missing_items > 0:
            parts.append(f"{missing_items} pending")
        qualitative_label = ", ".join(parts)

    # Aggregate flags
    all_flags: List[EligibilityFlag] = []

    # 1. Eligibility flags
    if claim.eligibility_result and claim.eligibility_result.flags:
        all_flags.extend(claim.eligibility_result.flags)

    # 2. Document validation issues converted to flags
    for doc in claim.documents:
        if doc.needs_confirmation or doc.validation_issues:
            for issue in doc.validation_issues:
                all_flags.append(EligibilityFlag(
                    flag_id=f"doc_{doc.document_id[:8]}_issue",
                    label=f"Document Validation Issue: {doc.filename}",
                    severity="worth-confirming" if doc.needs_confirmation else "info",
                    detail=issue,
                    item_id=doc.item_id,
                ))

    blocking_flags_count = sum(1 for f in all_flags if f.severity == "blocking")

    # Evaluate submission blockers
    can_submit, blockers = can_transition_to_ready_to_submit(claim, total_items, complete_items, missing_items, flagged_items, blocking_flags_count)

    return ReadinessSummary(
        total_items=total_items,
        complete_items=complete_items,
        flagged_items=flagged_items,
        missing_items=missing_items,
        qualitative_label=qualitative_label,
        all_flags=all_flags,
        blocking_flags_count=blocking_flags_count,
        can_submit=can_submit,
        submission_blockers=blockers,
    )


def can_transition_to_ready_to_submit(
    claim: Claim,
    total_items: int = 0,
    complete_items: int = 0,
    missing_items: int = 0,
    flagged_items: int = 0,
    blocking_flags_count: int = 0,
) -> Tuple[bool, List[str]]:
    """
    Strict transition guard for 'ready_to_submit'.
    Requires:
      - Treatment details provided
      - Eligibility evaluated
      - Zero blocking flags
      - Zero missing checklist items
      - Zero unconfirmed/flagged items
    """
    blockers: List[str] = []

    if not claim.treatment:
        blockers.append("Treatment details must be provided.")

    if not claim.eligibility_result:
        blockers.append("Claim eligibility evaluation must be run.")

    if blocking_flags_count > 0:
        blockers.append(f"{blocking_flags_count} blocking eligibility/policy condition(s) must be resolved.")

    if total_items == 0:
        blockers.append("Claim checklist has not been generated.")
    else:
        if missing_items > 0:
            blockers.append(f"{missing_items} required checklist item(s) are still missing.")
        if flagged_items > 0:
            blockers.append(f"{flagged_items} checklist item(s) are flagged or require manual confirmation.")

    return len(blockers) == 0, blockers
