"""
[DEPRECATED] Old shared collection ChromaDB service.
Do not use in the active application.
All active vector indexing and retrieval must use app.rag.vectorstore:
  - index_chunks(policy_id, chunks)
  - query_similar(policy_id, query, top_k)
  - delete_policy_index(policy_id)
"""

import warnings
from typing import Any, Dict, List

warnings.warn(
    "server.services.chroma_service is deprecated. Use app.rag.vectorstore instead.",
    DeprecationWarning,
    stacklevel=2,
)


class ChromaService:
    def upsert_chunks(self, chunks: List[Dict[str, Any]]):
        raise NotImplementedError("Deprecated: Use app.rag.vectorstore.index_chunks instead.")

    def query_policy_chunks(self, user_id: str, policy_id: str, query_text: str, n_results: int = 5):
        raise NotImplementedError("Deprecated: Use app.rag.vectorstore.query_similar instead.")

    def delete_policy_vectors(self, user_id: str, policy_id: str):
        raise NotImplementedError("Deprecated: Use app.rag.vectorstore.delete_policy_index instead.")


chroma_service = ChromaService()
