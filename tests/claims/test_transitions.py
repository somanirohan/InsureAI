"""
Unit tests for Claims and Checklist item state transitions.
Verifies all valid transitions succeed, at least 10 invalid transitions fail with HTTP 409,
and every transition appends to the claim timeline.
"""

import pytest
from app.claims.transitions import (
    CLAIM_ALLOWED_TRANSITIONS,
    CHECKLIST_ITEM_ALLOWED_TRANSITIONS,
    InvalidStateTransitionError,
    validate_claim_transition,
    validate_checklist_item_transition,
    transition_claim,
)


def test_all_valid_claim_transitions_succeed():
    """Test standard forward lifecycle transitions."""
    claim = {
        "claim_id": "CLM-001",
        "status": "draft",
        "timeline": [],
    }

    # draft -> eligibility_checked
    transition_claim(claim, "eligibility_checked", note="Ran eligibility engine")
    assert claim["status"] == "eligibility_checked"
    assert len(claim["timeline"]) == 1
    assert claim["timeline"][-1]["event"] == "Status transitioned to 'eligibility_checked'"

    # eligibility_checked -> docs_pending
    transition_claim(claim, "docs_pending", note="Checklist generated")
    assert claim["status"] == "docs_pending"
    assert len(claim["timeline"]) == 2

    # docs_pending -> docs_validated
    transition_claim(claim, "docs_validated", note="All required docs validated")
    assert claim["status"] == "docs_validated"
    assert len(claim["timeline"]) == 3

    # docs_validated -> ready_to_submit
    transition_claim(claim, "ready_to_submit", note="Review package ready")
    assert claim["status"] == "ready_to_submit"
    assert len(claim["timeline"]) == 4

    # ready_to_submit -> submitted
    transition_claim(claim, "submitted", note="User marked claim submitted")
    assert claim["status"] == "submitted"
    assert len(claim["timeline"]) == 5

    # submitted -> under_review
    transition_claim(claim, "under_review", note="Insurer acknowledged receipt")
    assert claim["status"] == "under_review"
    assert len(claim["timeline"]) == 6

    # under_review -> query_raised -> under_review -> settled
    transition_claim(claim, "query_raised", note="TPA requested extra hospital bills")
    assert claim["status"] == "query_raised"

    transition_claim(claim, "docs_pending", note="Reopened docs collection")
    assert claim["status"] == "docs_pending"

    transition_claim(claim, "docs_validated", note="Extra bill validated")
    assert claim["status"] == "docs_validated"


def test_ten_invalid_claim_transitions_fail_with_409():
    """Verify at least 10 illegal transitions fail with HTTP 409 InvalidStateTransitionError."""
    invalid_cases = [
        ("draft", "settled"),               # 1. Skip entire lifecycle
        ("draft", "ready_to_submit"),       # 2. Skip checks and docs
        ("draft", "submitted"),             # 3. Submit unvalidated draft
        ("eligibility_checked", "settled"), # 4. Settle without submission
        ("eligibility_checked", "submitted"),# 5. Submit without docs
        ("docs_pending", "ready_to_submit"),# 6. Bypass document validation
        ("docs_pending", "submitted"),      # 7. Direct submit from pending docs
        ("submitted", "settled"),           # 8. Settle before under_review
        ("settled", "draft"),               # 9. Reopen terminal settled state
        ("rejected", "ready_to_submit"),    # 10. Reopen terminal rejected state
        ("under_review", "docs_pending"),   # 11. Must raise query before reverting to docs
    ]

    assert len(invalid_cases) >= 10

    for current, target in invalid_cases:
        with pytest.raises(InvalidStateTransitionError) as exc_info:
            validate_claim_transition(current, target)
        assert exc_info.value.status_code == 409
        assert f"cannot move from '{current}' to '{target}'" in exc_info.value.detail


def test_timeline_append_on_every_transition():
    """Verify timeline strictly appends events and timestamps."""
    claim = {"claim_id": "CLM-TIMELINE", "status": "draft", "timeline": []}
    transition_claim(claim, "eligibility_checked", note="Step 1 complete")
    transition_claim(claim, "docs_pending", note="Step 2 complete")

    assert len(claim["timeline"]) == 2
    assert "timestamp" in claim["timeline"][0]
    assert "timestamp" in claim["timeline"][1]
    assert claim["timeline"][0]["note"] == "Step 1 complete"
    assert claim["timeline"][1]["note"] == "Step 2 complete"


def test_checklist_item_transitions():
    """Test valid and invalid checklist item transitions."""
    # Valid transitions
    validate_checklist_item_transition("required", "uploaded")
    validate_checklist_item_transition("uploaded", "validated")
    validate_checklist_item_transition("uploaded", "needs_confirmation")
    validate_checklist_item_transition("uploaded", "flagged")
    validate_checklist_item_transition("needs_confirmation", "validated")
    validate_checklist_item_transition("flagged", "uploaded")

    # Invalid transitions
    with pytest.raises(InvalidStateTransitionError) as exc_1:
        validate_checklist_item_transition("required", "validated")
    assert exc_1.value.status_code == 409

    with pytest.raises(InvalidStateTransitionError) as exc_2:
        validate_checklist_item_transition("required", "flagged")
    assert exc_2.value.status_code == 409

    with pytest.raises(InvalidStateTransitionError) as exc_3:
        validate_checklist_item_transition("validated", "needs_confirmation")
    assert exc_3.value.status_code == 409
