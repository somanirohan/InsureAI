"""
Unit tests for deterministic Claim Settlement Engine.
Tests pre-treatment estimate vs uploaded bill, receipt steps, citations, and deductions.
"""

import pytest
from app.claims.models import Claim, ClaimDocument, TreatmentDetails
from app.claims.settlement import calculate_settlement_estimate


@pytest.fixture
def sample_policy_facts():
    return {
        "sum_insured": {"value": "₹ 5,00,000", "page": 1},
        "room_rent_limit": {"value": "1% of Sum Insured", "page": 2},
        "co_pay": {"value": "10%", "page": 3},
        "deductible": {"value": "₹ 10,000", "page": 3},
        "waiting_periods": [],
        "exclusions": [],
        "claim_conditions": [],
    }


def test_settlement_pre_treatment_estimate_basis(sample_policy_facts):
    """When no bill is uploaded, basis is pre_treatment_estimate."""
    claim = Claim(
        claim_id="c1",
        user_id="u1",
        policy_id="p1",
        treatment=TreatmentDetails(
            name="Appendectomy",
            hospital="Apollo",
            admission_date="2024-05-10",
            room_type="Single Private AC",
            estimated_cost=100000.0,
        ),
        documents=[],
    )

    estimate = calculate_settlement_estimate(claim, sample_policy_facts)

    assert estimate.basis == "pre_treatment_estimate"
    assert len(estimate.receipt_steps) >= 4

    # Step 1: Gross
    assert estimate.receipt_steps[0].label == "Gross Claimed Amount"
    assert estimate.receipt_steps[0].amount == 100000.0

    # Step 2: 7% non-medical deduction
    step_7pct = next(s for s in estimate.receipt_steps if "7%" in s.label)
    assert step_7pct.amount == -7000.0
    assert "IRDAI List I" in step_7pct.citation

    # Step 3: Co-pay 10%
    step_copay = next(s for s in estimate.receipt_steps if "Co-Payment" in s.label)
    assert "Page 3" in step_copay.citation

    # Step 4: Deductible
    step_deductible = next(s for s in estimate.receipt_steps if "Deductible" in s.label)
    assert step_deductible.amount == -10000.0
    assert "Page 3" in step_deductible.citation

    assert estimate.total > 0
    assert estimate.total < 100000.0


def test_settlement_uploaded_bill_basis(sample_policy_facts):
    """When valid final bill exists, basis is uploaded_bill."""
    bill_doc = ClaimDocument(
        document_id="doc-bill-1",
        item_id="final_bill",
        filename="hospital_final_bill.pdf",
        extracted_fields={"total_amount": 180000.0, "document_type": "final_bill"},
        field_confidence={"total_amount": 0.95},
        validation_issues=[],
        needs_confirmation=False,
    )

    claim = Claim(
        claim_id="c2",
        user_id="u1",
        policy_id="p1",
        treatment=TreatmentDetails(
            name="Appendectomy",
            hospital="Apollo",
            admission_date="2024-05-10",
            room_type="Single Private AC",
            estimated_cost=100000.0,  # Differs from billed
        ),
        documents=[bill_doc],
    )

    estimate = calculate_settlement_estimate(claim, sample_policy_facts)

    assert estimate.basis == "uploaded_bill"
    assert estimate.receipt_steps[0].amount == 180000.0
    assert "hospital_final_bill.pdf" in estimate.receipt_steps[0].citation


def test_settlement_sum_insured_ceiling(sample_policy_facts):
    """When claim exceeds sum insured, it is capped at sum insured."""
    bill_doc = ClaimDocument(
        document_id="doc-bill-2",
        item_id="final_bill",
        filename="major_surgery_bill.pdf",
        extracted_fields={"total_amount": 900000.0, "document_type": "final_bill"},
        field_confidence={"total_amount": 0.95},
        validation_issues=[],
        needs_confirmation=False,
    )

    claim = Claim(
        claim_id="c3",
        user_id="u1",
        policy_id="p1",
        treatment=TreatmentDetails(
            name="Major Surgery",
            hospital="Max Hospital",
            admission_date="2024-05-10",
            room_type="Single Private AC",
            estimated_cost=900000.0,
        ),
        documents=[bill_doc],
    )

    estimate = calculate_settlement_estimate(claim, sample_policy_facts)

    # SI is 500,000, so payable cannot exceed 500,000
    assert estimate.total <= 500000.0
    cap_step = next((s for s in estimate.receipt_steps if "Sum Insured Ceiling Cap" in s.label), None)
    assert cap_step is not None
    assert "Page 1" in cap_step.citation
