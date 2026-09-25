from typing import List, Dict, Any, Optional
from datetime import datetime
from fastapi_server.db import get_vector_collection
import logging

logger = logging.getLogger("medshield.chroma")

class ChromaService:
    def upsert_chunks(self, chunks: List[Dict[str, Any]]):
        if not chunks:
            return

        collection = get_vector_collection()
        ids = [str(c["vector_id"]) for c in chunks]
        documents = [c["chunk_text"] for c in chunks]
        metadatas = [
            {
                "user_id": str(c["user_id"]),
                "policy_id": str(c["policy_id"]),
                "chunk_index": int(c.get("chunk_index", 0)),
                "page_number": int(c.get("page_number", 0)),
                "section_heading": c.get("section_heading", "General Terms"),
                "insurer_name": c.get("insurer_name", ""),
                "policy_type": c.get("policy_type", ""),
                "created_at": datetime.utcnow().isoformat()
            }
            for c in chunks
        ]

        collection.add(ids=ids, documents=documents, metadatas=metadatas)
        logger.info(f"[ChromaService] Indexed {len(chunks)} chunks into vector store")

    def query_policy_chunks(self, user_id: str, policy_id: Optional[Any], query_text: str, n_results: int = 5) -> List[Dict[str, Any]]:
        collection = get_vector_collection()

        where_filter = {
            "user_id": str(user_id)
        }

        if policy_id:
            if isinstance(policy_id, list):
                where_filter["policy_id"] = {"$in": [str(pid) for pid in policy_id]}
            else:
                where_filter["policy_id"] = str(policy_id)

        try:
            results = collection.query(
                query_texts=[query_text],
                n_results=n_results,
                where=where_filter
            )

            formatted = []
            if results and results.get("ids") and results["ids"][0]:
                for i in range(len(results["ids"][0])):
                    formatted.append({
                        "vector_id": results["ids"][0][i],
                        "chunk_text": results["documents"][0][i],
                        "metadata": results["metadatas"][0][i],
                        "distance": results["distances"][0][i] if "distances" in results and results["distances"] else None
                    })

            return formatted
        except Exception as e:
            logger.error(f"[ChromaService] Vector query error: {e}")
            return []

    def delete_policy_vectors(self, user_id: str, policy_id: str):
        collection = get_vector_collection()
        try:
            collection.delete(where={
                "user_id": str(user_id),
                "policy_id": str(policy_id)
            })
            logger.info(f"[ChromaService] Deleted vectors for policy {policy_id}")
        except Exception as e:
            logger.error(f"[ChromaService] Vector deletion error for policy {policy_id}: {e}")

chroma_service = ChromaService()
