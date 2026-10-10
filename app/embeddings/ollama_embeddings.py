"""
Ollama embedding provider.

Uses the /api/embeddings endpoint (native Ollama format) which accepts one
text at a time.  We loop over the batch rather than hoping for batch support,
which keeps the code compatible with older Ollama versions.
"""

from __future__ import annotations

import logging
import requests

from app.embeddings.base import EmbeddingProvider
from app.config import settings

logger = logging.getLogger(__name__)


class OllamaEmbeddingProvider(EmbeddingProvider):
    """
    Calls Ollama's /api/embeddings endpoint for local, cost-free embeddings.

    Recommended model: nomic-embed-text (768-dim, fast, high quality).
    Pull it once with: `ollama pull nomic-embed-text`
    Falls back gracefully to Chroma built-in embeddings if Ollama is offline.
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
        If Ollama is completely offline/unreachable, gracefully falls back
        to Chroma's built-in local DefaultEmbeddingFunction.
        """
        if not texts:
            return []

        # Try batch /api/embed endpoint first
        try:
            response = requests.post(
                f"{self.base_url}/api/embed",
                json={"model": self.model, "input": texts},
                timeout=5,
            )
            if response.status_code == 200:
                data = response.json()
                if "embeddings" in data:
                    return data["embeddings"]
        except Exception:
            # Fall back to legacy endpoint
            pass

        # Legacy /api/embeddings fallback (one-by-one)
        try:
            vectors: list[list[float]] = []
            for text in texts:
                response = requests.post(
                    f"{self.base_url}/api/embeddings",
                    json={"model": self.model, "prompt": text},
                    timeout=5,
                )
                response.raise_for_status()
                vectors.append(response.json()["embedding"])
            return vectors
        except Exception as err:
            logger.warning(
                "Ollama embedding endpoint unavailable at %s (%s). Falling back to Chroma built-in embeddings.",
                self.base_url,
                err,
            )
            try:
                from chromadb.utils import embedding_functions
                default_fn = embedding_functions.DefaultEmbeddingFunction()
                res = default_fn(texts)
                return [list(map(float, vec)) for vec in res]
            except Exception as chroma_err:
                logger.error("Chroma fallback embeddings also failed: %s", chroma_err)
                raise err

