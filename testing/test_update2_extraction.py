#!/usr/bin/env python3
"""
Update 2 test — chunk-then-merge extraction.

Run from repo root:
    python3.11 test_update2_extraction.py <path/to/policy.pdf>

Two test tiers:
  Tier 1 (no LLM) — runs instantly:
    - Import smoke test
    - _merge_facts() unit tests with synthetic chunk results
    - Deduplication correctness
    - First-found-wins for scalars
    - Missing fields omitted (not null)

  Tier 2 (LLM required, slow on local models) — runs if --live flag passed:
    - Full extract_structured_facts(chunks) against the real PDF
    - Prints final facts JSON for manual verification

Usage:
    python3.11 test_update2_extraction.py sample.pdf            # Tier 1 only
    python3.11 test_update2_extraction.py sample.pdf --live     # Tier 1 + 2
"""

import sys
import json
import logging
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

logging.basicConfig(level=logging.INFO, format="%(levelname)s | %(name)s | %(message)s")


# ── Tier 1: unit tests on merge logic (no LLM) ───────────────────────────────

def test_merge_logic() -> None:
    from app.rag.extraction import _merge_facts

    print("\n── Tier 1: _merge_facts() unit tests ───────────────────────────────")

    # Test 1: scalar first-found wins
    results = [
        {"sum_insured": {"value": "Rs. 10,00,000", "page": 1}},
        {"sum_insured": {"value": "Rs. 10 lakhs", "page": 4}},   # later, different wording
    ]
    merged = _merge_facts(results)
    assert merged["sum_insured"]["value"] == "Rs. 10,00,000", \
        f"FAIL: first-found should win, got {merged['sum_insured']}"
    print("  ✅  Scalar first-found wins (sum_insured from chunk 0, not chunk 1)")

    # Test 2: scalar absent when not in any chunk
    results = [{"waiting_periods": []}, {"exclusions": []}]
    merged = _merge_facts(results)
    assert "sum_insured" not in merged, "FAIL: absent scalar should not appear"
    assert "room_rent_limit" not in merged, "FAIL: absent scalar should not appear"
    print("  ✅  Absent scalar fields omitted entirely (not null)")

    # Test 3: list deduplication — same item in two chunks (overlap)
    dup_item = {"condition": "Pre-existing Diseases", "period": "48 months", "page": 5}
    results = [
        {"waiting_periods": [dup_item]},
        {"waiting_periods": [dup_item]},  # duplicate from overlap region
    ]
    merged = _merge_facts(results)
    assert len(merged["waiting_periods"]) == 1, \
        f"FAIL: duplicate waiting period should be deduped, got {len(merged['waiting_periods'])}"
    print("  ✅  Duplicate list items (from overlap) deduplicated correctly")

    # Test 4: list accumulation — different items from different chunks
    results = [
        {"exclusions": [{"item": "Cosmetic surgery", "page": 5}]},
        {"exclusions": [{"item": "Dental treatment not requiring hospitalisation", "page": 5}]},
    ]
    merged = _merge_facts(results)
    assert len(merged["exclusions"]) == 2, \
        f"FAIL: two distinct exclusions should both appear, got {len(merged['exclusions'])}"
    print("  ✅  Distinct list items from different chunks accumulated correctly")

    # Test 5: list fields always present even when empty
    results = [{"sum_insured": {"value": "Rs. 5,00,000", "page": 1}}]
    merged = _merge_facts(results)
    assert "waiting_periods"  in merged and isinstance(merged["waiting_periods"],  list)
    assert "exclusions"       in merged and isinstance(merged["exclusions"],       list)
    assert "claim_conditions" in merged and isinstance(merged["claim_conditions"], list)
    print("  ✅  List fields always present in output (possibly empty [])")

    # Test 6: case-insensitive dedup (model sometimes returns different casing)
    results = [
        {"claim_conditions": [{"condition": "Submit claim within 30 days of discharge", "page": 6}]},
        {"claim_conditions": [{"condition": "submit claim within 30 days of discharge", "page": 6}]},
    ]
    merged = _merge_facts(results)
    assert len(merged["claim_conditions"]) == 1, \
        f"FAIL: case-variant duplicate should dedup, got {len(merged['claim_conditions'])}"
    print("  ✅  Case-insensitive deduplication works")

    print("\n  All Tier 1 tests passed ✅\n")


# ── Tier 2: live LLM test ─────────────────────────────────────────────────────

def test_live_extraction(pdf_path: str) -> None:
    from app.ingestion.pdf_extract import extract_pages
    from app.ingestion.chunking import chunk_pages
    from app.rag.extraction import extract_structured_facts, pretty_print_facts

    print("── Tier 2: live LLM extraction ─────────────────────────────────────")
    print(f"  PDF: {pdf_path}")

    pages  = extract_pages(pdf_path)
    chunks = chunk_pages(pages)
    print(f"  Pages: {len(pages)}  |  Chunks: {len(chunks)}")
    print(f"  Starting extraction ({len(chunks)} LLM calls — may take several minutes)...\n")

    facts = extract_structured_facts(chunks)
    pretty_print_facts(facts)

    print("\n── Raw JSON ─────────────────────────────────────────────────────────")
    print(json.dumps(facts, indent=2, ensure_ascii=False))
    print("─────────────────────────────────────────────────────────────────────\n")


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: python3.11 test_update2_extraction.py <pdf> [--live]")
        sys.exit(1)

    pdf_path = sys.argv[1]
    live = "--live" in sys.argv

    test_merge_logic()

    if live:
        test_live_extraction(pdf_path)
    else:
        print("  (Skipping live LLM test. Pass --live to run full extraction.)\n")


if __name__ == "__main__":
    main()
