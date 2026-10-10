"""
Vector store manager using ChromaDB (scoped per policy).

Design rationale
----------------
Health insurance policies are distinct legal contracts. To ensure strict data
isolation and prevent information leakage across different uploaded policies,
every policy is indexed into its own isolated ChromaDB collection scoped by
`policy_id`.

Key responsibilities:
  1. `index_chunks(policy_id, chunks)`:
     - Generates embeddings via `get_embedder()` (configured API or Chroma default).
     - Stores chunk text, unique ID, and metadata (page_number, chunk_id, policy_id).
     - Persists to local directory specified by `settings.chroma_persist_dir`.
  2. `query_similar(policy_id, query, top_k)`:
     - Embeds user query using the same `get_embedder()`.
     - Queries only the specific policy's Chroma collection.
     - Returns ordered `RetrievedChunk` objects with text, 1-based page number,
       distance, and normalized similarity score.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Optional, Sequence

import chromadb

from app.config import settings
from app.embeddings.factory import get_embedder
from app.ingestion.chunking import Chunk
from app.vectorstore.registry import (
    delete_all_policy_vectorstores,
    format_chunk_id,
    get_active_embedding_model_name,
    get_chroma_client,
    get_policy_chunks,
    validate_retrieved_records,
)

logger = logging.getLogger(__name__)


# ── Data model ────────────────────────────────────────────────────────────────

@dataclass
class RetrievedChunk:
    """
    A chunk retrieved from vector similarity search.

    Attributes:
        chunk_id:    Original chunk index.
        page_number: Physical 1-based PDF page number where text originated.
        text:        Clean text content of the chunk.
        distance:    Raw cosine distance from Chroma (0.0 = identical).
        similarity:  Normalized similarity score (1.0 - distance).
    """
    chunk_id: int
    page_number: int
    text: str
    distance: float
    similarity: float


# ── Backward-compatible collection access ─────────────────────────────────────

def get_policy_collection(policy_id: str) -> chromadb.Collection:
    """
    Get isolated Chroma collection for a specific policy's chunks via registry.
    """
    return get_policy_chunks(policy_id)


# ── Public API ────────────────────────────────────────────────────────────────

def index_chunks(policy_id: str, chunks: Sequence[Chunk], user_id: Optional[str] = None) -> int:
    """
    Embed and index a list of chunks into the policy's isolated Chroma collection.

    Args:
        policy_id: Unique identifier for the policy document.
        chunks: Sequence of Chunk objects produced by chunk_pages().

    Returns:
        Number of chunks indexed.
    """
    if not chunks:
        logger.warning("No chunks provided to index for policy '%s'", policy_id)
        return 0

    collection = get_policy_collection(policy_id)
    embedder = get_embedder()
    active_model = get_active_embedding_model_name()
    now_iso = datetime.utcnow().isoformat()

    texts = [c.text for c in chunks]
    ids = [format_chunk_id(policy_id, c.chunk_id) for c in chunks]
    metadatas = [
        {
            "source_type": "policy_chunk",
            "policy_id": policy_id,
            "user_id": user_id or "default",
            "chunk_id": c.chunk_id,
            "page_number": c.page_number,
            "embedding_model": active_model,
            "created_at": now_iso,
        }
        for c in chunks
    ]

    logger.info(
        "Embedding %d chunks for policy '%s' using %s...",
        len(chunks),
        policy_id,
        settings.embedding_provider,
    )
    try:
        embeddings = embedder.embed(texts)
        # Upsert to avoid duplicate key errors on re-indexing
        collection.upsert(
            ids=ids,
            embeddings=embeddings,  # type: ignore[arg-type]
            documents=texts,
            metadatas=metadatas,  # type: ignore[arg-type]
        )
    except Exception as emb_err:
        logger.warning(
            "Primary embedding provider (%s) unavailable: %s. Using Chroma built-in embeddings.",
            settings.embedding_provider,
            emb_err,
        )
        collection.upsert(
            ids=ids,
            documents=texts,
            metadatas=metadatas,  # type: ignore[arg-type]
        )

    logger.info("Successfully indexed %d chunks for policy '%s'", len(chunks), policy_id)
    return len(chunks)


def query_similar(
    policy_id: str,
    query: str,
    top_k: Optional[int] = None,
) -> list[RetrievedChunk]:
    """
    Retrieve the most semantically relevant chunks for a question from a policy.

    Args:
        policy_id: Target policy document identifier.
        query: User question or search query.
        top_k: Number of relevant chunks to retrieve (defaults to settings.top_k).

    Returns:
        Ordered list of RetrievedChunk objects (closest first).
    """
    if not query or not query.strip():
        return []

    effective_k = top_k or settings.top_k
    collection = get_policy_collection(policy_id)

    total_docs = collection.count()
    if total_docs == 0:
        logger.warning("Collection for policy '%s' is empty", policy_id)
        return []

    fetch_k = min(effective_k, total_docs)
    results = None

    try:
        embedder = get_embedder()
        query_vector = embedder.embed_one(query.strip())
        results = collection.query(
            query_embeddings=[query_vector],
            n_results=fetch_k,
            include=["documents", "metadatas", "distances"],
        )
    except Exception as emb_err:
        logger.warning(
            "Primary embedder failed for query (%s). Falling back to Chroma query_texts.",
            emb_err,
        )
        results = collection.query(
            query_texts=[query.strip()],
            n_results=fetch_k,
            include=["documents", "metadatas", "distances"],
        )

    validated = validate_retrieved_records(
        results=results,
        expected_source_type="policy_chunk",
        expected_policy_id=policy_id,
    )

    retrieved: list[RetrievedChunk] = []
    docs = validated.get("documents", [])
    metas = validated.get("metadatas", [])
    distances = validated.get("distances", [])

    for doc, meta, dist in zip(docs, metas, distances):
        # Cosine distance to similarity: similarity = 1 - distance
        sim = max(0.0, 1.0 - float(dist))
        retrieved.append(
            RetrievedChunk(
                chunk_id=int(meta.get("chunk_id", 0)),
                page_number=int(meta.get("page_number", 1)),
                text=str(doc),
                distance=float(dist),
                similarity=sim,
            )
        )

    return retrieved


def delete_policy_index(policy_id: str) -> None:
    """
    Delete all vector collections associated with a policy via registry.
    """
    delete_all_policy_vectorstores(policy_id)
