# Audit Report: Claim Document Ingestion, Lifecycle, and Usage

**Audit Date:** 2026-10-10  
**Scope:** Complete claim document lifecycle across backend (`app/`, `server/`) and frontend (`client/`), from file upload to final presentation and downstream analytics.  
**Mode:** READ-ONLY diagnostic audit.

---

## 1. Trace of Document Data Access and Storage

The table below catalogs every location where uploaded claim documents (or their derivative artifacts) are read or written across the codebase.

| File & Function / Endpoint | Variable / Field Accessed | Operation (Read / Write) | Purpose & Context |
|---|---|---|---|
| `server/routers/claims.py:upload_claim_document` | `file: UploadFile`, `file_path` | **Write** (Disk) | Saves raw uploaded document byte stream into `server/uploads/claims/{claim_id}/{safe_uuid}{ext}`. |
| `server/routers/claims.py:upload_claim_document` | `claim["documents"]`, `claim["checklist"]` | **Write** (MongoDB `claims`) | Persists serialized `ClaimDocument` metadata and updates checklist item status (`needs_confirmation` or `validated`). |
| `server/routers/claims.py:reprocess_claim_document` | `target_doc["file_path"]` | **Read** (Disk) | Reads saved file from disk to re-run text extraction, OCR, LLM extraction, and deterministic validation. |
| `server/routers/claims.py:reprocess_claim_document` | `claim["documents"]`, `claim["checklist"]` | **Write** (MongoDB `claims`) | Replaces old `ClaimDocument` dict and resets checklist item status. |
| `server/routers/claims.py:revalidate_claim_document` | `target_doc["extracted_fields"]`, `target_doc["field_confidence"]` | **Read & Write** (MongoDB `claims`) | Re-runs 5 deterministic validators on existing extracted fields without re-reading the raw file. Writes updated `validation_issues` and `needs_confirmation`. |
| `server/routers/claims.py:confirm_document_fields` | `payload.confirmed_fields`, `target_doc["extracted_fields"]` | **Write** (MongoDB `claims`) | Overwrites extracted fields with user-verified values, clears `validation_issues` to `[]`, sets `needs_confirmation = False`, and sets checklist slot status to `validated`. |
| `app/claims/documents.py:extract_document_text` | `file_path`, `raw_text` | **Read** (Disk) | Opens PDF via PyMuPDF (`fitz.open`) or image via Pillow (`Image.open`) to extract raw text (native text layer or Tesseract OCR). |
| `app/claims/documents.py:extract_document_fields` | `raw_text`, `extracted_fields`, `field_confidence` | **Read & Write** (In-Memory) | Formats prompt and sends up to first 3,000 characters to LLM (or regex fallback). Returns structured dictionary and per-field confidence dictionary. |
| `app/claims/documents.py:validate_document` | `extracted_fields`, `field_confidence`, `validation_issues` | **Read & Write** (In-Memory) | Evaluates 5 deterministic validation rules against treatment details and user profile. Sets `needs_confirmation` flag and populates `validation_issues`. |
| `app/claims/settlement.py:calculate_settlement_estimate` | `doc.extracted_fields["total_amount"]`, `doc.item_id`, `doc.filename` | **Read** (In-Memory) | Scans `claim.documents` for a bill (`final_bill` or `itemised_bills`) to determine if settlement basis is `uploaded_bill` or `pre_treatment_estimate`. |
| `app/claims/readiness.py:compute_claim_readiness` | `doc.needs_confirmation`, `doc.validation_issues`, `item.status` | **Read** (In-Memory) | Converts unconfirmed documents and validation issues into `EligibilityFlag` instances with severity `worth-confirming`. |
| `app/claims/readiness.py:can_transition_to_ready_to_submit` | `item.status` | **Read** (In-Memory) | Enforces that all policy-sourced document items must be `validated` before transition to `ready_to_submit`. |
| `server/routers/claims.py:get_claim_review` | `claim["documents"]`, `claim["settlement_estimate"]` | **Read** (MongoDB `claims`) | Serializes dossier for final submission review screen. |
| `client/src/claims/DocumentChecklistSection.jsx` | `doc.extracted_fields`, `doc.validation_issues`, `doc.needs_confirmation` | **Read** (Frontend UI) | Renders extracted patient name, dates, diagnosis, billed amount, validation issues list, and "Edit / Confirm Values" modal. |

---

## 2. External Calls Receiving Document Content

| Pipeline Stage / External Service | Provider / Target | Payload Sent | Truncation Applied | Logging Details |
|---|---|---|---|---|
| **Text Extraction (Raster Pages & Photos)** | Local Tesseract OCR (Binary `/opt/homebrew/bin/tesseract` via `pytesseract`) | Bitmap image samples rendered from PDF pages at 300 DPI or direct JPG/PNG image bytes. | First 5 pages of PDF (`min(len(doc), 5)`). Photos processed in full. | Logs character count and first 200 characters: `logger.info("[%s/%s] Image OCR finished: %d chars", claim_id, doc_id, len(img_txt))`. Raw text is **not** logged. |
| **Field Extraction (Structured Parser)** | Groq Cloud API (`https://api.groq.com/openai/v1/chat/completions`) using model `qwen/qwen3.8-27b` | System prompt + user prompt containing document text excerpt: `DOCUMENT TEXT: """{text[:3000]}"""`. | **Yes**, strictly truncated to `text[:3000]` characters (`max_tokens=600`). | Extracted structured dictionary is logged: `logger.info("[%s/%s] LLM field extraction succeeded: %s", claim_id, doc_id, fields)`. Full document text is **not** logged. |
| **Embeddings Generation** | *None* | **Never called.** Claim documents are never embedded. | N/A | N/A |
| **ChromaDB Vector Store** | *None* | **Never called.** No collection or document write occurs. | N/A | N/A |

---

## 3. Compliance & Architectural Rule Verifications

| Architectural Invariant / Rule | Status | Evidence (File & Line) | Detail & Findings |
|---|---|---|---|
| **1. Claim document content is never written to ChromaDB** | **CONFIRMED** | `app/rag/vectorstore.py:97-165`<br>`server/routers/claims.py:380-520` | ChromaDB collections are keyed exclusively by `policy_{policy_id}` for policy PDF chunks. The claim upload endpoint (`server/routers/claims.py:380`) writes only to local disk and MongoDB collection `claims`. No vector store call is imported or invoked. |
| **2. Claim documents are never used by chatbot/RAG path** | **CONFIRMED** | `server/routers/chat.py:168-230`<br>`server/services/rag_service.py:75-140`<br>`app/rag/qa.py:48-180` | Chatbot and RAG QA retrieve context strictly from `db.policy_chunks` and ChromaDB collection `policy_{policy_id}` using policy facts. `db.claims` and `ClaimDocument` are never queried in the chat router or RAG service. |
| **3. Claim documents are never used as policy evidence or supporting excerpts** | **CONFIRMED** | `app/rag/qa.py:180-260`<br>`app/rag/confidence.py:20-65` | Citations and verification statuses in QA answers cite policy page numbers stored in policy facts and policy chunks. Claim documents are never referenced as citations for policy terms. |
| **4. Settlement uses only validated or user-confirmed values, never needs_confirmation values** | **VIOLATION (CRITICAL)** | `app/claims/settlement.py:78-87` | In `calculate_settlement_estimate`, the code iterates over `claim.documents` searching for `doc.item_id == "final_bill" or doc.extracted_fields.get("document_type") == "final_bill"` and checks only `if amt and float(amt) > 0: bill_doc = doc`. **It does NOT check `if not doc.needs_confirmation` or `if doc.status == 'validated'`!** As a result, an unconfirmed or flagged bill immediately populates the settlement estimate basis as `uploaded_bill`. |
| **5. Eligibility verdicts & settlement arithmetic never depend on LLM beyond schema-validated fields** | **CONFIRMED** | `app/claims/eligibility.py:1-468`<br>`app/claims/settlement.py:115-212` | All eligibility checks (moratorium, PED, exclusions, room rent) are deterministic Python calculations based on `policy_facts` and `treatment`. Settlement deduction calculations (proportional deductions, deductibles, co-pays) are pure deterministic math functions. LLMs are never consulted for verdicts or math. |
| **6. Full document text is not written to logs** | **CONFIRMED** | `app/claims/documents.py:122, 182, 191, 608` | Logging outputs character counts (`len(combined)`), first 200 characters preview in CLI debugger only, and parsed structured dictionary keys. Full text is never logged to application logs. |
| **7. Every read of a document checks that the claim belongs to the requesting user** | **CONFIRMED** | `server/routers/claims.py:56-66, 143, 391, 530, 579, 639, 679, 712, 752` | Every claim endpoint invokes `_get_claim_or_404(claim_id, user_id)` which runs `db.claims.find_one({"claim_id": claim_id, "user_id": user_id})`. Cross-user access returns HTTP 403 Forbidden. |

---

## 4. Orphan Risks Analysis

### A. Re-upload for the Same Slot (`item_id`)
- **Disk:** When a user uploads a new document for an existing slot (e.g., replacing `final_bill`), `server/routers/claims.py:434-439` generates a new random UUID file name (`safe_name = f"{uuid.uuid4().hex}{ext}"`) and saves it.
- **Database:** `server/routers/claims.py:456` filters out the old document: `docs = [d for d in docs if d.get("item_id") != item_id]`.
- **Orphan Risk Identified:** The **old physical file** at the previous `file_path` on disk is **never deleted (`os.remove`)**. Over repeated re-uploads, orphan files accumulate in `server/uploads/claims/{claim_id}/`.

### B. Claim Deletion
- **Orphan Risk Identified:** There is **no claim deletion endpoint** (`DELETE /api/claims/{claim_id}`) in `server/routers/claims.py`. If a claim record is dropped or deleted directly via MongoDB, the entire folder `server/uploads/claims/{claim_id}/` on disk remains orphaned indefinitely.

### C. Policy Deletion (`DELETE /api/policies/{policy_id}`)
- **Policy Service Cascade:** In `server/services/policy_service.py:242-286`, `delete_policy_cascade`:
  - Cleans the ChromaDB collection `policy_{policy_id}`.
  - Deletes MongoDB `policy_chunks`.
  - Clears `policy_id` references in `db.conversations`.
  - Deletes `db.cost_estimates`.
  - Deletes the policy file from disk.
- **Orphan Risk Identified:** `delete_policy_cascade` **does not cascade into `db.claims`**. Any existing claims created against `policy_id` remain in MongoDB with broken references to the deleted policy, and all associated document files on disk in `server/uploads/claims/{claim_id}/` remain orphaned.

---

## 5. Identified Defects & Vulnerabilities (Ranked by Severity)

### 1. [HIGH] Settlement Uses Unvalidated / `needs_confirmation` Bill Values
- **Location:** `app/claims/settlement.py:78-87`
- **Defect:** `calculate_settlement_estimate` selects the first document with `total_amount > 0` regardless of whether `doc.needs_confirmation == True` or `doc.validation_issues` has errors.
- **Impact:** Violates the core design contract: financial settlement basis can be derived from inaccurate, unvalidated, or unconfirmed OCR extractions.
- **Minimal Fix:**
  ```python
  # In app/claims/settlement.py:79
  for doc in claim.documents:
      if (doc.item_id == "final_bill" or doc.extracted_fields.get("document_type") == "final_bill"):
          # ONLY accept bill if document is validated and does not require confirmation
          if not getattr(doc, "needs_confirmation", False):
              amt = doc.extracted_fields.get("total_amount")
              if amt and float(amt) > 0:
                  bill_doc = doc
                  break
  ```

### 2. [MEDIUM] Orphan Claim Document Files on Slot Replacement
- **Location:** `server/routers/claims.py:432-458`
- **Defect:** When uploading a replacement file for an existing slot, the old file record is removed from `claim["documents"]`, but the prior file at `target_doc.get("file_path")` is not unlinked from the filesystem.
- **Impact:** Unbounded disk leakage in `server/uploads/claims/{claim_id}/`.
- **Minimal Fix:**
  ```python
  # Before saving new file or when replacing slot:
  old_doc = next((d for d in claim.get("documents", []) if d.get("item_id") == item_id), None)
  if old_doc and old_doc.get("file_path") and os.path.exists(old_doc["file_path"]):
      try:
          os.remove(old_doc["file_path"])
      except OSError:
          pass
  ```

### 3. [MEDIUM] Missing Cascade Deletion of Claims upon Policy Deletion
- **Location:** `server/services/policy_service.py:242` (`delete_policy_cascade`)
- **Defect:** Deleting a policy leaves orphaned claim records in `db.claims` and uncleaned document folders in `server/uploads/claims/{claim_id}`.
- **Impact:** Broken foreign key relations in UI claims dashboard, orphaned disk storage.
- **Minimal Fix:**
  ```python
  # In delete_policy_cascade:
  claims_to_del = await db.claims.find({"policy_id": str(p_oid), "user_id": str(u_oid)}).to_list(1000)
  for c in claims_to_del:
      c_dir = os.path.join(settings.UPLOAD_DIR, "claims", c.get("claim_id", ""))
      if os.path.exists(c_dir):
          shutil.rmtree(c_dir, ignore_errors=True)
  await db.claims.delete_many({"policy_id": str(p_oid), "user_id": str(u_oid)})
  ```

### 4. [LOW] Line Items Ignored in Data Schema
- **Location:** `app/claims/models.py:90` (`ClaimDocument`)
- **Defect:** `ClaimDocument` extracts and stores scalar fields (`total_amount`, `admission_date`, `patient_name`, `diagnosis`), but does not define or store itemized breakdown rows (`line_items`).
- **Impact:** Settlement calculations must use overall proportional deductions rather than line-by-line consumable/room exclusions.
- **Minimal Fix:** Future enhancement to introduce `line_items: List[Dict[str, Any]] = Field(default_factory=list)` to `ClaimDocument`.
