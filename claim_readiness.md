# Claim Readiness Checklist: Architecture & Decision Log

This document details the architectural decisions, design choices, tradeoffs, and limitations for the Claim Readiness Checklist feature added to the InsureAI Insurance Policy Intelligence Assistant RAG system.

---

### Decisions made during schema design

1. **Why `stage`, `deadline`, and `page` fields were added to `claim_conditions`:**
   - Previously, `claim_conditions` was a flat list of unstructured text strings (`[{"condition": str, "page": int}]`). While acceptable for generic summaries, it failed to communicate *when* an insured person needs to act (e.g., pre-authorization must happen before surgery, while bill submission happens post-discharge).
   - Adding `stage`, `deadline`, and `page` converts free-text conditions into a chronological, actionable timeline directly tied to physical PDF evidence.

2. **Why `null` is used for missing deadlines instead of a default value:**
   - Using a fallback or default value (such as "N/A", "Immediate", or "Standard timeframe") would mislead users by implying the policy specified a deadline or that no urgency exists.
   - `null` unambiguously represents "the contract is silent on a specific timeframe for this requirement."

3. **Why `unspecified` is a valid stage rather than being excluded:**
   - Some contractual clauses state important legal obligations that do not belong strictly to a hospital stay stage (e.g., "The Insured must cooperate with the TPA during investigation" or "All disputes must be referred to the Insurance Ombudsman").
   - Discarding these would lose critical contractual rights and obligations. Designating them as `unspecified` allows them to be displayed under a separate "Other requirements" section without making false assumptions about their chronological order.

4. **Why the extraction prompt explicitly forbids inventing deadlines:**
   - LLMs have a strong tendency to hallucinate typical insurance timeframes (e.g., assuming "within 30 days" or "within 24 hours" even when unstated).
   - In insurance law, missing a deadline can result in a rejected claim. Inferring a timeframe that is not written in the contract could lead an insured person to forfeit their coverage.

---

### Decisions made during verification

1. **Why verification runs at upload time rather than question time:**
   - Running verification (`verify_answer()`) against LLM evaluators takes ~1–2 seconds per item. If verified at question time across 4–6 requirements, the chat response would suffer an unacceptable 5–10 second latency.
   - Running verification once during document ingestion and persisting the `verified: bool` flag inside MongoDB `facts` metadata ensures question-time checklist generation is instantaneous (~1 millisecond) with zero cloud LLM latency.

2. **What happens when a `claim_condition` item fails verification:**
   - An item that fails verification (`verified: False`) is retained in the structured facts and rendered in the checklist, but marked with an explicit `confirm with insurer` badge.
   - The overall response confidence drops from `High` to `Medium`.

3. **Why failed verification results in a "confirm with insurer" badge rather than item deletion:**
   - Insurance policies often contain complex legal phrasing, cross-references across schedules, or OCR imperfections that may trigger an overly conservative "unsupported" verdict from the LLM verification auditor.
   - Deleting the item completely could cause the user to miss a crucial step (e.g., intimating the TPA). Flagging it with "confirm with insurer" alerts the user to double-check that specific requirement with their TPA without hiding the potential requirement.

---

### Decisions made during routing

1. **Which keywords were chosen and why:**
   - Specific keywords chosen: `"claim checklist"`, `"claim process"`, `"claims process"`, `"claim procedure"`, `"claims procedure"`, `"how to claim"`, `"how do i claim"`, `"how to file a claim"`, `"how do i file a claim"`, `"steps to claim"`, `"steps to file a claim"`, `"required documents for claim"`, `"documents required for claim"`, `"documents needed for claim"`, `"required claim documents"`, `"claim documents"`, `"cashless process"`, `"cashless procedure"`, `"reimbursement process"`, `"reimbursement procedure"`, `"what to do before admission"`, `"what do i need before admission"`, `"what to do after discharge"`, `"steps after discharge"`.
   - Pattern combinations:
     - Mention of admission (`"admitted"`, `"admission"`, `"hospitalisation"`) + preparation intent (`"what do i need"`, `"what should i do"`, `"what is needed"`, `"checklist"`).
     - Mention of claim mechanisms (`"cashless"`, `"reimbursement"`) + procedural actions (`"how to"`, `"steps"`, `"documents"`, `"intimation"`).
   - Reasoning: These terms uniquely denote procedural execution inquiries rather than benefit inquiries.

2. **Which keywords were considered and rejected:**
   - Broad keywords like `"claim"`, `"insurance"`, `"hospital"`, `"treatment"` were explicitly rejected in isolation.
   - Reason: Questions like "Can I claim knee surgery?", "What is the claim limit?", or "Does my insurance cover hospital room rent?" are benefit/coverage questions, not process inquiries. Routing them to the checklist would hijack the semantic RAG path and prevent users from getting coverage answers.

3. **Why `claim_checklist` intent is handled before structured-field lookup in `qa.py`:**
   - `"claim_checklist"` is an orchestration intent, not a single scalar database field in `structured_facts`.
   - The standard structured-field lookup in `qa.py` attempts `field_data = structured_facts.get(matched_field)` and formats a single field answer.
   - Handling `"claim_checklist"` first allows the orchestrator to call `build_claim_checklist()`, run scenario-aware treatment checks, assemble stage groups, and construct checklist metadata before the scalar table lookup is evaluated.

---

### Decisions made in the checklist builder

1. **Why stage ordering was chosen (`before_admission` first):**
   - Chronological flow matches human hospital journeys:
     1. `before_admission`: Pre-authorization, advance notice, network verification.
     2. `during_stay`: Emergency intimation, TPA card presentation, daily room category tracking.
     3. `after_discharge`: Collecting discharge summary, medical bills, prescriptions, and filing reimbursement.
     4. `unspecified`: General statutory rights, ombudsman guidelines, and grievance channels.

2. **Why the builder is deterministic rather than LLM-generated:**
   - Calling an LLM at question time introduces latency, token costs, non-deterministic formatting, and hallucination risks.
   - Because the requirements are already parsed, structured, and verified during upload, grouping them into stages is a pure projection operation. A deterministic Python builder executes in sub-millisecond time and guarantees that only verified contract terms are returned.

3. **Why a Low-confidence "nothing found" response is preferred over an empty list or generic tips:**
   - If an uploaded policy schedule is truncated or does not state procedural rules, outputting an empty checklist or generic fabricated advice is misleading.
   - An explicit Low-confidence message ("We couldn't find specific claim requirements or procedural conditions in this policy document. Please confirm claim deadlines and document requirements directly with your insurance provider.") provides transparent consumer guidance without pretending the policy contained clauses that are absent.

4. **Why general tips are separated from policy-backed items:**
   - Mixing general tips (e.g., "Carry photo ID") into policy-backed items under the insurer's name would blur the line between binding legal contract terms and helpful advice.
   - Placing general tips in an explicitly labeled `> ℹ️ General advice — not from your policy` section ensures that legal contract terms and practical reminders remain distinct.

---

### Decisions made in `qa.py` integration

1. **Threshold used to decide explicit treatment mentions:**
   - Word-boundary regex matching (`\b<term>\b`) across clinical terms and aliases (`knee surgery`, `joint replacement`, `cataract`, `hernia`, `maternity`, `cancer`, `dental`, `cosmetic`, `bariatric`, `sinusitis`, `ivf`).
   - Generic questions like "how do I claim" or "what documents are required" contain no clinical terms and skip the scenario check entirely.

2. **Why the heads-up block is placed at the top of the response:**
   - In insurance claims, coverage eligibility precedes procedural filing. If an insured is being admitted for surgery that has an unexpired 24-month waiting period or is permanently excluded, knowing that fact immediately is far more important than gathering reimbursement receipts. Placing the heads-up alert at the top ensures critical coverage caveats are seen first.

---

### Known limitations and what was not built

1. **Table-spanning multi-page claim schedules:**
   - Policies that scatter claim conditions across non-standard annexures (e.g., Appendix IV on page 48) outside the top-keyword pages may be missed if they exceed `max_pages=3` in `_filter_pages`.
   - *Mitigation needed:* An ingestion-time full-document table locator or hybrid search across annexures.

2. **Interactive checkbox persistence:**
   - Checkboxes in `ChecklistCard` maintain local component state (`useState`) for session demonstration purposes and do not persist across page reloads in MongoDB.
   - *Mitigation needed:* If converted to a user task manager, a dedicated `checklist_progress` collection would need to store user checkmarks per policy.

3. **Complex multi-illness scenario reasoning:**
   - The scenario-aware check uses clinical keywords and structured matching against `waiting_periods` and `exclusions`. If a user describes a rare condition using lay terminology that does not match known clinical aliases, the heads-up check will not trigger.

---

### Files changed

- **`app/rag/extraction.py`**: Updated `_CLAIM_PROMPT` to extract 4 fields (`condition`, `stage`, `deadline`, `page`), updated heuristic claim extraction, and added upload-time verification invocation in `extract_structured_facts()`.
- **`app/rag/verification.py`**: Added `verify_claim_conditions()` to verify claim condition requirements against cited page texts during document ingestion.
- **`app/rag/router.py`**: Added `"claim_checklist"` intent with conservative keyword matching (`CLAIM_CHECKLIST_KEYWORDS`), scenario-aware intent detection, and embedding references.
- **`app/rag/checklist.py`**: Created deterministic Claim Readiness Checklist builder grouping conditions chronologically with calibrated confidence and visually separated general advice.
- **`app/rag/qa.py`**: Integrated `"claim_checklist"` route handling before structured field lookup, added scenario-aware treatment cross-referencing against waiting periods/exclusions, and extended `Citation` and `AnswerResult` dataclasses.
- **`server/services/fact_mapper.py`**: Updated `rag_facts_to_mongo_facts()` and `mongo_facts_to_rag_facts()` to persist and restore `stage`, `deadline`, `page`, and `verified` metadata in MongoDB.
- **`server/services/rag_service.py`**: Forwarded `checklist`, `general_advice`, and `heads_up` fields in the RAG service response dictionary.
- **`server/routers/chat.py`**: Persisted `checklist`, `general_advice`, and `heads_up` in the conversation `assistant_msg` in MongoDB.
- **`claim_readiness.md`**: Created architecture and decision documentation.
- **`docs/claims/checklist_split_decision_log.md`**: Detailed architectural decision log and verification results for the Requirement/Document checklist split.
- **`docs/claims/results.md`**: Quantitative split accuracy evaluation across diverse phrasing styles.
