"""
Central configuration for FastAPI server using pydantic-settings.
Unified with app/config.py settings.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any, List, Union
from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

try:
    from app.config import settings as app_settings
except ImportError:
    import sys
    from pathlib import Path
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
    from app.config import settings as app_settings


_ROOT_DIR = Path(__file__).resolve().parent.parent
_ROOT_ENV = str(_ROOT_DIR / ".env")
_SERVER_ENV = str(_ROOT_DIR / "server" / ".env")


class ServerSettings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(_ROOT_ENV, _SERVER_ENV, ".env", "server/.env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    PORT: int = 5001
    MONGO_URI: str = "mongodb+srv://rohanjagdishsomani_db_user:N62wBcWLZNdmGwN7@insurai.v3ucvhs.mongodb.net"
    MONGO_DB_NAME: str = "insurai"
    JWT_SECRET: str = "insureai_super_secret_jwt_key_2026_secure_key"
    JWT_EXPIRES_IN: str = "7d"
    CLIENT_URL: str = "http://localhost:5173"
    ALLOWED_ORIGINS: Union[list[str], str] = ["http://localhost:5173", "http://127.0.0.1:5173"]
    UPLOAD_DIR: str = "server/uploads"
    MAX_FILE_SIZE_MB: int = 25
    ENVIRONMENT: str = "development"

    @field_validator("ALLOWED_ORIGINS", mode="before")
    @classmethod
    def parse_allowed_origins(cls, v: Any) -> list[str]:
        if isinstance(v, str):
            return [orig.strip() for orig in v.split(",") if orig.strip()]
        if isinstance(v, list):
            return v
        return ["http://localhost:5173", "http://127.0.0.1:5173"]

    @property
    def chroma_persist_dir(self) -> str:
        return app_settings.chroma_persist_dir


settings = ServerSettings()
