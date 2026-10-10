# Semantic Matching & Verification Decision Log

This document records the architectural decisions, design rationales, risk mitigations, and evaluation outcomes for **Addition 2: Semantic Matching and Verification of Policy Evidence**.

---

## 1. Context & Architectural Goals
The objective is to automatically link billed items, medical procedures, and treatment descriptions to relevant health insurance policy clauses, verifying whether the clauses support coverage, contradict it (exclusions / waiting periods), or leave interpretation ambiguous.

### Hard Constraints Enforced:
1. **Arithmetic and Monetary Calculations Remain Strictly Outside the Model**: Co-pay, deductible, sub-limits, sum insured caps, and proportionate deductions are computed deterministically in `app/claims/settlement.py`. The learned model never outputs or decides currency amounts.
2. **Deterministic Document Precedence**: Precedence between conflicting documents and amounts is codified in a single rule table in `app/claims/precedence.py` (`irda_guideline` > `user_confirmed` > `final_bill` > `itemised_bills` > `preauth_approval_letter` > `discharge_summary` > `pre_treatment_estimate`), never decided by a model.
3. **Strict Vector Store Scoping & Separation**: Policy chunks (`policy_{policy_id}`), clause indices (`clauses_{policy_id}`), and claim documents never collide. Claim documents are never embedded or stored in ChromaDB.
4. **Verbatim Excerpt Invariant**: Supporting excerpts must be exact whitespace-normalized substrings of the source clause text. Non-verbatim or hallucinated excerpts force `confidence = "needs_review"`.
5. **No Numeric Probabilities**: User-facing interfaces expose categorical confidence labels (`high`, `medium`, `needs_review`) and verdicts (`supports`, `contradicts`, `ambiguous`, `conflicting_evidence`, `no_match`).

---

## 2. Decision Records

### Decision 1: Dedicated Vector Registry (`app/vectorstore/registry.py`)
- **Context**: Prior to Addition 2, vectorstore collections were created ad-hoc across modules.
- **Decision**: Centralize all Chroma collection access into `app/vectorstore/registry.py`:
  - `get_policy_chunks(policy_id)` for RAG Q&A path.
  - `get_clause_index(policy_id)` for semantic clause matching.
  - On-query checks: `validate_retrieved_records` drops any record with mismatched `source_type` or `policy_id`.
  - Embedding mismatch check: `_verify_collection_embedding_model` raises `EmbeddingModelMismatchError` if a collection was embedded with a different model.
- **Consequences**: Complete physical isolation; zero chance of clause records leaking into general Q&A or claim data leaking into Chroma.

### Decision 2: Domain-Specific Medical Abbreviations Expansion (`app/claims/semantic/abbreviations.py`)
- **Context**: Hospital bills utilize dense acronyms (`phaco with iol`, `rm chg`, `ot charges`, `pac`, `tka`, `turp`, `ped`, `wp`), whereas legal contracts use formal terminology (*phacoemulsification, intraocular lens, room rent, operation theatre, pre-existing disease*).
- **Decision**: Expand abbreviations at query time before dense retrieval, preserving the original query while appending expanded canonical terms.
- **Outcome**: Retrieval accuracy on abbreviation queries improved from 64.3% (BM25 baseline) to 78.6% (Semantic pipeline).

### Decision 3: Verbatim Excerpt Enforcement Function (`app/claims/semantic/criteria.py`)
- **Context**: Generative LLMs frequently paraphrase excerpts or drop punctuation, which undermines legal trustworthiness.
- **Decision**: Implemented `is_verbatim_substring` and `enforce_verbatim_excerpt_contract`. If an excerpt is not a verbatim substring of the policy clause text, confidence is downgraded to `needs_review` with a flagged reason.
- **Outcome**: Achieved **100.0% verbatim compliance** across all 84 benchmark test examples.

### Decision 4: Deterministic Fallback & Timeout Gracefulness
- **Context**: Remote LLM and embedding providers can experience latency or rate limits (e.g. HTTP 429).
- **Decision**: Set bounded timeouts with automatic fallback to `BM25ClauseIndex` and deterministic keyword verification, appending the visible notice: `"Semantic matching unavailable, using keyword fallback"`.
- **Outcome**: Zero application crashes when provider limits are reached.

---

## 3. Evaluation Summary
- **Benchmark Corpus**: 84 labeled examples across 3 health insurance policies (HDFC ERGO Optima Secure, Star Health Cardiac Care, Care Supreme).
- **DEV vs. TEST Split**:
  - DEV Split (42 examples): 83.3% Semantic vs 76.2% BM25 (+7.1% Δ)
  - TEST Split (42 examples): 85.7% Semantic vs 78.6% BM25 (+7.1% Δ)
- **Top Win Categories**:
  - Paraphrases: +14.3% over BM25
  - Abbreviations: +14.3% over BM25
  - Hard Negatives: 91.7% correctly flagged as `no_match`
- **Known Failure Mode**:
  - Conflicting evidence (e.g. covered procedure with excluded robotic guidance): Dense retrieval ranks one clause over another. Managed safely by triggering `needs_review` and preserving adjuster override via `PUT /claims/{id}/evidence/{match_id}/confirm`.
