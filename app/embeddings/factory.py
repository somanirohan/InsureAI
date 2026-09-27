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

    Raises:
        ValueError: If the provider name is unknown.
    """
    provider = settings.embedding_provider

    if provider == "ollama":
        from app.embeddings.ollama_embeddings import OllamaEmbeddingProvider
        return OllamaEmbeddingProvider()

    if provider == "api":
        from app.embeddings.api_embeddings import APIEmbeddingProvider
        return APIEmbeddingProvider()

    raise ValueError(
        f"Unknown EMBEDDING_PROVIDER '{provider}'. "
        "Valid choices: ollama | api"
    )
