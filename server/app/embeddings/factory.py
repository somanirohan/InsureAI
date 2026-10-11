"""
Embedding provider factory.

Same pattern as llm/factory.py: the only file that imports concrete embedding
classes.  Every caller uses get_embedder() and works against EmbeddingProvider.
"""

from __future__ import annotations

from app.config import settings
from app.embeddings.base import EmbeddingProvider


def get_embedder() -> EmbeddingProvider:
    """
    Read EMBEDDING_PROVIDER from settings and return the right provider.

    Supported values
    ----------------
    ``ollama``  — local Ollama server (primary, default).
                  Uses ``/api/embed`` with ``/api/embeddings`` as a compatibility
                  fallback.  Requires Ollama running at ``OLLAMA_BASE_URL``.

    ``api``     — OpenAI-compatible REST API (not the default).
                  Requires ``EMBEDDING_API_KEY`` and ``EMBEDDING_API_BASE_URL``.

    If the configured provider is unavailable at runtime, ``app/rag/vectorstore``
    automatically falls back to ChromaDB's built-in embedding behaviour.

    Raises:
        ValueError: If the provider name is not recognised.
    """
    provider = settings.embedding_provider

    if provider == "ollama":
        from app.embeddings.ollama_embeddings import OllamaEmbeddingProvider
        return OllamaEmbeddingProvider()

    raise ValueError(
        f"Unknown EMBEDDING_PROVIDER '{provider}'. "
        "Valid choices: ollama"
    )
