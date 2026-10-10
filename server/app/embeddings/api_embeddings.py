"""
API-based embedding provider (OpenAI-compatible).

Works with any endpoint that follows the OpenAI /embeddings contract:
- OpenAI (text-embedding-3-small / large)
- OpenRouter (some models)
- NVIDIA NIM embedding endpoints

Configured via EMBEDDING_API_BASE_URL, EMBEDDING_API_KEY, EMBEDDING_API_MODEL
in .env.  Because the SDK handles batching automatically, this is efficient
for large documents too.
"""

from __future__ import annotations

from openai import OpenAI

from app.embeddings.base import EmbeddingProvider
from app.config import settings


class APIEmbeddingProvider(EmbeddingProvider):
    """
    Wraps any OpenAI-compatible /embeddings endpoint.

    Batches the full list of texts in a single API call (the SDK handles
    the request body), which is more efficient than Ollama's one-by-one loop.
    """

    def __init__(
        self,
        base_url: str | None = None,
        api_key: str | None = None,
        model: str | None = None,
    ) -> None:
        self._client = OpenAI(
            base_url=base_url or settings.embedding_api_base_url,
            api_key=api_key or settings.embedding_api_key,
        )
        self.model = model or settings.embedding_api_model

    def embed(self, texts: list[str]) -> list[list[float]]:
        """
        Send all texts in one batch call and return vectors in the same order.

        The OpenAI SDK preserves order in the response, so we can zip directly.
        """
        response = self._client.embeddings.create(
            model=self.model,
            input=texts,
        )
        # Sort by index just in case the API reorders (defensive)
        sorted_data = sorted(response.data, key=lambda d: d.index)
        return [item.embedding for item in sorted_data]
