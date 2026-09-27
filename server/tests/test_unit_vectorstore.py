"""
Unit tests for isolated ChromaDB collections, re-indexing, deletion, and cross-policy isolation.
"""

import sys
from pathlib import Path

repo_root = Path(__file__).resolve().parent.parent.parent
server_dir = repo_root / "server"
for p in (str(repo_root), str(server_dir)):
    if p not in sys.path:
        sys.path.insert(0, p)

import pytest
from app.ingestion.chunking import Chunk
from app.rag.vectorstore import (
    index_chunks,
    query_similar,
    delete_policy_index,
    get_chroma_client,
)


def test_isolated_policy_indexing_and_retrieval():
    policy_a = "test_policy_alpha_1"
    policy_b = "test_policy_beta_2"

    # Chunks for Policy A
    chunks_a = [
        Chunk(chunk_id=0, page_number=1, text="Alpha policy covers dental injuries from accidents up to 50000 rupees."),
        Chunk(chunk_id=1, page_number=2, text="Alpha policy waiting period for maternity is 9 months."),
    ]

    # Chunks for Policy B
    chunks_b = [
        Chunk(chunk_id=0, page_number=1, text="Beta policy permanently excludes all dental treatments without exception."),
        Chunk(chunk_id=1, page_number=3, text="Beta policy waiting period for maternity is 24 months."),
    ]

    # Clean prior test state
    delete_policy_index(policy_a)
    delete_policy_index(policy_b)

    # 1. Index both policies
    indexed_a = index_chunks(policy_a, chunks_a)
    indexed_b = index_chunks(policy_b, chunks_b)
    assert indexed_a == 2
    assert indexed_b == 2

    # 2. Query Policy A for dental coverage -> must only retrieve Alpha text
    results_a = query_similar(policy_a, "dental coverage", top_k=2)
    assert len(results_a) > 0
    assert "Alpha policy" in results_a[0].text
    assert "Beta policy" not in results_a[0].text

    # 3. Query Policy B for dental coverage -> must only retrieve Beta text
    results_b = query_similar(policy_b, "dental coverage", top_k=2)
    assert len(results_b) > 0
    assert "Beta policy" in results_b[0].text
    assert "Alpha policy" not in results_b[0].text

    # 4. Re-indexing idempotency (upsert check)
    reindexed_a = index_chunks(policy_a, chunks_a)
    assert reindexed_a == 2
    results_a_after = query_similar(policy_a, "dental coverage", top_k=5)
    # Total chunks in collection must still be 2, not duplicated to 4
    assert len(results_a_after) == 2

    # 5. Vector deletion check
    delete_policy_index(policy_a)
    # After deletion, collection should be empty or deleted
    client = get_chroma_client()
    colls = [c.name for c in client.list_collections()]
    assert f"policy_{policy_a}" not in colls

    # Clean up policy B
    delete_policy_index(policy_b)
