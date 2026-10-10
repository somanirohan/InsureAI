"""
Unit tests for claim document validation pipeline and 5 deterministic validators.
"""

import pytest
from app.claims.documents import validate_document
from app.claims.models import TreatmentDetails


@pytest.fixture
def sample_treatment():
    return TreatmentDetails(
        name="Total Knee Replacement",
        hospital="Fortis Hospital",
        admission_date="2024-05-10",
        discharge_date="2024-05-14",
        room_type="Single Private AC",
        estimated_cost=250000.0,
    )


def test_validator_1_patient_name_fuzzy_match(sample_treatment):
    """Patient name mismatch should be caught and require confirmation."""
    fields = {
        "patient_name": "Ramesh Kumar Sharma",
        "admission_date": "2024-05-10",
        "discharge_date": "2024-05-14",
        "diagnosis": "Severe Osteoarthritis Knee",
        "total_amount": 250000.0,
        "document_type": "discharge_summary",
    }
    conf = {k: 0.9 for k in fields}

    # Matching name
    issues, needs_conf = validate_document(
        extracted_fields=fields,
        field_confidence=conf,
        item_id="discharge_summary",
        treatment=sample_treatment,
        expected_patient_name="Ramesh Sharma",
    )
    assert len(issues) == 0
    assert needs_conf is False

    # Mismatched name
    issues_mismatch, needs_conf_mismatch = validate_document(
        extracted_fields=fields,
        field_confidence=conf,
        item_id="discharge_summary",
        treatment=sample_treatment,
        expected_patient_name="Pooja Patel",
    )
    assert any("does not match expected name" in issue for issue in issues_mismatch)
    assert needs_conf_mismatch is True


def test_validator_2_date_consistency(sample_treatment):
    """Admission date after discharge or mismatching treatment date triggers issues."""
    # Admission after discharge
    fields_bad_dates = {
        "patient_name": "Ramesh Sharma",
        "admission_date": "2024-05-20",
        "discharge_date": "2024-05-14",
        "diagnosis": "Total Knee Replacement",
        "total_amount": None,
        "document_type": "discharge_summary",
    }
    conf = {k: 0.9 for k in fields_bad_dates}

    issues, needs_conf = validate_document(
        extracted_fields=fields_bad_dates,
        field_confidence=conf,
        item_id="discharge_summary",
        treatment=sample_treatment,
        expected_patient_name="Ramesh Sharma",
    )
    assert any("cannot be after discharge date" in issue for issue in issues)
    assert any("differs from claim admission date" in issue for issue in issues)
    assert needs_conf is True


def test_validator_3_numeric_bill_total(sample_treatment):
    """Bill slot requires positive amount; flags exorbitant bill."""
    # Zero/missing amount in bill slot
    fields_zero = {
        "patient_name": "Ramesh Sharma",
        "admission_date": "2024-05-10",
        "discharge_date": "2024-05-14",
        "diagnosis": "Total Knee Replacement",
        "total_amount": 0.0,
        "document_type": "final_bill",
    }
    conf = {k: 0.9 for k in fields_zero}

    issues, needs_conf = validate_document(
        extracted_fields=fields_zero,
        field_confidence=conf,
        item_id="final_bill",
        treatment=sample_treatment,
        expected_patient_name="Ramesh Sharma",
    )
    assert any("missing a valid positive total" in issue for issue in issues)
    assert needs_conf is True

    # Valid bill amount
    fields_valid = dict(fields_zero, total_amount=245000.0)
    issues_valid, needs_conf_valid = validate_document(
        extracted_fields=fields_valid,
        field_confidence=conf,
        item_id="final_bill",
        treatment=sample_treatment,
        expected_patient_name="Ramesh Sharma",
    )
    assert len(issues_valid) == 0
    assert needs_conf_valid is False


def test_validator_4_diagnosis_alignment(sample_treatment):
    """Unrelated diagnosis triggers issue."""
    fields_unrelated = {
        "patient_name": "Ramesh Sharma",
        "admission_date": "2024-05-10",
        "discharge_date": "2024-05-14",
        "diagnosis": "Acute Gastroenteritis and Food Poisoning",
        "total_amount": 250000.0,
        "document_type": "discharge_summary",
    }
    conf = {k: 0.9 for k in fields_unrelated}

    issues, needs_conf = validate_document(
        extracted_fields=fields_unrelated,
        field_confidence=conf,
        item_id="discharge_summary",
        treatment=sample_treatment,
        expected_patient_name="Ramesh Sharma",
    )
    assert any("does not appear to match claimed treatment" in issue for issue in issues)
    assert needs_conf is True


def test_validator_5_document_type_alignment(sample_treatment):
    """Document uploaded to wrong slot triggers issue."""
    fields_wrong_slot = {
        "patient_name": "Ramesh Sharma",
        "admission_date": "2024-05-10",
        "discharge_date": "2024-05-14",
        "diagnosis": "Total Knee Replacement",
        "total_amount": 250000.0,
        "document_type": "final_bill",  # Final bill uploaded to discharge_summary slot
    }
    conf = {k: 0.9 for k in fields_wrong_slot}

    issues, needs_conf = validate_document(
        extracted_fields=fields_wrong_slot,
        field_confidence=conf,
        item_id="discharge_summary",
        treatment=sample_treatment,
        expected_patient_name="Ramesh Sharma",
    )
    assert any("Document detected as 'final_bill' but was uploaded to the 'discharge_summary' slot" in issue for issue in issues)
    assert needs_conf is True


def test_low_confidence_triggers_needs_confirmation(sample_treatment):
    """Field confidence < 0.7 triggers needs_confirmation even if validators pass."""
    fields = {
        "patient_name": "Ramesh Sharma",
        "admission_date": "2024-05-10",
        "discharge_date": "2024-05-14",
        "diagnosis": "Total Knee Replacement",
        "total_amount": 250000.0,
        "document_type": "final_bill",
    }
    # Low confidence on bill amount
    conf = {
        "patient_name": 0.9,
        "admission_date": 0.9,
        "discharge_date": 0.9,
        "diagnosis": 0.9,
        "total_amount": 0.55,  # < 0.7
        "document_type": 0.9,
    }

    issues, needs_conf = validate_document(
        extracted_fields=fields,
        field_confidence=conf,
        item_id="final_bill",
        treatment=sample_treatment,
        expected_patient_name="Ramesh Sharma",
    )
    assert needs_conf is True
    assert "Low confidence on total billed amount." in issues
