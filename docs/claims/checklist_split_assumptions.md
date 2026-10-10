# Claim Checklist Split: Assumptions and Data Shapes

This document specifies the exact function signatures, data shapes, and assumptions
governing the split of checklist items into **Requirements** (reminders and deadlines)
and **Documents** (uploadable file slots).

---

## 1. Upstream Extraction Schema (`structured_facts["claim_conditions"]`)

We depend on the extracted facts produced by `app/rag/extraction.py`:

```python
{
    "claim_conditions": [
        {
            "condition": str,       # Raw contractual sentence from policy
            "stage": str,           # "before_admission" | "during_stay" | "after_discharge" | "unspecified"
            "deadline": str | None, # Stated timeframe or None
            "page": int,            # 1-indexed page number
            "verified": bool        # Verification result against page text
        }
    ]
}
```

### Assumptions
- **No re-extraction**: Existing policies in the database have this shape already. We do NOT alter extraction prompts or models.
- **Messy sentences**: Policy sentences often combine deadlines and document lists, e.g.:
  `"Required documents: Original discharge summary, all itemised bills and receipts, diagnostic reports, prescriptions, and a duly completed claim form"`.
  Classification and splitting must run deterministically at checklist-build time.

---

## 2. Controlled Vocabulary Data Shapes (`app/claims/checklist_vocabulary.py`)

### Document Types
Each document type has:
- `id`: Stable string slug (e.g. `discharge_summary`, `itemised_bills`, `diagnostic_reports`, `prescriptions`, `claim_form`, `preauth_approval_letter`, `id_proof`, `policy_copy`, `doctor_certificate`, `investigation_reports`).
- `label`: Human-readable label (e.g. "Original Discharge Summary").
- `description`: Single clear sentence describing what the document is.
- `synonyms`: List of lowercase substrings matching variations in policy text.

### Requirement Types
Each requirement type has:
- `id`: Stable string slug (e.g. `preauthorisation`, `admission_intimation`, `claim_filing_deadline`, `generic_requirement`).
- `label_template`: Template string formatted with parsed deadline (e.g. "Request pre-authorisation {deadline}").
- `anchor`: Standard stage anchor (`before_admission`, `after_admission`, `after_discharge`).
- `synonyms`: Action keywords for matching.

---

## 3. Checklist Item Model (`app/claims/models.py`)

The revised `ChecklistItem` model:

```python
class ChecklistItem(BaseModel):
    item_id: str                              # Controlled vocabulary ID or 'other_<slug>'
    kind: Literal["document", "requirement"] # Distinct item kind
    label: str                               # Plain English display label
    description: Optional[str] = None         # Description (documents only)
    stage: str                               # "before_admission" | "during_stay" | "after_discharge" | "unspecified"
    page_cite: Optional[int] = None           # Cited page number or None
    original_text: str                       # Exact policy sentence
    source: Literal["policy", "standard_suggestion"] = "policy"
    status: str                              # "required" | "uploaded" | "validated" | "flagged" | "needs_confirmation" (docs)
                                             # "pending" | "done" (requirements)
    needs_confirmation: bool = False         # True if unmatched or unparseable
    deadline: Optional[Dict[str, Any]] = None # Requirements: {value, unit, anchor, direction, raw, computed_due_date}
    document_id: Optional[str] = None        # Document attachment ID (documents only)
```

### Assumptions
- Backward compatibility: Existing fields `item_id`, `label`, `stage`, `page_cite`, `status`, `document_id` are preserved with defaults so older serialized dictionaries deserialize safely.
- New fields `kind`, `description`, `original_text`, `source`, `needs_confirmation`, `deadline` have safe defaults.

---

## 4. State Machine & Transitions (`app/claims/transitions.py`)

- **Document items**:
  `required` -> `uploaded` -> `validated` | `flagged` | `needs_confirmation`
- **Requirement items**:
  `pending` <-> `done` (user-attested toggle).
- **Upload rules**:
  Direct upload to requirement items is rejected with HTTP 422, except when `item_id == "preauthorisation"`, which links to `preauth_approval_letter`.

---

## 5. Due Date Computation

Given treatment `admission_date` and `discharge_date`:
- Anchor `before_admission`: `admission_date` minus deadline duration.
- Anchor `after_admission`: `admission_date` plus deadline duration.
- Anchor `after_discharge`: `discharge_date` plus deadline duration (or `admission_date` if discharge is null).
- Past due check: If computed due date < current date and status != `done`, emit a non-blocking `worth-confirming` flag.

---

## 6. Readiness Gating (`ready_to_submit`)

- **Document criteria**: All policy-sourced documents must be `validated` (0 missing, 0 flagged/needs_confirmation). Suggested fallback documents do not block.
- **Requirement criteria**: Incomplete requirements emit non-blocking "worth-confirming" flags. They never block submission because certain actions (e.g. pre-auth in emergency admission) may not apply.
- **Readiness label format**:
  `"Documents: X of Y uploaded and validated, Z flagged. Actions: A of B marked done."` (Zero numeric percentage scores).
