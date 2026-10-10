"""
Unit tests verifying stable item IDs in the checklist builder.
"""

from app.rag.checklist import build_claim_checklist, normalize_item_id


def test_normalize_item_id_canonical_mappings():
    """Verify standard insurance requirement strings map to stable canonical IDs."""
    assert normalize_item_id("pre-authorisation must be requested at least 48 hours prior") == "preauth_form"
    assert normalize_item_id("notification is required within 24 hours of admission") == "emergency_intimation"
    assert normalize_item_id("Claims for reimbursement must be filed within 30 days") == "reimbursement_claim_form"
    assert normalize_item_id("Required documents: Original discharge summary") == "discharge_summary"
    assert normalize_item_id("all itemised bills and receipts must be submitted") == "final_bill"
    assert normalize_item_id("diagnostic reports and prescriptions") == "investigation_reports"


def test_build_claim_checklist_assigns_item_id():
    """Verify build_claim_checklist attaches item_id to all items in stage groups."""
    sample_facts = {
        "claim_conditions": [
            {
                "condition": "pre-authorisation must be requested at least 48 hours prior through the TPA helpline",
                "stage": "before_admission",
                "deadline": "48 hours prior",
                "page": 3,
                "verified": True,
            },
            {
                "condition": "Original discharge summary must be submitted",
                "stage": "after_discharge",
                "deadline": None,
                "page": 3,
                "verified": True,
            },
        ]
    }

    res = build_claim_checklist(sample_facts)
    checklist = res["checklist"]
    assert len(checklist) == 2

    before_items = checklist[0]["items"]
    assert len(before_items) == 1
    assert before_items[0]["item_id"] == "preauth_form"
    assert before_items[0]["page"] == 3
    assert before_items[0]["verified"] is True

    after_items = checklist[1]["items"]
    assert len(after_items) == 1
    assert after_items[0]["item_id"] == "discharge_summary"
    assert after_items[0]["page"] == 3
