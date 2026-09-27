"""
LLM provider factory.

The ONLY place in the codebase that imports concrete provider classes.
Every other module calls get_llm() and receives an LLMProvider — it never
needs to know which backend is active.  Switching providers = change one
env var, restart, done.
"""

from __future__ import annotations

from app.config import settings
from app.llm.base import LLMProvider


def get_llm() -> LLMProvider:
    """
    Read LLM_PROVIDER from settings and return the appropriate provider.

    Raises:
        ValueError: If the configured provider name is unknown (typo guard).
    """
    provider = settings.llm_provider

    if provider == "ollama":
        from app.llm.ollama_provider import OllamaProvider
        return OllamaProvider()

    if provider == "openrouter":
        from app.llm.openai_compatible_provider import OpenAICompatibleProvider
        return OpenAICompatibleProvider(
            base_url=settings.openrouter_base_url,
            api_key=settings.openrouter_api_key,
            model=settings.openrouter_model,
        )

    if provider == "nvidia":
        from app.llm.openai_compatible_provider import OpenAICompatibleProvider
        return OpenAICompatibleProvider(
            base_url=settings.nvidia_base_url,
            api_key=settings.nvidia_api_key,
            model=settings.nvidia_model,
        )

    raise ValueError(
        f"Unknown LLM_PROVIDER '{provider}'. "
        "Valid choices: ollama | openrouter | nvidia"
    )
