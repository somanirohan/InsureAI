"""
Ollama embedding provider.

Uses the /api/embeddings endpoint (native Ollama format) which accepts one
text at a time.  We loop over the batch rather than hoping for batch support,
which keeps the code compatible with older Ollama versions.
"""

from __future__ import annotations

import requests

from app.embeddings.base import EmbeddingProvider
from app.config import settings


class OllamaEmbeddingProvider(EmbeddingProvider):
    """
    Calls Ollama's /api/embeddings endpoint for local, cost-free embeddings.

    Recommended model: nomic-embed-text (768-dim, fast, high quality).
    Pull it once with: `ollama pull nomic-embed-text`
    """

    def __init__(
        self,
        base_url: str | None = None,
        model: str | None = None,
    ) -> None:
        self.base_url = (base_url or settings.ollama_base_url).rstrip("/")
        self.model = model or settings.ollama_embedding_model

    def embed(self, texts: list[str]) -> list[list[float]]:
        """
        Embed texts using Ollama.

        Tries the modern batch /api/embed endpoint first (Ollama >= 0.1.34)
        for fast single-request batching. Falls back to iterating over
        the legacy /api/embeddings endpoint if /api/embed is unavailable.
        """
        if not texts:
            return []

        # Try batch /api/embed endpoint first
        try:
            response = requests.post(
                f"{self.base_url}/api/embed",
                json={"model": self.model, "input": texts},
                timeout=120,
            )
            if response.status_code == 200:
                data = response.json()
                if "embeddings" in data:
                    return data["embeddings"]
        except Exception:
            # Fall back to legacy endpoint
            pass

        # Legacy /api/embeddings fallback (one-by-one)
        vectors: list[list[float]] = []
        for text in texts:
            response = requests.post(
                f"{self.base_url}/api/embeddings",
                json={"model": self.model, "prompt": text},
                timeout=60,
            )
            response.raise_for_status()
            vectors.append(response.json()["embedding"])
        return vectors
