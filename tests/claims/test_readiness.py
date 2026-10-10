"""
Unit tests for claim readiness engine and submission transition guards.
Verifies qualitative labels (no numeric risk scores) and strict gating.
"""

import pytest
from app.claims.models import (
    ChecklistItem,
    Claim,
    ClaimDocument,
    EligibilityCheck,
    EligibilityFlag,
    EligibilityResult,
    TreatmentDetails,
)
from app.claims.readiness import compute_claim_readiness


def test_readiness_qualitative_summary_label():
    """Verify readiness summary produces qualitative string with complete, flagged, pending counts."""
    items = [
        ChecklistItem(item_id="preauth_form", label="Preauth Form", stage="before_admission", status="validated"),
        ChecklistItem(item_id="discharge_summary", label="Discharge Summary", stage="after_discharge", status="validated"),
        ChecklistItem(item_id="final_bill", label="Final Bill", stage="after_discharge", status="needs_confirmation"),
        ChecklistItem(item_id="investigation_reports", label="Lab Reports", stage="after_discharge", status="required"),
    ]

    claim = Claim(
        claim_id="c1",
        user_id="u1",
        policy_id="p1",
        status="docs_pending",
        checklist=items,
        treatment=TreatmentDetails(
            name="Appendectomy",
            hospital="Apollo",
            admission_date="2024-05-10",
            room_type="Single Private AC",
            estimated_cost=100000.0,
        ),
        eligibility_result=EligibilityResult(checks=[], flags=[]),
    )

    summary = compute_claim_readiness(claim)

    assert summary.total_items == 4
    assert summary.complete_items == 2
    assert summary.flagged_items == 1
    assert summary.missing_items == 1

    # Qualitative label format
    assert summary.qualitative_label == "2 of 4 items complete, 1 flagged, 1 pending"

    # Must NOT be able to submit
    assert summary.can_submit is False
    assert len(summary.submission_blockers) >= 2


def test_readiness_blocks_submission_on_blocking_flag():
    """Blocking eligibility flag prevents transition to ready_to_submit."""
    items = [
        ChecklistItem(item_id="item1", label="Item 1", stage="before_admission", status="validated"),
        ChecklistItem(item_id="item2", label="Item 2", stage="after_discharge", status="validated"),
    ]

    blocking_flag = EligibilityFlag(
        flag_id="waiting_period_unmet",
        label="Specific Waiting Period Not Met",
        severity="blocking",
        detail="Policy age is 6 months vs 24 months required.",
    )

    claim = Claim(
        claim_id="c2",
        user_id="u1",
        policy_id="p1",
        status="docs_validated",
        checklist=items,
        treatment=TreatmentDetails(
            name="Cataract",
            hospital="Apollo",
            admission_date="2024-05-10",
            room_type="Single Private AC",
            estimated_cost=40000.0,
        ),
        eligibility_result=EligibilityResult(
            checks=[EligibilityCheck(check="wp", result="fail", detail="unmet", source="p1")],
            flags=[blocking_flag],
        ),
    )

    summary = compute_claim_readiness(claim)

    assert summary.blocking_flags_count == 1
    assert summary.can_submit is False
    assert any("blocking eligibility" in b for b in summary.submission_blockers)


def test_readiness_allows_submission_when_clean():
    """All items validated and zero blocking flags allows transition."""
    items = [
        ChecklistItem(item_id="item1", label="Item 1", stage="before_admission", status="validated"),
        ChecklistItem(item_id="item2", label="Item 2", stage="after_discharge", status="validated"),
    ]

    info_flag = EligibilityFlag(
        flag_id="irdai_note",
        label="IRDAI Info",
        severity="info",  # Non-blocking
        detail="Informational regulatory reference.",
    )

    claim = Claim(
        claim_id="c3",
        user_id="u1",
        policy_id="p1",
        status="docs_validated",
        checklist=items,
        treatment=TreatmentDetails(
            name="Appendectomy",
            hospital="Apollo",
            admission_date="2024-05-10",
            room_type="Single Private AC",
            estimated_cost=100000.0,
        ),
        eligibility_result=EligibilityResult(
            checks=[EligibilityCheck(check="exclusions", result="pass", detail="ok", source="p1")],
            flags=[info_flag],
        ),
    )

    summary = compute_claim_readiness(claim)

    assert summary.can_submit is True
    assert len(summary.submission_blockers) == 0
    assert summary.qualitative_label == "2 of 2 items complete"
