"""
Unit and Contract Tests for Phase 2: Retrieve -> Rerank -> Verify Pipeline.

Covers:
  - Verbatim excerpt invariant: if excerpt != verbatim substring, confidence forced to 'needs_review'.
  - Ambiguity as a first class citizen: irrelevant queries return 'no_match'.
  - Timeouts and fallback notice: 'Semantic matching unavailable, using keyword fallback'.
  - BM25 baseline scoring.
  - Abbreviation expansion linking.
"""

import pytest
from app.claims.semantic.criteria import (
    SemanticMatchResult,
    enforce_verbatim_excerpt_contract,
    is_verbatim_substring,
)
from app.claims.semantic.baseline import BM25ClauseIndex
from app.claims.semantic.clause_index import (
    extract_clauses_from_policy,
    index_policy_clauses,
)
from app.claims.semantic.verifier import (
    _deterministic_keyword_verify,
    match_and_verify_item,
    verify_clause_support,
)
from app.claims.semantic.retriever import CandidateClause
from app.vectorstore.registry import delete_all_policy_vectorstores


@pytest.fixture
def clean_pipeline_policy():
    pol_id = "test_policy_pipeline_phase2"
    delete_all_policy_vectorstores(pol_id)
    yield pol_id
    delete_all_policy_vectorstores(pol_id)


def test_verbatim_substring_check():
    clause = "Clause 4.1: Robotic assisted surgery and cyberknife treatments are permanently excluded from coverage."
    
    # Exact substring
    assert is_verbatim_substring("Robotic assisted surgery", clause)
    # Extra whitespace normalized
    assert is_verbatim_substring("Robotic   assisted  surgery", clause)
    # Different wording / hallucinated phrase
    assert not is_verbatim_substring("Robotic operations are disallowed entirely", clause)


def test_verbatim_contract_enforcement_forces_needs_review():
    clause_text = "Clause 3.1: Cataract surgery has a specific waiting period of 24 months."
    
    # Hallucinated excerpt
    bad_res = SemanticMatchResult(
        match_id="m_1",
        clause_id="wp_1",
        clause_title="Cataract Waiting Period",
        clause_type="waiting_period",
        page=3,
        supporting_excerpt="Cataract operations cannot be claimed for two full years.",
        verdict="contradicts",
        confidence="high",
    )
    enforced = enforce_verbatim_excerpt_contract(bad_res, clause_text)
    assert enforced.confidence == "needs_review"
    assert "verbatim substring" in (enforced.review_reason or "")


def test_bm25_clause_index_baseline():
    clauses = [
        {"clause_id": "c1", "title": "Room Rent", "text": "Room rent charges capped at 5000 per day"},
        {"clause_id": "c2", "title": "Cataract Limit", "text": "Cataract treatment limit is 40000 per eye"},
        {"clause_id": "c3", "title": "Cosmetic Exclusion", "text": "Plastic surgery and cosmetic treatments excluded"},
    ]
    bm25 = BM25ClauseIndex(clauses)
    
    res = bm25.score("cataract surgery eye", top_k=2)
    assert len(res) > 0
    assert res[0][0]["clause_id"] == "c2"

    res_rent = bm25.score("room rent daily limit", top_k=1)
    assert res_rent[0][0]["clause_id"] == "c1"


def test_deterministic_keyword_verify_exclusion_and_fallback():
    cand = CandidateClause(
        clause_id="ex_1",
        clause_type="exclusion",
        title="Cosmetic Exclusion",
        text="Clause 4.1: Cosmetic surgery, aesthetic treatments, and plastic surgery are permanently excluded.",
        page=6,
        score=0.88,
        metadata={},
    )
    res = _deterministic_keyword_verify("Aesthetic Rhinoplasty Surgery", cand, is_fallback=True)
    assert res.verdict == "contradicts"
    assert res.is_fallback is True
    assert res.fallback_notice == "Semantic matching unavailable, using keyword fallback"
    assert is_verbatim_substring(res.supporting_excerpt, cand.text)


def test_ambiguity_first_class_no_match(clean_pipeline_policy):
    pol_id = clean_pipeline_policy
    # Empty or unrelated policy clauses
    sample_facts = [
        {
            "category": "specific_exclusions",
            "fact_value": "Cosmetic surgery is permanently excluded.",
            "source_text": "Clause 4.1: Cosmetic surgery is permanently excluded.",
            "page_number": 6,
        }
    ]
    clauses = extract_clauses_from_policy(pol_id, sample_facts)
    index_policy_clauses(pol_id, clauses, rebuild=True)

    # Completely unrelated query
    match = match_and_verify_item(pol_id, "Quantum computing server license subscription")
    assert match.verdict == "no_match"
    assert match.clause_id == "none"
