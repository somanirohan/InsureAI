"""
Vector Store Registry for InsureAI.

The ONLY place in the codebase where collection names are built and ChromaDB
collections are retrieved. Enforces strict isolation between:
  1. Policy chunks (general RAG Q&A: collection 'policy_{policy_id}')
  2. Policy clauses (semantic evidence matching & verification: collection 'clauses_{policy_id}')
  3. Claim documents (NEVER embedded or stored in ChromaDB; transient query embedding only).

Features:
  - Source type and policy ID validation on every query.
  - Active embedding model verification (raises EmbeddingModelMismatchError if collection was embedded with different model).
  - Namespaced IDs:
      * policy chunk: policy:{policy_id}:chunk:{chunk_id}
      * policy clause: clause:{policy_id}:{clause_id}
  - Idempotent index rebuilds and cascade deletions.
"""

from __future__ import annotations

import logging
import re
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional, Tuple

import chromadb
from chromadb.config import Settings as ChromaSettings

from app.config import settings
from app.embeddings.factory import get_embedder

logger = logging.getLogger("insureai.vectorstore.registry")

SourceType = Literal["policy_chunk", "policy_clause"]


class EmbeddingModelMismatchError(Exception):
    """Raised when an active embedding model does not match the model stored with a collection."""
    pass


class InvalidCollectionScopeError(Exception):
    """Raised when code attempts to access a collection outside authorized accessors."""
    pass


_CHROMA_CLIENT: Optional[chromadb.ClientAPI] = None


def get_chroma_client() -> chromadb.ClientAPI:
    """Get or initialize singleton ChromaDB client (supports hosted HttpClient or local PersistentClient)."""
    global _CHROMA_CLIENT
    if _CHROMA_CLIENT is None:
        if getattr(settings, "chroma_host", None):
            host = settings.chroma_host.strip()
            # Clean protocol if included in chroma_host (e.g. https://my-chroma.onrender.com)
            ssl = getattr(settings, "chroma_ssl", False)
            if host.startswith("https://"):
                host = host[8:]
                ssl = True
            elif host.startswith("http://"):
                host = host[7:]

            # Remove port if embedded in host string
            port = getattr(settings, "chroma_port", None)
            if ":" in host:
                parts = host.split(":")
                host = parts[0]
                try:
                    port = int(parts[1])
                except ValueError:
                    pass

            if port is None:
                port = 443 if ssl else 8000

            headers = {}
            api_key = getattr(settings, "chroma_api_key", "").strip()
            if api_key:
                headers["Authorization"] = f"Bearer {api_key}"
                headers["X-Chroma-Token"] = api_key

            tenant = getattr(settings, "chroma_tenant", "default_tenant")
            database = getattr(settings, "chroma_database", "default_database")

            # Check if using Chroma Cloud (api.trychroma.com)
            if "trychroma.com" in host.lower():
                logger.info("Connecting to Chroma Cloud (tenant=%s, database=%s)", tenant, database)
                _CHROMA_CLIENT = chromadb.CloudClient(
                    api_key=api_key,
                    tenant=tenant,
                    database=database,
                    settings=ChromaSettings(anonymized_telemetry=False),
                )
            else:
                logger.info("Connecting to hosted ChromaDB at %s:%s (ssl=%s, tenant=%s, database=%s)", host, port, ssl, tenant, database)
                _CHROMA_CLIENT = chromadb.HttpClient(
                    host=host,
                    port=port,
                    ssl=ssl,
                    headers=headers if headers else None,
                    tenant=tenant,
                    database=database,
                    settings=ChromaSettings(anonymized_telemetry=False),
                )
        else:
            persist_path = Path(settings.chroma_persist_dir).resolve()
            persist_path.mkdir(parents=True, exist_ok=True)
            logger.info("Initializing local ChromaDB persistent client at: %s", persist_path)
            _CHROMA_CLIENT = chromadb.PersistentClient(
                path=str(persist_path),
                settings=ChromaSettings(anonymized_telemetry=False),
            )
    return _CHROMA_CLIENT


def get_active_embedding_model_name() -> str:
    """Return the active model name string from the current embedding provider."""
    try:
        embedder = get_embedder()
        model_name = getattr(embedder, "model", None)
        if model_name:
            return str(model_name)
    except Exception:
        pass
    if settings.embedding_provider == "ollama":
        return str(settings.ollama_embedding_model)
    elif settings.embedding_provider == "api":
        return str(settings.embedding_api_model)
    return "chroma_default"


def sanitize_policy_id(policy_id: str) -> str:
    """Clean policy identifier to satisfy Chroma collection naming rules."""
    cleaned = re.sub(r"[^a-zA-Z0-9_-]", "_", policy_id.strip())
    return cleaned[:50]


def get_policy_chunk_collection_name(policy_id: str) -> str:
    """Build standardized collection name for general policy chunks."""
    clean_id = sanitize_policy_id(policy_id)
    return f"policy_{clean_id}"


def get_clause_index_collection_name(policy_id: str) -> str:
    """Build standardized collection name for semantic clause index."""
    clean_id = sanitize_policy_id(policy_id)
    return f"clauses_{clean_id}"


def format_chunk_id(policy_id: str, chunk_id: Any) -> str:
    """Namespaced chunk ID: policy:{policy_id}:chunk:{chunk_id}"""
    return f"policy:{policy_id}:chunk:{chunk_id}"


def format_clause_id(policy_id: str, clause_id: Any) -> str:
    """Namespaced clause ID: clause:{policy_id}:{clause_id}"""
    return f"clause:{policy_id}:{clause_id}"


def _verify_collection_embedding_model(collection: chromadb.Collection) -> None:
    """
    Check if the collection was created with a specific embedding model.
    If recorded and differs from active model, raises EmbeddingModelMismatchError.
    """
    meta = collection.metadata or {}
    stored_model = meta.get("embedding_model")
    active_model = get_active_embedding_model_name()

    if stored_model and stored_model != active_model:
        raise EmbeddingModelMismatchError(
            f"Embedding model mismatch for collection '{collection.name}': "
            f"collection was indexed with '{stored_model}', but active embedder is '{active_model}'. "
            "Please re-index or adjust EMBEDDING_PROVIDER configuration."
        )


def get_policy_chunks(policy_id: str, user_id: Optional[str] = None) -> chromadb.Collection:
    """
    Accessor for policy chunks collection (RAG Q&A path).
    Verifies embedding model compatibility.
    """
    if not policy_id or not policy_id.strip():
        raise InvalidCollectionScopeError("policy_id is required.")

    client = get_chroma_client()
    coll_name = get_policy_chunk_collection_name(policy_id)
    active_model = get_active_embedding_model_name()

    coll = client.get_or_create_collection(
        name=coll_name,
        metadata={
            "source_type": "policy_chunk",
            "policy_id": policy_id,
            "user_id": user_id or "default",
            "embedding_model": active_model,
            "hnsw:space": "cosine",
            "created_at": datetime.utcnow().isoformat(),
        },
    )
    _verify_collection_embedding_model(coll)
    return coll


def get_clause_index(policy_id: str, user_id: Optional[str] = None) -> chromadb.Collection:
    """
    Accessor for clause index collection (Semantic verification path only).
    Verifies embedding model compatibility.
    """
    if not policy_id or not policy_id.strip():
        raise InvalidCollectionScopeError("policy_id is required.")

    client = get_chroma_client()
    coll_name = get_clause_index_collection_name(policy_id)
    active_model = get_active_embedding_model_name()

    coll = client.get_or_create_collection(
        name=coll_name,
        metadata={
            "source_type": "policy_clause",
            "policy_id": policy_id,
            "user_id": user_id or "default",
            "embedding_model": active_model,
            "hnsw:space": "cosine",
            "created_at": datetime.utcnow().isoformat(),
        },
    )
    _verify_collection_embedding_model(coll)
    return coll


def validate_retrieved_records(
    results: Dict[str, Any],
    expected_source_type: SourceType,
    expected_policy_id: str,
) -> Dict[str, List[Any]]:
    """
    Filter retrieved results to ensure no cross-source or cross-policy leakage occurs.
    Violations are discarded and logged.
    """
    filtered: Dict[str, List[Any]] = {
        "ids": [],
        "documents": [],
        "metadatas": [],
        "distances": [],
    }

    raw_ids = results.get("ids", [[]])[0] if results.get("ids") else []
    raw_docs = results.get("documents", [[]])[0] if results.get("documents") else []
    raw_metas = results.get("metadatas", [[]])[0] if results.get("metadatas") else []
    raw_dists = results.get("distances", [[]])[0] if results.get("distances") else []

    for rid, rdoc, rmeta, rdist in zip(raw_ids, raw_docs, raw_metas, raw_dists):
        rmeta = rmeta or {}
        rec_source = rmeta.get("source_type", "policy_chunk")
        rec_pol = rmeta.get("policy_id")

        # Drop record if wrong source_type or wrong policy_id
        if rec_source != expected_source_type:
            logger.warning(
                "Dropped record '%s': source_type '%s' does not match expected '%s'",
                rid, rec_source, expected_source_type
            )
            continue

        if rec_pol and str(rec_pol) != str(expected_policy_id):
            logger.error(
                "Cross-policy violation detected! Dropped record '%s' belonging to policy '%s' from query for '%s'",
                rid, rec_pol, expected_policy_id
            )
            continue

        filtered["ids"].append(rid)
        filtered["documents"].append(rdoc)
        filtered["metadatas"].append(rmeta)
        filtered["distances"].append(rdist)

    return filtered


def rebuild_clause_index(policy_id: str, user_id: Optional[str] = None) -> chromadb.Collection:
    """
    Idempotently delete and recreate the clause index collection for a policy.
    Never alters policy chunks collection.
    """
    client = get_chroma_client()
    coll_name = get_clause_index_collection_name(policy_id)
    try:
        client.delete_collection(name=coll_name)
        logger.info("Deleted existing clause collection '%s' for rebuild", coll_name)
    except Exception:
        pass
    return get_clause_index(policy_id, user_id=user_id)


def delete_all_policy_vectorstores(policy_id: str) -> None:
    """
    Delete all vector collections associated with a policy:
      - policy chunks ('policy_{policy_id}')
      - clause index ('clauses_{policy_id}')
    Leaves no orphan collections.
    """
    client = get_chroma_client()
    for coll_name in (
        get_policy_chunk_collection_name(policy_id),
        get_clause_index_collection_name(policy_id),
    ):
        try:
            client.delete_collection(name=coll_name)
            logger.info("Deleted collection '%s' for policy '%s'", coll_name, policy_id)
        except Exception as exc:
            logger.debug("Collection '%s' was not present or could not be deleted: %s", coll_name, exc)
