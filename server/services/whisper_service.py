"""
Whisper AI transcription service for InsureAI.
Uses Groq Whisper (whisper-large-v3-turbo) or OpenAI Whisper
for ultra-fast, highly accurate cloud speech-to-text.
"""

from __future__ import annotations

import os
import logging
from typing import Optional
from openai import OpenAI

logger = logging.getLogger("insureai.whisper")


class WhisperService:
    def __init__(self):
        self._cached_client: Optional[OpenAI] = None
        self._cached_model: Optional[str] = None

    def get_client_and_model(self) -> tuple[OpenAI, str]:
        """
        Returns a cached, connection-pooled OpenAI client and model name.
        Reusing the client avoids creating new TCP/SSL handshakes on every request,
        cutting latency by up to 80%.
        """
        if self._cached_client and self._cached_model:
            return self._cached_client, self._cached_model

        groq_api_key = os.getenv("GROQ_API_KEY", "")
        if not groq_api_key:
            try:
                from app.config import settings as app_settings
                groq_api_key = getattr(app_settings, "groq_api_key", "")
            except Exception:
                pass

        import httpx

        http_client = httpx.Client(
            limits=httpx.Limits(max_keepalive_connections=20, max_connections=50, keepalive_expiry=60.0),
            timeout=httpx.Timeout(15.0, connect=5.0),
        )

        if groq_api_key:
            self._cached_client = OpenAI(
                base_url="https://api.groq.com/openai/v1",
                api_key=groq_api_key,
                http_client=http_client,
                max_retries=1,
            )
            self._cached_model = "whisper-large-v3-turbo"
            return self._cached_client, self._cached_model

        openai_api_key = os.getenv("OPENAI_API_KEY", "")
        if openai_api_key:
            self._cached_client = OpenAI(
                api_key=openai_api_key,
                http_client=http_client,
                max_retries=1,
            )
            self._cached_model = "whisper-1"
            return self._cached_client, self._cached_model

        raise ValueError(
            "No Whisper API provider configured. Please ensure GROQ_API_KEY is set in your .env file."
        )

    def transcribe(
        self,
        audio_bytes: bytes,
        filename: str = "audio.webm",
        content_type: str = "audio/webm",
        language: Optional[str] = None,
        prompt: Optional[str] = None,
    ) -> str:
        """
        Transcribe audio bytes using Whisper AI with optimized low-latency settings.
        """
        if not audio_bytes or len(audio_bytes) < 100:
            raise ValueError("Audio recording is too short or empty. Please speak clearly.")

        client, model = self.get_client_and_model()

        # Concise prompt keeps Whisper decoder fast
        insurance_prompt = prompt or "Health insurance query: sum insured, copay, deductible, exclusions, claims."

        create_kwargs = {
            "file": (filename, audio_bytes, content_type),
            "model": model,
            "prompt": insurance_prompt,
            "response_format": "json",
            "temperature": 0.0,
        }

        # Language code (e.g., 'en', 'hi')
        if language and language not in ("auto", "all", ""):
            lang_code = language.split("-")[0].lower()
            create_kwargs["language"] = lang_code

        logger.info("Calling Whisper API (%s) on %d bytes of audio...", model, len(audio_bytes))
        response = client.audio.transcriptions.create(**create_kwargs)
        transcribed_text = (response.text or "").strip()
        logger.info("Whisper transcription completed: '%s'", transcribed_text)
        return transcribed_text


whisper_service = WhisperService()

