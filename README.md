# MedShield — AI-Powered Insurance Policy Intelligence Assistant

MedShield is a full-stack AI-driven web application built with **React**, **Tailwind CSS**, **FastAPI (Python)**, **MongoDB (Motor)**, and **ChromaDB**. It allows users to upload health insurance policy PDFs and receive grounded AI assistance: automated fact extraction, red-flag detection, citation-backed natural-language Q&A, multi-policy comparisons, and treatment cost estimation with what-if scenario simulations.

---

## 🏗️ Architecture Overview

```
                        ┌──────────────────────────────────────────────┐
                        │              React + Tailwind CSS            │
                        │        (Dashboard, Chat, Cost, Compare)      │
                        └──────────────────────┬───────────────────────┘
                                               │ REST API + WebSocket
                                               ▼
                        ┌──────────────────────────────────────────────┐
                        │          FastAPI Backend (:5001)             │
                        │    (JWT Auth, Policy Pipeline, RAG, Cost)    │
                        └──────────────┬───────────────────────────────┘
                                       │
                ┌──────────────────────┴──────────────────────┐
                ▼                                             ▼
┌───────────────────────────────┐             ┌───────────────────────────────┐
│     MongoDB (Motor Async)     │             │      ChromaDB (Vector Store)  │
│  - users                      │             │  - policy_chunks collection   │
│  - policies (+ embedded facts)│             │    • metadata.user_id         │
│  - policy_chunks              │             │    • metadata.policy_id       │
│  - conversations (+ messages) │             │    • metadata.page_number     │
│  - cost_estimates (+ variants)│             │    • metadata.section_heading │
│  - policy_comparisons         │             └───────────────────────────────┘
└───────────────────────────────┘
```

---

## 🗄️ Database Schemas & Data Model

The data layer uses **MongoDB** as the system of record and **ChromaDB** as the semantic vector store.

### 1. MongoDB Collections (6 Collections)

| Collection | Schema Model | Storage Strategy | Key Indexes |
|---|---|---|---|
| `users` | [`user.py`](file:///server/models/user.py) | Primary account collection | Unique index on `email` |
| `policies` | [`policy.py`](file:///server/models/policy.py) | Policy records + **embedded** `facts` array | `user_id`, `status`, `facts.category` |
| `policy_chunks` | Managed in policy service | Text chunks referencing policy and vector store | Compound unique `(policy_id, chunk_index)`, `vector_id`, `user_id` |
| `conversations` | [`chat.py`](file:///server/models/chat.py) | Chat sessions + **embedded** `messages` array with citations | `user_id`, `policy_id`, `updated_at` (desc) |
| `cost_estimates` | [`cost.py`](file:///server/models/cost.py) | Base estimates + **embedded** `what_if_variants` array | `user_id`, `policy_id`, `created_at` (desc) |
| `policy_comparisons`| [`comparison.py`](file:///server/models/comparison.py)| Multi-policy diff snapshots | `user_id` |

#### Embedded Facts Shape (`policies.facts`):
- `fact_id` (UUID)
- `category` (enum: `coverage_category`, `sum_insured`, `sub_limit`, `waiting_period`, `exclusion`, `room_rent_limit`, `co_payment`, `deductible`, `claim_condition`)
- `fact_key` (e.g. `room_rent_cap_per_day`)
- `fact_value` (normalized text value)
- `fact_value_numeric` (number for cost engine calculations)
- `unit` (`INR`, `%`, `days`, etc.)
- `source_page` & `source_section` (traceability back to original document)
- `extraction_confidence` (`high`, `medium`, `low`)

#### Embedded Messages Shape (`conversations.messages`):
- `message_id` (UUID)
- `role` (`user` / `assistant`)
- `content` (text)
- `query_type` (`structured` / `semantic` via [FR-09])
- `plain_language` (simplified variant via [FR-13])
- `confidence_level` (`high` / `medium` / `low` via [FR-12])
- `verification_passed` & `verification_notes` (FR-11 self-verification)
- `citations` (`[{ policy_id, chunk_vector_id, page_number, section_heading }]`)

---

## 🚀 Quick Start Guide

### Prerequisites
- **Python 3.10+**
- **Node.js** (v18+ or v20+ for React frontend)
- **MongoDB** running locally (`mongodb://127.0.0.1:27017/medshield`) or MongoDB Atlas URI

### 1. Install Dependencies
```bash
# Server & RAG dependencies
pip install -r server/requirements.txt

# Client dependencies
cd client && npm install
```

### 2. Seed Demo Data (Optional but Recommended)
Populates MongoDB with demo policies (Star Health Premier, HDFC ERGO Optima Secure), extracted facts, chunks, ChromaDB vectors, a chat conversation, and cost estimates:
```bash
npm run seed
```
Demo Credentials:
- **Email:** `demo@medshield.ai`
- **Password:** `password123`

### 3. Run the Development Servers
In separate terminals or from root:

**Terminal 1 (FastAPI Backend API & WebSocket):**
```bash
npm run server
# Runs on http://localhost:5001
```

**Terminal 2 (React + Tailwind Client):**
```bash
npm run client
# Runs on http://localhost:5173
```

---

## 📁 Project Directory Structure

```
InsurAI/
├── package.json                   # Root scripts
├── app/                           # Core RAG, Chunking, Extraction, Embeddings & LLMs
│   ├── config.py                  # Pydantic settings
│   ├── embeddings/                # Ollama & OpenAI-compatible embeddings
│   ├── ingestion/                 # PyMuPDF page extraction & chunking
│   ├── llm/                       # Ollama, OpenRouter, NVIDIA NIM providers
│   └── rag/                       # Router, Extraction, ChromaDB, Verification, QA
├── server/                        # FastAPI Backend (:5001)
│   ├── .env                       # Environment variables
│   ├── requirements.txt           # Python dependencies
│   ├── main.py                    # FastAPI entry point & WebSocket
│   ├── config.py                  # Server configuration
│   ├── db.py                      # MongoDB Motor connection & Chroma client
│   ├── models/                    # Pydantic schemas (user, policy, chat, cost, comparison)
│   ├── routers/                   # Modular FastAPI routers
│   ├── services/                  # Business logic (policy, rag, cost, comparison, chroma)
│   └── utils/                     # Seeder script
└── client/                        # React 19 + Tailwind CSS Frontend (:5173)
    ├── src/
    │   ├── components/
    │   │   ├── common/Navbar.jsx
    │   │   ├── dashboard/         # Policy cards, upload modal, facts table
    │   │   ├── chat/              # RAG chat, plain language toggle, citations
    │   │   ├── cost/              # Treatment cost estimator & what-if simulator
    │   │   ├── comparison/        # Side-by-side policy diff table
    │   │   └── auth/AuthModal.jsx # Login & registration
    │   ├── context/AuthContext.jsx
    │   ├── services/api.js        # Axios instance with JWT interceptor
    │   ├── App.jsx
    │   ├── main.jsx
    │   └── index.css              # Tailwind + Glassmorphism styles
    ├── tailwind.config.js
    └── vite.config.js
```
