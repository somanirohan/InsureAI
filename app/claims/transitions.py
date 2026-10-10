"""
State machine and transition validation for Claims and Checklist items.
Enforces deterministic lifecycle transitions. Invalid transitions raise typed 409 exceptions.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Optional, Set
from fastapi import HTTPException, status

# ── Allowed Transitions ──────────────────────────────────────────────────────

CLAIM_ALLOWED_TRANSITIONS: Dict[str, Set[str]] = {
    "draft": {"eligibility_checked"},
    "eligibility_checked": {"docs_pending"},
    "docs_pending": {"docs_validated"},
    "docs_validated": {"ready_to_submit", "docs_pending"},
    "ready_to_submit": {"submitted", "docs_pending"},
    "submitted": {"under_review"},
    "under_review": {"settled", "rejected", "query_raised"},
    "query_raised": {"under_review", "docs_pending"},
    "settled": set(),
    "rejected": set(),
}

CHECKLIST_ITEM_ALLOWED_TRANSITIONS: Dict[str, Set[str]] = {
    "required": {"uploaded"},
    "uploaded": {"validated", "flagged", "needs_confirmation"},
    "needs_confirmation": {"validated", "flagged", "uploaded"},
    "flagged": {"uploaded", "validated"},
    "validated": {"uploaded"},
}


class InvalidStateTransitionError(HTTPException):
    """Raised when an illegal transition is requested; mapped to HTTP 409."""

    def __init__(self, current_status: str, target_status: str, entity: str = "Claim"):
        valid_next = (
            CLAIM_ALLOWED_TRANSITIONS.get(current_status, set())
            if entity == "Claim"
            else CHECKLIST_ITEM_ALLOWED_TRANSITIONS.get(current_status, set())
        )
        valid_list = sorted(list(valid_next)) if valid_next else ["(terminal state - no further transitions)"]
        detail = (
            f"Invalid {entity} status transition: cannot move from '{current_status}' to '{target_status}'. "
            f"Allowed next states from '{current_status}': {valid_list}."
        )
        super().__init__(status_code=status.HTTP_409_CONFLICT, detail=detail)


def validate_claim_transition(current_status: str, target_status: str) -> None:
    """Validate that moving from current_status to target_status is permitted."""
    allowed = CLAIM_ALLOWED_TRANSITIONS.get(current_status, set())
    if target_status not in allowed:
        raise InvalidStateTransitionError(current_status, target_status, entity="Claim")


def validate_checklist_item_transition(current_status: str, target_status: str) -> None:
    """Validate that moving checklist item from current_status to target_status is permitted."""
    allowed = CHECKLIST_ITEM_ALLOWED_TRANSITIONS.get(current_status, set())
    if target_status not in allowed:
        raise InvalidStateTransitionError(current_status, target_status, entity="ChecklistItem")


def transition_claim(
    claim_dict: Dict[str, Any],
    target_status: str,
    note: Optional[str] = None,
    event_label: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Perform a validated status transition on a claim dictionary,
    recording an immutable timeline entry.
    """
    curr = claim_dict.get("status", "draft")
    if curr != target_status:
        validate_claim_transition(curr, target_status)
        claim_dict["status"] = target_status

    timeline = claim_dict.setdefault("timeline", [])
    now = datetime.utcnow().isoformat()
    event_name = event_label or f"Status transitioned to '{target_status}'"
    timeline.append({
        "timestamp": now,
        "event": event_name,
        "note": note or f"Moved from {curr} to {target_status}",
    })
    claim_dict["updated_at"] = now
    return claim_dict
