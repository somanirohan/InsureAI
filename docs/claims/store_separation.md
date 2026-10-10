# Vector Store Separation: Policy Chunks vs. Clause Index

This document records the vector store isolation architecture for InsureAI, ensuring policy chunks (used for general RAG Q&A), policy clause records (used for semantic matching & verification), and claim content never overlap, collide, or leak.

---

## 1. Current State Inventory

### 1.1 Existing Collection Naming & Schema
- **Collection Name**: Formatted as `policy_{clean_id}` where `clean_id = re.sub(r"[^a-zA-Z0-9_-]", "_", policy_id.strip())[:63]`.
- **Collection Metadata**: `{"policy_id": policy_id, "hnsw:space": "cosine"}`.
- **Record ID Scheme**: `"{policy_id}_{chunk_id}"` (e.g. `pol123_0`).
- **Record Metadata**: `{"policy_id": policy_id, "chunk_id": int, "page_number": int}`.
- **Embedding Provider**: `get_embedder()` (Ollama or API embedder configured via `settings.embedding_provider`).
- **Storage Location**: `settings.chroma_persist_dir` (`./chroma_store`).

### 1.2 Call Sites for ChromaDB Access
- `app/rag/vectorstore.py`:
  - `get_chroma_client()`: Returns singleton persistent client.
  - `get_policy_collection(policy_id)`: Calls `client.get_or_create_collection(name=f"policy_{clean_id}")`.
  - `index_chunks(policy_id, chunks)`: Upserts chunks into `policy_{clean_id}`.
  - `query_similar(policy_id, query, top_k)`: Queries `policy_{clean_id}`.
  - `delete_policy_index(policy_id)`: Deletes `policy_{clean_id}`.
- `server/services/policy_service.py`:
  - Calls `index_chunks` during background processing.
  - Calls `delete_policy_index` during policy cascade deletion and extraction cleanup.

---

## 2. Separation Architecture & Registry (`app/vectorstore/registry.py`)

To prevent any data leakage across scopes, `app/vectorstore/registry.py` is established as the **sole authority** for collection retrieval and naming:

### 2.1 Collection Segregation
1. **Policy Chunks (`get_policy_chunks_collection`)**:
   - Collection name: `policy_{clean_id}`
   - Purpose: General RAG Q&A chunk search (`app/rag/qa.py`).
   - Source type: `policy_chunk`.
   - ID format: `policy:{policy_id}:chunk:{chunk_id}`.
2. **Clause Index (`get_clause_index_collection`)**:
   - Collection name: `clauses_{clean_id}`
   - Purpose: Policy evidence matching and verification (`app/claims/semantic/`).
   - Source type: `policy_clause`.
   - ID format: `clause:{policy_id}:{clause_id}`.
3. **Claim Documents**:
   - **NEVER** stored or indexed in ChromaDB. Uploaded claim documents and line items live solely in MongoDB (`db.claims.documents`).
   - When a claim description is matched, it is embedded transiently in memory at query time and never persisted to ChromaDB.

### 2.2 Metadata & Validation Contract
On every record upserted:
- `source_type`: `"policy_chunk"` | `"policy_clause"`
- `policy_id`: Target policy ID string
- `user_id`: Owning user ID string (or `"system"` / empty if system-wide)
- `embedding_model`: Active model name from embedder
- `created_at`: ISO timestamp

On every query:
- The registry validates that the collection's stored `embedding_model` matches the active embedder model. A typed `EmbeddingModelMismatchError` is raised if they conflict.
- The returned records are strictly inspected to ensure `source_type` and `policy_id` match the requested scope. Any mismatched records are dropped and logged as security violations.

### 2.3 Idempotent Rebuild & Deletion Cascades
- `rebuild_clause_index(policy_id)` deletes only `clauses_{clean_id}` and recreates it.
- `delete_all_policy_vectorstores(policy_id)` deletes both `policy_{clean_id}` and `clauses_{clean_id}`.
- `server/services/policy_service.py` is hooked to call `delete_all_policy_vectorstores`.
