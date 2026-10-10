# Claim Processing Workflow: Dependencies & Assumptions Log

This document records the exact function signatures, data shapes, and operational assumptions that the new `app/claims/` package and frontend claim workflow depend on.

---

## 1. Upstream Module Dependencies & Signatures

### A. Checklist Module (`app/rag/checklist.py`)
- **Function**: `build_claim_checklist(structured_facts: Optional[dict[str, Any]], heads_up: Optional[str] = None) -> dict[str, Any]`
- **Input Shape**:
  ```python
  structured_facts = {
      "claim_conditions": [
          {
              "condition": str,
              "stage": "before_admission" | "during_stay" | "after_discharge" | "unspecified",
              "deadline": str | None,
              "page": int,
              "verified": bool
          }
      ],
      "waiting_periods": [{"condition": str, "period": str, "page": int}],
      "exclusions": [{"item": str, "page": int}],
      "sum_insured": {"value": str, "page": int},
      "room_rent_limit": {"value": str, "page": int},
      "co_pay": {"value": str, "page": int},
      "deductible": {"value": str, "page": int}
  }
  ```
- **Output Shape**:
  ```python
  {
      "checklist": [
          {
              "stage": str,
              "label": str,
              "items": [
                  {
                      "item_id": str,  # Stable ID (e.g. 'preauth_form', 'final_bill')
                      "condition": str,
                      "deadline": str | None,
                      "page": int,
                      "page_number": int,
                      "verified": bool
                  }
              ]
          }
      ],
      "confidence": "High" | "Medium" | "Low",
      "confidence_reason": str,
      "source": "structured",
      "answer": str,
      "pages": list[int],
      "citations": list[dict],
      "general_advice": list[str],
      "heads_up": str | None
  }
  ```
- **Stable Item ID Normalization**: Added `normalize_item_id(condition, stage) -> str` so requirements across different insurer policies map to standard IDs: `preauth_form`, `emergency_intimation`, `reimbursement_claim_form`, `discharge_summary`, `final_bill`, `investigation_reports`, `identity_proof`.

---

### B. Cost Engine (`server/services/cost_service.py`)
- **Service Class**: `CostEstimatorService`
- **Function**:
  ```python
  calculate_cost_breakdown(
      policy: Optional[dict[str, Any]],
      treatment_name: str,
      hospital_tier: str,             # "tier_1" | "tier_2" | "tier_3"
      room_rent_per_day: float = 8000.0,
      stay_days: int = 4,
      voluntary_deductible: float = 0.0,
      has_copay_rider: bool = False
  ) -> dict[str, Any]
  ```
- **Output Shape**:
  ```python
  {
      "estimated_total_cost": float,
      "covered_amount": float,
      "out_of_pocket_amount": float,
      "cost_breakdown": {
          "base_hospital_charges": float,
          "room_rent_applied": float,
          "room_rent_cap_per_day": float,
          "room_rent_copay_penalty": float,
          "deductible_deducted": float,
          "copay_percentage": float,
          "copay_amount": float,
          "sub_limit_caps_applied": list[dict],
          "excluded_items_cost": float,
          "final_payable_by_insurer": float,
          "final_payable_by_user": float
      },
      "assumptions": list[str],
      "citations": list[dict],
      "disclaimer": str
  }
  ```

---

### C. PDF Text Extraction & OCR (`app/ingestion/pdf_extract.py`)
- **Function**: `extract_pages(file_path: str) -> list[PageText]`
- **Data Object**:
  ```python
  @dataclass
  class PageText:
      page_number: int       # 1-indexed physical page
      text: str              # Extracted plain text
      source: "native" | "ocr"
  ```
- **OCR fallback**: Tesseract OCR runs automatically if text density is below threshold.

---

### D. Self-Verification Engine (`app/rag/verification.py`)
- **Function**: `verify_answer(claim: str, passage: str) -> dict[str, Any]`
- **Output Shape**:
  ```python
  {
      "supported": bool,
      "verification_status": "fully_supported" | "partially_supported" | "unsupported",
      "reasoning": str,
      "evidence_quote": str
  }
  ```

---

### E. Database Layer (`server/db.py`)
- **Functions**:
  - `get_async_db() -> AsyncIOMotorDatabase`
  - `to_object_id(val: Any) -> Optional[ObjectId]`
- **MongoDB Collections**:
  - `policies`: contains policy metadata, `user_id`, `file_path`, `facts`
  - `claims`: stores claims linked by `policy_id` and `user_id`

---

### F. Authentication Layer (`server/routers/auth.py`)
- **Dependency**: `get_current_user`
- **Output**: User dictionary with `_id` (ObjectId or str), `email`, `full_name`.

---

## 2. Claim Entity Data Shape (`claims` collection)

```json
{
  "_id": "ObjectId",
  "claim_id": "CLM-UUID-HEX",
  "user_id": "ObjectId or str",
  "policy_id": "ObjectId or str",
  "status": "draft",
  "treatment": {
    "name": "Knee Replacement",
    "hospital": "Apollo Hospital, Delhi",
    "admission_date": "2026-11-01T00:00:00Z",
    "discharge_date": "2026-11-05T00:00:00Z",
    "room_type": "Single Private AC",
    "estimated_cost": 350000.0
  },
  "eligibility_result": {
    "checks": [
      {
        "check": "Treatment on exclusions list",
        "result": "pass",
        "detail": "Treatment is not listed in policy exclusions.",
        "source": "Page 2, Clause 4"
      }
    ],
    "flags": [],
    "evaluated_at": "2026-10-10T13:00:00Z"
  },
  "checklist": [
    {
      "item_id": "preauth_form",
      "label": "Pre-authorisation request",
      "stage": "before_admission",
      "page_cite": 3,
      "status": "required",
      "document_id": null
    }
  ],
  "documents": [
    {
      "document_id": "DOC-UUID-HEX",
      "item_id": "final_bill",
      "filename": "final_bill.pdf",
      "extracted_fields": {
        "patient_name": "Rajesh Kumar Sharma",
        "admission_date": "2026-11-01",
        "discharge_date": "2026-11-05",
        "diagnosis": "Severe Osteoarthritis",
        "total_amount": 348500.0,
        "line_items": [],
        "document_type": "final_bill"
      },
      "field_confidence": {
        "patient_name": 0.95,
        "total_amount": 0.98
      },
      "validation_issues": [],
      "needs_confirmation": false
    }
  ],
  "settlement_estimate": {
    "basis": "pre_treatment_estimate",
    "receipt_steps": [
      {
        "label": "Base hospital charges",
        "amount": 350000.0,
        "rule": "Hospitalization expense benchmark",
        "citation": "Policy facts"
      }
    ],
    "total": 315000.0
  },
  "timeline": [
    {
      "timestamp": "2026-10-10T13:00:00Z",
      "event": "Claim created",
      "note": "Initial draft created by user"
    }
  ],
  "created_at": "2026-10-10T13:00:00Z",
  "updated_at": "2026-10-10T13:00:00Z"
}
```

---

## 3. Explicit Assumptions List

1. **Frontend directory path**:
   - The repository's frontend code lives under `client/src/`. The spec specifies `frontend/src/claims/`.
   - *Resolution*: Created a symbolic link `frontend -> client` so both paths point to the exact same physical directory.

2. **Claim Checklist Item Status vs Claim Status**:
   - Claim status: `draft` -> `eligibility_checked` -> `docs_pending` -> `docs_validated` -> `ready_to_submit` -> `submitted` -> `under_review` -> `settled` | `rejected` | `query_raised`.
   - Item status: `required` -> `uploaded` -> `validated` | `flagged` | `needs_confirmation`.
   - *Resolution*: Maintained in separate typed state machines (`app/claims/transitions.py`).

3. **IRDAI Reference Values**:
   - Values: `ped_waiting_period_max_months` = 36, `moratorium_period_months` = 60, `free_look_period_min_days` = 30.
   - Per spec: `clause`, `verified_on`, and `verified_by` are set to `"UNVERIFIED - fill after checking original circular"`. A dedicated loader forbids any numeric literals in other files.

4. **Document Extraction & Validators**:
   - The LLM will only be used for extracting fields with confidence scores from uploaded PDF texts.
   - All validation checks (patient name fuzzy match, dates sequence, numeric bill total, diagnosis match, slot match) are 100% deterministic code.
