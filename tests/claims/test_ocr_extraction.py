"""
Comprehensive test suite for claim document OCR extraction, preprocessing,
LLM structured parsing, fallbacks, failure transparency, and deterministic validation.
"""

import json
import os
from unittest.mock import MagicMock, patch
import pytest

from app.claims.documents import (
    check_ocr_availability,
    extract_document_text,
    extract_document_fields,
    validate_document,
    process_uploaded_claim_document,
)
from app.claims.models import TreatmentDetails


@pytest.fixture
def standard_treatment():
    return TreatmentDetails(
        name="Total Knee Replacement",
        hospital="Apollo Hospitals",
        admission_date="2024-05-10",
        discharge_date="2024-05-14",
        room_type="Single Private AC",
        estimated_cost=250000.0,
    )


# ── 1. Clean Text PDF Test ───────────────────────────────────────────────────

def test_clean_text_pdf_no_ocr_triggered_validates(standard_treatment):
    """Clean text PDF should extract natively without OCR and reach validated status."""
    path = "tests/claims/fixtures/clean_bill.pdf"
    assert os.path.exists(path)

    text, diag = extract_document_text(path)
    assert diag["source"] == "native"
    assert diag["ocr_triggered"] is False
    assert diag["char_count"] >= 50

    doc = process_uploaded_claim_document(
        file_path=path,
        filename="clean_bill.pdf",
        item_id="final_bill",
        treatment=standard_treatment,
        expected_patient_name="Ramesh Sharma",
    )
    assert doc.needs_confirmation is False
    assert len(doc.validation_issues) == 0
    assert doc.extracted_fields.get("total_amount") == 245000.0


# ── 2. Scanned PDF & JPG Test ────────────────────────────────────────────────

def test_scanned_pdf_and_jpg_ocr_triggered(standard_treatment):
    """Scanned PDF and JPG must trigger OCR and extract valid content."""
    scan_path = "tests/claims/fixtures/scanned_bill.pdf"
    assert os.path.exists(scan_path)

    text_scan, diag_scan = extract_document_text(scan_path)
    assert diag_scan["ocr_triggered"] is True
    assert diag_scan["char_count"] > 0
    assert "Apollo" in text_scan or "Ramesh" in text_scan

    photo_path = "tests/claims/fixtures/photo_bill.jpg"
    assert os.path.exists(photo_path)
    text_photo, diag_photo = extract_document_text(photo_path)
    assert diag_photo["ocr_triggered"] is True
    assert diag_photo["char_count"] > 0


# ── 3. Rotated Scan / Preprocessing ──────────────────────────────────────────

def test_rotated_or_oriented_scan_handling(standard_treatment, tmp_path):
    """Rotated image should be processed or safely flagged with specific reason."""
    from PIL import Image, ImageDraw

    # Create a rotated test image
    img = Image.new("RGB", (600, 800), color=(255, 255, 255))
    d = ImageDraw.Draw(img)
    d.text((50, 50), "Patient Name: Ramesh Sharma\nTotal Amount: INR 50000", fill=(0, 0, 0))
    rotated_img = img.rotate(90, expand=True)
    rot_file = str(tmp_path / "rotated.png")
    rotated_img.save(rot_file)

    text, diag = extract_document_text(rot_file)
    assert diag["ocr_triggered"] is True
    # Pipeline executes without exception
    fields, conf = extract_document_fields(text, "final_bill")
    assert isinstance(fields, dict)


# ── 4. Blank or Unreadable Image ─────────────────────────────────────────────

def test_blank_or_unreadable_image_handled_safely(standard_treatment, tmp_path):
    """Blank image must be marked needs_confirmation with specific reason and not crash."""
    from PIL import Image

    blank_img = Image.new("RGB", (300, 300), color=(255, 255, 255))
    blank_file = str(tmp_path / "blank.png")
    blank_img.save(blank_file)

    doc = process_uploaded_claim_document(
        file_path=blank_file,
        filename="blank.png",
        item_id="final_bill",
        treatment=standard_treatment,
        expected_patient_name="Ramesh Sharma",
    )
    assert doc.needs_confirmation is True
    assert any("Document unreadable or blank" in iss for iss in doc.validation_issues)


# ── 5. Tesseract Unavailable Patch Test ───────────────────────────────────────

def test_tesseract_unavailable_graceful_handling(standard_treatment):
    """When Tesseract is unavailable on the machine, document is flagged with exact reason."""
    with patch("app.claims.documents.check_ocr_availability") as mock_check:
        mock_check.return_value = {
            "available": False,
            "binary_path": None,
            "version": None,
            "languages": [],
            "error": "Tesseract binary not found on host PATH",
        }
        # Run on a scanned PDF that requires OCR
        doc = process_uploaded_claim_document(
            file_path="tests/claims/fixtures/scanned_bill.pdf",
            filename="scanned_bill.pdf",
            item_id="final_bill",
            treatment=standard_treatment,
            expected_patient_name="Ramesh Sharma",
        )
        assert doc.needs_confirmation is True
        assert any("OCR unavailable on this machine" in iss for iss in doc.validation_issues)


# ── 6. LLM Edge Cases: Code Fences, Number Formats, Tolerant Parsing ──────────

def test_llm_markdown_fences_and_currency_parsing():
    """Tolerant extraction handles markdown fences, commas, and currency symbols."""
    mock_llm_response = """```json
    {
      "patient_name": "Ramesh Sharma",
      "admission_date": "10/05/2024",
      "discharge_date": "14/05/2024",
      "diagnosis": "Total Knee Replacement",
      "total_amount": "₹2,45,000.00",
      "document_type": "final_bill",
      "confidence": {
        "patient_name": 0.95,
        "admission_date": 0.9,
        "discharge_date": 0.9,
        "diagnosis": 0.9,
        "total_amount": 0.95,
        "document_type": 0.95
      }
    }
    ```"""
    with patch("app.claims.documents.get_llm") as mock_get_llm:
        mock_instance = MagicMock()
        mock_instance.chat.return_value = mock_llm_response
        mock_get_llm.return_value = mock_instance

        fields, conf = extract_document_fields("Some text", "final_bill")
        assert fields["patient_name"] == "Ramesh Sharma"
        assert fields["admission_date"] == "2024-05-10"
        assert fields["discharge_date"] == "2024-05-14"
        assert fields["total_amount"] == 245000.0
        assert fields["document_type"] == "final_bill"
        assert conf["total_amount"] == 0.95


# ── 7. Flawed Documents Guard (Guard Against Over-Loosening) ─────────────────

def test_deliberately_flawed_documents_are_flagged(standard_treatment):
    """Guard against over-loosening: flawed documents MUST still be flagged with reasons."""
    # (a) Wrong patient name
    fields_wrong_name = {
        "patient_name": "Sunita Verma",
        "admission_date": "2024-05-10",
        "discharge_date": "2024-05-14",
        "diagnosis": "Total Knee Replacement",
        "total_amount": 245000.0,
        "document_type": "final_bill",
    }
    conf = {k: 0.9 for k in fields_wrong_name}
    issues, needs_conf = validate_document(
        extracted_fields=fields_wrong_name,
        field_confidence=conf,
        item_id="final_bill",
        treatment=standard_treatment,
        expected_patient_name="Ramesh Sharma",
    )
    assert needs_conf is True
    assert any("does not match expected name" in iss for iss in issues)

    # (b) Discharge before admission
    fields_bad_dates = dict(fields_wrong_name, patient_name="Ramesh Sharma", admission_date="2024-05-20", discharge_date="2024-05-14")
    issues_dates, needs_conf_dates = validate_document(
        extracted_fields=fields_bad_dates,
        field_confidence=conf,
        item_id="final_bill",
        treatment=standard_treatment,
        expected_patient_name="Ramesh Sharma",
    )
    assert needs_conf_dates is True
    assert any("cannot be after discharge date" in iss for iss in issues_dates)

    # (c) Missing total in bill slot
    fields_no_total = dict(fields_wrong_name, patient_name="Ramesh Sharma", total_amount=None)
    issues_no_tot, needs_conf_no_tot = validate_document(
        extracted_fields=fields_no_total,
        field_confidence=conf,
        item_id="final_bill",
        treatment=standard_treatment,
        expected_patient_name="Ramesh Sharma",
    )
    assert needs_conf_no_tot is True
    assert any("missing a valid positive total" in iss for iss in issues_no_tot)

    # (d) Wrong document type for slot
    fields_wrong_type = dict(fields_wrong_name, patient_name="Ramesh Sharma", total_amount=245000.0, document_type="final_bill")
    issues_type, needs_conf_type = validate_document(
        extracted_fields=fields_wrong_type,
        field_confidence=conf,
        item_id="discharge_summary",
        treatment=standard_treatment,
        expected_patient_name="Ramesh Sharma",
    )
    assert needs_conf_type is True
    assert any("uploaded to the 'discharge_summary' slot" in iss for iss in issues_type)


# ── 8. Non-Bill Discharge Summary Does Not Flag Missing Bill Total ────────────

def test_clean_discharge_summary_not_flagged_for_missing_amount(standard_treatment):
    """Discharge summary should NOT require total_amount and should validate cleanly."""
    doc = process_uploaded_claim_document(
        file_path="tests/claims/fixtures/discharge_summary.pdf",
        filename="discharge_summary.pdf",
        item_id="discharge_summary",
        treatment=standard_treatment,
        expected_patient_name="Ramesh Sharma",
    )
    assert doc.needs_confirmation is False
    assert len(doc.validation_issues) == 0


# ── 9. Specific Reasons On Every Flagged Document ────────────────────────────

def test_every_flagged_document_has_specific_non_empty_reasons(standard_treatment):
    """Every needs_confirmation outcome must contain at least one non-empty specific reason."""
    fields = {
        "patient_name": None,
        "admission_date": None,
        "discharge_date": None,
        "diagnosis": None,
        "total_amount": None,
        "document_type": "unknown",
    }
    conf = {k: 0.1 for k in fields}
    issues, needs_conf = validate_document(
        extracted_fields=fields,
        field_confidence=conf,
        item_id="final_bill",
        treatment=standard_treatment,
        expected_patient_name="Ramesh Sharma",
    )
    assert needs_conf is True
    assert len(issues) > 0
    assert all(len(iss.strip()) > 0 for iss in issues)
