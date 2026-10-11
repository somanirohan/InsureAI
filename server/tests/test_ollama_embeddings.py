"""
Tests for OllamaEmbeddingProvider and the embedding factory.

Coverage
--------
1.  Batch embedding via /api/embed (primary endpoint)
2.  Single-text embedding via embed_one()
3.  /api/embeddings legacy endpoint compatibility fallback (404 on /api/embed)
4.  Timeout → raises requests.Timeout (propagated to caller)
5.  Connection failure → raises requests.ConnectionError (propagated to caller)
6.  factory.get_embedder() returns OllamaEmbeddingProvider when provider=ollama
7.  factory.get_embedder() raises ValueError for unknown provider
8.  ChromaDB fallback during index_chunks() when Ollama embedding fails
9.  ChromaDB fallback during query_similar() when Ollama embedding fails
10. Policy-specific vector isolation (chunks from policy A never appear in
    policy B results)
11. Claims clause retrieval works with both Ollama and ChromaDB fallback paths
"""

from __future__ import annotations

import logging
from typing import Any
from unittest.mock import MagicMock, patch

import pytest
import requests

# ── Fixtures ──────────────────────────────────────────────────────────────────

FAKE_VECTOR_768 = [0.1] * 768  # nomic-embed-text output dimension


def _make_embed_response(vectors: list[list[float]]) -> MagicMock:
    """Simulate a successful /api/embed response."""
    mock = MagicMock()
    mock.json.return_value = {"embeddings": vectors}
    mock.raise_for_status.return_value = None
    mock.status_code = 200
    return mock


def _make_embeddings_response(vector: list[float]) -> MagicMock:
    """Simulate a successful /api/embeddings response."""
    mock = MagicMock()
    mock.json.return_value = {"embedding": vector}
    mock.raise_for_status.return_value = None
    mock.status_code = 200
    return mock


def _make_404() -> requests.HTTPError:
    resp = MagicMock()
    resp.status_code = 404
    exc = requests.HTTPError(response=resp)
    return exc


# ── 1. Batch embedding via /api/embed ─────────────────────────────────────────

class TestBatchEmbedPrimaryEndpoint:
    def test_returns_one_vector_per_text(self):
        from app.embeddings.ollama_embeddings import OllamaEmbeddingProvider

        texts = ["hello world", "insurance policy", "claim settlement"]
        vectors = [FAKE_VECTOR_768[:] for _ in texts]

        with patch("requests.post", return_value=_make_embed_response(vectors)) as mock_post:
            provider = OllamaEmbeddingProvider(
                base_url="http://localhost:11434",
                model="nomic-embed-text",
                timeout=30,
            )
            result = provider.embed(texts)

        assert len(result) == 3
        assert result[0] == FAKE_VECTOR_768
        # Verify correct endpoint was called
        called_url = mock_post.call_args[0][0]
        assert called_url.endswith("/api/embed"), f"Expected /api/embed, got {called_url}"

    def test_preserves_input_ordering(self):
        from app.embeddings.ollama_embeddings import OllamaEmbeddingProvider

        texts = ["first", "second", "third"]
        vectors = [[float(i)] * 4 for i in range(3)]

        with patch("requests.post", return_value=_make_embed_response(vectors)):
            provider = OllamaEmbeddingProvider(base_url="http://localhost:11434")
            result = provider.embed(texts)

        for i, vec in enumerate(result):
            assert vec[0] == float(i), f"Vector at index {i} has wrong value"

    def test_empty_input_returns_empty_list(self):
        from app.embeddings.ollama_embeddings import OllamaEmbeddingProvider

        with patch("requests.post") as mock_post:
            provider = OllamaEmbeddingProvider(base_url="http://localhost:11434")
            result = provider.embed([])

        assert result == []
        mock_post.assert_not_called()


# ── 2. Single-text embed_one ──────────────────────────────────────────────────

class TestEmbedOne:
    def test_embed_one_returns_single_vector(self):
        from app.embeddings.ollama_embeddings import OllamaEmbeddingProvider

        with patch("requests.post", return_value=_make_embed_response([FAKE_VECTOR_768])):
            provider = OllamaEmbeddingProvider(base_url="http://localhost:11434")
            result = provider.embed_one("what is my sum insured?")

        assert isinstance(result, list)
        assert len(result) == 768

    def test_embed_one_legacy_path_skips_new_api(self):
        """When legacy endpoint is known, embed_one goes straight to /api/embeddings."""
        from app.embeddings.ollama_embeddings import OllamaEmbeddingProvider

        provider = OllamaEmbeddingProvider(base_url="http://localhost:11434")
        provider._use_legacy_endpoint = True  # force legacy path

        with patch("requests.post", return_value=_make_embeddings_response(FAKE_VECTOR_768)) as mock_post:
            result = provider.embed_one("single text")

        assert result == FAKE_VECTOR_768
        called_url = mock_post.call_args[0][0]
        assert called_url.endswith("/api/embeddings"), f"Expected legacy endpoint, got {called_url}"


# ── 3. Legacy /api/embeddings compatibility fallback ─────────────────────────

class TestLegacyEndpointFallback:
    def test_falls_back_to_legacy_on_404(self, caplog):
        from app.embeddings.ollama_embeddings import OllamaEmbeddingProvider

        texts = ["text one", "text two"]
        vectors = [FAKE_VECTOR_768[:] for _ in texts]

        call_count = {"n": 0}

        def side_effect(url: str, **kwargs: Any) -> MagicMock:
            call_count["n"] += 1
            if url.endswith("/api/embed"):
                raise _make_404()
            # /api/embeddings — return one vector at a time
            return _make_embeddings_response(vectors[call_count["n"] - 2])

        with caplog.at_level(logging.WARNING, logger="app.embeddings.ollama_embeddings"):
            with patch("requests.post", side_effect=side_effect):
                provider = OllamaEmbeddingProvider(base_url="http://localhost:11434")
                result = provider.embed(texts)

        assert len(result) == 2
        assert "fallback" in caplog.text.lower() or "api/embeddings" in caplog.text

    def test_legacy_flag_set_after_404(self):
        """After the first 404, subsequent calls skip /api/embed."""
        from app.embeddings.ollama_embeddings import OllamaEmbeddingProvider

        provider = OllamaEmbeddingProvider(base_url="http://localhost:11434")
        assert provider._use_legacy_endpoint is None

        def side_effect(url: str, **kwargs: Any) -> MagicMock:
            if url.endswith("/api/embed"):
                raise _make_404()
            return _make_embeddings_response(FAKE_VECTOR_768)

        with patch("requests.post", side_effect=side_effect):
            provider.embed(["text"])

        assert provider._use_legacy_endpoint is True

        # Second call: should NOT try /api/embed at all
        with patch("requests.post", return_value=_make_embeddings_response(FAKE_VECTOR_768)) as mock_post:
            provider.embed(["text2"])

        for call in mock_post.call_args_list:
            called_url: str = call[0][0]
            # Must be the legacy endpoint (/api/embeddings), NOT the new /api/embed
            assert called_url.endswith("/api/embeddings"), (
                f"Expected /api/embeddings (legacy), got {called_url}"
            )


# ── 4. Timeout propagation ────────────────────────────────────────────────────

class TestTimeoutHandling:
    def test_timeout_raises(self):
        from app.embeddings.ollama_embeddings import OllamaEmbeddingProvider

        with patch("requests.post", side_effect=requests.Timeout("timed out")):
            provider = OllamaEmbeddingProvider(base_url="http://localhost:11434", timeout=1)
            with pytest.raises(requests.Timeout):
                provider.embed(["test"])

    def test_timeout_value_passed_to_requests(self):
        from app.embeddings.ollama_embeddings import OllamaEmbeddingProvider

        with patch("requests.post", return_value=_make_embed_response([FAKE_VECTOR_768])) as mock_post:
            provider = OllamaEmbeddingProvider(base_url="http://localhost:11434", timeout=15)
            provider.embed(["test"])

        _, kwargs = mock_post.call_args
        assert kwargs.get("timeout") == 15


# ── 5. Connection failure propagation ────────────────────────────────────────

class TestConnectionFailure:
    def test_connection_error_raises(self):
        from app.embeddings.ollama_embeddings import OllamaEmbeddingProvider

        with patch("requests.post", side_effect=requests.ConnectionError("refused")):
            provider = OllamaEmbeddingProvider(base_url="http://localhost:11434")
            with pytest.raises(requests.ConnectionError):
                provider.embed(["test"])


# ── 6. Factory returns OllamaEmbeddingProvider ───────────────────────────────

class TestFactory:
    def test_factory_returns_ollama_provider_when_ollama(self, monkeypatch):
        from app.embeddings.ollama_embeddings import OllamaEmbeddingProvider
        import app.config as cfg_module

        monkeypatch.setattr(cfg_module.settings, "embedding_provider", "ollama")

        from app.embeddings import factory as fac
        import importlib
        importlib.reload(fac)  # force re-read of settings

        # Re-import after reload
        from app.embeddings.factory import get_embedder
        provider = get_embedder()
        assert isinstance(provider, OllamaEmbeddingProvider)

    def test_factory_raises_for_unknown_provider(self, monkeypatch):
        import app.config as cfg_module

        monkeypatch.setattr(cfg_module.settings, "embedding_provider", "unknown_xyz")  # type: ignore[attr-defined]

        from app.embeddings.factory import get_embedder
        with pytest.raises(ValueError, match="Unknown EMBEDDING_PROVIDER"):
            get_embedder()


# ── 7. ChromaDB fallback during index_chunks ─────────────────────────────────

class TestChromaFallbackIndexing:
    def test_index_falls_back_to_chroma_when_ollama_fails(self, caplog):
        """When Ollama embedding raises, index_chunks uses Chroma without embeddings arg."""
        from app.ingestion.chunking import Chunk

        dummy_chunks = [
            Chunk(chunk_id=0, page_number=1, text="Waiting period is 30 days."),
            Chunk(chunk_id=1, page_number=2, text="Room rent is limited to 1%."),
        ]

        mock_collection = MagicMock()
        mock_embedder = MagicMock()
        mock_embedder.embed.side_effect = requests.ConnectionError("Ollama not running")

        with patch("app.rag.vectorstore.get_policy_collection", return_value=mock_collection), \
             patch("app.rag.vectorstore.get_embedder", return_value=mock_embedder), \
             patch("app.rag.vectorstore.get_active_embedding_model_name", return_value="nomic-embed-text"), \
             caplog.at_level(logging.WARNING, logger="app.rag.vectorstore"):

            from app.rag.vectorstore import index_chunks
            count = index_chunks("policy_test_fallback", dummy_chunks)

        assert count == 2
        # Chroma upsert must be called WITHOUT embeddings= when falling back
        upsert_call = mock_collection.upsert.call_args
        assert "embeddings" not in (upsert_call.kwargs if upsert_call.kwargs else {})
        assert "Chroma built-in" in caplog.text or "fallback" in caplog.text.lower()

    def test_index_uses_ollama_when_available(self):
        from app.ingestion.chunking import Chunk

        dummy_chunks = [Chunk(chunk_id=0, page_number=1, text="Sum insured is 5 lakh.")]
        mock_collection = MagicMock()
        mock_embedder = MagicMock()
        mock_embedder.embed.return_value = [FAKE_VECTOR_768]

        with patch("app.rag.vectorstore.get_policy_collection", return_value=mock_collection), \
             patch("app.rag.vectorstore.get_embedder", return_value=mock_embedder), \
             patch("app.rag.vectorstore.get_active_embedding_model_name", return_value="nomic-embed-text"):

            from app.rag.vectorstore import index_chunks
            count = index_chunks("policy_test_ollama", dummy_chunks)

        assert count == 1
        upsert_call = mock_collection.upsert.call_args
        # Ollama path: embeddings MUST be passed
        upsert_kwargs = upsert_call.kwargs if upsert_call.kwargs else {}
        assert "embeddings" in upsert_kwargs
        assert upsert_kwargs["embeddings"] == [FAKE_VECTOR_768]


# ── 8. ChromaDB fallback during query_similar ────────────────────────────────

class TestChromaFallbackRetrieval:
    def _make_chroma_results(self) -> dict:
        return {
            "documents": [["Claim must be submitted within 30 days."]],
            "metadatas": [[{
                "source_type": "policy_chunk",
                "policy_id": "policy_retrieval_test",
                "chunk_id": 0,
                "page_number": 3,
            }]],
            "distances": [[0.15]],
        }

    def test_query_falls_back_to_query_texts_when_ollama_fails(self, caplog):
        mock_collection = MagicMock()
        mock_collection.count.return_value = 5
        mock_collection.query.return_value = self._make_chroma_results()

        mock_embedder = MagicMock()
        mock_embedder.embed_one.side_effect = requests.ConnectionError("Ollama down")

        with patch("app.rag.vectorstore.get_policy_collection", return_value=mock_collection), \
             patch("app.rag.vectorstore.get_embedder", return_value=mock_embedder), \
             patch("app.rag.vectorstore.validate_retrieved_records", return_value={
                 "documents": ["Claim must be submitted within 30 days."],
                 "metadatas": [{"source_type": "policy_chunk", "policy_id": "policy_retrieval_test",
                                "chunk_id": 0, "page_number": 3}],
                 "distances": [0.15],
             }), \
             caplog.at_level(logging.WARNING, logger="app.rag.vectorstore"):

            from app.rag.vectorstore import query_similar
            results = query_similar("policy_retrieval_test", "claim submission deadline")

        # query_texts fallback must have been used
        call_kwargs = mock_collection.query.call_args.kwargs
        assert "query_texts" in call_kwargs, "ChromaDB fallback should use query_texts"
        assert "query_embeddings" not in call_kwargs
        assert "fallback" in caplog.text.lower() or "query_texts" in caplog.text

    def test_query_uses_ollama_when_available(self):
        mock_collection = MagicMock()
        mock_collection.count.return_value = 5
        mock_collection.query.return_value = self._make_chroma_results()

        mock_embedder = MagicMock()
        mock_embedder.embed_one.return_value = FAKE_VECTOR_768

        with patch("app.rag.vectorstore.get_policy_collection", return_value=mock_collection), \
             patch("app.rag.vectorstore.get_embedder", return_value=mock_embedder), \
             patch("app.rag.vectorstore.validate_retrieved_records", return_value={
                 "documents": ["Claim must be submitted within 30 days."],
                 "metadatas": [{"source_type": "policy_chunk", "policy_id": "p1",
                                "chunk_id": 0, "page_number": 3}],
                 "distances": [0.15],
             }):

            from app.rag.vectorstore import query_similar
            results = query_similar("p1", "what is the claim period?")

        call_kwargs = mock_collection.query.call_args.kwargs
        assert "query_embeddings" in call_kwargs
        assert "query_texts" not in call_kwargs


# ── 9. Policy-specific vector isolation ──────────────────────────────────────

class TestPolicyIsolation:
    def test_query_only_hits_its_own_collection(self):
        """
        query_similar for policy A must NOT query policy B's collection.
        Verified by checking that get_policy_collection is called with the
        correct policy_id.
        """
        mock_collection = MagicMock()
        mock_collection.count.return_value = 3
        mock_collection.query.return_value = {
            "documents": [["Policy A text"]],
            "metadatas": [[{"source_type": "policy_chunk", "policy_id": "policy_A",
                            "chunk_id": 0, "page_number": 1}]],
            "distances": [[0.1]],
        }
        mock_embedder = MagicMock()
        mock_embedder.embed_one.return_value = FAKE_VECTOR_768

        with patch("app.rag.vectorstore.get_policy_collection", return_value=mock_collection) as mock_get_coll, \
             patch("app.rag.vectorstore.get_embedder", return_value=mock_embedder), \
             patch("app.rag.vectorstore.validate_retrieved_records", return_value={
                 "documents": ["Policy A text"],
                 "metadatas": [{"source_type": "policy_chunk", "policy_id": "policy_A",
                                "chunk_id": 0, "page_number": 1}],
                 "distances": [0.1],
             }):

            from app.rag.vectorstore import query_similar
            query_similar("policy_A", "sum insured")

        mock_get_coll.assert_called_once_with("policy_A")


# ── 10. Claims clause retrieval ───────────────────────────────────────────────

class TestClaimsClauseRetrieval:
    """
    Claims-specific semantic retrieval should work whether Ollama or
    ChromaDB fallback is active.  We verify the result set is non-empty
    and correctly formatted in both paths.
    """

    def _mock_chroma_results(self, policy_id: str) -> dict:
        return {
            "documents": [["All claims must be intimated within 24 hours of hospitalisation."]],
            "metadatas": [[{
                "source_type": "policy_chunk",
                "policy_id": policy_id,
                "chunk_id": 5,
                "page_number": 8,
            }]],
            "distances": [[0.08]],
        }

    def test_claims_retrieval_ollama_path(self):
        policy_id = "claims_policy"
        mock_collection = MagicMock()
        mock_collection.count.return_value = 10
        mock_collection.query.return_value = self._mock_chroma_results(policy_id)

        mock_embedder = MagicMock()
        mock_embedder.embed_one.return_value = FAKE_VECTOR_768

        with patch("app.rag.vectorstore.get_policy_collection", return_value=mock_collection), \
             patch("app.rag.vectorstore.get_embedder", return_value=mock_embedder), \
             patch("app.rag.vectorstore.validate_retrieved_records", return_value={
                 "documents": ["All claims must be intimated within 24 hours of hospitalisation."],
                 "metadatas": [{"source_type": "policy_chunk", "policy_id": policy_id,
                                "chunk_id": 5, "page_number": 8}],
                 "distances": [0.08],
             }):

            from app.rag.vectorstore import query_similar
            results = query_similar(policy_id, "claim intimation requirement")

        assert len(results) == 1
        assert results[0].page_number == 8
        assert results[0].similarity > 0.8

    def test_claims_retrieval_fallback_path(self):
        policy_id = "claims_policy_fallback"
        mock_collection = MagicMock()
        mock_collection.count.return_value = 10
        mock_collection.query.return_value = self._mock_chroma_results(policy_id)

        mock_embedder = MagicMock()
        mock_embedder.embed_one.side_effect = requests.ConnectionError("Ollama offline")

        with patch("app.rag.vectorstore.get_policy_collection", return_value=mock_collection), \
             patch("app.rag.vectorstore.get_embedder", return_value=mock_embedder), \
             patch("app.rag.vectorstore.validate_retrieved_records", return_value={
                 "documents": ["All claims must be intimated within 24 hours of hospitalisation."],
                 "metadatas": [{"source_type": "policy_chunk", "policy_id": policy_id,
                                "chunk_id": 5, "page_number": 8}],
                 "distances": [0.08],
             }):

            from app.rag.vectorstore import query_similar
            results = query_similar(policy_id, "claim intimation requirement")

        # Fallback: query_texts was used
        call_kwargs = mock_collection.query.call_args.kwargs
        assert "query_texts" in call_kwargs
        assert len(results) == 1
        assert results[0].page_number == 8
