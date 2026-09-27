import os
from urllib.parse import urlparse
from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import MongoClient
import logging

try:
    import certifi
    ca_file = certifi.where()
except Exception:
    ca_file = None

try:
    from config import settings
except ImportError:
    from server.config import settings

logger = logging.getLogger("medshield.db")

motor_client = None
db = None

sync_mongo_client = None
sync_db = None

def _extract_db_name(uri: str, default: str = "insurai") -> str:
    configured_default = getattr(settings, "MONGO_DB_NAME", default) or default
    if not uri:
        return configured_default
    try:
        clean_uri = uri.strip()
        parsed = urlparse(clean_uri)
        path = parsed.path.strip("/")
        if path:
            candidate = path.split("?")[0].strip()
            # Must be a valid MongoDB database name (no dots, no @, not empty)
            if candidate and "." not in candidate and "@" not in candidate and "/" not in candidate:
                return candidate
    except Exception:
        pass
    return configured_default

def _get_client_kwargs() -> dict:
    kwargs = {
        "serverSelectionTimeoutMS": 10000,
        "connectTimeoutMS": 10000,
        "socketTimeoutMS": 45000,
        "maxPoolSize": 50,
        "minPoolSize": 1,
        "retryWrites": True,
        "appName": "InsureAI"
    }
    if ca_file and os.path.exists(ca_file):
        kwargs["tlsCAFile"] = ca_file
    return kwargs

def get_async_client() -> AsyncIOMotorClient:
    global motor_client
    if motor_client is None:
        kwargs = _get_client_kwargs()
        uri = settings.MONGO_URI.strip()
        motor_client = AsyncIOMotorClient(uri, **kwargs)
    return motor_client

def get_async_db():
    global motor_client, db
    if db is None:
        client = get_async_client()
        db_name = _extract_db_name(settings.MONGO_URI, "insurai")
        db = client[db_name]
        logger.info(f"[MongoDB] Initialized Async connection to database: '{db_name}'")
    return db

def get_sync_client() -> MongoClient:
    global sync_mongo_client
    if sync_mongo_client is None:
        kwargs = _get_client_kwargs()
        uri = settings.MONGO_URI.strip()
        sync_mongo_client = MongoClient(uri, **kwargs)
    return sync_mongo_client

def get_sync_db():
    global sync_mongo_client, sync_db
    if sync_db is None:
        client = get_sync_client()
        db_name = _extract_db_name(settings.MONGO_URI, "insurai")
        sync_db = client[db_name]
        logger.info(f"[MongoDB] Initialized Sync connection to database: '{db_name}'")
    return sync_db

async def check_async_connection() -> tuple[bool, dict]:
    """Test the async MongoDB connection and return connectivity status and metadata."""
    try:
        client = get_async_client()
        ping_res = await client.admin.command("ping")
        database = get_async_db()
        collections = await database.list_collection_names()
        return True, {
            "status": "connected",
            "database": database.name,
            "collections_count": len(collections),
            "collections": collections,
            "ping": ping_res
        }
    except Exception as e:
        logger.error(f"[MongoDB] Async connection check failed: {e}")
        return False, {"status": "error", "error": str(e)}

def check_sync_connection() -> tuple[bool, dict]:
    """Test the sync MongoDB connection and return connectivity status and metadata."""
    try:
        client = get_sync_client()
        ping_res = client.admin.command("ping")
        database = get_sync_db()
        collections = database.list_collection_names()
        return True, {
            "status": "connected",
            "database": database.name,
            "collections_count": len(collections),
            "collections": collections,
            "ping": ping_res
        }
    except Exception as e:
        logger.error(f"[MongoDB] Sync connection check failed: {e}")
        return False, {"status": "error", "error": str(e)}

async def ensure_async_indexes(database=None):
    """Ensure all required collections have appropriate indexes."""
    if database is None:
        database = get_async_db()
    try:
        # Users indexes: unique email
        await database.users.create_index("email", unique=True)

        # Policies indexes: user_id, status, uploaded_at
        await database.policies.create_index([("user_id", 1), ("uploaded_at", -1)])
        await database.policies.create_index("status")

        # Policy chunks indexes
        await database.policy_chunks.create_index([("policy_id", 1), ("chunk_index", 1)])
        await database.policy_chunks.create_index("user_id")
        await database.policy_chunks.create_index("vector_id")

        # Conversations indexes
        await database.conversations.create_index([("user_id", 1), ("updated_at", -1)])
        await database.conversations.create_index("policy_id")

        # Cost estimates indexes
        await database.cost_estimates.create_index([("user_id", 1), ("created_at", -1)])
        await database.cost_estimates.create_index("policy_id")

        # Policy comparisons indexes
        await database.policy_comparisons.create_index([("user_id", 1), ("created_at", -1)])

        logger.info("[MongoDB] Verified all database indexes successfully")
    except Exception as e:
        logger.warning(f"[MongoDB] Note on index creation: {e}")

def ensure_sync_indexes(database=None):
    """Ensure all required collections have appropriate indexes synchronously."""
    if database is None:
        database = get_sync_db()
    try:
        database.users.create_index("email", unique=True)
        database.policies.create_index([("user_id", 1), ("uploaded_at", -1)])
        database.policies.create_index("status")
        database.policy_chunks.create_index([("policy_id", 1), ("chunk_index", 1)])
        database.policy_chunks.create_index("user_id")
        database.policy_chunks.create_index("vector_id")
        database.conversations.create_index([("user_id", 1), ("updated_at", -1)])
        database.conversations.create_index("policy_id")
        database.cost_estimates.create_index([("user_id", 1), ("created_at", -1)])
        database.cost_estimates.create_index("policy_id")
        database.policy_comparisons.create_index([("user_id", 1), ("created_at", -1)])
        logger.info("[MongoDB] Verified all sync database indexes successfully")
    except Exception as e:
        logger.warning(f"[MongoDB] Note on sync index creation: {e}")

async def close_db_connections():
    """Gracefully close both motor and sync mongo clients."""
    global motor_client, db, sync_mongo_client, sync_db
    if motor_client is not None:
        motor_client.close()
        motor_client = None
        db = None
        logger.info("[MongoDB] Closed Async Motor connection")
    if sync_mongo_client is not None:
        sync_mongo_client.close()
        sync_mongo_client = None
        sync_db = None
        logger.info("[MongoDB] Closed Sync MongoDB connection")

chroma_client = None
vector_collection = None

class MemoryVectorStoreFallback:
    def __init__(self):
        self.documents = []
        self.metadatas = []
        self.ids = []

    def add(self, ids, documents, metadatas):
        for i, doc_id in enumerate(ids):
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

            doc_lower = doc.lower()
            overlap = sum(1 for word in query_words if word in doc_lower)
            matched_indices.append((i, overlap))

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

    # 1. Try connecting to standalone ChromaDB HTTP service
    try:
        import chromadb
        chroma_client = chromadb.HttpClient(host=settings.CHROMA_HOST, port=settings.CHROMA_PORT)
        chroma_client.heartbeat()
        vector_collection = chroma_client.get_or_create_collection(settings.CHROMA_COLLECTION_NAME)
        logger.info(f"[ChromaDB] Connected to ChromaDB service at {settings.CHROMA_HOST}:{settings.CHROMA_PORT}")
        return vector_collection
    except Exception:
        pass

    # 2. Try persistent embedded ChromaDB client (local persistent disk storage)
    try:
        import chromadb
        persist_dir = getattr(settings, "CHROMA_PERSIST_DIR", "./chroma_store")
        os.makedirs(persist_dir, exist_ok=True)
        chroma_client = chromadb.PersistentClient(path=persist_dir)
        vector_collection = chroma_client.get_or_create_collection(settings.CHROMA_COLLECTION_NAME)
        logger.info(f"[ChromaDB] Connected to Persistent ChromaDB at {persist_dir}")
        return vector_collection
    except Exception as e:
        logger.warning(f"[ChromaDB] Persistent ChromaDB initialization failed ({e}). Falling back to In-Memory store.")

    # 3. Fallback to in-memory store
    vector_collection = MemoryVectorStoreFallback()
    return vector_collection
