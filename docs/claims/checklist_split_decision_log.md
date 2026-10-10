# Claim Checklist Split: Architectural Decisions & Verification Log

This decision log documents the rationale, controlled vocabulary approach, deliberate constraints,
and accuracy metrics for splitting policy claim conditions into **Requirements** (actions/deadlines)
and **Documents** (uploadable file slots).

---

## 1. What Changed and Why (The Bug Report)

In the previous implementation, the claim workflow displayed raw policy extraction sentences directly as checklist items, each with an upload button. This caused three critical usability and validation defects:

1. **Deadlines and actions had upload buttons**: Procedural requirements (e.g. *"pre-authorisation must be requested at least 48 hours prior"* or *"notification is required within 24 hours of admission"*) are temporal actions or phone intimations, not uploadable documents. Exposing an upload button confused users and could never be meaningfully validated.
2. **Compound sentences produced single slots**: A contractual sentence listing multiple documents (e.g. *"Required documents: Original discharge summary, all itemised bills and receipts, diagnostic reports, prescriptions, and a duly completed claim form"*) produced a single upload slot, forcing users to combine 5 distinct physical records into one upload and preventing OCR validators from checking individual document types.
3. **Absence of stable controlled vocabulary IDs**: Items lacked canonical IDs, preventing document validators and downstream systems from knowing which document type was expected.

---

## 2. The Controlled Vocabulary Approach & Determinism

We introduced a two-tiered controlled vocabulary (`app/claims/checklist_vocabulary.py`):

1. **Document Types (`DOCUMENT_TYPES`)**:
   - Canonical IDs: `discharge_summary`, `itemised_bills`, `diagnostic_reports`, `prescriptions`, `claim_form`, `preauth_approval_letter`, `id_proof`, `policy_copy`, `doctor_certificate`, `investigation_reports`.
   - Each entry defines a single-sentence plain-English description and a list of lowercase synonyms.
2. **Requirement Types (`REQUIREMENT_TYPES`)**:
   - Canonical IDs: `preauthorisation`, `admission_intimation`, `claim_filing_deadline`, `generic_requirement`.
   - Each entry defines an anchor lifecycle stage (`before_admission`, `after_admission`, `after_discharge`) and a label template formatted with parsed deadlines.

### Why It Is 100% Deterministic:
- **No LLM calls**: Classification, splitting, deadline parsing, and label generation run as pure deterministic functions in `app/claims/checklist_classifier.py` and `app/claims/builder.py`.
- **Compound Synonym Preservation**: Segments with conjunctions (`"itemised bills and receipts"`) are checked against compound synonyms first; they are never falsely split into two slots.
- **Idempotence**: Running checklist construction multiple times on the same policy produces identical item IDs and deterministic ordering.

---

## 3. Deliberate Design Decisions (What Was NOT Done)

1. **No LLM Paraphrasing at Checklist Build Time**:
   If a sentence cannot be parsed into a template, we show the original contractual policy sentence as-is and mark `needs_confirmation = True`. We strictly avoid LLM paraphrasing to eliminate hallucination risks.
2. **No Extraction or Surfacing of Phone Numbers or App Names**:
   Contact details (helpline numbers, TPA portal URLs) remain visible only in the original sentence displayed beneath each item. They are not parsed into short titles to avoid outdated or misattributed phone contacts.
3. **No Auto-marking Actions Done**:
   Procedural requirements (e.g., intimating the TPA) must be self-attested by the user via the "Mark as done" toggle (`PUT /api/claims/{id}/checklist/{item_id}/done`). They are never auto-completed.
4. **Pre-authorisation Proof Exception**:
   Only `preauthorisation` allows an optional upload (cashless approval letter). All other pure requirement items reject file uploads with HTTP 422.

---

## 4. Known Limitations & Tradeoffs

1. **Vocabulary Coverage**:
   Classification accuracy depends on synonym lists in `checklist_vocabulary.py`. Novel phrasing styles will map to `other_<slug>` and require manual user confirmation.
2. **Self-Attested Actions**:
   Action requirements cannot be verified against insurer systems without live API integrations (which do not exist). Marking an action "done" is user-attested.
3. **Non-Blocking Actions**:
   Unfulfilled action requirements emit non-blocking `worth-confirming` flags rather than blocking `ready_to_submit`. In emergency admissions, pre-auth is impossible; blocking submission would lock the user out of filing a legitimate reimbursement claim.

---

## 5. Measured Split Accuracy & Test Results

Evaluated across the bug-report sentences and 8 diverse phrasing fixtures (numbered lists, bullet points, compound conjunctions, lab/radiology variants, unmapped items):

- **Expected Items Evaluated:** 16
- **Correctly Extracted Items:** 16 (**100.0% accuracy**)
- **Wrongly Merged Items:** 0 (0.0%)
- **Wrongly Split Items:** 0 (0.0%)
- **Dropped Items:** 0 (0.0%)
- **Total Test Suite:** 49 passing unit and golden scenario tests in `tests/claims/`.
