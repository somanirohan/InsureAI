"""
Tests for Phase 1: Policy Clause Indexing and Abbreviations Expansion.
"""

import pytest
from app.embeddings.factory import get_embedder
from app.claims.semantic.abbreviations import expand_abbreviations, get_canonical_term
from app.claims.semantic.clause_index import (
    extract_clauses_from_policy,
    index_policy_clauses,
    get_clause_count_by_type,
)
from app.vectorstore.registry import delete_all_policy_vectorstores, get_clause_index


@pytest.fixture
def clean_clause_policy():
    pol_id = "test_policy_clause_phase1"
    delete_all_policy_vectorstores(pol_id)
    yield pol_id
    delete_all_policy_vectorstores(pol_id)


def test_abbreviations_expansion():
    # Test single medical abbreviation
    assert get_canonical_term("phaco") == "phacoemulsification cataract surgery"
    assert get_canonical_term("icu") == "intensive care unit"
    assert get_canonical_term("rm chg") == "room rent charges"

    # Test phrase expansion
    expanded = expand_abbreviations("Billed for pac and rm chg")
    assert "room rent charges" in expanded
    assert "pre anaesthetic checkup" in expanded

    expanded_surgical = expand_abbreviations("Bilateral cataract iol operation")
    assert "cataract" in expanded_surgical
    assert "lens" in expanded_surgical or "intraocular" in expanded_surgical


def test_clause_extraction_and_indexing(clean_clause_policy):
    pol_id = clean_clause_policy
    sample_facts = [
        {
            "category": "specific_exclusions",
            "fact_value": "Cosmetic surgery, aesthetic treatments, and plastic surgery are permanently excluded.",
            "source_text": "Clause 4.1: Cosmetic surgery, aesthetic treatments, and plastic surgery are permanently excluded.",
            "page_number": 6,
        },
        {
            "category": "specific_exclusions",
            "fact_value": "Robotic assisted surgeries are excluded unless specifically pre-authorized.",
            "source_text": "Clause 4.2: Robotic assisted surgeries are excluded unless specifically pre-authorized.",
            "page_number": 6,
        },
        {
            "category": "waiting_period",
            "fact_value": "Joint replacement surgeries have a 24-month waiting period.",
            "source_text": "Clause 3.2: Joint replacement surgeries have a 24-month waiting period from inception.",
            "page_number": 4,
        },
        {
            "category": "room_rent_limit",
            "fact_value": "1% of Sum Insured per day, ICU limit 2% per day.",
            "source_text": "Clause 2.1: Room Rent limit is 1% of SI per day. ICU charges are capped at 2% of SI per day.",
            "page_number": 3,
        },
        {
            "category": "sub_limit",
            "fact_value": "Cataract surgery sub-limit is Rs. 40,000 per eye.",
            "source_text": "Clause 2.4: Cataract surgery sub-limit is Rs. 40,000 per eye.",
            "page_number": 4,
        },
    ]

    clauses = extract_clauses_from_policy(pol_id, sample_facts)
    assert len(clauses) == 5

    types = {c.clause_type for c in clauses}
    assert "exclusion" in types
    assert "waiting_period" in types
    assert "room_rent" in types
    assert "sub_limit" in types

    # Index into dedicated clauses collection
    indexed_count = index_policy_clauses(pol_id, clauses, rebuild=True)
    assert indexed_count == 5

    counts = get_clause_count_by_type(pol_id)
    assert counts["exclusion"] == 2
    assert counts["waiting_period"] == 1
    assert counts["room_rent"] == 1
    assert counts["sub_limit"] == 1

    # Verify retrieval from clause index directly
    embedder = get_embedder()
    q_vec = embedder.embed_one("cosmetic treatment")
    clause_coll = get_clause_index(pol_id)
    res = clause_coll.query(query_embeddings=[q_vec], n_results=1)
    assert len(res["ids"][0]) == 1
    assert "ex_" in res["ids"][0][0]

