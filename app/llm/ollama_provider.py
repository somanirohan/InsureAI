"""
Ollama LLM provider.

Talks to a locally-running Ollama server via its native /api/chat endpoint.
We don't use the OpenAI SDK here because Ollama's native API returns a
streaming NDJSON response (or a single JSON blob with `stream: false`), which
is structurally different from the OpenAI chat-completions shape.
"""

from __future__ import annotations

import json
from typing import Any

import requests

from app.llm.base import LLMProvider
from app.config import settings


class OllamaProvider(LLMProvider):
    """
    Wraps the Ollama /api/chat endpoint.

    Uses `stream: false` so we get the entire reply in a single HTTP response
    rather than having to reassemble server-sent events.
    """

    def __init__(
        self,
        base_url: str | None = None,
        model: str | None = None,
    ) -> None:
        self.base_url = (base_url or settings.ollama_base_url).rstrip("/")
        self.model = model or settings.ollama_model

    def chat(
        self,
        messages: list[dict[str, str]],
        **kwargs: Any,
    ) -> str:
        """
        POST to /api/chat with stream=false.

        We pass temperature and any other kwargs directly into the Ollama
        options dict so callers can still tune generation without knowing
        which provider is active.
        """
        payload: dict[str, Any] = {
            "model": self.model,
            "messages": messages,
            "stream": False,
            "options": {
                "temperature": kwargs.get("temperature", 0.1),
                "num_predict": kwargs.get("max_tokens", 1024),
            },
        }

        response = requests.post(
            f"{self.base_url}/api/chat",
            json=payload,
            timeout=600,  # CPU inference at ~11 tok/s can take 3-5 min on long prompts
        )
        response.raise_for_status()

        data = response.json()
        # Ollama wraps the reply in data["message"]["content"]
        return data["message"]["content"]
