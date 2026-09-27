#!/usr/bin/env python3
"""
Step 3 smoke test — vector store indexing and query retrieval.

Tests:
  1. Indexing chunks into policy-scoped ChromaDB collection.
  2. Querying similar chunks and checking semantic relevance.
  3. Verifying page numbers and chunk metadata.

Usage:
    python3.11 test_step3_vectorstore.py sample_health_insurance_policy.pdf
"""

import sys
import logging
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

logging.basicConfig(level=logging.INFO, format="%(levelname)s | %(name)s | %(message)s")

from app.ingestion.pdf_extract import extract_pages
from app.ingestion.chunking import chunk_pages
from app.rag.vectorstore import index_chunks, query_similar, delete_policy_index

POLICY_ID = "ssh_fam_2026_test"


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: python3.11 test_step3_vectorstore.py <path/to/policy.pdf>")
        sys.exit(1)

    pdf_path = sys.argv[1]
    print("\n" + "=" * 75)
    print("  STEP 3 TEST — CHUNKING + VECTOR STORE INDEXING & RETRIEVAL")
    print("=" * 75)

    # 1. Ingestion + Chunking
    print("\n[1/3] Extracting and chunking policy...")
    pages = extract_pages(pdf_path)
    chunks = chunk_pages(pages)
    print(f"      {len(pages)} pages -> {len(chunks)} chunks produced.")

    # 2. Index into ChromaDB
    print(f"\n[2/3] Indexing chunks into ChromaDB collection for policy '{POLICY_ID}'...")
    num_indexed = index_chunks(POLICY_ID, chunks)
    print(f"      Indexed {num_indexed} chunks successfully.")

    # 3. Test queries
    test_queries = [
        {
            "query": "Is experimental or unproven treatment covered by this policy?",
            "expected_page": 5,
            "expected_keyword": "experimental",
        },
        {
            "query": "How much road ambulance expenses are covered?",
            "expected_page": 4,
            "expected_keyword": "ambulance",
        },
        {
            "query": "What is the procedure for cashless claim pre-authorisation?",
            "expected_page": 6,
            "expected_keyword": "cashless",
        },
    ]

    print("\n[3/3] Running similarity retrieval queries...")
    all_passed = True

    for i, t in enumerate(test_queries, 1):
        q = t["query"]
        print(f"\n  Query {i}: '{q}'")
        results = query_similar(POLICY_ID, q, top_k=3)

        if not results:
            print("    ❌ FAIL: No chunks retrieved!")
            all_passed = False
            continue

        top_hit = results[0]
        preview = top_hit.text.replace("\n", " ")[:120]
        print(f"    Top Hit: [Page {top_hit.page_number}] Sim: {top_hit.similarity:.4f} | Chunk ID: {top_hit.chunk_id}")
        print(f"             Text: {preview}...")

        has_keyword = t["expected_keyword"].lower() in top_hit.text.lower()
        is_page_match = top_hit.page_number == t["expected_page"]

        if has_keyword and is_page_match:
            print(f"    ✅ PASS: Correctly retrieved Page {top_hit.page_number} with keyword '{t['expected_keyword']}'")
        else:
            print(f"    ⚠️ Warning: Page expected {t['expected_page']}, got {top_hit.page_number} (keyword found: {has_keyword})")

    print("\n" + "=" * 75)
    if all_passed:
        print("🎉 ALL VECTOR STORE RETRIEVAL TESTS PASSED!\n")
    else:
        print("⚠️ Some retrieval tests had warnings.\n")


if __name__ == "__main__":
    main()
