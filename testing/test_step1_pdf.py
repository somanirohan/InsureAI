#!/usr/bin/env python3
"""
Step 1 smoke test — PDF extraction.

Run from the repo root (next to the app/ directory):
    python test_step1_pdf.py <path/to/policy.pdf>

What this script verifies
--------------------------
1. Every page is returned with a 1-based page number.
2. Each page is tagged with its extraction source (native / ocr / empty).
3. The character counts look reasonable (non-zero for a real policy PDF).
4. The preview text is readable / not garbled.

Once you're happy with the output, confirm and we move to Step 2.
"""

import sys
import logging
from pathlib import Path

# Make sure Python can find the app/ package regardless of working directory
sys.path.insert(0, str(Path(__file__).parent))

logging.basicConfig(
    level=logging.INFO,
    format="%(levelname)s | %(name)s | %(message)s",
)

from app.ingestion.pdf_extract import extract_pages, pretty_print_pages


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: python test_step1_pdf.py <path/to/policy.pdf>")
        sys.exit(1)

    pdf_path = sys.argv[1]
    print(f"\nExtracting: {pdf_path}")

    pages = extract_pages(pdf_path)
    pretty_print_pages(pages, max_chars=400)

    # Summary stats
    native  = sum(1 for p in pages if p.source == "native")
    ocr     = sum(1 for p in pages if p.source == "ocr")
    empty   = sum(1 for p in pages if p.source == "empty")
    total_chars = sum(p.char_count for p in pages)

    print("── Summary ─────────────────────────────────")
    print(f"  Total pages  : {len(pages)}")
    print(f"  Native text  : {native}")
    print(f"  OCR fallback : {ocr}")
    print(f"  Empty pages  : {empty}")
    print(f"  Total chars  : {total_chars:,}")
    print("────────────────────────────────────────────\n")


if __name__ == "__main__":
    main()
