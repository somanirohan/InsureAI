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
     - Generates embeddings via `get_embedder()` (swappable: Ollama or API).
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
from pathlib import Path
from typing import Optional, Sequence

import chromadb
from chromadb.config import Settings as ChromaSettings

from app.config import settings
from app.embeddings.factory import get_embedder
from app.ingestion.chunking import Chunk

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


# ── Chroma client singleton ───────────────────────────────────────────────────

_CHROMA_CLIENT: Optional[chromadb.ClientAPI] = None


def get_chroma_client() -> chromadb.ClientAPI:
    """
    Get or initialize persistent ChromaDB client.
    """
    global _CHROMA_CLIENT
    if _CHROMA_CLIENT is None:
        persist_path = Path(settings.chroma_persist_dir).resolve()
        persist_path.mkdir(parents=True, exist_ok=True)
        logger.info("Initializing ChromaDB persistent client at: %s", persist_path)
        _CHROMA_CLIENT = chromadb.PersistentClient(
            path=str(persist_path),
            settings=ChromaSettings(anonymized_telemetry=False),
        )
    return _CHROMA_CLIENT


def _sanitize_collection_name(policy_id: str) -> str:
    """
    Format policy_id to comply with Chroma collection naming rules:
    - 3-63 characters
    - Starts and ends with alphanumeric
    - Contains only alphanumeric, underscores, hyphens
    """
    clean_id = re.sub(r"[^a-zA-Z0-9_-]", "_", policy_id.strip())
    name = f"policy_{clean_id}"
    if len(name) > 63:
        name = name[:63]
    return name


def get_policy_collection(policy_id: str) -> chromadb.Collection:
    """
    Get or create isolated Chroma collection for a specific policy.
    """
    client = get_chroma_client()
    coll_name = _sanitize_collection_name(policy_id)
    return client.get_or_create_collection(
        name=coll_name,
        metadata={"policy_id": policy_id, "hnsw:space": "cosine"},
    )


# ── Public API ────────────────────────────────────────────────────────────────

def index_chunks(policy_id: str, chunks: Sequence[Chunk]) -> int:
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

    texts = [c.text for c in chunks]
    ids = [f"{policy_id}_{c.chunk_id}" for c in chunks]
    metadatas = [
        {
            "policy_id": policy_id,
            "chunk_id": c.chunk_id,
            "page_number": c.page_number,
        }
        for c in chunks
    ]

    logger.info(
        "Embedding %d chunks for policy '%s' using %s...",
        len(chunks),
        policy_id,
        settings.embedding_provider,
    )
    embeddings = embedder.embed(texts)

    # Upsert to avoid duplicate key errors on re-indexing
    collection.upsert(
        ids=ids,
        embeddings=embeddings,  # type: ignore[arg-type]
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
    embedder = get_embedder()
    query_vector = embedder.embed_one(query.strip())

    results = collection.query(
        query_embeddings=[query_vector],
        n_results=fetch_k,
        include=["documents", "metadatas", "distances"],
    )

    retrieved: list[RetrievedChunk] = []

    docs = results.get("documents", [[]])[0]
    metas = results.get("metadatas", [[]])[0]
    distances = results.get("distances", [[]])[0]

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
    Delete a policy's vector collection (useful when a policy is deleted or re-uploaded).
    """
    client = get_chroma_client()
    coll_name = _sanitize_collection_name(policy_id)
    try:
        client.delete_collection(name=coll_name)
        logger.info("Deleted Chroma collection '%s' for policy '%s'", coll_name, policy_id)
    except Exception as exc:
        logger.warning("Failed to delete collection '%s': %s", coll_name, exc)
