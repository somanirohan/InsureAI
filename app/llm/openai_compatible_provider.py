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
            # If the model does not exist or account lacks access, auto-fallback to available model
            err_str = str(exc).lower()
            if "model_not_found" in err_str or "does not exist" in err_str:
                try:
                    available = [m.id for m in self._client.models.list().data if not any(x in m.id.lower() for x in ("guard", "whisper", "embed"))]
                    if available:
                        fallback_model = available[0]
                        create_kwargs["model"] = fallback_model
                        self.model = fallback_model
                        response = self._client.chat.completions.create(**create_kwargs)
                        return response.choices[0].message.content or ""
                except Exception:
                    pass
            raise
