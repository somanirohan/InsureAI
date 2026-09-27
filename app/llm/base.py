"""
Abstract base class for LLM providers.

Every provider (Ollama, OpenRouter, NVIDIA) must implement this interface.
The rest of the codebase depends ONLY on LLMProvider — never on a concrete class.
That way, swapping providers requires zero changes outside llm/factory.py.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any


class LLMProvider(ABC):
    """
    Minimal contract: given a list of chat messages, return the assistant's
    reply as a plain string.  All provider-specific HTTP details stay inside
    the concrete implementations.
    """

    @abstractmethod
    def chat(
        self,
        messages: list[dict[str, str]],
        **kwargs: Any,
    ) -> str:
        """
        Send `messages` to the underlying model and return the text reply.

        Args:
            messages: OpenAI-style list of {"role": ..., "content": ...} dicts.
            **kwargs: Provider-specific overrides (e.g. temperature, max_tokens).

        Returns:
            The assistant message content as a plain string.
        """
        ...
