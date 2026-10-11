"""
Ollama embedding provider.

Uses the Ollama REST API to generate embeddings locally with `nomic-embed-text`
(or any model configured via OLLAMA_EMBEDDING_MODEL).

Endpoint strategy
-----------------
  Primary:    POST /api/embed       (Ollama >= 0.1.32)
  Fallback:   POST /api/embeddings  (older Ollama, single-text only)

Input ordering is preserved: the i-th output vector corresponds to the i-th
input text.

Configuration (read from Settings / environment):
  OLLAMA_BASE_URL          e.g. http://localhost:11434
  OLLAMA_EMBEDDING_MODEL   e.g. nomic-embed-text
  OLLAMA_TIMEOUT_SECONDS   default 30
"""

from __future__ import annotations

import logging
from typing import Any

import requests

from app.config import settings
from app.embeddings.base import EmbeddingProvider

logger = logging.getLogger(__name__)


class OllamaEmbeddingProvider(EmbeddingProvider):
    """
    Embedding provider backed by a local Ollama instance.

    Tries ``POST /api/embed`` first (batch-capable, Ollama ≥ 0.1.32).
    If that endpoint returns a 404 it falls back to ``POST /api/embeddings``
    (older API, one text at a time) and logs a one-time warning.
    """

    def __init__(
        self,
        base_url: str | None = None,
        model: str | None = None,
        timeout: int | None = None,
    ) -> None:
        self._base_url = (base_url or settings.ollama_base_url).rstrip("/")
        self._model = model or settings.ollama_embedding_model
        self._timeout = timeout if timeout is not None else settings.ollama_timeout_seconds
        self._use_legacy_endpoint: bool | None = None  # discovered on first call

    # ── Internal helpers ──────────────────────────────────────────────────────

    def _embed_via_new_api(self, texts: list[str]) -> list[list[float]]:
        """Call POST /api/embed (Ollama >= 0.1.32, supports batch)."""
        url = f"{self._base_url}/api/embed"
        payload: dict[str, Any] = {"model": self._model, "input": texts}
        resp = requests.post(url, json=payload, timeout=self._timeout)
        resp.raise_for_status()
        data = resp.json()
        # Ollama /api/embed returns {"embeddings": [[...], ...]}
        vectors: list[list[float]] = data["embeddings"]
        return vectors

    def _embed_one_via_legacy_api(self, text: str) -> list[float]:
        """Call POST /api/embeddings (older Ollama, single text per request)."""
        url = f"{self._base_url}/api/embeddings"
        payload: dict[str, Any] = {"model": self._model, "prompt": text}
        resp = requests.post(url, json=payload, timeout=self._timeout)
        resp.raise_for_status()
        data = resp.json()
        # Older API returns {"embedding": [...]}
        return data["embedding"]

    # ── Public API ────────────────────────────────────────────────────────────

    def embed(self, texts: list[str]) -> list[list[float]]:
        """
        Embed a batch of texts, preserving input order.

        Attempts ``/api/embed`` first; on a 404 falls back to the legacy
        ``/api/embeddings`` endpoint (one request per text).

        Args:
            texts: Non-empty list of strings to embed.

        Returns:
            List of float vectors in the same order as ``texts``.

        Raises:
            requests.RequestException: On network error or non-2xx/404 response.
        """
        if not texts:
            return []

        # If we already know the server only speaks the legacy API, skip the
        # primary endpoint entirely to avoid unnecessary round-trips.
        if self._use_legacy_endpoint is True:
            return self._embed_batch_legacy(texts)

        try:
            vectors = self._embed_via_new_api(texts)
            if self._use_legacy_endpoint is None:
                logger.info(
                    "Ollama embedding (/api/embed): model=%s, batch_size=%d",
                    self._model,
                    len(texts),
                )
                self._use_legacy_endpoint = False
            return vectors

        except requests.HTTPError as exc:
            if exc.response is not None and exc.response.status_code == 404:
                if self._use_legacy_endpoint is not False:
                    logger.warning(
                        "Ollama /api/embed returned 404 — falling back to "
                        "/api/embeddings (older Ollama version). "
                        "Consider upgrading Ollama for better batch performance."
                    )
                    self._use_legacy_endpoint = True
                return self._embed_batch_legacy(texts)
            raise

    def _embed_batch_legacy(self, texts: list[str]) -> list[list[float]]:
        """Embed texts one-by-one using the legacy /api/embeddings endpoint."""
        vectors: list[list[float]] = []
        for i, text in enumerate(texts):
            vec = self._embed_one_via_legacy_api(text)
            vectors.append(vec)
            if (i + 1) % 10 == 0:
                logger.debug(
                    "Ollama legacy embed: %d/%d texts processed", i + 1, len(texts)
                )
        logger.info(
            "Ollama embedding (/api/embeddings legacy): model=%s, count=%d",
            self._model,
            len(texts),
        )
        return vectors

    def embed_one(self, text: str) -> list[float]:
        """
        Embed a single string.

        Overrides the base class default to use the more efficient single-text
        path on the legacy API when applicable.

        Args:
            text: The string to embed.

        Returns:
            A single float vector.
        """
        if self._use_legacy_endpoint is True:
            return self._embed_one_via_legacy_api(text)
        # Use the batch path (handles /api/embed → legacy fallback automatically)
        return self.embed([text])[0]
