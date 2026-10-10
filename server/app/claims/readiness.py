"""
Deterministic Claim Readiness and Flag Aggregation Engine.
Produces qualitative completeness summaries without any numeric percentages or risk scores.
Guards the transition to 'ready_to_submit' strictly enforcing that all required policy documents
are complete and zero blocking flags remain.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple
from pydantic import BaseModel, Field

from app.claims.models import Claim, EligibilityFlag

# ── Configurable Submission Gating Rules ──────────────────────────────────────
# Requirement actions are user-attested reminders; incomplete requirements produce
# non-blocking 'worth-confirming' flags rather than blocking submission.
REQUIREMENTS_BLOCK_SUBMISSION: bool = False

# Standard suggestions (fallback when policy has 0 docs) are advisory and do not block.
STANDARD_SUGGESTIONS_BLOCK_SUBMISSION: bool = False


class ReadinessSummary(BaseModel):
    # Overall aggregate counts (preserved for backward-compatibility)
    total_items: int = 0
    complete_items: int = 0
    flagged_items: int = 0
    missing_items: int = 0
    qualitative_label: str
    all_flags: List[EligibilityFlag] = Field(default_factory=list)
    blocking_flags_count: int = 0
    can_submit: bool = False
    submission_blockers: List[str] = Field(default_factory=list)

    # Distinct document and requirement counts
    total_documents: int = 0
    validated_documents: int = 0
    flagged_documents: int = 0
    missing_documents: int = 0

    total_requirements: int = 0
    done_requirements: int = 0
    pending_requirements: int = 0


def compute_claim_readiness(claim: Claim) -> ReadinessSummary:
    """
    Compute qualitative readiness counts and aggregated flags for a claim.
    Never produces numeric scores or percentages.
    """
    checklist = claim.checklist or []
    total_items = len(checklist)

    # Document breakdown
    total_documents = 0
    validated_documents = 0
    flagged_documents = 0
    missing_documents = 0

    # Requirement breakdown
    total_requirements = 0
    done_requirements = 0
    pending_requirements = 0

    all_flags: List[EligibilityFlag] = []
    today_str = datetime.utcnow().strftime("%Y-%m-%d")

    for item in checklist:
        is_req = getattr(item, "kind", "document") == "requirement"

        if is_req:
            total_requirements += 1
            if item.status == "done":
                done_requirements += 1
            else:
                pending_requirements += 1
                # Non-blocking advisory flag for unfulfilled action
                all_flags.append(EligibilityFlag(
                    flag_id=f"req_{item.item_id}_pending",
                    label=f"Action Pending: {item.label}",
                    severity="worth-confirming",
                    detail=f"Requirement '{item.label}' has not been marked as completed.",
                    item_id=item.item_id,
                ))

                # Check if deadline is past due
                if item.deadline and isinstance(item.deadline, dict):
                    due_date = item.deadline.get("computed_due_date")
                    if due_date and due_date < today_str:
                        all_flags.append(EligibilityFlag(
                            flag_id=f"req_{item.item_id}_overdue",
                            label=f"Deadline Passed: {item.label}",
                            severity="worth-confirming",
                            detail=f"The procedural deadline ({due_date}) for '{item.label}' has passed.",
                            item_id=item.item_id,
                        ))
        else:
            total_documents += 1
            if item.status == "validated":
                validated_documents += 1
            elif item.status in ("flagged", "needs_confirmation"):
                flagged_documents += 1
            else:
                missing_documents += 1

    complete_items = validated_documents + done_requirements
    flagged_items = flagged_documents
    missing_items = missing_documents + pending_requirements

    # Format qualitative summary string
    if total_items == 0:
        qualitative_label = "Checklist not initialized"
    elif total_requirements > 0:
        doc_part = f"Documents: {validated_documents} of {total_documents} uploaded and validated"
        if flagged_documents > 0:
            doc_part += f", {flagged_documents} flagged"
        if missing_documents > 0:
            doc_part += f", {missing_documents} missing"

        req_part = f"Actions: {done_requirements} of {total_requirements} marked done"
        qualitative_label = f"{doc_part}. {req_part}."
    else:
        # Fallback format when checklist has only documents
        parts = [f"{complete_items} of {total_items} items complete"]
        if flagged_items > 0:
            parts.append(f"{flagged_items} flagged")
        if missing_items > 0:
            parts.append(f"{missing_items} pending")
        qualitative_label = ", ".join(parts)

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
    can_submit, blockers = can_transition_to_ready_to_submit(
        claim=claim,
        total_items=total_items,
        total_documents=total_documents,
        missing_documents=missing_documents,
        flagged_documents=flagged_documents,
        blocking_flags_count=blocking_flags_count,
    )

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
        total_documents=total_documents,
        validated_documents=validated_documents,
        flagged_documents=flagged_documents,
        missing_documents=missing_documents,
        total_requirements=total_requirements,
        done_requirements=done_requirements,
        pending_requirements=pending_requirements,
    )


def can_transition_to_ready_to_submit(
    claim: Claim,
    total_items: int = 0,
    total_documents: int = 0,
    missing_documents: int = 0,
    flagged_documents: int = 0,
    blocking_flags_count: int = 0,
) -> Tuple[bool, List[str]]:
    """
    Strict transition guard for 'ready_to_submit'.
    Requires:
      - Treatment details provided
      - Eligibility evaluated
      - Zero blocking flags
      - Zero policy-sourced document items missing
      - Zero policy-sourced document items flagged/unconfirmed
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
        # Check policy-sourced documents
        policy_docs = [
            it for it in claim.checklist
            if getattr(it, "kind", "document") == "document" and getattr(it, "source", "policy") == "policy"
        ]
        if policy_docs:
            missing_docs = [it for it in policy_docs if it.status not in ("validated", "flagged", "needs_confirmation")]
            flagged_docs = [it for it in policy_docs if it.status in ("flagged", "needs_confirmation")]
            if missing_docs:
                blockers.append(f"{len(missing_docs)} required checklist item(s) are still missing.")
            if flagged_docs:
                blockers.append(f"{len(flagged_docs)} checklist item(s) are flagged or require manual confirmation.")
        elif total_documents > 0 and STANDARD_SUGGESTIONS_BLOCK_SUBMISSION:
            unvalidated_all = [it for it in claim.checklist if getattr(it, "kind", "document") == "document" and it.status != "validated"]
            if unvalidated_all:
                blockers.append(f"{len(unvalidated_all)} document(s) must be validated.")
        elif total_documents == 0 and missing_documents > 0:
            blockers.append(f"{missing_documents} required checklist item(s) are still missing.")

    return len(blockers) == 0, blockers
