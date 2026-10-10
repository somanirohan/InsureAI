#!/usr/bin/env python3
"""
CLI utility to debug document text extraction, OCR, LLM extraction, and deterministic validation.

Usage:
    python scripts/debug_document.py <file_path> [--slot <item_id>] [--patient <name>] [--cost <amount>]
"""

import argparse
import json
import os
import sys
from pathlib import Path

# Add project root to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.claims.documents import (
    check_ocr_availability,
    extract_document_text,
    extract_document_fields,
    validate_document,
)
from app.claims.models import TreatmentDetails


def main():
    parser = argparse.ArgumentParser(description="Debug document OCR and field extraction pipeline.")
    parser.add_argument("file_path", help="Path to document (PDF, PNG, JPG)")
    parser.add_argument("--slot", default="final_bill", help="Checklist slot ID (default: final_bill)")
    parser.add_argument("--patient", default="Ramesh Sharma", help="Expected patient name (default: Ramesh Sharma)")
    parser.add_argument("--admission", default="2024-05-10", help="Expected admission date (default: 2024-05-10)")
    parser.add_argument("--discharge", default="2024-05-14", help="Expected discharge date (default: 2024-05-14)")
    parser.add_argument("--cost", type=float, default=250000.0, help="Estimated treatment cost (default: 250000.0)")
    parser.add_argument("--treatment-name", default="Total Knee Replacement", help="Treatment procedure name")
    args = parser.parse_args()

    if not os.path.exists(args.file_path):
        print(f"Error: File '{args.file_path}' does not exist.")
        sys.exit(1)

    print("=" * 70)
    print(" InsureAI Document Pipeline CLI Debugger")
    print("=" * 70)
    print(f"File:      {args.file_path}")
    print(f"Slot:      {args.slot}")
    print(f"Patient:   {args.patient}")
    print(f"Treatment: {args.treatment_name} (₹{args.cost:,.2f})")
    print("-" * 70)

    # 1. OCR Availability
    ocr_status = check_ocr_availability()
    print("[1] Host OCR Status:")
    print(f"    Available:   {ocr_status['available']}")
    print(f"    Binary:      {ocr_status['binary_path']}")
    print(f"    Version:     {ocr_status['version']}")
    print(f"    Languages:   {ocr_status['languages']}")
    if ocr_status['error']:
        print(f"    Error:       {ocr_status['error']}")
    print("-" * 70)

    # 2. Text Extraction & OCR
    print("[2] Text Extraction & OCR Fallback:")
    raw_text, diag = extract_document_text(args.file_path)
    print(f"    Source:      {diag['source']}")
    print(f"    Chars:       {diag['char_count']}")
    print(f"    OCR Used:    {diag['ocr_triggered']}")
    if diag['ocr_error']:
        print(f"    OCR Error:   {diag['ocr_error']}")
    print("    First 200 Chars:")
    print(f"    {repr(raw_text[:200])}")
    print("-" * 70)

    # 3. Field Extraction
    print("[3] Field Extraction (LLM + Fallback):")
    fields, conf = extract_document_fields(raw_text, args.slot)
    print(f"    Extracted Fields:\n{json.dumps(fields, indent=6)}")
    print(f"    Confidence:\n{json.dumps(conf, indent=6)}")
    print("-" * 70)

    # 4. Validation
    treatment = TreatmentDetails(
        name=args.treatment_name,
        hospital="Debug General Hospital",
        admission_date=args.admission,
        discharge_date=args.discharge,
        room_type="Single Private AC",
        estimated_cost=args.cost,
    )

    issues, needs_conf = validate_document(
        extracted_fields=fields,
        field_confidence=conf,
        item_id=args.slot,
        treatment=treatment,
        expected_patient_name=args.patient,
        ocr_diag=diag,
    )

    print("[4] Deterministic Validation Result:")
    print(f"    Status:              {'needs_confirmation' if needs_conf else 'validated'}")
    print(f"    Needs Confirmation:  {needs_conf}")
    print(f"    Issues ({len(issues)}):")
    for i, iss in enumerate(issues, 1):
        print(f"      {i}. {iss}")
    print("=" * 70)


if __name__ == "__main__":
    main()
