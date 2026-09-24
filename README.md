# MedShield — AI-Powered Insurance Policy Intelligence Assistant

MedShield is a full-stack AI-driven web application built with **React**, **Tailwind CSS**, **Express (Node.js)**, **MongoDB (Mongoose)**, and **ChromaDB**. It allows users to upload health insurance policy PDFs and receive grounded AI assistance: automated fact extraction, red-flag detection, citation-backed natural-language Q&A, multi-policy comparisons, and treatment cost estimation with what-if scenario simulations.

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
                        │             Express.js Backend               │
                        │    (JWT Auth, Policy Pipeline, RAG, Cost)    │
                        └──────────────┬───────────────────────────────┘
                                       │
                ┌──────────────────────┴──────────────────────┐
                ▼                                             ▼
┌───────────────────────────────┐             ┌───────────────────────────────┐
│       MongoDB (Mongoose)      │             │      ChromaDB (Vector Store)  │
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
| `users` | [`User.js`](file:///server/src/models/User.js) | Primary account collection | Unique index on `email` |
| `policies` | [`Policy.js`](file:///server/src/models/Policy.js) | Policy records + **embedded** `facts` array | `user_id`, `status`, `facts.category` |
| `policy_chunks` | [`PolicyChunk.js`](file:///server/src/models/PolicyChunk.js) | Text chunks referencing policy and vector store | Compound unique `(policy_id, chunk_index)`, `vector_id`, `user_id` |
| `conversations` | [`Conversation.js`](file:///server/src/models/Conversation.js) | Chat sessions + **embedded** `messages` array with citations | `user_id`, `policy_id`, `updated_at` (desc) |
| `cost_estimates` | [`CostEstimate.js`](file:///server/src/models/CostEstimate.js) | Base estimates + **embedded** `what_if_variants` array | `user_id`, `policy_id`, `created_at` (desc) |
| `policy_comparisons`| [`PolicyComparison.js`](file:///server/src/models/PolicyComparison.js)| Multi-policy diff snapshots | `user_id` |

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

### 2. ChromaDB Vector Store

- **Collection Name:** `policy_chunks`
- **Join Key:** `id` matches `policy_chunks.vector_id` in MongoDB.
- **Metadata Fields:** `user_id`, `policy_id`, `chunk_index`, `page_number`, `section_heading`, `insurer_name`, `policy_type`, `created_at`.
- **Data Isolation:** Every vector query filters strictly on `user_id` and `policy_id`.
- **Fallback:** Includes a built-in memory vector store fallback for local development when standalone ChromaDB is not yet spun up.

---

### 3. Data Isolation & Cascade Delete Rules

1. **Data Isolation (NFR 5.3):** Every query against `policies`, `policy_chunks`, `conversations`, `cost_estimates`, and `policy_comparisons` strictly enforces `req.user._id` scoping in the service layer.
2. **Cascade Deletes (Section 8):** Deleting a policy document via `DELETE /api/policies/:id` triggers:
   - Deletion of matching `policy_chunks` in MongoDB
   - Deletion of corresponding vectors from ChromaDB
   - Nulling out / deletion of references in `conversations` and `cost_estimates`.

---

## 🚀 Quick Start Guide

### Prerequisites
- **Node.js** (v18+ or v20+)
- **MongoDB** running locally (`mongodb://127.0.0.1:27017/medshield`) or MongoDB Atlas URI

### 1. Install Dependencies
Dependencies are already installed. If running on a fresh clone:
```bash
# Root
npm install

# Server
cd server && npm install

# Client
cd ../client && npm install
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

**Terminal 1 (Backend API & WebSocket):**
```bash
npm run server
# Runs on http://localhost:5000
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
├── server/
│   ├── .env                       # Environment variables
│   ├── src/
│   │   ├── config/
│   │   │   ├── config.js          # App configurations
│   │   │   ├── db.js              # MongoDB Mongoose connection
│   │   │   └── chroma.js          # ChromaDB connection & in-memory fallback
│   │   ├── models/
│   │   │   ├── User.js            # Collection: users
│   │   │   ├── Policy.js          # Collection: policies (+ embedded facts)
│   │   │   ├── PolicyChunk.js     # Collection: policy_chunks (vector join)
│   │   │   ├── Conversation.js    # Collection: conversations (+ embedded messages)
│   │   │   ├── CostEstimate.js    # Collection: cost_estimates (+ what-if variants)
│   │   │   └── PolicyComparison.js# Collection: policy_comparisons
│   │   ├── middleware/
│   │   │   ├── auth.js            # JWT auth & NFR 5.3 data isolation
│   │   │   ├── errorHandler.js    # Centralized error responses
│   │   │   └── upload.js          # Multer for policy PDF uploads
│   │   ├── services/
│   │   │   ├── policyService.js   # Pipeline lifecycle & cascade delete
│   │   │   ├── chromaService.js   # Vector store indexing & querying
│   │   │   ├── ragService.js      # Structured vs Semantic RAG, verification & citations
│   │   │   ├── costEstimatorService.js # Hospital tier cost calculation & what-if
│   │   │   └── comparisonService.js # Multi-policy comparison diff snapshot
│   │   ├── controllers/           # REST endpoint handlers
│   │   ├── routes/                # Modular Express routers
│   │   ├── utils/
│   │   │   └── seedDemoData.js    # Database seeder
│   │   └── server.js              # Server entry point + WebSocket
└── client/
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
