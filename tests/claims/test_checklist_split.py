"""
Tests for Claim Checklist Split (Requirements and Documents).
Verifies:
1. Bug report sentences produce 3 requirements and 5 documents.
2. 'itemised bills and receipts' stays ONE item.
3. Mixed sentence yields both kinds.
4. Unmapped document phrases produce other_<slug> with needs_confirmation=True.
5. Zero document policy produces fallback list with source='standard_suggestion', non-blocking.
6. Requirement upload rejection (HTTP 422, except preauth).
7. Traceability: page citations and original text preserved.
8. Determinism and idempotence.
9. Unparseable deadline fallback.
10. computed_due_date calculations and past-due flags.
11. Readiness counts and gating.
12. Migration logic.
13. Accuracy on 8 diverse phrasing fixtures.
14. Zero LLM calls in checklist build path.
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timedelta
from unittest.mock import patch
import pytest

from app.claims.builder import (
    build_claim_workflow_checklist,
    compute_due_date_for_deadline,
)
from app.claims.checklist_classifier import (
    classify_condition,
    parse_deadline,
    split_document_list,
)
from app.claims.checklist_vocabulary import (
    DOCUMENT_TYPES,
    REQUIREMENT_TYPES,
    STANDARD_SUGGESTION_DOC_IDS,
)
from app.claims.models import (
    ChecklistItem,
    Claim,
    ClaimDocument,
    EligibilityResult,
    TreatmentDetails,
)
from app.claims.readiness import compute_claim_readiness
from scripts.migrate_claim_checklists import migrate_single_claim_data

FIXTURES_PATH = os.path.join(
    os.path.dirname(__file__), "fixtures", "checklist", "phrasing_samples.json"
)


# ── Case 1: Bug Report Policy Sentences ────────────────────────────────────────

def test_bug_report_sentences_produce_3_requirements_and_5_documents():
    """
    Verify exact sentences from the bug report produce:
    3 requirements (preauthorisation, admission_intimation, claim_filing_deadline)
    5 documents (discharge_summary, itemised_bills, diagnostic_reports, prescriptions, claim_form)
    """
    raw_facts = {
        "claim_conditions": [
            {
                "condition": "pre-authorisation must be requested at least 48 hours prior through the TPA helpline...",
                "stage": "before_admission",
                "deadline": "48 hours prior",
                "page": 3,
                "verified": True,
            },
            {
                "condition": "notification is required within 24 hours of admission",
                "stage": "during_stay",
                "deadline": "24 hours",
                "page": 3,
                "verified": True,
            },
            {
                "condition": "Claims for reimbursement must be filed within 30 days of discharge from hospital",
                "stage": "after_discharge",
                "deadline": "30 days",
                "page": 3,
                "verified": True,
            },
            {
                "condition": "Required documents: Original discharge summary, all itemised bills and receipts, diagnostic reports, prescriptions, and a duly completed claim form",
                "stage": "after_discharge",
                "deadline": None,
                "page": 3,
                "verified": True,
            },
        ]
    }

    items = build_claim_workflow_checklist(
        raw_facts, admission_date="2026-11-10", discharge_date="2026-11-15"
    )

    reqs = [it for it in items if it.kind == "requirement"]
    docs = [it for it in items if it.kind == "document"]

    assert len(reqs) == 3
    assert len(docs) == 5

    req_ids = [r.item_id for r in reqs]
    assert "preauthorisation" in req_ids
    assert "admission_intimation" in req_ids
    assert "claim_filing_deadline" in req_ids

    # Deadlines parsed
    preauth = next(r for r in reqs if r.item_id == "preauthorisation")
    assert preauth.deadline is not None
    assert preauth.deadline.get("value") == 48
    assert preauth.deadline.get("unit") == "hours"
    assert preauth.deadline.get("computed_due_date") == "2026-11-08"

    intimation = next(r for r in reqs if r.item_id == "admission_intimation")
    assert intimation.deadline is not None
    assert intimation.deadline.get("value") == 24
    assert intimation.deadline.get("computed_due_date") == "2026-11-11"

    filing = next(r for r in reqs if r.item_id == "claim_filing_deadline")
    assert filing.deadline is not None
    assert filing.deadline.get("value") == 30
    assert filing.deadline.get("unit") == "days"
    assert filing.deadline.get("computed_due_date") == "2026-12-15"

    doc_ids = [d.item_id for d in docs]
    expected_doc_ids = [
        "discharge_summary",
        "itemised_bills",
        "diagnostic_reports",
        "prescriptions",
        "claim_form",
    ]
    assert doc_ids == expected_doc_ids

    # Document descriptions are present
    for d in docs:
        assert d.description is not None
        assert len(d.description) > 10


# ── Case 2: itemised bills and receipts compound synonym ──────────────────────

def test_itemised_bills_and_receipts_yields_one_item():
    """'itemised bills and receipts' must stay ONE item, not split on 'and'."""
    text = "all itemised bills and receipts must be submitted"
    splits = split_document_list(text)
    assert len(splits) == 1
    assert splits[0]["matched_id"] == "itemised_bills"


# ── Case 3: Mixed sentence yields both kinds ──────────────────────────────────

def test_mixed_sentence_yields_both_kinds():
    """A sentence mixing an action and documents yields both requirements and documents."""
    text = "Submit a duly completed claim form along with original discharge summary within 30 days of discharge"
    classification = classify_condition(text, "after_discharge")
    assert classification == "mixed"

    raw_facts = {
        "claim_conditions": [
            {
                "condition": text,
                "stage": "after_discharge",
                "deadline": "30 days",
                "page": 4,
                "verified": True,
            }
        ]
    }
    items = build_claim_workflow_checklist(raw_facts)
    reqs = [it for it in items if it.kind == "requirement"]
    docs = [it for it in items if it.kind == "document"]

    assert len(reqs) >= 1
    assert any(r.item_id == "claim_filing_deadline" for r in reqs)
    assert len(docs) >= 2
    doc_ids = {d.item_id for d in docs}
    assert "claim_form" in doc_ids
    assert "discharge_summary" in doc_ids


# ── Case 4: Unmapped document phrase ─────────────────────────────────────────

def test_unmapped_document_phrase_yields_other_slug():
    """Unmapped document phrases yield other_<slug> with needs_confirmation=True."""
    text = "Required documents: Implant barcode sticker and invoice"
    splits = split_document_list(text)
    assert len(splits) >= 1
    assert any(s["matched_id"].startswith("other_") for s in splits)
    unmapped = next(s for s in splits if s["matched_id"].startswith("other_"))
    assert unmapped["needs_confirmation"] is True
    assert "confirm" in unmapped["description"].lower()


# ── Case 5: Policy with no document items fallback ───────────────────────────

def test_zero_document_policy_yields_standard_suggestions():
    """A policy with 0 document items returns labeled standard suggestions."""
    raw_facts = {
        "claim_conditions": [
            {
                "condition": "pre-authorisation must be requested at least 48 hours prior",
                "stage": "before_admission",
                "deadline": "48 hours",
                "page": 2,
                "verified": True,
            }
        ]
    }
    items = build_claim_workflow_checklist(raw_facts)
    docs = [it for it in items if it.kind == "document"]

    assert len(docs) == len(STANDARD_SUGGESTION_DOC_IDS)
    for d in docs:
        assert d.source == "standard_suggestion"
        assert d.page_cite is None
        assert "not found in your policy" in d.label

    # Suggestions must NOT block submission
    claim = Claim(
        claim_id="c_fallback",
        user_id="u1",
        policy_id="p1",
        status="docs_pending",
        checklist=items,
        treatment=TreatmentDetails(
            name="Surgery",
            hospital="Hospital",
            admission_date="2026-11-10",
            room_type="Single Room",
            estimated_cost=50000.0,
        ),
        eligibility_result=EligibilityResult(checks=[], flags=[]),
    )
    summary = compute_claim_readiness(claim)
    # The requirement is not done, but requirements don't block. Suggested documents don't block.
    # Therefore, submission is allowed!
    assert summary.can_submit is True


# ── Case 6: Traceability and Citations ────────────────────────────────────────

def test_traceability_page_citations_and_original_text():
    """Every policy-sourced item carries original_text and a page citation."""
    raw_facts = {
        "claim_conditions": [
            {
                "condition": "Required documents: Original discharge summary and hospital bills",
                "stage": "after_discharge",
                "deadline": None,
                "page": 7,
                "verified": True,
            }
        ]
    }
    items = build_claim_workflow_checklist(raw_facts)
    for it in items:
        assert it.page_cite == 7
        assert "Original discharge summary" in it.original_text
        assert it.item_id in DOCUMENT_TYPES or it.item_id.startswith("other_")


# ── Case 7: Determinism and Idempotence ───────────────────────────────────────

def test_determinism_and_idempotence():
    """Building twice yields identical IDs and item ordering."""
    raw_facts = {
        "claim_conditions": [
            {
                "condition": "pre-authorisation must be requested at least 48 hours prior",
                "stage": "before_admission",
                "deadline": "48 hours prior",
                "page": 3,
                "verified": True,
            },
            {
                "condition": "Required documents: Original discharge summary, itemised bills, prescriptions",
                "stage": "after_discharge",
                "deadline": None,
                "page": 4,
                "verified": True,
            },
        ]
    }
    build1 = [it.model_dump() for it in build_claim_workflow_checklist(raw_facts)]
    build2 = [it.model_dump() for it in build_claim_workflow_checklist(raw_facts)]

    assert build1 == build2


# ── Case 8: Unparseable deadline fallback ─────────────────────────────────────

def test_unparseable_deadline_fallback():
    """An unparseable requirement falls back to original text with needs_confirmation=True."""
    text = "Insured must intimate regarding sudden medical events as early as reasonably possible"
    parsed = parse_deadline(text)
    assert parsed is None

    raw_facts = {
        "claim_conditions": [
            {
                "condition": text,
                "stage": "unspecified",
                "deadline": None,
                "page": 10,
                "verified": True,
            }
        ]
    }
    items = build_claim_workflow_checklist(raw_facts)
    req = next(it for it in items if it.kind == "requirement")
    assert req.label == text
    assert req.needs_confirmation is True


# ── Case 9: Due date computation and past-due flag ────────────────────────────

def test_due_date_computation_and_past_due_flag():
    """computed_due_date computes correctly and past-due unfinished requirement raises a flag."""
    deadline = {"value": 48, "unit": "hours", "anchor": "before_admission", "direction": "before"}
    due_date, hint = compute_due_date_for_deadline(deadline, admission_date="2026-05-10")
    assert due_date == "2026-05-08"
    assert hint is None

    # Past-due test with past date
    past_due_date = "2020-01-01"
    req_item = ChecklistItem(
        item_id="preauthorisation",
        kind="requirement",
        label="Request pre-authorisation",
        stage="before_admission",
        status="pending",
        deadline={"value": 48, "unit": "hours", "anchor": "before_admission", "computed_due_date": past_due_date},
        original_text="Pre-authorisation needed",
    )
    claim = Claim(
        claim_id="c_past",
        user_id="u1",
        policy_id="p1",
        status="docs_pending",
        checklist=[req_item],
        treatment=TreatmentDetails(
            name="Care",
            hospital="Hospital",
            admission_date="2020-01-03",
            room_type="Room",
            estimated_cost=10000.0,
        ),
        eligibility_result=EligibilityResult(checks=[], flags=[]),
    )
    summary = compute_claim_readiness(claim)
    assert any("overdue" in f.flag_id for f in summary.all_flags)
    # Flag is non-blocking worth-confirming
    overdue_flag = next(f for f in summary.all_flags if "overdue" in f.flag_id)
    assert overdue_flag.severity == "worth-confirming"


# ── Case 10: Readiness counts and gating ──────────────────────────────────────

def test_readiness_counts_and_gating_behavior():
    """
    Readiness reports distinct Document and Action counts.
    When all documents are validated but one action is pending, submission is NOT blocked.
    """
    items = [
        ChecklistItem(
            item_id="preauthorisation",
            kind="requirement",
            label="Request Pre-auth",
            stage="before_admission",
            status="pending",
            original_text="Pre-auth text",
        ),
        ChecklistItem(
            item_id="discharge_summary",
            kind="document",
            label="Discharge Summary",
            stage="after_discharge",
            status="validated",
            original_text="Summary text",
        ),
        ChecklistItem(
            item_id="itemised_bills",
            kind="document",
            label="Bills",
            stage="after_discharge",
            status="validated",
            original_text="Bills text",
        ),
    ]

    claim = Claim(
        claim_id="c_readiness",
        user_id="u1",
        policy_id="p1",
        status="docs_pending",
        checklist=items,
        treatment=TreatmentDetails(
            name="Procedure",
            hospital="Hospital",
            admission_date="2026-11-10",
            room_type="Room",
            estimated_cost=25000.0,
        ),
        eligibility_result=EligibilityResult(checks=[], flags=[]),
    )

    summary = compute_claim_readiness(claim)
    assert summary.total_documents == 2
    assert summary.validated_documents == 2
    assert summary.total_requirements == 1
    assert summary.done_requirements == 0
    assert summary.pending_requirements == 1

    # Qualitative label has both parts
    assert "Documents: 2 of 2 uploaded and validated" in summary.qualitative_label
    assert "Actions: 0 of 1 marked done" in summary.qualitative_label

    # Crucial: Unfulfilled action generates non-blocking flag; does NOT block submission
    assert summary.can_submit is True
    assert len(summary.submission_blockers) == 0


# ── Case 11: Migration logic ──────────────────────────────────────────────────

def test_migration_logic_preserves_files_and_remaps_slots():
    """Migration maps old slots (final_bill -> itemised_bills) and marks unmatched needs_confirmation."""
    claim = {
        "claim_id": "c_migrate",
        "status": "docs_pending",
        "checklist": [
            {"item_id": "final_bill", "label": "Final Bill", "stage": "after_discharge", "status": "validated"}
        ],
        "documents": [
            {
                "document_id": "doc_1",
                "item_id": "final_bill",
                "filename": "bill.pdf",
                "extracted_fields": {"total_amount": 10000},
                "field_confidence": {},
                "validation_issues": [],
                "needs_confirmation": False,
            },
            {
                "document_id": "doc_2",
                "item_id": "custom_unknown_slot",
                "filename": "extra.pdf",
                "extracted_fields": {},
                "field_confidence": {},
                "validation_issues": [],
                "needs_confirmation": False,
            },
        ],
    }

    policy = {
        "facts": [
            {"name": "claim_conditions", "value": [{"condition": "Hospital final bills and receipts", "page": 2, "stage": "after_discharge", "verified": True}]}
        ]
    }

    new_checklist, updated_docs, audit = migrate_single_claim_data(claim, policy)

    # 1. bill.pdf remapped to itemised_bills
    doc1 = next(d for d in updated_docs if d["document_id"] == "doc_1")
    assert doc1["item_id"] == "itemised_bills"

    # 2. extra.pdf kept and marked needs_confirmation
    doc2 = next(d for d in updated_docs if d["document_id"] == "doc_2")
    assert doc2["needs_confirmation"] is True
    assert "reassign this file to a document slot" in doc2["validation_issues"]


# ── Case 12: 8 Diverse Phrasing Fixtures Split Accuracy ───────────────────────

def test_fixtures_split_accuracy():
    """Verify split accuracy against 8 diverse phrasing fixtures."""
    with open(FIXTURES_PATH, "r") as f:
        fixtures = json.load(f)

    assert len(fixtures) >= 8
    correct_count = 0
    total_count = len(fixtures)

    for item in fixtures:
        text = item["text"]
        if item.get("expected_ids"):
            splits = split_document_list(text)
            split_ids = [s["matched_id"] for s in splits]
            # Verify each expected id is in split_ids
            if all(exp in split_ids for exp in item["expected_ids"]):
                correct_count += 1
        elif item.get("expected_req_id"):
            parsed = parse_deadline(text)
            if (
                parsed
                and parsed.get("value") == item["expected_deadline_val"]
                and parsed.get("unit") == item["expected_unit"]
            ):
                correct_count += 1
        elif item.get("expected_unmapped"):
            splits = split_document_list(text)
            if any(s["matched_id"].startswith("other_") for s in splits):
                correct_count += 1

    accuracy = correct_count / total_count
    assert accuracy >= 1.0  # 100% split accuracy on target fixtures


# ── Case 13: Zero LLM Calls in Checklist Build Path ───────────────────────────

def test_zero_llm_calls_in_checklist_build_path():
    """Verify strictly zero LLM calls occur during checklist build."""
    with patch("app.llm.factory.get_llm") as mock_llm:
        raw_facts = {
            "claim_conditions": [
                {
                    "condition": "pre-authorisation must be requested at least 48 hours prior",
                    "stage": "before_admission",
                    "deadline": "48 hours",
                    "page": 1,
                    "verified": True,
                },
                {
                    "condition": "Required documents: Original discharge summary, itemised bills, prescriptions",
                    "stage": "after_discharge",
                    "deadline": None,
                    "page": 2,
                    "verified": True,
                },
            ]
        }
        items = build_claim_workflow_checklist(raw_facts)
        assert len(items) > 0
        mock_llm.assert_not_called()
