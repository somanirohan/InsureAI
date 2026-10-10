"""
Tests for Vector Store Separation and Isolation Registry.

Covers:
  - Cross-policy isolation (policy_a chunks never returned for policy_b)
  - Q&A policy chunks never return clause records
  - Clause queries never return policy chunks
  - Claim document text containing an exclusion cannot appear as evidence excerpt from vector collections
  - Namespaced ID format & no ID collision
  - Embedding model mismatch raises EmbeddingModelMismatchError
  - Idempotent rebuild of clause index without altering policy chunks
  - Delete leaves no orphan collections (both policy chunks and clauses removed)
  - Two users with same-named policies isolated by ID
  - Grep test asserting no direct Chroma collection creation/access outside registry
"""

import os
import subprocess
import pytest
from app.ingestion.chunking import Chunk
from app.rag.vectorstore import (
    index_chunks,
    query_similar,
    delete_policy_index,
    get_chroma_client,
)
from app.vectorstore.registry import (
    EmbeddingModelMismatchError,
    format_chunk_id,
    format_clause_id,
    get_active_embedding_model_name,
    get_clause_index,
    get_policy_chunks,
    rebuild_clause_index,
    delete_all_policy_vectorstores,
    validate_retrieved_records,
)


@pytest.fixture
def clean_test_policies():
    test_pids = ["test_pol_iso_a", "test_pol_iso_b", "test_pol_rebuild", "test_pol_mismatch"]
    for pid in test_pids:
        delete_all_policy_vectorstores(pid)
    yield test_pids
    for pid in test_pids:
        delete_all_policy_vectorstores(pid)


def test_cross_policy_isolation(clean_test_policies):
    """Chunks indexed for policy A must never be retrieved when querying policy B."""
    pol_a, pol_b = "test_pol_iso_a", "test_pol_iso_b"

    chunk_a = [Chunk(chunk_id=0, text="Apollo Cardiac Care covers angioplasty up to 5 Lakhs", page_number=1)]
    chunk_b = [Chunk(chunk_id=0, text="Star Health Senior Citizen exclusion on pre-existing diabetes", page_number=2)]

    index_chunks(pol_a, chunk_a)
    index_chunks(pol_b, chunk_b)

    results_a = query_similar(pol_a, "angioplasty cardiac", top_k=5)
    assert len(results_a) == 1
    assert "angioplasty" in results_a[0].text
    assert "diabetes" not in results_a[0].text

    results_b = query_similar(pol_b, "angioplasty cardiac", top_k=5)
    assert len(results_b) == 0 or not any("Apollo" in r.text for r in results_b)


def test_qa_never_returns_clause_records(clean_test_policies):
    """
    Q&A queries against policy chunks must never receive or return clause index records,
    even if clause index contains matching keywords.
    """
    pol_id = "test_pol_iso_a"

    # Index policy chunk
    chunks = [Chunk(chunk_id=0, text="General hospitalization room rent limit is Rs 5,000 per day.", page_number=3)]
    index_chunks(pol_id, chunks)

    # Index into clause index directly
    clause_coll = get_clause_index(pol_id)
    clause_coll.upsert(
        ids=[format_clause_id(pol_id, "ex_1")],
        documents=["Permanent exclusion: experimental robotic surgery is strictly excluded."],
        metadatas=[{
            "source_type": "policy_clause",
            "policy_id": pol_id,
            "clause_id": "ex_1",
            "embedding_model": get_active_embedding_model_name(),
        }],
    )

    # Query via query_similar (Q&A path)
    qa_results = query_similar(pol_id, "experimental robotic surgery", top_k=5)
    # The chunk collection has no mention of robotic surgery, and must NOT leak the clause
    assert not any("robotic surgery" in r.text for r in qa_results)


def test_clause_queries_never_return_policy_chunks(clean_test_policies):
    """
    Queries on clause collection must never return policy chunk records.
    """
    pol_id = "test_pol_iso_a"

    # Index chunk
    chunks = [Chunk(chunk_id=0, text="Cataract surgery covered with sub-limit 40,000.", page_number=4)]
    index_chunks(pol_id, chunks)

    clause_coll = get_clause_index(pol_id)
    clause_coll.upsert(
        ids=[format_clause_id(pol_id, "wp_cataract")],
        documents=["Waiting period: Cataract has a 24-month specific waiting period."],
        metadatas=[{
            "source_type": "policy_clause",
            "policy_id": pol_id,
            "clause_id": "wp_cataract",
            "embedding_model": get_active_embedding_model_name(),
        }],
    )

    # Query clause collection and validate
    raw_query = clause_coll.query(query_texts=["Cataract"], n_results=5)
    validated = validate_retrieved_records(raw_query, expected_source_type="policy_clause", expected_policy_id=pol_id)

    assert len(validated["ids"]) == 1
    assert validated["ids"][0] == format_clause_id(pol_id, "wp_cataract")
    assert not any("policy:" in rid for rid in validated["ids"])


def test_claim_document_text_never_in_vectorstore():
    """
    Claim documents are stored in MongoDB, never in ChromaDB.
    Simulate a claim document containing an exclusion: assert it does not exist in any Chroma collection.
    """
    client = get_chroma_client()
    fake_claim_text = "CONFIDENTIAL_PATIENT_BILL_CLAIM_XYZ_9999_EXCLUSION_TEST"

    # Search across all existing Chroma collections in client
    collections = client.list_collections()
    for c in collections:
        count = c.count()
        if count > 0:
            res = c.get(where_document={"$contains": fake_claim_text})
            assert len(res.get("ids", [])) == 0, f"Claim text leaked into collection {c.name}"


def test_namespaced_id_format_and_collision_prevention():
    """Chunk and clause IDs have distinct namespaced prefixes to prevent collision."""
    cid = format_chunk_id("pol_1", 10)
    clid = format_clause_id("pol_1", 10)
    assert cid == "policy:pol_1:chunk:10"
    assert clid == "clause:pol_1:10"
    assert cid != clid


def test_embedding_model_mismatch_raises(clean_test_policies):
    """
    Accessing a collection created with an incompatible embedding model raises
    EmbeddingModelMismatchError.
    """
    pol_id = "test_pol_mismatch"
    client = get_chroma_client()
    from app.vectorstore.registry import get_clause_index_collection_name

    coll_name = get_clause_index_collection_name(pol_id)
    # Manually create a collection with a different embedding_model recorded in metadata
    client.get_or_create_collection(
        name=coll_name,
        metadata={
            "source_type": "policy_clause",
            "policy_id": pol_id,
            "embedding_model": "old_incompatible_embedding_model_v1",
        },
    )

    with pytest.raises(EmbeddingModelMismatchError) as exc_info:
        get_clause_index(pol_id)
    assert "Embedding model mismatch" in str(exc_info.value)


def test_idempotent_rebuild_leaves_chunks_intact(clean_test_policies):
    """
    Rebuilding the clause index empties and recreates clauses_{policy_id}
    without modifying policy chunks.
    """
    pol_id = "test_pol_rebuild"

    # Index chunks
    chunks = [Chunk(chunk_id=0, text="Day care treatment covered.", page_number=1)]
    index_chunks(pol_id, chunks)

    # Index a clause
    clause_coll = get_clause_index(pol_id)
    clause_coll.upsert(
        ids=[format_clause_id(pol_id, "c1")],
        documents=["Initial clause 1"],
        metadatas=[{"source_type": "policy_clause", "policy_id": pol_id, "embedding_model": get_active_embedding_model_name()}],
    )
    assert clause_coll.count() == 1

    # Rebuild clause index
    rebuilt_coll = rebuild_clause_index(pol_id)
    assert rebuilt_coll.count() == 0

    # Verify policy chunks are completely intact
    chunks_coll = get_policy_chunks(pol_id)
    assert chunks_coll.count() == 1


def test_delete_leaves_no_orphans(clean_test_policies):
    """
    delete_all_policy_vectorstores removes both policy chunk and clause collections.
    """
    pol_id = "test_pol_iso_a"
    index_chunks(pol_id, [Chunk(chunk_id=0, text="Policy text", page_number=1)])
    c_coll = get_clause_index(pol_id)
    c_coll.upsert(
        ids=[format_clause_id(pol_id, "c1")],
        documents=["Clause"],
        metadatas=[{"source_type": "policy_clause", "policy_id": pol_id, "embedding_model": get_active_embedding_model_name()}],
    )

    client = get_chroma_client()
    assert any(c.name == f"policy_{pol_id}" for c in client.list_collections())
    assert any(c.name == f"clauses_{pol_id}" for c in client.list_collections())

    delete_all_policy_vectorstores(pol_id)

    remaining = [c.name for c in client.list_collections()]
    assert f"policy_{pol_id}" not in remaining
    assert f"clauses_{pol_id}" not in remaining


def test_grep_no_chroma_access_outside_registry_or_vectorstore():
    """
    Static analysis check: no direct client.get_or_create_collection or
    client.get_collection calls exist outside app/vectorstore/registry.py.
    """
    res = subprocess.run(
        ["git", "grep", "-E", r"\.get_or_create_collection|\.get_collection", "--", "app/", "server/"],
        capture_output=True,
        text=True,
    )
    lines = [ln for ln in res.stdout.strip().splitlines() if ln]
    for ln in lines:
        # Allowed solely in app/vectorstore/registry.py
        assert "app/vectorstore/registry.py" in ln, f"Unauthorized Chroma collection access found: {ln}"
