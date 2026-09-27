#!/usr/bin/env python3
"""
Update 3 test — embedding-based query router.

Tests route_question() and route_question_with_score() against sample questions
spanning both structured-path and semantic-path queries.

Usage:
    python3.11 test_update3_router.py
"""

import sys
import logging
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

logging.basicConfig(level=logging.INFO, format="%(levelname)s | %(name)s | %(message)s")

from app.config import settings
from app.rag.router import (
    route_question,
    route_question_with_score,
    warm_router_cache,
    STRUCTURED_FIELD_REFERENCES,
)

# ── Sample test questions ─────────────────────────────────────────────────────

SAMPLE_QUESTIONS: list[dict[str, str]] = [
    # Structured targets
    {
        "question": "What is my total sum insured coverage amount?",
        "expected_type": "structured",
        "expected_field": "sum_insured",
    },
    {
        "question": "What is the daily hospital room rent limit under my policy?",
        "expected_type": "structured",
        "expected_field": "room_rent_limit",
    },
    {
        "question": "Is there a mandatory co-pay percentage I need to pay on claims?",
        "expected_type": "structured",
        "expected_field": "co_pay",
    },
    {
        "question": "What is the policy deductible amount before insurance pays?",
        "expected_type": "structured",
        "expected_field": "deductible",
    },
    {
        "question": "How long is the waiting period for pre-existing disease (PED)?",
        "expected_type": "structured",
        "expected_field": "waiting_periods",
    },
    {
        "question": "What are the permanent exclusions not covered under this policy?",
        "expected_type": "structured",
        "expected_field": "exclusions",
    },
    {
        "question": "What are the documents and timeline required to submit a reimbursement claim?",
        "expected_type": "structured",
        "expected_field": "claim_conditions",
    },

    # Semantic targets (should route to None / "semantic")
    {
        "question": "Is experimental or unproven treatment covered by this insurance?",
        "expected_type": "semantic",
        "expected_field": "None",
    },
    {
        "question": "Can I claim hospitalisation expenses if treated under Ayurvedic or AYUSH medicine?",
        "expected_type": "semantic",
        "expected_field": "None",
    },
    {
        "question": "What happens if I forget to pay my renewal premium within the grace period?",
        "expected_type": "semantic",
        "expected_field": "None",
    },
    {
        "question": "Does this policy cover medical treatments taken while travelling outside India?",
        "expected_type": "semantic",
        "expected_field": "None",
    },
    {
        "question": "How can I escalate an unsettled claim dispute to the Insurance Ombudsman?",
        "expected_type": "semantic",
        "expected_field": "None",
    },
]


def main() -> None:
    print("\n" + "=" * 80)
    print("  UPDATE 3 TEST — EMBEDDING-BASED ROUTER")
    print("=" * 80)
    print(f"  Embedding Provider: {settings.embedding_provider}")
    print(f"  Similarity Threshold: {settings.router_similarity_threshold:.2f}")
    print(f"  Structured Fields: {list(STRUCTURED_FIELD_REFERENCES.keys())}")
    print("=" * 80 + "\n")

    print("Warming router reference embeddings cache...")
    warm_router_cache()
    print("Cache warmed successfully.\n")

    print(f"{'#':<3} | {'QUESTION':<45} | {'SIMILARITY':<10} | {'ROUTED TO':<16} | {'EXPECTED':<12} | {'STATUS'}")
    print("-" * 105)

    all_passed = True

    for i, item in enumerate(SAMPLE_QUESTIONS, 1):
        q = item["question"]
        expected_type = item["expected_type"]
        expected_field = item["expected_field"]

        matched_field, max_score, _ = route_question_with_score(q)

        routed_display = matched_field if matched_field else "semantic"
        expected_display = expected_field if expected_type == "structured" else "semantic"

        is_match = (
            (expected_type == "structured" and matched_field == expected_field) or
            (expected_type == "semantic" and matched_field is None)
        )

        status_str = "✅ PASS" if is_match else "❌ FAIL"
        if not is_match:
            all_passed = False

        q_truncated = (q[:42] + "...") if len(q) > 45 else q
        print(f"{i:<3} | {q_truncated:<45} | {max_score:<10.4f} | {routed_display:<16} | {expected_display:<12} | {status_str}")

    print("-" * 105)
    if all_passed:
        print("\n🎉 ALL ROUTER TESTS PASSED!\n")
    else:
        print("\n⚠️ SOME ROUTER TESTS FAILED — Review scores and threshold above.\n")


if __name__ == "__main__":
    main()
