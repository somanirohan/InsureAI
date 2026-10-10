# Semantic Matching and Verification: System Assumptions & Contract Specifications

This document defines the exact function signatures, data shapes, and operational assumptions for **Addition 2: Semantic Matching and Verification of Policy Evidence**, as mandated in Step 0.

---

## 1. Dependent Function Signatures and Data Shapes

### 1.1 Treatment-to-Exclusion / Waiting Period Matching (`app/claims/eligibility.py`)
- **Current Signature**:
  ```python
  def evaluate_eligibility(
      policy_facts: Dict[str, Any],
      treatment: TreatmentDetails,
      policy_start_date: Optional[str] = None,
      today: Optional[str] = None,
      irdai_reference: Optional[Dict[str, Any]] = None,
  ) -> EligibilityResult
  ```
- **Current Behavior**:
  - Exclusions check: iterates over `policy_facts.get("exclusions", [])` (each item `{"item": str, "page": int}`). Matches via substring and token overlap (`overlap_ratio >= 0.5` -> `"fail"` / `"blocking"`; `0.25 <= overlap_ratio < 0.5` -> `"flag"` / `"worth-confirming"`; else `"pass"`).
  - Specific waiting periods: iterates over `policy_facts.get("waiting_periods", [])` (each item `{"condition": str, "period": str, "page": int}`). Token overlap check against `treatment.name`. If policy age is less than required months, verdict is `"fail"` / `"blocking"`.
- **Target Replacement**:
  - Calls `match_and_verify(description=treatment.name, policy_id=policy_id)` against the clause index (`clauses_{policy_id}`).
  - Maps verified verdicts deterministically:
    - `"contradicts"` on an exclusion clause: maps to `"fail"` with blocking flag.
    - `"supports"` on an exclusion clause: maps to `"pass"` (or non-exclusion).
    - `"ambiguous"` or `"conflicting_evidence"` or `"needs_review"`: maps to `"flag"` / `"worth-confirming"` or `"unable_to_determine"`.
    - `"no_match"`: maps to `"pass"` for that check.

### 1.2 Structured Facts & Clause Index Storage (`app/rag/extraction.py`, `server/services/fact_mapper.py`)
- **RAG Facts Shape**:
  ```python
  {
      "sum_insured": {"value": str, "page": int},
      "room_rent_limit": {"value": str, "page": int},
      "co_pay": {"value": str, "page": int},
      "deductible": {"value": str, "page": int},
      "waiting_periods": [{"condition": str, "period": str, "page": int}],
      "exclusions": [{"item": str, "page": int}],
      "claim_conditions": [{"condition": str, "page": int}]
  }
  ```
- **MongoDB Facts Schema** (`db.policies.facts`):
  List of dicts:
  ```python
  {
      "fact_id": str,
      "category": "waiting_period" | "exclusion" | "room_rent_limit" | "co_payment" | "deductible" | "sum_insured",
      "fact_key": str,
      "fact_value": str,
      "fact_value_numeric": float | None,
      "unit": str | None,
      "source_page": int | None,
      "source_section": str | None,
      "extraction_confidence": "high" | "medium" | "low",
      "metadata": dict | None
  }
  ```
- **Chunks Storage** (`db.policy_chunks` and Chroma collection `policy_{policy_id}`):
  ```python
  class Chunk:
      chunk_id: int
      text: str
      page_number: int
      section_heading: Optional[str] = None
  ```

### 1.3 ChromaDB Vector Store & Call Sites (`app/rag/vectorstore.py`)
- **Client**: `get_chroma_client() -> chromadb.PersistentClient` pointing to `settings.chroma_persist_dir` (`./chroma_store`).
- **Collection Naming**: Currently sanitized to `policy_{policy_id}` for policy chunks.
- **Call Sites**:
  1. `app/rag/vectorstore.py`: `get_policy_collection`, `index_chunks`, `query_similar`, `delete_policy_index`.
  2. `app/rag/qa.py`: calls `query_similar(policy_id, question, top_k)`.
  3. `server/services/policy_service.py`: calls `index_chunks` during background upload and `delete_policy_index` during deletion.
  4. Unit tests: `server/tests/test_unit_vectorstore.py`, `server/tests/test_integration_flow.py`, `server/tests/test_unit_processing_failure.py`.

### 1.4 Embedding & LLM Provider Abstractions
- **Embedding Provider** (`app/embeddings/base.py`, `app/embeddings/factory.py`):
  - `get_embedder() -> EmbeddingProvider`
  - Methods: `embed(texts: list[str]) -> list[list[float]]`, `embed_one(text: str) -> list[float]`.
  - Default configured provider: `settings.embedding_provider` (`"ollama"` or `"api"`).
- **LLM Provider** (`app/llm/base.py`, `app/llm/factory.py`, `app/llm/openai_compatible_provider.py`):
  - `get_llm() -> LLMProvider`
  - Methods: `chat(messages: list[dict[str, str]], **kwargs: Any) -> str`. Supports `format="json"`, `temperature`, `max_tokens`.
  - Fallback: Auto-fallback models on model_not_found; timeouts caught by callers and must fall back to keyword matching.

### 1.5 Claim Document Line Items & Settlement Precedence
- **Document Model** (`app/claims/models.py`):
  - `line_items: List[LineItem]` where `LineItem(description=str, amount=float, quantity=float|None, confidence=float)`.
- **Settlement Engine** (`app/claims/settlement.py`):
  - `calculate_settlement_estimate(claim: Claim, policy_facts: Dict[str, Any]) -> SettlementEstimate`
  - Uses only validated/confirmed bill (`needs_confirmation is False and len(validation_issues) == 0`).
  - Precedence and exact arithmetic are deterministic rules outside any learned model.

---

## 2. Unknowns and Explicit Assumptions

1. **Embedding Model Persistence**:
   - *Assumption*: In production and development without active Ollama daemons, `OllamaEmbeddingProvider` or `APIEmbeddingProvider` might fail or use Chroma fallback embeddings. Vector collections must record their active `embedding_model` metadata and verify compatibility at query time.
2. **Clause Index Source**:
   - *Assumption*: The clause index for `clauses_{policy_id}` will be synthesized from extracted facts (exclusions, waiting periods, sub-limits) AND relevant raw chunks from `policy_chunks` corresponding to those pages, ensuring verbatim clause text exists for excerpt verification.
3. **verbatim Excerpt Substring Normalization**:
   - *Assumption*: Policy clause text in Chroma or facts contains whitespace or linebreaks. Excerpt validation checks `re.sub(r'\s+', ' ', excerpt.strip()) in re.sub(r'\s+', ' ', clause_text.strip())`. If not a normalized verbatim substring, the verdict is forced to `"needs_review"` with review reason `"Excerpt not found verbatim in clause text"`.
4. **LLM Verification Quota & Reranker Choice**:
   - *Assumption*: Free-tier Groq API has daily token limits (TPD). The verification prompt will be constrained (<400 tokens), and the default reranker will support an env var `RERANKER=llm|cross_encoder|none`. When LLM fails, timed out, or rate-limited (HTTP 429), it automatically falls back to keyword matching (`app/claims/semantic/baseline.py`) with `"Semantic matching unavailable, using keyword fallback"`.
5. **No Numeric Probability in UI**:
   - *Assumption*: Confidence will strictly be represented as discrete categorical badges: `HIGH` (Green), `MEDIUM` (Amber), `NEEDS_REVIEW` (Red/Orange). Exact numeric probabilities or cosine distances will never be rendered to end users.
6. **Precedence Table**:
   - *Assumption*: Document precedence is codified in `app/claims/precedence.py` as an immutable lookup table:
     1. `final_bill` > `pre_treatment_estimate` (for billed amounts)
     2. `discharge_summary` > `prescriptions` > `diagnostic_reports` (for primary diagnosis)
     3. User explicit manual confirmation > All automated extractions.

---

## 3. Full Existing Test Suite Baseline Run

All existing test suites were executed before writing any new code:

1. **Claims Suite (`tests/claims/`)**:
   - `pytest tests/claims/` -> **70 passed, 0 failed in 11.55s**
   - Covers: `test_audit_fixes.py`, `test_checklist_split.py`, `test_checklist_stable_ids.py`, `test_claims_router.py`, `test_documents.py`, `test_eligibility.py`, `test_golden_scenarios.py`, `test_irdai.py`, `test_ocr_extraction.py`, `test_readiness.py`, `test_settlement.py`, `test_transitions.py`.
2. **Server Unit Tests (`server/tests/`)**:
   - `pytest server/tests/test_unit_rag_adapter.py` -> **17 passed in 4.02s**
   - `pytest server/tests/test_unit_vectorstore.py server/tests/test_unit_fact_mapper.py server/tests/test_unit_processing_failure.py server/tests/test_unit_cost.py server/tests/test_unit_chat_conversations.py server/tests/test_unit_object_id_and_db.py` -> **21 passed in 17.97s**
3. **Recommendations Suite (`tests/test_recommendations.py`)**:
   - `pytest tests/test_recommendations.py` -> **9 passed in 7.71s**
4. **Claims Scenario Eval Script (`scripts/run_claims_eval.py`)**:
   - `python scripts/run_claims_eval.py` -> **16/16 (100.0%) correct**.
5. **RAG Q&A Evaluation**:
   - `app/testing/test_step5_qa.py` is a manual smoke-test CLI script requiring a PDF argument.
   - `evals/run_evals.py` requires an external `evals/questions.json` benchmark set (currently not committed in the repo; `test_unit_rag_adapter.py` tests the RAG engine logic).

**Baseline Summary**:
- **Total passing tests**: 117 tests passing across the codebase.
- **Regressions target**: 0.
