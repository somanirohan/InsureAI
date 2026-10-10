import hashlib
import math
import logging
import requests

from app.embeddings.base import EmbeddingProvider
from app.config import settings

logger = logging.getLogger(__name__)


def _deterministic_hash_vector(text: str, dim: int = 768) -> list[float]:
    """Generate a normalized deterministic 768-dim embedding vector from text."""
    vec = [0.0] * dim
    words = text.lower().split()
    if not words:
        return vec
    for word in words:
        h = int(hashlib.md5(word.encode("utf-8")).hexdigest(), 16)
        idx = h % dim
        sign = 1.0 if ((h >> 8) & 1) == 0 else -1.0
        vec[idx] += sign
    norm = math.sqrt(sum(x * x for x in vec))
    if norm > 0:
        vec = [round(x / norm, 6) for x in vec]
    return vec


class OllamaEmbeddingProvider(EmbeddingProvider):
    """
    Calls Ollama's /api/embeddings endpoint for local, cost-free embeddings.

    Recommended model: nomic-embed-text (768-dim, fast, high quality).
    Falls back gracefully to deterministic text embeddings if Ollama is unreachable.
    """
    _ollama_reachable: bool | None = None

    def __init__(
        self,
        base_url: str | None = None,
        model: str | None = None,
    ) -> None:
        self.base_url = (base_url or settings.ollama_base_url).rstrip("/")
        self.model = model or settings.ollama_embedding_model

    def _check_reachable(self) -> bool:
        if OllamaEmbeddingProvider._ollama_reachable is not None:
            return OllamaEmbeddingProvider._ollama_reachable
        try:
            r = requests.get(f"{self.base_url}/api/tags", timeout=0.5)
            OllamaEmbeddingProvider._ollama_reachable = (r.status_code == 200)
        except Exception:
            OllamaEmbeddingProvider._ollama_reachable = False
        return OllamaEmbeddingProvider._ollama_reachable

    def embed(self, texts: list[str]) -> list[list[float]]:
        """
        Embed texts using Ollama with fallback.
        """
        if not texts:
            return []

        if not self._check_reachable():
            return [_deterministic_hash_vector(t) for t in texts]

        # Try batch /api/embed endpoint first
        try:
            response = requests.post(
                f"{self.base_url}/api/embed",
                json={"model": self.model, "input": texts},
                timeout=10,
            )
            if response.status_code == 200:
                data = response.json()
                if "embeddings" in data and data["embeddings"]:
                    return data["embeddings"]
        except Exception:
            pass

        # Try legacy /api/embeddings endpoint
        try:
            vectors: list[list[float]] = []
            for text in texts:
                response = requests.post(
                    f"{self.base_url}/api/embeddings",
                    json={"model": self.model, "prompt": text},
                    timeout=5,
                )
                if response.status_code == 200:
                    vectors.append(response.json()["embedding"])
                else:
                    break
            if len(vectors) == len(texts):
                return vectors
        except Exception:
            pass

        # Fallback to deterministic hashed embeddings
        return [_deterministic_hash_vector(t) for t in texts]


