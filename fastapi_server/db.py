import os
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import MongoClient
from fastapi_server.config import settings
import logging

logger = logging.getLogger("medshield.db")

# Async Motor Client for FastAPI endpoints
motor_client = None
db = None

# Sync MongoClient for scripts/seeder
sync_mongo_client = None
sync_db = None

def get_async_db():
    global motor_client, db
    if db is None:
        motor_client = AsyncIOMotorClient(settings.MONGO_URI)
        # Extract database name from URI or fallback to medshield
        db_name = settings.MONGO_URI.split("/")[-1].split("?")[0] or "medshield"
        db = motor_client[db_name]
        logger.info(f"Connected to Async MongoDB: {db_name}")
    return db

def get_sync_db():
    global sync_mongo_client, sync_db
    if sync_db is None:
        sync_mongo_client = MongoClient(settings.MONGO_URI)
        db_name = settings.MONGO_URI.split("/")[-1].split("?")[0] or "medshield"
        sync_db = sync_mongo_client[db_name]
    return sync_db

# ChromaDB Initialization with In-Memory Fallback
chroma_client = None
vector_collection = None

class MemoryVectorStoreFallback:
    """In-memory vector store fallback when standalone ChromaDB is not active"""
    def __init__(self):
        self.documents = []
        self.metadatas = []
        self.ids = []

    def add(self, ids, documents, metadatas):
        for i, doc_id in enumerate(ids):
            # Update existing or append
            if doc_id in self.ids:
                idx = self.ids.index(doc_id)
                self.documents[idx] = documents[i]
                self.metadatas[idx] = metadatas[i]
            else:
                self.ids.append(doc_id)
                self.documents.append(documents[i])
                self.metadatas.append(metadatas[i])
        logger.info(f"[ChromaFallback] In-Memory store indexed {len(ids)} chunks")

    def query(self, query_texts, n_results=5, where=None):
        query_text = (query_texts[0] if query_texts else "").lower()
        query_words = set(query_text.split())

        matched_indices = []
        for i, (doc, meta) in enumerate(zip(self.documents, self.metadatas)):
            # Apply metadata filters (user_id & policy_id data isolation)
            if where:
                match = True
                for k, v in where.items():
                    if isinstance(v, dict) and "$in" in v:
                        if str(meta.get(k)) not in v["$in"]:
                            match = False
                            break
                    elif str(meta.get(k)) != str(v):
                        match = False
                        break
                if not match:
                    continue

            # Calculate keyword similarity score
            doc_lower = doc.lower()
            overlap = sum(1 for word in query_words if word in doc_lower)
            matched_indices.append((i, overlap))

        # Sort by overlap score descending
        matched_indices.sort(key=lambda x: x[1], reverse=True)
        top_indices = [idx for idx, score in matched_indices[:n_results]]

        res_ids = [self.ids[i] for i in top_indices]
        res_docs = [self.documents[i] for i in top_indices]
        res_metas = [self.metadatas[i] for i in top_indices]

        return {
            "ids": [res_ids],
            "documents": [res_docs],
            "metadatas": [res_metas],
            "distances": [[0.1 * i for i in range(len(res_ids))]]
        }

    def delete(self, where=None):
        if not where:
            return
        user_id = str(where.get("user_id", ""))
        policy_id = str(where.get("policy_id", ""))

        indices_to_remove = []
        for i, meta in enumerate(self.metadatas):
            if str(meta.get("user_id")) == user_id and str(meta.get("policy_id")) == policy_id:
                indices_to_remove.append(i)

        for i in reversed(indices_to_remove):
            del self.ids[i]
            del self.documents[i]
            del self.metadatas[i]
        logger.info(f"[ChromaFallback] Deleted {len(indices_to_remove)} vectors for policy {policy_id}")

def get_vector_collection():
    global chroma_client, vector_collection
    if vector_collection is not None:
        return vector_collection

    try:
        import chromadb
        chroma_client = chromadb.HttpClient(host=settings.CHROMA_HOST, port=settings.CHROMA_PORT)
        vector_collection = chroma_client.get_or_create_collection(settings.CHROMA_COLLECTION_NAME)
        logger.info(f"[ChromaDB] Connected to ChromaDB at {settings.CHROMA_HOST}:{settings.CHROMA_PORT}")
    except Exception as e:
        logger.warning(f"[ChromaDB] Standalone ChromaDB connection failed ({e}). Using MemoryVectorStoreFallback.")
        vector_collection = MemoryVectorStoreFallback()

    return vector_collection
