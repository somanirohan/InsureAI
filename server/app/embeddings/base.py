"""
Abstract base class for embedding providers.

Mirrors the LLMProvider pattern: callers depend on this interface,
never on a concrete class.  The embedder's job is simple: turn a list
of text strings into a list of float vectors.
"""

from __future__ import annotations

from abc import ABC, abstractmethod


class EmbeddingProvider(ABC):
    """
    Contract: given N strings, return N embedding vectors (list of floats).
    The vector dimension depends on the model but must be consistent within
    a single policy's collection.
    """

    @abstractmethod
    def embed(self, texts: list[str]) -> list[list[float]]:
        """
        Embed a batch of texts.

        Args:
            texts: Non-empty list of strings to embed.

        Returns:
            List of float vectors, one per input text, in the same order.
        """
        ...

    def embed_one(self, text: str) -> list[float]:
        """
        Convenience wrapper for embedding a single string.
        Avoids the caller having to wrap/unwrap a list.
        """
        return self.embed([text])[0]
