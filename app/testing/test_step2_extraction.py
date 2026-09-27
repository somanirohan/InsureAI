#!/usr/bin/env python3
"""
Step 2 smoke test — structured facts extraction.

Run from the repo root:
    python3.11 test_step2_extraction.py <path/to/policy.pdf>

What to verify manually
------------------------
1. sum_insured, room_rent_limit, co_pay, deductible — check values and page
   numbers against the actual PDF.
2. waiting_periods — should list PED (48m), specific illnesses (24m),
   maternity (9m), initial (30 days).
3. exclusions — should list all bullet items from the exclusions section.
4. claim_conditions — pre-auth timelines, document submission deadlines,
   settlement timelines should all appear.
5. No "invented" values — every entry must be traceable to the source page.
"""

import sys
import json
import logging
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

logging.basicConfig(
    level=logging.INFO,
    format="%(levelname)s | %(name)s | %(message)s",
)

from app.ingestion.pdf_extract import extract_pages
from app.rag.extraction import extract_structured_facts, pretty_print_facts


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: python3.11 test_step2_extraction.py <path/to/policy.pdf>")
        sys.exit(1)

    pdf_path = sys.argv[1]
    print(f"\nPDF: {pdf_path}")

    # Step 1 (reused): extract pages
    print("\n[1/2] Extracting pages...")
    pages = extract_pages(pdf_path)
    print(f"      {len(pages)} pages extracted")

    # Step 2: extract structured facts via LLM
    print("\n[2/2] Running structured LLM extraction (this may take ~30s)...")
    facts = extract_structured_facts(pages)

    # Human-readable display
    pretty_print_facts(facts)

    # Also dump raw JSON so you can inspect every field exactly
    print("\n── Raw JSON output (copy for backend team) ──────────────────────────────")
    print(json.dumps(facts, indent=2, ensure_ascii=False))
    print("─────────────────────────────────────────────────────────────────────────\n")


if __name__ == "__main__":
    main()
