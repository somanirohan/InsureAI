"""
Central configuration for the InsureAI RAG module.

All provider credentials, model names, and toggles are loaded from a .env file
via pydantic-settings.  No other module should read os.environ directly — they
should import `settings` from here so the source of truth stays in one place.
"""

from __future__ import annotations

from pathlib import Path
from typing import Literal, Optional
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
    # Set LLM_PROVIDER=groq | openrouter | nvidia
    llm_provider: Literal["groq", "openrouter", "nvidia"] = "groq"

    # Groq (Ultra-fast cloud inference, OpenAI-compatible)
    groq_base_url: str = "https://api.groq.com/openai/v1"
    groq_api_key: str = ""
    groq_model: str = "qwen/qwen3.8-27b"

    # OpenRouter
    openrouter_base_url: str = "https://openrouter.ai/api/v1"
    openrouter_api_key: str = ""
    openrouter_model: str = "meta-llama/llama-3-8b-instruct"

    # NVIDIA NIM
    nvidia_base_url: str = "https://integrate.api.nvidia.com/v1"
    nvidia_api_key: str = ""
    nvidia_model: str = "meta/llama3-8b-instruct"

    # ── Embedding provider selection ──────────────────────────────────────────
    # Set EMBEDDING_PROVIDER=ollama (primary, local embeddings)
    # ChromaDB built-in embeddings are used automatically as a fallback when
    # Ollama is unavailable (see app/rag/vectorstore.py).
    embedding_provider: Literal["ollama", "api"] = "ollama"

    # Ollama (local embeddings — primary provider)
    ollama_base_url: str = "http://localhost:11434"
    ollama_embedding_model: str = "nomic-embed-text"
    ollama_timeout_seconds: int = 30

    # ── Vector store ──────────────────────────────────────────────────────────
    # ChromaDB: local embedded directory or hosted remote instance (HttpClient/CloudClient)
    chroma_persist_dir: str = "./chroma_store"
    chroma_host: str = ""                # e.g. "my-chroma.onrender.com" or "localhost"
    chroma_port: Optional[int] = None    # e.g. 8000, 443
    chroma_ssl: bool = False             # Set to True for https:// hosted Chroma
    chroma_api_key: str = ""             # Optional Chroma auth token/header
    chroma_tenant: str = "default_tenant"
    chroma_database: str = "default_database"

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

    # ── Claims & Settlement ──────────────────────────────────────────────────
    # Absolute tolerance in Rupees for discrepancy between bill total and sum of line items
    line_item_sum_tolerance: float = 100.0


# Module-level singleton — import this everywhere.
settings = Settings()
