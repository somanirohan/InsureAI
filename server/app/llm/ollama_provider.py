"""
Ollama LLM provider.

Talks to a locally-running Ollama server via its native /api/chat endpoint.
We don't use the OpenAI SDK here because Ollama's native API returns a
streaming NDJSON response (or a single JSON blob with `stream: false`), which
is structurally different from the OpenAI chat-completions shape.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Optional

import requests

from app.llm.base import LLMProvider
from app.config import settings

logger = logging.getLogger(__name__)


class OllamaProvider(LLMProvider):
    """
    Wraps the Ollama /api/chat endpoint.

    Uses `stream: false` so we get the entire reply in a single HTTP response
    rather than having to reassemble server-sent events.
    Includes auto-discovery and fallback for installed models to prevent 404 crashes.
    """

    def __init__(
        self,
        base_url: str | None = None,
        model: str | None = None,
    ) -> None:
        self.base_url = (base_url or settings.ollama_base_url).rstrip("/")
        self.model = model or settings.ollama_model

    def _find_installed_chat_model(self) -> Optional[str]:
        """Query Ollama /api/tags to find an installed chat/completion model."""
        try:
            resp = requests.get(f"{self.base_url}/api/tags", timeout=5)
            if resp.status_code == 200:
                data = resp.json()
                models = data.get("models", [])
                for m in models:
                    m_name = m.get("name") or m.get("model") or ""
                    # Skip embedding models
                    caps = m.get("capabilities", [])
                    if caps == ["embedding"] or "embed" in m_name.lower():
                        continue
                    if m_name:
                        return m_name
        except Exception:
            pass
        return None

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

        # Enable constrained JSON grammar decoding if requested
        if kwargs.get("format") == "json" or kwargs.get("json_mode"):
            payload["format"] = "json"

        response = requests.post(
            f"{self.base_url}/api/chat",
            json=payload,
            timeout=600,  # CPU inference at ~11 tok/s can take 3-5 min on long prompts
        )

        # Handle model not found error gracefully by falling back to an installed model
        if response.status_code == 404:
            err_msg = ""
            try:
                err_data = response.json()
                err_msg = err_data.get("error", "")
            except Exception:
                pass

            if "not found" in err_msg.lower():
                fallback = self._find_installed_chat_model()
                if fallback and fallback != self.model:
                    logger.warning(
                        "Configured Ollama model '%s' not found (%s). Automatically falling back to installed model '%s'.",
                        self.model,
                        err_msg,
                        fallback,
                    )
                    self.model = fallback
                    payload["model"] = fallback
                    response = requests.post(
                        f"{self.base_url}/api/chat",
                        json=payload,
                        timeout=600,
                    )

        try:
            response.raise_for_status()
        except requests.HTTPError as exc:
            detail = ""
            try:
                err_json = response.json()
                if "error" in err_json:
                    detail = f" - {err_json['error']}"
            except Exception:
                detail = f" - {response.text[:200]}"
            raise requests.HTTPError(
                f"{exc}{detail} (Model: '{payload.get('model')}', URL: {response.url})",
                response=response,
            ) from exc

        data = response.json()
        # Ollama wraps the reply in data["message"]["content"]
        return data["message"]["content"]
