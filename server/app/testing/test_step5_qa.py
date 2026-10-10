#!/usr/bin/env python3
"""
Step 5 smoke test — end-to-end Q&A orchestration (answer_question).

Tests:
  1. Structured Path: e.g. "What is my room rent limit?"
     -> Directly routed to structured facts, zero generation hallucination, High confidence.
  2. Semantic Path: e.g. "Is experimental treatment covered?"
     -> Retrieved from ChromaDB, generated answer with page citation, self-verified, High confidence.
  3. Semantic Path: e.g. "How much is covered for road ambulance transport?"
     -> Retrieved from ChromaDB, generated answer with page citation, self-verified, High confidence.

Usage:
    python3.11 test_step5_qa.py sample_health_insurance_policy.pdf
"""

import sys
import logging
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

logging.basicConfig(level=logging.INFO, format="%(levelname)s | %(name)s | %(message)s")

from app.ingestion.pdf_extract import extract_pages
from app.ingestion.chunking import chunk_pages
from app.rag.vectorstore import index_chunks
from app.rag.qa import answer_question

POLICY_ID = "ssh_fam_2026_demo"

# Prototypical pre-extracted structured facts from this policy
SAMPLE_STRUCTURED_FACTS = {
    "sum_insured": {"value": "Rs. 10,00,000", "page": 1},
    "room_rent_limit": {"value": "1% of Sum Insured per day (Rs. 10,000/day)", "page": 4},
    "co_pay": {"value": "20% co-payment on all admissible claims", "page": 2},
    "deductible": None,
    "waiting_periods": [
        {"condition": "Pre-existing Diseases (PED)", "period": "48 months", "page": 5},
        {"condition": "Specific Illnesses (e.g. cataract, hernia)", "period": "24 months", "page": 5},
        {"condition": "Maternity expenses", "period": "9 months", "page": 5},
        {"condition": "Initial waiting period", "period": "30 days", "page": 5},
    ],
    "exclusions": [
        {"item": "Unproven or experimental treatment not recognized by allopathic medicine", "page": 5},
        {"item": "Cosmetic or plastic surgery unless necessitated by an Accident", "page": 5},
        {"item": "Treatment received outside India", "page": 5},
    ],
    "claim_conditions": [
        {"condition": "Cashless claim pre-authorisation notice at least 48 hours prior to planned hospitalisation", "page": 6},
        {"condition": "Emergency cashless claim notice within 24 hours of admission", "page": 6},
        {"condition": "Reimbursement claim documents submission within 30 days of discharge", "page": 6},
    ],
}


def main() -> None:
    if len(sys.argv) < 2:
        print("Usage: python3.11 test_step5_qa.py <path/to/policy.pdf>")
        sys.exit(1)

    pdf_path = sys.argv[1]
    print("\n" + "=" * 80)
    print("  STEP 5 TEST — END-TO-END RAG ORCHESTRATION (answer_question)")
    print("=" * 80)

    # 1. Ingestion + Indexing
    print("\n[1/2] Indexing policy document...")
    pages = extract_pages(pdf_path)
    chunks = chunk_pages(pages)
    index_chunks(POLICY_ID, chunks)
    print(f"      Policy indexed: {len(chunks)} chunks across {len(pages)} pages.")

    # 2. Test Questions
    test_cases = [
        {
            "type": "STRUCTURED PATH TEST",
            "question": "What is the daily hospital room rent limit under my policy?",
            "expected_path": "structured",
        },
        {
            "type": "STRUCTURED PATH TEST (Waiting Periods)",
            "question": "What are the waiting periods for pre-existing diseases?",
            "expected_path": "structured",
        },
        {
            "type": "SEMANTIC PATH TEST (Exclusions / Interpretive)",
            "question": "Is experimental or unproven treatment covered by this insurance?",
            "expected_path": "semantic",
        },
        {
            "type": "SEMANTIC PATH TEST (Benefits / Scope)",
            "question": "How much road ambulance transport expense is covered under the policy?",
            "expected_path": "semantic",
        },
    ]

    print("\n[2/2] Running end-to-end questions through answer_question()...\n")

    for i, tc in enumerate(test_cases, 1):
        print("─" * 80)
        print(f"Test {i} [{tc['type']}]")
        print(f"Question: \"{tc['question']}\"")

        res = answer_question(
            policy_id=POLICY_ID,
            question=tc["question"],
            structured_facts=SAMPLE_STRUCTURED_FACTS,
        )

        print(f"\n  ➤ Path Taken         : {res.source_path.upper()} (expected: {tc['expected_path'].upper()})")
        print(f"  ➤ Confidence         : {res.confidence} ({res.confidence_reason})")
        print(f"  ➤ Pages Cited        : {res.pages}")
        if res.structured_field:
            print(f"  ➤ Structured Field   : {res.structured_field}")
        if res.verification_result:
            print(f"  ➤ Self-Verification  : {res.verification_result.get('verification_status')} (quote: {res.verification_result.get('evidence_quote', '')[:60]}...)")
        print(f"\n  ➤ Final Answer:\n{res.answer}\n")

        assert res.source_path == tc["expected_path"], f"Path mismatch: expected {tc['expected_path']}, got {res.source_path}"
        assert res.confidence in ("High", "Medium"), f"Unexpected low confidence: {res.confidence}"
        print(f"  ✅ Test {i} PASSED.")

    print("\n" + "=" * 80)
    print("🎉 ALL END-TO-END RAG ORCHESTRATION TESTS COMPLETED SUCCESSFULLY!\n")


if __name__ == "__main__":
    main()
