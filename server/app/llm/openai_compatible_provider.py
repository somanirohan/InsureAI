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
        self.base_url = base_url
        if not api_key:
            raise ValueError(
                f"API key for model '{model}' ({base_url}) is not configured. "
                "Please set GROQ_API_KEY (or appropriate provider key) in your .env file."
            )
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
        create_kwargs: dict[str, Any] = {
            "model": self.model,
            "messages": messages,  # type: ignore[arg-type]
            "temperature": kwargs.get("temperature", 0.1),
            "max_tokens": kwargs.get("max_tokens", 2048),
        }

        # Enable JSON object format if requested (supported natively by Groq and OpenAI)
        if kwargs.get("format") == "json" or kwargs.get("json_mode"):
            create_kwargs["response_format"] = {"type": "json_object"}

        try:
            response = self._client.chat.completions.create(**create_kwargs)
            return response.choices[0].message.content or ""
        except Exception as exc:
            # If the model does not exist or account hit rate limits, auto-fallback to alternative available chat model
            err_str = str(exc).lower()
            if any(k in err_str for k in ("model_not_found", "does not exist", "rate_limit", "rate limit", "429")):
                try:
                    candidates = ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "llama-3.3-70b-versatile", "llama-3.1-8b-instant"]
                    for alt in candidates:
                        if alt == self.model:
                            continue
                        try:
                            create_kwargs["model"] = alt
                            response = self._client.chat.completions.create(**create_kwargs)
                            self.model = alt
                            return response.choices[0].message.content or ""
                        except Exception:
                            continue
                except Exception:
                    pass
            raise
