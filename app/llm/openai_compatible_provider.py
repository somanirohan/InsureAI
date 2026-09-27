"""
Generic OpenAI-compatible LLM provider.

Both OpenRouter and NVIDIA NIM expose the same request/response shape as the
OpenAI chat-completions API, so one parameterised class covers both rather
than duplicating code.  The factory picks which base_url + api_key to inject.
"""

from __future__ import annotations

from typing import Any

from openai import OpenAI

from app.llm.base import LLMProvider


class OpenAICompatibleProvider(LLMProvider):
    """
    Works with any backend that speaks the OpenAI chat-completions API:
    - OpenRouter  (base_url = https://openrouter.ai/api/v1)
    - NVIDIA NIM  (base_url = https://integrate.api.nvidia.com/v1)
    - The real OpenAI API
    - Any local proxy (e.g. LiteLLM, vLLM with --api-server)

    Parameterised at construction time so the factory can instantiate the
    right flavour without subclassing.
    """

    def __init__(
        self,
        base_url: str,
        api_key: str,
        model: str,
    ) -> None:
        self.model = model
        # The openai SDK handles auth headers, retries, and response parsing.
        self._client = OpenAI(base_url=base_url, api_key=api_key)

    def chat(
        self,
        messages: list[dict[str, str]],
        **kwargs: Any,
    ) -> str:
        """
        Call the /chat/completions endpoint.

        Temperature defaults to 0.1 to keep factual extractions deterministic;
        callers can override via kwargs.
        """
        response = self._client.chat.completions.create(
            model=self.model,
            messages=messages,  # type: ignore[arg-type]
            temperature=kwargs.get("temperature", 0.1),
            max_tokens=kwargs.get("max_tokens", 2048),
        )
        return response.choices[0].message.content or ""
