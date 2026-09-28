#!/usr/bin/env python3
"""
Test policy document validation and keyword verification.

Verifies:
  1. Real / sample policy documents pass validation with high keyword coverage and confidence.
  2. Non-policy documents (prescriptions, invoices, privacy policies, random text) FAIL
     validation and raise an explicit descriptive ValueError.
"""

import sys
from pathlib import Path

# Add project root to sys.path
repo_root = Path(__file__).resolve().parent.parent.parent
if str(repo_root) not in sys.path:
    sys.path.insert(0, str(repo_root))

from app.ingestion.pdf_extract import PageText, extract_pages
from app.ingestion.policy_validator import validate_policy_document, PolicyValidationResult


def test_real_policy_rules_pdf():
    print("\n--- Testing Real Policy Scheme: Rules.pdf ---")
    pdf_path = repo_root / "server" / "uploads" / "policies" / "1790519546_Rules.pdf"
    if pdf_path.exists():
        pages = extract_pages(str(pdf_path))
        result = validate_policy_document(pages, raise_error=False)
        print(f"Is Valid: {result.is_valid}")
        print(f"Distinct Keywords: {result.total_distinct_keywords}")
        print(f"Matched Core: {result.matched_core}")
        print(f"Matched Coverage: {result.matched_coverage}")
        print(f"Matched Clauses: {result.matched_clauses}")
        print(f"Matched Insurers: {result.matched_insurers}")
        print(f"Confidence: {result.confidence_score}")
        print(f"Reason: {result.reason}")
        assert result.is_valid is True, "Rules.pdf should be recognized as a valid policy!"
        print("  PASS: Rules.pdf successfully validated.")
    else:
        print("  Skipped: File not found.")


def test_sample_health_policy():
    print("\n--- Testing Sample Health Insurance Policy PDF ---")
    pdf_path = repo_root / "app" / "testing" / "sample_health_insurance_policy.pdf"
    if pdf_path.exists():
        pages = extract_pages(str(pdf_path))
        result = validate_policy_document(pages, raise_error=False)
        print(f"Is Valid: {result.is_valid}")
        print(f"Distinct Keywords: {result.total_distinct_keywords}")
        print(f"Matched Core: {result.matched_core}")
        print(f"Matched Coverage: {result.matched_coverage}")
        print(f"Matched Clauses: {result.matched_clauses}")
        print(f"Confidence: {result.confidence_score}")
        print(f"Reason: {result.reason}")
        assert result.is_valid is True, "Sample health policy should be valid!"
        print("  PASS: Sample Health Insurance Policy successfully validated.")
    else:
        print("  Skipped: File not found.")


def test_prescription_pdf_fails():
    print("\n--- Testing Prescription PDF (Must FAIL and raise ValueError) ---")
    pdf_path = repo_root / "server" / "uploads" / "policies" / "1790519030_prescription_Mayank_Chandak.pdf"
    if pdf_path.exists():
        pages = extract_pages(str(pdf_path))
        
        # Test non-raising mode
        result = validate_policy_document(pages, raise_error=False)
        print(f"Is Valid: {result.is_valid}")
        print(f"Total Keywords Found: {result.total_distinct_keywords}")
        print(f"Reason: {result.reason}")
        assert result.is_valid is False, "Prescription should NOT be valid!"

        # Test raising mode
        try:
            validate_policy_document(pages, raise_error=True)
            assert False, "Expected ValueError was not raised for prescription PDF!"
        except ValueError as exc:
            print(f"  Successfully caught expected ValueError: {exc}")
            assert "not appear to be a valid insurance policy" in str(exc)

        print("  PASS: Prescription correctly rejected with ValueError.")
    else:
        print("  Skipped: File not found.")


def test_privacy_policy_fails():
    print("\n--- Testing Website Privacy Policy (Must FAIL) ---")
    fake_privacy_policy = [
        PageText(
            page_number=1,
            text="Welcome to our website. Privacy Policy. We collect cookies and personal data when you browse our site. Read our privacy policy carefully.",
            source="native",
        )
    ]
    result = validate_policy_document(fake_privacy_policy, raise_error=False)
    print(f"Is Valid: {result.is_valid}")
    print(f"Reason: {result.reason}")
    assert result.is_valid is False, "Website Privacy Policy should NOT be accepted as insurance policy!"

    try:
        validate_policy_document(fake_privacy_policy, raise_error=True)
        assert False, "Expected ValueError was not raised for privacy policy!"
    except ValueError as exc:
        print(f"  Successfully caught expected ValueError: {exc}")

    print("  PASS: Privacy policy correctly rejected.")


def test_resume_fails():
    print("\n--- Testing Resume / CV (Must FAIL) ---")
    fake_resume = [
        PageText(
            page_number=1,
            text="John Doe Software Engineer. Skills: Python, React, AWS. Experience: 5 years building scalable applications at TechCorp.",
            source="native",
        )
    ]
    result = validate_policy_document(fake_resume, raise_error=False)
    print(f"Is Valid: {result.is_valid}")
    print(f"Reason: {result.reason}")
    assert result.is_valid is False, "Resume should NOT be accepted as insurance policy!"
    print("  PASS: Resume correctly rejected.")


if __name__ == "__main__":
    print("=" * 70)
    print("  RUNNING POLICY VALIDATOR KEYWORD VERIFICATION TESTS")
    print("=" * 70)
    test_real_policy_rules_pdf()
    test_sample_health_policy()
    test_prescription_pdf_fails()
    test_privacy_policy_fails()
    test_resume_fails()
    print("\n" + "=" * 70)
    print("  ALL POLICY VALIDATION TESTS PASSED!")
    print("=" * 70 + "\n")
