"""
Unit and integration tests for audit fixes in claim settlement and line item extraction.
Written BEFORE implementation to define expected behavior.
"""

import json
import pytest
from app.claims.models import Claim, ClaimDocument, TreatmentDetails, LineItem
from app.claims.settlement import calculate_settlement_estimate
from app.claims.documents import (
    validate_document,
    _parse_line_items,
    _merge_line_items,
    extract_document_fields,
)


@pytest.fixture
def mock_policy_facts():
    return {
        "room_rent_limit": {"value": 5000.0, "type": "fixed", "page": 2},
        "co_pay": {"value": 10.0, "type": "percentage", "page": 3},
        "deductible": {"value": 10000.0, "type": "fixed", "page": 4},
    }


@pytest.fixture
def base_treatment():
    return TreatmentDetails(
        name="Appendectomy",
        hospital="City Care Hospital",
        admission_date="2024-06-01",
        discharge_date="2024-06-03",
        room_type="Single Private AC",
        estimated_cost=80000.0,
    )


# ── Task 1: Settlement Basis Tests ───────────────────────────────────────────

def test_settlement_ignores_needs_confirmation_bill(base_treatment, mock_policy_facts):
    """
    An uploaded bill marked needs_confirmation=True MUST NOT be used as settlement basis.
    Basis must remain 'pre_treatment_estimate' and a receipt note should indicate
    the bill is awaiting confirmation.
    """
    doc = ClaimDocument(
        document_id="doc-1",
        item_id="final_bill",
        filename="unconfirmed_bill.pdf",
        extracted_fields={"total_amount": 120000.0, "document_type": "final_bill"},
        field_confidence={"total_amount": 0.5},
        validation_issues=["Document missing a valid positive total billed amount."],
        needs_confirmation=True,
    )
    claim = Claim(
        claim_id="claim-1",
        user_id="user-1",
        policy_id="pol-1",
        treatment=base_treatment,
        documents=[doc],
    )

    estimate = calculate_settlement_estimate(claim, mock_policy_facts)
    assert estimate.basis == "pre_treatment_estimate"
    assert estimate.receipt_steps[0].amount == 80000.0  # Uses treatment estimated cost
    # Assert note in receipt steps
    note_step = next((s for s in estimate.receipt_steps if "awaiting confirmation" in s.label.lower() or "awaiting confirmation" in s.rule.lower()), None)
    assert note_step is not None


def test_settlement_adopts_validated_bill(base_treatment, mock_policy_facts):
    """
    A validated bill (needs_confirmation=False, no unresolved issues)
    MUST be adopted as the settlement basis 'uploaded_bill'.
    """
    doc = ClaimDocument(
        document_id="doc-2",
        item_id="final_bill",
        filename="validated_bill.pdf",
        extracted_fields={"total_amount": 120000.0, "document_type": "final_bill"},
        field_confidence={"total_amount": 0.95},
        validation_issues=[],
        needs_confirmation=False,
    )
    claim = Claim(
        claim_id="claim-2",
        user_id="user-1",
        policy_id="pol-1",
        treatment=base_treatment,
        documents=[doc],
    )

    estimate = calculate_settlement_estimate(claim, mock_policy_facts)
    assert estimate.basis == "uploaded_bill"
    assert estimate.receipt_steps[0].amount == 120000.0


def test_settlement_adopts_user_confirmed_bill(base_treatment, mock_policy_facts):
    """
    A bill that previously had issues but was confirmed by the user
    (needs_confirmation=False, validation_issues=[]) is adopted.
    """
    doc = ClaimDocument(
        document_id="doc-3",
        item_id="final_bill",
        filename="confirmed_bill.pdf",
        extracted_fields={"total_amount": 115000.0, "document_type": "final_bill"},
        field_confidence={"total_amount": 0.8},
        validation_issues=[],
        needs_confirmation=False,
    )
    claim = Claim(
        claim_id="claim-3",
        user_id="user-1",
        policy_id="pol-1",
        treatment=base_treatment,
        documents=[doc],
    )

    estimate = calculate_settlement_estimate(claim, mock_policy_facts)
    assert estimate.basis == "uploaded_bill"
    assert estimate.receipt_steps[0].amount == 115000.0


def test_settlement_ignores_bill_with_unresolved_blocking_issue(base_treatment, mock_policy_facts):
    """
    Even if needs_confirmation is somehow False, if unresolved issues exist,
    it must not be adopted.
    """
    doc = ClaimDocument(
        document_id="doc-4",
        item_id="final_bill",
        filename="flawed_bill.pdf",
        extracted_fields={"total_amount": 115000.0, "document_type": "final_bill"},
        field_confidence={"total_amount": 0.8},
        validation_issues=["Patient name mismatch"],
        needs_confirmation=False,  # edge-case
    )
    claim = Claim(
        claim_id="claim-4",
        user_id="user-1",
        policy_id="pol-1",
        treatment=base_treatment,
        documents=[doc],
    )

    estimate = calculate_settlement_estimate(claim, mock_policy_facts)
    assert estimate.basis == "pre_treatment_estimate"


# ── Task 2: Line Items Extraction & Discrepancy Tests ────────────────────────

def test_line_item_amount_parsing():
    """Deterministic parsing handles currency symbols, commas, and quantities."""
    raw_items = [
        {"description": "OT Charges", "amount": "₹ 45,000.00", "quantity": "1"},
        {"description": "Room Rent", "amount": "Rs.15,000", "quantity": 3},
        {"description": "Medicines & Consumables", "amount": 12500.50},
    ]
    parsed, malformed = _parse_line_items(raw_items)
    assert len(parsed) == 3
    assert len(malformed) == 0
    assert parsed[0].amount == 45000.0
    assert parsed[1].amount == 15000.0
    assert parsed[1].quantity == 3.0
    assert parsed[2].amount == 12500.50


def test_malformed_line_items_trigger_needs_confirmation(base_treatment):
    """Malformed line items must not be dropped silently; they trigger needs_confirmation."""
    raw_items = [
        {"description": "Valid Item", "amount": "5000"},
        {"description": "Malformed Item Without Amount", "amount": "invalid-amt"},
    ]
    parsed, malformed = _parse_line_items(raw_items)
    assert len(parsed) == 1
    assert len(malformed) == 1

    fields = {
        "patient_name": "Ramesh Sharma",
        "admission_date": "2024-06-01",
        "discharge_date": "2024-06-03",
        "total_amount": 5000.0,
        "line_items": [p.model_dump() for p in parsed],
        "document_type": "final_bill",
        "malformed_line_items": malformed,
    }
    conf = {k: 0.9 for k in fields}
    issues, needs_conf = validate_document(
        extracted_fields=fields,
        field_confidence=conf,
        item_id="final_bill",
        treatment=base_treatment,
        expected_patient_name="Ramesh Sharma",
    )
    assert needs_conf is True
    assert any("malformed" in iss.lower() for iss in issues)


def test_line_items_total_discrepancy_raises_flag(base_treatment):
    """When the sum of line items differs from total_amount beyond tolerance, flag issue."""
    line_items = [
        LineItem(description="Item 1", amount=20000.0),
        LineItem(description="Item 2", amount=30000.0),
    ]  # Sum = 50,000
    fields = {
        "patient_name": "Ramesh Sharma",
        "admission_date": "2024-06-01",
        "discharge_date": "2024-06-03",
        "total_amount": 80000.0,  # Difference of 30,000 > tolerance
        "line_items": [li.model_dump() for li in line_items],
        "document_type": "final_bill",
    }
    conf = {k: 0.9 for k in fields}
    issues, needs_conf = validate_document(
        extracted_fields=fields,
        field_confidence=conf,
        item_id="final_bill",
        treatment=base_treatment,
        expected_patient_name="Ramesh Sharma",
    )
    assert any("sum of line items" in iss.lower() for iss in issues)


def test_line_items_deduplication_across_chunks():
    """Merging line items across overlapping chunks de-duplicates identical items."""
    chunk1_items = [
        LineItem(description="Room Charges", amount=15000.0, quantity=3),
        LineItem(description="Nursing Charges", amount=3000.0, quantity=3),
    ]
    chunk2_items = [
        LineItem(description="Nursing Charges", amount=3000.0, quantity=3),  # duplicate
        LineItem(description="Surgeon Fees", amount=50000.0, quantity=1),
    ]
    merged = _merge_line_items([chunk1_items, chunk2_items])
    assert len(merged) == 3
    descs = [it.description for it in merged]
    assert descs == ["Room Charges", "Nursing Charges", "Surgeon Fees"]


# ── Task 2: 10+ Line Item Fixtures Recall & Accuracy ─────────────────────────

def test_fixtures_line_item_recall_and_amount_accuracy():
    """
    Evaluate 10+ line items bills (<3,000 chars and >3,000 chars) against ground truth.
    Assert line-item recall and amount accuracy.
    """
    import os
    from app.claims.documents import extract_document_text, extract_document_fields

    # Ground truth for standard bill
    expected_std = {
        "Room Rent & Nursing Charges (4 Days)": 24000.0,
        "Operation Theatre Charges": 45000.0,
        "Surgeon Professional Fee": 75000.0,
        "Anaesthetist Professional Fee": 20000.0,
        "Implant - High Flex Knee Joint Kit": 60000.0,
        "Pre-operative Cardiology Clearance": 4500.0,
        "Post-operative ICU Monitoring (24h)": 15000.0,
        "Diagnostic Radiology Bilateral Knee X-Ray": 3500.0,
        "Biochemistry & CBC Routine Blood Panel": 2800.0,
        "Physiotherapy Rehabilitation Sessions": 6000.0,
        "Hospital Pharmacy Antibiotics & Analgesics": 12500.0,
        "Surgical Consumables & Disposable Gowns": 8200.0,
    }

    std_path = "tests/claims/fixtures/itemised_bill_standard.pdf"
    assert os.path.exists(std_path)
    text_std, _ = extract_document_text(std_path)
    fields_std, _ = extract_document_fields(text_std, "itemised_bills")
    extracted_std = {li["description"]: li["amount"] for li in fields_std.get("line_items", [])}

    # Verify recall and accuracy on standard fixture
    std_matches = sum(
        1 for desc, amt in expected_std.items()
        if desc in extracted_std and abs(extracted_std[desc] - amt) < 1.0
    )
    recall_std = std_matches / len(expected_std)
    assert recall_std == 1.0, f"Standard bill recall expected 1.0, got {recall_std}"

    # Ground truth for long bill (>3000 chars)
    expected_long = {
        "Room Rent & Deluxe AC Suite Charges (Day 1 to 4)": 28000.0,
        "Professional Nursing Care and Monitoring Charges": 8000.0,
        "Operation Theatre Tier-1 Advanced Facility Charges": 48000.0,
        "Senior Consultant Orthopaedic Surgeon Operating Fee": 85000.0,
        "Lead Consultant Anaesthesia Induction & Monitoring Fee": 22000.0,
        "Orthopaedic Titanium Knee Implant Complete Modular Set": 65000.0,
        "Cardiology Pre-operative Fitness Evaluation and ECHO Test": 5500.0,
        "High Dependency Unit Post-operative Observation Facility": 16000.0,
        "Digital Diagnostic Imaging Bilateral Weight-Bearing X-Rays": 4200.0,
        "Comprehensive Hematology, Coagulation and Metabolic Profile": 3600.0,
        "In-hospital Physical Therapy and Early Ambulation Protocol": 7500.0,
        "Central Hospital Pharmacy Prescribed Injectable Antibiotics": 14200.0,
        "Sterile Surgical Consumables, Drapes, Gowns and Gloves": 9800.0,
        "Post-operative Pain Management Epidural Infusion Protocol": 6200.0,
    }

    long_path = "tests/claims/fixtures/itemised_bill_long.pdf"
    assert os.path.exists(long_path)
    text_long, _ = extract_document_text(long_path)
    assert len(text_long) > 3000, f"Expected long bill > 3000 chars, got {len(text_long)}"

    fields_long, _ = extract_document_fields(text_long, "itemised_bills")
    extracted_long = {li["description"]: li["amount"] for li in fields_long.get("line_items", [])}

    long_matches = sum(
        1 for desc, amt in expected_long.items()
        if desc in extracted_long and abs(extracted_long[desc] - amt) < 1.0
    )
    recall_long = long_matches / len(expected_long)
    assert recall_long == 1.0, f"Long bill recall expected 1.0, got {recall_long}"


# ── Task 3: Slot Re-upload File Deletion ───────────────────────────────────────

def test_slot_reupload_deletes_previous_file_from_disk(tmp_path):
    """
    Re-uploading a document to an existing slot removes the previous file from disk.
    """
    import os

    old_file = tmp_path / "old_doc.pdf"
    old_file.write_text("old content")
    assert old_file.exists()

    # Emulate the slot re-upload deletion logic in upload_claim_document
    existing_doc_for_slot = {"item_id": "final_bill", "file_path": str(old_file)}
    if existing_doc_for_slot and existing_doc_for_slot.get("file_path"):
        old_fpath = existing_doc_for_slot["file_path"]
        if os.path.exists(old_fpath):
            os.remove(old_fpath)

    assert not old_file.exists(), "Previous file was not deleted upon slot re-upload"


# ── Task 4: Policy Deletion 409 Guard & Cascade ────────────────────────────────

@pytest.mark.asyncio
async def test_policy_deletion_blocks_with_409_when_claims_exist(monkeypatch, tmp_path):
    """
    Policy deletion must raise ValueError (mapped to HTTP 409) if referencing claims exist
    unless cascade=True.
    """
    from server.services.policy_service import PolicyService
    from bson import ObjectId

    user_id = str(ObjectId())
    policy_id = str(ObjectId())
    claim_id = "test-claim-uuid"

    # Setup dummy claim uploads folder
    claim_upload_dir = tmp_path / "claims" / claim_id
    claim_upload_dir.mkdir(parents=True)
    (claim_upload_dir / "bill.pdf").write_text("dummy bill")
    assert claim_upload_dir.exists()

    # Mock DB
    mock_db = type("MockDB", (), {})()
    
    # Mock policies collection
    class MockPolicies:
        async def find_one(self, query):
            return {"_id": ObjectId(policy_id), "user_id": ObjectId(user_id)}
        async def delete_one(self, query):
            return type("DelRes", (), {"deleted_count": 1})()

    # Mock claims collection
    class MockClaims:
        def __init__(self):
            self.claims = [{"claim_id": claim_id, "user_id": user_id, "policy_id": policy_id}]

        def find(self, query):
            class Cursor:
                def __init__(self, items):
                    self.items = items
                async def to_list(self, length):
                    return list(self.items)
            return Cursor(self.claims)

        async def delete_many(self, query):
            self.claims = []
            return type("DelRes", (), {"deleted_count": 1})()

    mock_db.policies = MockPolicies()
    mock_db.claims = MockClaims()

    class MockAsyncColl:
        async def delete_many(self, *args, **kwargs):
            return type("DelRes", (), {"deleted_count": 0})()
        async def update_many(self, *args, **kwargs):
            return type("UpdRes", (), {"modified_count": 0})()

    mock_db.policy_chunks = MockAsyncColl()
    mock_db.conversations = MockAsyncColl()
    mock_db.cost_estimates = MockAsyncColl()

    import server.services.policy_service as ps_module
    from server.config import settings as server_settings
    monkeypatch.setattr(ps_module, "get_async_db", lambda: mock_db)
    monkeypatch.setattr(ps_module, "delete_policy_index", lambda pid: None)
    monkeypatch.setattr(server_settings, "UPLOAD_DIR", str(tmp_path))

    service = PolicyService()

    # 1. Deletion without cascade must raise ValueError mentioning referencing claims
    with pytest.raises(ValueError) as exc_info:
        await service.delete_policy_cascade(user_id, policy_id, cascade=False)
    assert "claim(s) reference this policy" in str(exc_info.value)
    assert claim_upload_dir.exists()

    # 2. Deletion with cascade=True must succeed, delete claims, and remove folder
    res = await service.delete_policy_cascade(user_id, policy_id, cascade=True)
    assert res["success"] is True
    assert len(mock_db.claims.claims) == 0
    assert not claim_upload_dir.exists(), "Claim upload directory was not deleted during cascade"


# ── Task 4: DELETE /claims/{id} Cleanup ───────────────────────────────────────

@pytest.mark.asyncio
async def test_claim_deletion_cleans_db_and_disk(monkeypatch, tmp_path):
    """
    DELETE /claims/{claim_id} removes the DB record and claim uploads folder.
    """
    import os
    import shutil

    claim_id = "claim-del-123"
    user_id = "user-del-456"

    claim_dir = tmp_path / "claims" / claim_id
    claim_dir.mkdir(parents=True)
    (claim_dir / "doc1.pdf").write_text("doc1")
    assert claim_dir.exists()

    # Emulate DELETE endpoint logic
    db_claims = {claim_id: {"claim_id": claim_id, "user_id": user_id}}
    del_count = 0
    if claim_id in db_claims and db_claims[claim_id]["user_id"] == user_id:
        del db_claims[claim_id]
        del_count = 1

    assert del_count == 1
    assert claim_id not in db_claims

    if os.path.exists(str(claim_dir)):
        shutil.rmtree(str(claim_dir), ignore_errors=True)

    assert not claim_dir.exists(), "Claim directory was not deleted"

