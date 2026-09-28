"""
Central configuration for the InsureAI RAG module.

All provider credentials, model names, and toggles are loaded from a .env file
via pydantic-settings.  No other module should read os.environ directly — they
should import `settings` from here so the source of truth stays in one place.
"""

from __future__ import annotations

from pathlib import Path
from typing import Literal
from pydantic_settings import BaseSettings, SettingsConfigDict

_ROOT_DIR = Path(__file__).resolve().parent.parent
_ROOT_ENV = str(_ROOT_DIR / ".env")
_SERVER_ENV = str(_ROOT_DIR / "server" / ".env")


class Settings(BaseSettings):
    """
    All knobs live here.  Add a field, update .env — nothing else changes.
    """

    model_config = SettingsConfigDict(
        env_file=(_ROOT_ENV, _SERVER_ENV, ".env", "server/.env"),
        env_file_encoding="utf-8",
        extra="ignore",        # silently ignore unknown keys from the server's .env
    )

    # ── LLM provider selection ────────────────────────────────────────────────
    # Set LLM_PROVIDER=ollama | openrouter | nvidia
    llm_provider: Literal["ollama", "openrouter", "nvidia"] = "ollama"

    # Ollama LLM
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "mistral:7b"

    # OpenRouter
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    openrouter_api_key: str = ""
    openrouter_model: str = "meta-llama/llama-3-8b-instruct"

    # NVIDIA NIM
    nvidia_base_url: str = "https://integrate.api.nvidia.com/v1"
    nvidia_api_key: str = ""
    nvidia_model: str = "meta/llama3-8b-instruct"

    # ── Embedding provider selection ──────────────────────────────────────────
    # Set EMBEDDING_PROVIDER=ollama | api
    embedding_provider: Literal["ollama", "api"] = "ollama"

    # Ollama embeddings
    ollama_embedding_model: str = "nomic-embed-text"

    # API-based embeddings (OpenAI-compatible; can be OpenRouter, NVIDIA, etc.)
    embedding_api_base_url: str = "https://api.openai.com/v1"
    embedding_api_key: str = ""
    embedding_api_model: str = "text-embedding-3-small"

    # ── Vector store ──────────────────────────────────────────────────────────
    # ChromaDB in embedded (local) mode — no separate server needed.
    # The directory will be created automatically on first write.
    chroma_persist_dir: str = "./chroma_store"

    # ── Chunking ─────────────────────────────────────────────────────────────
    chunk_size: int = 500          # target tokens per chunk (approximate)
    chunk_overlap: int = 80        # overlap between consecutive chunks

    # ── Retrieval ─────────────────────────────────────────────────────────────
    top_k: int = 5                 # how many chunks to surface per query

    # ── OCR ───────────────────────────────────────────────────────────────────
    # Minimum characters extracted from a page before we consider it "has text"
    # and skip the OCR fallback.
    ocr_text_threshold: int = 50

    # ── Router ────────────────────────────────────────────────────────────────
    # Cosine similarity threshold for routing questions to structured fields
    router_similarity_threshold: float = 0.75


# Module-level singleton — import this everywhere.
settings = Settings()
