# InsureAI — AI-Powered Health Insurance Policy Intelligence Assistant

InsureAI is a full-stack AI-driven web application built with **React**, **Tailwind CSS**, **FastAPI (Python 3.11)**, **MongoDB**, and **Advanced persistent ChromaDB**. It allows users to upload health insurance policy PDFs and receive grounded AI assistance: automated structured fact extraction, red-flag detection, citation-backed natural-language Q&A, multi-policy comparisons, and treatment cost estimation with what-if scenario simulations.

---

## 🏗️ System Architecture

```
                          ┌──────────────────────────────────────────────┐
                          │              React + Tailwind CSS            │
                          │        (Dashboard, Chat, Cost, Compare)      │
                          └──────────────────────┬───────────────────────┘
                                                 │ REST API + WebSocket (/api/chat/ws)
                                                 ▼
                          ┌──────────────────────────────────────────────┐
                          │          FastAPI Backend (:5001)             │
                          │   (Auth, Document Pipeline, RAG, Cost, Comp) │
                          └──────────────┬───────────────────────────────┘
                                         │
                 ┌───────────────────────┴───────────────────────┐
                 │                                               │
                 ▼                                               ▼
  ┌───────────────────────────────┐               ┌───────────────────────────────┐
  │     MongoDB (Application DB)  │               │   Advanced RAG Engine (app/)  │
  │  - users (bcrypt auth)        │               │  - pdf_extract.py (PyMuPDF)   │
  │  - policies (+ facts array)   │               │  - chunking.py (Page-bound)   │
  │  - policy_chunks (metadata)   │               │  - extraction.py (3-pass LLM) │
  │  - conversations (+ messages) │               │  - router.py (Cosine router)  │
  │  - cost_estimates (+ variants)│               │  - verification.py (Quote ver)│
  │  - policy_comparisons         │               │  - confidence.py (Calibrated) │
  └───────────────────────────────┘               │  - qa.py (End-to-End Orchest) │
                                                  └──────────────┬────────────────┘
                                                                 │
                                                                 ▼
                                                  ┌───────────────────────────────┐
                                                  │  ChromaDB (Isolated Collections)
                                                  │  - policy_{policy_id}         │
                                                  │  - nomic-embed-text / API     │
                                                  │  - page numbers & chunk IDs   │
                                                  └───────────────────────────────┘
```

### Core Architecture Principles:
- **FastAPI is the only active backend:** All routing, authentication, request validation, and persistence orchestrate through FastAPI under `server/`.
- **`app/` is the authoritative RAG engine:** All PDF ingestion, chunking, 3-pass LLM extraction, vector routing, ChromaDB querying, answer drafting, and self-verification logic reside solely in `app/`. No duplicate RAG or vector retrieval code exists in FastAPI.
- **Zero Hallucination Guarantee:** Policy facts come exclusively from the uploaded PDF content. No fake values, no hardcoded defaults, and no filename-based guessing.
- **Isolated Vector Collections:** Every uploaded policy receives its own dedicated ChromaDB collection (`policy_{policy_id}`), preventing cross-policy and cross-tenant retrieval contamination.
- **Reliable Processing Lifecycle:** Policies transition strictly through `uploading` $\rightarrow$ `extracting` $\rightarrow$ `ready`. If extraction or indexing encounters any error, the policy status transitions to `failed` with an explicit `processing_error`. Failed policies cannot be marked ready and cannot be queried.

---

## 🗄️ Database Schemas & Data Model

The data layer uses **MongoDB** as the system of record and **ChromaDB** as the isolated semantic vector store.

### 1. MongoDB Collections (6 Collections)

| Collection | Model / Location | Storage Strategy | Key Indexes |
|---|---|---|---|
| `users` | [`server/models/user.py`](file:///Users/palak/InsureAI/server/models/user.py) | Primary account collection (bcrypt password hashes) | Unique index on `email` |
| `policies` | [`server/models/policy.py`](file:///Users/palak/InsureAI/server/models/policy.py) | Policy records + embedded extracted `facts` array | `user_id`, `status` |
| `policy_chunks` | Managed in policy service | Text chunks referencing policy and vector store | `policy_id`, `user_id`, compound unique `(policy_id, chunk_index)` |
| `conversations` | [`server/models/chat.py`](file:///Users/palak/InsureAI/server/models/chat.py) | Chat sessions + embedded `messages` array with citations | `user_id`, `updated_at` |
| `cost_estimates` | [`server/models/cost.py`](file:///Users/palak/InsureAI/server/models/cost.py) | Base estimates + embedded `what_if_variants` array | `user_id`, `created_at` |
| `policy_comparisons`| [`server/models/comparison.py`](file:///Users/palak/InsureAI/server/models/comparison.py)| Multi-policy diff snapshots | `user_id` |

#### MongoDB Facts Schema (`policies.facts`):
- `fact_id` (UUID)
- `category` (`sum_insured`, `room_rent_limit`, `co_payment`, `deductible`, `waiting_period`, `exclusion`, `claim_condition`)
- `fact_key` (Stable key e.g. `sum_insured`, `room_rent_limit`, `waiting_period_1`)
- `fact_value` (Exact extracted text value from policy)
- `fact_value_numeric` (Reliably parsed number for cost engine calculations; preserves explicit `0.0` for 0% co-pay)
- `unit` (`INR`, `%`, `days`, `months`)
- `source_page` & `source_section` (Traceability back to physical PDF page)
- `extraction_confidence` (`high`, `medium`, `low`)

---

## ⚡ API & WebSocket Contracts

### REST Endpoints:
- `POST /api/auth/register` — Register account with bcrypt hash
- `POST /api/auth/login` — Login & receive JWT access token
- `GET /api/auth/me` — Authenticated user profile (never returns `password_hash`)
- `POST /api/policies/upload` — Upload policy PDF with MIME/size validation
- `GET /api/policies` — List user policies
- `GET /api/policies/{policy_id}` — Get policy status and extracted facts
- `DELETE /api/policies/{policy_id}` — Cascade delete policy, chunks, and Chroma vector collection
- `POST /api/chat/message` — REST Q&A endpoint powered by `app.rag`
- `GET /api/chat/conversations` — User conversations list
- `POST /api/cost/estimate` — Request-driven medical cost breakdown
- `POST /api/cost/estimate/{id}/what-if` — What-if simulation preserving original room rent & stay days
- `POST /api/comparisons` — Compare 2+ policies
- `GET /api/health` — Health check verifying MongoDB connectivity

### Chat REST & WebSocket Response Contract:

Both `POST /api/chat/message` and WebSocket `/api/chat/ws` return the standardized RAG response:

```json
{
  "query_type": "structured",
  "answer": "The Sum Insured under this policy is **INR 10,00,000** (found on Page 2).",
  "plain_language": "In simple terms: The Sum Insured under this policy is INR 10,00,000 (found on Page 2).",
  "confidence_level": "high",
  "verification_passed": true,
  "verification_notes": "Authoritative policy fact extracted from document schedule.",
  "citations": [
    {
      "policy_id": "673f8b0e7c5a2b1f8e9a0123",
      "chunk_vector_id": "673f8b0e7c5a2b1f8e9a0123_0",
      "page_number": 2,
      "section_heading": null,
      "excerpt": "Sum Insured: INR 10,00,000"
    }
  ]
}
```

- **Confidence Mapping:** Lowercase API standard (`"high"`, `"medium"`, `"low"`).
- **Verification:** Evaluated against `verification_status` (`"fully_supported"` and `"partially_supported"` $\rightarrow$ `true`; `"unsupported"` or missing $\rightarrow$ `false`; structured $\rightarrow$ `true`).
- **Citation Metadata:** Authentic metadata only (physical `page_number`, `chunk_vector_id`, `excerpt`, and `section_heading` if genuinely supplied). No fabricated section headings.

### Canonical WebSocket Endpoint:
- **URL:** `ws://localhost:5001/api/chat/ws`

**Client message format:**
```json
{
  "token": "<jwt>",
  "question": "What is my room rent limit per day?",
  "policy_id": "6ab979ce4023234b0c5ae4cf",
  "conversation_id": null,
  "plain_language_mode": false
}
```

**Server event sequence:**
1. `{"type": "connected"}`
2. `{"type": "status", "message": "Consulting policy intelligence engine..."}`
3. `{"type": "chunk", "token": "The "}` ... (streamed token by token)
4. `{"type": "complete", "query_type": "structured", "confidence_level": "high", "verification_passed": true, "verification_notes": "...", "citations": [...], "plain_language": "..."}`

---

## 🚀 Quick Start & Running Tests

### Prerequisites:
- Python 3.11+
- Node.js 18+
- MongoDB running on `mongodb://127.0.0.1:27017/medshield`
- Ollama running locally on `http://localhost:11434` with `mistral:7b` and `nomic-embed-text` (or API keys in `.env`)
- Tesseract OCR (optional fallback for scanned PDFs)

### 1. Environment Configuration:
Create `.env` in the project root:
```env
PORT=5001
MONGO_URI=mongodb://127.0.0.1:27017/medshield
JWT_SECRET=insureai_super_secret_jwt_key_2026_secure_key
JWT_EXPIRES_IN=7d
CLIENT_URL=http://localhost:5173
ALLOWED_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
UPLOAD_DIR=server/uploads

LLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=mistral:7b

EMBEDDING_PROVIDER=ollama
OLLAMA_EMBEDDING_MODEL=nomic-embed-text
CHROMA_PERSIST_DIR=./chroma_store
```

### 2. Seed Demo Data:
```bash
# Populate MongoDB with demo policies, realistic facts, and indexed Chroma vectors:
python3.11 server/utils/seeder.py
```
**Default Demo Credentials:**
- Email: `demo@medshield.ai`
- Password: `password123`

### 3. Run the Test Suites:
```bash
# Run all unit test suites (fast, mocked DB & RAG, runs in ~2s with no external services required):
python3.11 -m pytest server/tests/test_unit_rag_adapter.py \
                     server/tests/test_unit_fact_mapper.py \
                     server/tests/test_unit_cost.py \
                     server/tests/test_unit_object_id_and_db.py \
                     server/tests/test_unit_vectorstore.py \
                     server/tests/test_unit_processing_failure.py -v

# Or run all unit tests in one command:
python3.11 -m pytest server/tests/ -k "not test_full_application_lifecycle" -v

# Run the complete end-to-end integration lifecycle test (19 steps against live MongoDB & RAG):
python3.11 -m pytest server/tests/test_integration_flow.py -v
```

### 4. Run Development Servers:

**Option A — One-Command Startup (Recommended):**
```bash
./run.sh
```
This automatically verifies MongoDB and Ollama connectivity and launches both the FastAPI backend (`:5001`) and Vite React frontend (`:5173`). Press `Ctrl+C` to stop both.

**Option B — Run in Separate Terminals:**
```bash
# Terminal 1: FastAPI Backend
python3.11 server/main.py

# Terminal 2: React Frontend
cd client
npm run dev
```

- **Frontend Application:** `http://localhost:5173`
- **Backend API:** `http://localhost:5001`
- **Swagger Interactive API Docs:** `http://localhost:5001/docs`
- **Health Check Endpoint:** `http://localhost:5001/api/health`

