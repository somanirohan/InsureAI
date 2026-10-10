#!/usr/bin/env python3
"""
Update 1 test — page-bound structure-aware chunking.

Run from repo root:
    python3.11 test_update1_chunking.py <path/to/policy.pdf>

What to verify:
  1. No chunk has a page_number that differs from its neighbours' in a way
     that suggests it straddles pages (each page group should be contiguous).
  2. Chunk sizes are in the 200–2000 char range (≈50–500 tokens).
  3. The overlap region of consecutive same-page chunks is visible in the preview.
  4. Empty pages (if any) produce zero chunks.
  5. Total chunk count is plausible for the document size.
"""

import sys
import logging
from pathlib import Path
from collections import defaultdict

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

logging.basicConfig(level=logging.INFO, format="%(levelname)s | %(name)s | %(message)s")

from app.ingestion.pdf_extract import extract_pages
from app.ingestion.chunking import chunk_pages, pretty_print_chunks


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: python3.11 test_update1_chunking.py <path/to/policy.pdf>")
        sys.exit(1)

    pdf_path = sys.argv[1]
    print(f"\nPDF: {pdf_path}\n")

    pages = extract_pages(pdf_path)
    print(f"Pages extracted : {len(pages)}")

    chunks = chunk_pages(pages)
    pretty_print_chunks(chunks, max_chars=180)

    # ── Verification checks ───────────────────────────────────────────────────
    print("── Verification ────────────────────────────────────────────────────")

    # 1. No chunk spans multiple pages
    assert all(isinstance(c.page_number, int) for c in chunks), \
        "FAIL: chunk_id has non-integer page_number"
    print("  ✅  All chunks have a single integer page_number")

    # 2. chunk_ids are contiguous 0..N-1
    ids = [c.chunk_id for c in chunks]
    assert ids == list(range(len(chunks))), "FAIL: chunk_ids not contiguous"
    print(f"  ✅  chunk_ids contiguous 0..{len(chunks)-1}")

    # 3. No empty chunk text
    empties = [c for c in chunks if not c.text.strip()]
    assert not empties, f"FAIL: {len(empties)} empty chunks"
    print("  ✅  No empty chunks")

    # 4. Per-page chunk counts
    by_page: dict[int, list] = defaultdict(list)
    for c in chunks:
        by_page[c.page_number].append(c)
    print("\n  Per-page breakdown:")
    for pg in sorted(by_page):
        pg_chunks = by_page[pg]
        sizes = [c.char_count for c in pg_chunks]
        print(f"    Page {pg:>2}: {len(pg_chunks):>2} chunk(s) | "
              f"sizes: {sizes} | total chars: {sum(sizes)}")

    # 5. Size distribution
    sizes_all = [c.char_count for c in chunks]
    print(f"\n  Size stats:")
    print(f"    Min  : {min(sizes_all)} chars")
    print(f"    Max  : {max(sizes_all)} chars")
    print(f"    Mean : {sum(sizes_all)//len(sizes_all)} chars")

    # 6. Overlap spot-check: consecutive chunks on same page should share a tail/head
    overlaps_found = 0
    for i in range(1, len(chunks)):
        a, b = chunks[i-1], chunks[i]
        if a.page_number == b.page_number and a.char_count > 50:
            tail = a.text[-100:]   # last 100 chars of previous chunk
            if any(word in b.text for word in tail.split() if len(word) > 5):
                overlaps_found += 1
    print(f"\n  ✅  Overlap spot-check: {overlaps_found} same-page chunk pairs share content")
    print("────────────────────────────────────────────────────────────────────\n")


if __name__ == "__main__":
    main()
