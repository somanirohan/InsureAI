"""
End-to-end Golden Claim Scenarios Test Suite.
Evaluates 6 realistic, synthetic insurance claim journeys:
  Scenario 1: Clean Happy Path (Covered procedure, satisfied waiting period, all docs validated)
  Scenario 2: Permanent Exclusion Rejection (Blocked submission with policy clause citation)
  Scenario 3: Specific Waiting Period Breach (Policy age < 24 months for named ailment)
  Scenario 4: Room Rent Proportionate Deduction (Deluxe room breaches 1% cap, transparent deduction)
  Scenario 5: Document Mismatch & Manual Confirmation (OCR error -> needs confirmation -> user confirms -> validated)
  Scenario 6: IRDAI Regulatory Baseline Discrepancy (Policy 48mo vs IRDAI statutory 36mo cap advisory)
"""

import pytest
from datetime import datetime
from unittest.mock import MagicMock, patch
from bson import ObjectId

from app.claims.models import (
    Claim,
    ClaimDocument,
    ChecklistItem,
    TreatmentDetails,
)
from app.claims.eligibility import evaluate_eligibility
from app.claims.documents import validate_document
from app.claims.settlement import calculate_settlement_estimate
from app.claims.readiness import compute_claim_readiness
from app.claims.transitions import transition_claim, InvalidStateTransitionError


# ── Fixtures: Standard Synthetic Policy Facts ────────────────────────────────

@pytest.fixture
def synthetic_policy_facts():
    return {
        "sum_insured": {"value": "₹ 5,00,000", "page": 1},
        "room_rent_limit": {"value": "1% of Sum Insured per day", "page": 2},
        "co_pay": {"value": "10%", "page": 3},
        "deductible": {"value": "₹ 5,000", "page": 3},
        "waiting_periods": [
            {"condition": "Pre-existing Diseases (PED)", "period": "48 months", "page": 4},
            {"condition": "Cataract surgery and eye ailments", "period": "24 months", "page": 4},
            {"condition": "Hernia and hydrocele procedures", "period": "24 months", "page": 5},
            {"condition": "Joint Replacement Surgeries", "period": "24 months", "page": 5},
        ],
        "exclusions": [
            {"item": "Cosmetic, aesthetic and plastic surgeries", "page": 9},
            {"item": "Bariatric surgery for obesity or weight management", "page": 9},
            {"item": "Hazardous sports and adventurous activities", "page": 10},
        ],
        "claim_conditions": [
            {
                "condition": "Submit original discharge summary within 15 days of discharge",
                "stage": "after_discharge",
                "deadline": "15 days",
                "page": 12,
                "verified": True,
            },
            {
                "condition": "Submit itemized hospital final bill and payment receipts within 30 days",
                "stage": "after_discharge",
                "deadline": "30 days",
                "page": 12,
                "verified": True,
            },
        ],
    }


# ── Scenario 1: Clean Happy Path ─────────────────────────────────────────────

def test_scenario_1_happy_path(synthetic_policy_facts):
    """
    User files claim for emergency Appendectomy.
    Policy is 3 years old (all waiting periods met).
    All required documents uploaded and verified.
    Result: Clean eligibility, transparent bill-based settlement, 0 blockers, successful submission.
    """
    treatment = TreatmentDetails(
        name="Emergency Appendectomy",
        hospital="Max Super Speciality Hospital",
        admission_date="2024-05-10",
        discharge_date="2024-05-13",
        room_type="Single Private AC Room",
        estimated_cost=95000.0,
    )

    # 1. Eligibility evaluation
    eligibility = evaluate_eligibility(
        policy_facts=synthetic_policy_facts,
        treatment=treatment,
        policy_start_date="2021-01-01",  # 3+ years old
        today="2024-05-15",
    )

    # All checks pass without blocking flags
    assert all(c.result in ("pass", "flag") for c in eligibility.checks)
    blocking_flags = [f for f in eligibility.flags if f.severity == "blocking"]
    assert len(blocking_flags) == 0

    # 2. Documents uploaded and validated
    doc_discharge = ClaimDocument(
        document_id="doc-1",
        item_id="discharge_summary",
        filename="Discharge_Summary_Max.pdf",
        extracted_fields={
            "patient_name": "Ramesh Sharma",
            "admission_date": "2024-05-10",
            "discharge_date": "2024-05-13",
            "diagnosis": "Acute Appendicitis with Appendectomy",
            "document_type": "discharge_summary",
        },
        field_confidence={"patient_name": 0.95, "admission_date": 0.95},
        validation_issues=[],
        needs_confirmation=False,
    )

    doc_bill = ClaimDocument(
        document_id="doc-2",
        item_id="final_bill",
        filename="Final_Bill_Max.pdf",
        extracted_fields={
            "patient_name": "Ramesh Sharma",
            "admission_date": "2024-05-10",
            "discharge_date": "2024-05-13",
            "total_amount": 92000.0,
            "document_type": "final_bill",
        },
        field_confidence={"patient_name": 0.95, "total_amount": 0.98},
        validation_issues=[],
        needs_confirmation=False,
    )

    checklist_items = [
        ChecklistItem(item_id="discharge_summary", label="Original discharge summary", stage="after_discharge", status="validated", document_id="doc-1"),
        ChecklistItem(item_id="final_bill", label="Hospital final bill", stage="after_discharge", status="validated", document_id="doc-2"),
    ]

    claim = Claim(
        claim_id="claim-happy-1",
        user_id="user-1",
        policy_id="policy-1",
        status="docs_validated",
        treatment=treatment,
        eligibility_result=eligibility,
        checklist=checklist_items,
        documents=[doc_discharge, doc_bill],
    )

    # 3. Settlement calculation
    settlement = calculate_settlement_estimate(claim, synthetic_policy_facts)
    assert settlement.basis == "uploaded_bill"
    assert settlement.total > 0
    # Must deduct 7% consumables, 10% copay, and 5000 deductible
    assert settlement.total < 92000.0
    claim.settlement_estimate = settlement

    # 4. Readiness check
    readiness = compute_claim_readiness(claim)
    assert readiness.total_items == 2
    assert readiness.complete_items == 2
    assert readiness.missing_items == 0
    assert readiness.flagged_items == 0
    assert readiness.can_submit is True
    assert readiness.qualitative_label == "2 of 2 items complete"

    # 5. State machine transition to ready_to_submit -> submitted
    transition_claim(claim.__dict__, "ready_to_submit")
    assert claim.status == "ready_to_submit"

    transition_claim(claim.__dict__, "submitted")
    assert claim.status == "submitted"
    assert len(claim.timeline) >= 2


# ── Scenario 2: Permanent Exclusion Rejection ────────────────────────────────

def test_scenario_2_exclusion_rejection(synthetic_policy_facts):
    """
    User requests claim for Cosmetic Rhinoplasty surgery.
    Engine matches permanent exclusion on Page 9.
    Verdict: Exclusions check fails, blocking flag raised, submission strictly blocked.
    """
    treatment = TreatmentDetails(
        name="Cosmetic Aesthetic Rhinoplasty",
        hospital="Aura Clinic",
        admission_date="2024-05-10",
        room_type="Single Private AC Room",
        estimated_cost=120000.0,
    )

    eligibility = evaluate_eligibility(
        policy_facts=synthetic_policy_facts,
        treatment=treatment,
        policy_start_date="2020-01-01",
        today="2024-05-15",
    )

    # Check 1 fails
    exc_check = next(c for c in eligibility.checks if c.check == "exclusions_check")
    assert exc_check.result == "fail"
    assert "Page 9" in exc_check.source

    # Blocking flag generated
    blocking_flags = [f for f in eligibility.flags if f.severity == "blocking"]
    assert len(blocking_flags) >= 1
    assert any(f.flag_id == "exclusion_conflict" for f in blocking_flags)

    claim = Claim(
        claim_id="claim-exc-2",
        user_id="user-1",
        policy_id="policy-1",
        status="docs_pending",
        treatment=treatment,
        eligibility_result=eligibility,
        checklist=[
            ChecklistItem(item_id="bill", label="Hospital Bill", stage="after_discharge", status="validated"),
        ],
    )

    # Readiness confirms submission is strictly blocked
    readiness = compute_claim_readiness(claim)
    assert readiness.can_submit is False
    assert any("blocking eligibility/policy condition" in b for b in readiness.submission_blockers)


# ── Scenario 3: Specific Waiting Period Breach ───────────────────────────────

def test_scenario_3_waiting_period_breach(synthetic_policy_facts):
    """
    User requires Cataract surgery under a policy active for only 8 months.
    Specific waiting period clause mandates 24 months continuous coverage.
    Verdict: Check fails with Page 4 citation, blocking flag created, prevents submission.
    """
    treatment = TreatmentDetails(
        name="Cataract Surgery (Phacoemulsification)",
        hospital="Eye Care Centre",
        admission_date="2024-05-10",
        room_type="Day Care Ward",
        estimated_cost=45000.0,
    )

    # Policy started 8 months ago
    eligibility = evaluate_eligibility(
        policy_facts=synthetic_policy_facts,
        treatment=treatment,
        policy_start_date="2023-09-01",
        today="2024-05-15",
    )

    wp_check = next(c for c in eligibility.checks if c.check == "specific_waiting_period_check")
    assert wp_check.result == "fail"
    assert "Page 4" in wp_check.source

    blocking_flags = [f for f in eligibility.flags if f.severity == "blocking"]
    assert any(f.flag_id == "waiting_period_unmet" for f in blocking_flags)
    assert "24" in blocking_flags[0].detail

    claim = Claim(
        claim_id="claim-wp-3",
        user_id="user-1",
        policy_id="policy-1",
        status="docs_pending",
        treatment=treatment,
        eligibility_result=eligibility,
        checklist=[],
    )

    readiness = compute_claim_readiness(claim)
    assert readiness.can_submit is False
    assert any("blocking eligibility" in b for b in readiness.submission_blockers)


# ── Scenario 4: Room Rent Proportionate Deduction ────────────────────────────

def test_scenario_4_room_rent_proportionate_deduction(synthetic_policy_facts):
    """
    Sum insured is 500,000 with a 1% daily room rent cap (₹5,000/day).
    Patient admits into Super Deluxe / Suite room.
    Verdict: Proportionate deduction warning flagged; settlement math itemizes deduction with Page 2 citation.
    """
    treatment = TreatmentDetails(
        name="Gallbladder Stone Removal",
        hospital="Fortis Hospital",
        admission_date="2024-05-10",
        discharge_date="2024-05-14",
        room_type="Super Deluxe / Suite",
        estimated_cost=150000.0,
    )

    eligibility = evaluate_eligibility(
        policy_facts=synthetic_policy_facts,
        treatment=treatment,
        policy_start_date="2021-01-01",
        today="2024-05-15",
    )

    # Cost & Sub-limit check flags proportionate deduction risk
    rr_flags = [f for f in eligibility.flags if f.flag_id == "room_rent_proportionate_deduction"]
    assert len(rr_flags) == 1
    assert "Page 2" in rr_flags[0].citation

    claim = Claim(
        claim_id="claim-rr-4",
        user_id="user-1",
        policy_id="policy-1",
        status="docs_validated",
        treatment=treatment,
        eligibility_result=eligibility,
        documents=[],
    )

    # Settlement math reflects proportionate deduction
    settlement = calculate_settlement_estimate(claim, synthetic_policy_facts)
    rr_step = next(s for s in settlement.receipt_steps if "Room Rent Proportionate Deduction" in s.label)
    assert rr_step.amount < 0
    assert "Page 2" in rr_step.citation


# ── Scenario 5: Document Mismatch & Manual Confirmation ──────────────────────

def test_scenario_5_document_mismatch_and_confirmation(synthetic_policy_facts):
    """
    OCR extracts slight name typo or patient name mismatch on hospital bill.
    Validator marks document 'needs_confirmation: true'.
    Readiness reflects flagged item and blocks submission.
    User manually confirms fields -> document validates -> readiness allows submission.
    """
    treatment = TreatmentDetails(
        name="Emergency Appendectomy",
        hospital="Apollo Hospital",
        admission_date="2024-05-10",
        discharge_date="2024-05-13",
        room_type="Single Private AC Room",
        estimated_cost=90000.0,
    )

    # Extracted name is different / partial
    doc_fields = {
        "patient_name": "Unknown Patient X",
        "admission_date": "2024-05-10",
        "discharge_date": "2024-05-13",
        "diagnosis": "Appendectomy",
        "total_amount": 88000.0,
        "document_type": "final_bill",
    }
    conf = {k: 0.9 for k in doc_fields}

    issues, needs_conf = validate_document(
        extracted_fields=doc_fields,
        field_confidence=conf,
        item_id="final_bill",
        treatment=treatment,
        expected_patient_name="Ramesh Sharma",
    )

    assert needs_conf is True
    assert len(issues) >= 1

    claim_doc = ClaimDocument(
        document_id="doc-flagged-5",
        item_id="final_bill",
        filename="Bill.pdf",
        extracted_fields=doc_fields,
        field_confidence=conf,
        validation_issues=issues,
        needs_confirmation=True,
    )

    claim = Claim(
        claim_id="claim-doc-5",
        user_id="user-1",
        policy_id="policy-1",
        status="docs_pending",
        treatment=treatment,
        eligibility_result=evaluate_eligibility(synthetic_policy_facts, treatment, "2020-01-01"),
        checklist=[
            ChecklistItem(item_id="final_bill", label="Hospital Final Bill", stage="after_discharge", status="needs_confirmation", document_id="doc-flagged-5"),
        ],
        documents=[claim_doc],
    )

    # Readiness before confirmation
    readiness_before = compute_claim_readiness(claim)
    assert readiness_before.flagged_items == 1
    assert readiness_before.can_submit is False
    assert any("flagged or require manual confirmation" in b for b in readiness_before.submission_blockers)

    # User manually confirms fields
    claim_doc.extracted_fields["patient_name"] = "Ramesh Sharma"
    claim_doc.needs_confirmation = False
    claim_doc.validation_issues = []
    claim.checklist[0].status = "validated"

    # Readiness after confirmation
    readiness_after = compute_claim_readiness(claim)
    assert readiness_after.flagged_items == 0
    assert readiness_after.complete_items == 1
    assert readiness_after.can_submit is True


# ── Scenario 6: Regulatory IRDAI Baseline Discrepancy ────────────────────────

def test_scenario_6_irdai_regulatory_discrepancy(synthetic_policy_facts):
    """
    Policy clause specifies a 48-month PED waiting period.
    IRDAI statutory master circular caps PED waiting periods at 36 months.
    Verdict: Engine surfaces an informational advisory flag citing the IRDAI circular.
    """
    treatment = TreatmentDetails(
        name="Hypertension Consultation & Inpatient Care",
        hospital="City Clinic",
        admission_date="2024-05-10",
        room_type="Single Private AC Room",
        estimated_cost=25000.0,
    )

    eligibility = evaluate_eligibility(
        policy_facts=synthetic_policy_facts,
        treatment=treatment,
        policy_start_date="2021-01-01",
        today="2024-05-15",
    )

    # IRDAI baseline check flags the discrepancy
    irdai_check = next(c for c in eligibility.checks if c.check == "irdai_baseline_check")
    assert irdai_check.result == "flag"
    assert "48" in irdai_check.detail
    assert "36" in irdai_check.detail

    # Surfaces statutory protection flag
    statutory_flags = [f for f in eligibility.flags if f.flag_id == "irdai_ped_cap_override"]
    assert "IRDAI" in statutory_flags[0].citation
    assert "circular" in statutory_flags[0].citation.lower()
