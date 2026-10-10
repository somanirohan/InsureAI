# Audit Fixes: Claim Processing Module & Document Lifecycle

This document records the fixes applied to the InsureAI claim module following the findings identified in `docs/claims/document_usage_audit.md`.

---

## 1. Summary of Changes

### 1.1 Settlement Basis Fix (`app/claims/settlement.py`)
- **Problem**: Settlement estimate calculation was adopting uploaded bills as the calculation basis whenever an uploaded bill was present with an amount > 0, even if the document had `needs_confirmation: True` or unresolved validation issues.
- **Fix**:
  - Updated the bill candidate lookup to strictly check:
    ```python
    if not doc.needs_confirmation and len(doc.validation_issues) == 0:
        bill_doc = doc
    ```
  - If a bill document was uploaded but has `needs_confirmation=True` or active issues, the basis is maintained as `"pre_treatment_estimate"`.
  - Added an explicit informative receipt step note:
    ```
    "Bill Uploaded But Awaiting Confirmation"
    "An itemised hospital bill has been uploaded but has pending confirmation issues. The settlement estimate currently reflects your pre-treatment estimate until the bill is verified."
    ```
  - Fixed a string-to-float coercion issue where room limit was stored as string (e.g., `"5000"`).

### 1.2 Line Items Schema Extension & Discrepancy Flagging (`app/claims/models.py`, `app/claims/documents.py`, `app/config.py`)
- **Schema Extension**:
  - Defined `LineItem` Pydantic model:
    ```python
    class LineItem(BaseModel):
        description: str
        amount: float
        quantity: Optional[float] = None
        confidence: float = 1.0
    ```
  - Added `line_items: List[LineItem] = Field(default_factory=list)` to `ClaimDocument`.
  - Added `line_items: Optional[List[LineItem]] = None` to `ConfirmDocumentFieldsRequest`.
- **Deterministic Amount & Quantity Parsing**:
  - Added `_parse_amount` with currency prefix cleaning (`Rs.`, `INR`, `₹`, `Ps.`, `Fs.`), comma removal, and numeric float conversion.
  - Added `_parse_quantity` to handle integer, float, and numeric string expressions.
  - Implemented `_parse_line_items` to schema-validate items: malformed entries (missing description or invalid numeric amount) are collected into `malformed_line_items` and NEVER dropped silently.
- **3,000-Character Cap Handling via Chunk Segmentation**:
  - For itemised bills exceeding 2,800 characters, the text is sliced into overlapping segments (chunk size 2,800, overlap 300).
  - Each segment undergoes extraction and validation.
  - Segments are merged via `_merge_line_items`, de-duplicating by normalized `(description.lower(), round(amount, 2))`.
- **Line Item Sum vs Bill Total Discrepancy Check**:
  - Configurable tolerance setting added to `app/config.py`: `settings.line_item_sum_tolerance = 100.0` (default ₹100.0).
  - If the absolute difference between `sum(line_items)` and `total_amount` exceeds `line_item_sum_tolerance`, `validate_document` adds an issue:
    `"Sum of line items (₹X) differs from bill total (₹Y) by ₹Z (exceeds ₹100 tolerance)."`
    and raises `needs_confirmation = True`.
- **UI Integration**:
  - `client/src/claims/DocumentChecklistSection.jsx`:
    - Renders the itemized line items table in the expanded card with total sum and line count.
    - Added interactive editable line items rows in the confirmation form (+ Add Line Item, edit description, quantity, amount, remove item).
  - `client/src/claims/ClaimReviewScreen.jsx`:
    - Renders an itemised line items breakdown card displaying all line items extracted from the verified hospital bill.

### 1.3 Slot Re-upload File Cleanup (`server/routers/claims.py`)
- **Problem**: Re-uploading a document to an existing checklist slot left old files on disk as orphans.
- **Fix**:
  - In `upload_claim_document`, before writing the new file, inspect the existing document for that slot:
    ```python
    existing_doc_for_slot = next((d for d in claim.get("documents", []) if d.get("item_id") == item_id), None)
    if existing_doc_for_slot and existing_doc_for_slot.get("file_path"):
        old_fpath = existing_doc_for_slot["file_path"]
        if os.path.exists(old_fpath):
            os.remove(old_fpath)
    ```
  - Full validation state for the slot is replaced cleanly.

### 1.4 Claim & Policy Deletion Cascades (`server/routers/claims.py`, `server/routers/policies.py`, `server/services/policy_service.py`)
- **`DELETE /api/claims/{claim_id}`**:
  - Validates user ownership (`claim["user_id"] == current_user["_id"]`).
  - Deletes MongoDB claim record from `db.claims`.
  - Recursively removes the claim uploads folder (`server/uploads/claims/{claim_id}`) via `shutil.rmtree`.
- **`DELETE /api/policies/{policy_id}`**:
  - Checks if any claims reference this policy for the user (`db.claims.find({"user_id": user_id, "policy_id": policy_id})`).
  - If claims exist and `cascade=False` (default): raises HTTP 409 Conflict with message:
    `"Cannot delete policy: X claim(s) reference this policy. Pass ?cascade=true to delete the policy and all associated claims."`
  - If `cascade=True`: iterates through all referencing claims, removes their uploads directory `server/uploads/claims/{claim_id}`, removes all referencing claims from `db.claims`, deletes policy chunks, cleans conversation references, deletes vector collection, and unlinks policy file.

---

## 2. Test Fixtures & Line-Item Recall / Accuracy

Created two test fixtures with 10+ line items in `tests/claims/fixtures/`:
1. **`itemised_bill_standard.pdf`**:
   - 12 itemised lines (length ~1,091 characters).
   - Line items ground truth:
     - Room Rent & Nursing Charges (4 Days): ₹24,000.00
     - Operation Theatre Charges: ₹45,000.00
     - Surgeon Professional Fee: ₹75,000.00
     - Anaesthetist Professional Fee: ₹20,000.00
     - Implant - High Flex Knee Joint Kit: ₹60,000.00
     - Pre-operative Cardiology Clearance: ₹4,500.00
     - Post-operative ICU Monitoring (24h): ₹15,000.00
     - Diagnostic Radiology Bilateral Knee X-Ray: ₹3,500.00
     - Biochemistry & CBC Routine Blood Panel: ₹2,800.00
     - Physiotherapy Rehabilitation Sessions: ₹6,000.00
     - Hospital Pharmacy Antibiotics & Analgesics: ₹12,500.00
     - Surgical Consumables & Disposable Gowns: ₹8,200.00
     - **Bill Total**: ₹2,76,500.00
   - **Line-item recall**: 100% (12/12)
   - **Amount accuracy**: 100% (12/12)

2. **`itemised_bill_long.pdf`**:
   - 14 itemised lines (length 3,465 characters, exceeding the 3,000-character cap).
   - Extracted across multiple overlapping segments and de-duplicated.
   - Line items ground truth:
     - Room Rent & Deluxe AC Suite Charges (Day 1 to 4): ₹28,000.00
     - Professional Nursing Care and Monitoring Charges: ₹8,000.00
     - Operation Theatre Tier-1 Advanced Facility Charges: ₹48,000.00
     - Senior Consultant Orthopaedic Surgeon Operating Fee: ₹85,000.00
     - Lead Consultant Anaesthesia Induction & Monitoring Fee: ₹22,000.00
     - Orthopaedic Titanium Knee Implant Complete Modular Set: ₹65,000.00
     - Cardiology Pre-operative Fitness Evaluation and ECHO Test: ₹5,500.00
     - High Dependency Unit Post-operative Observation Facility: ₹16,000.00
     - Digital Diagnostic Imaging Bilateral Weight-Bearing X-Rays: ₹4,200.00
     - Comprehensive Hematology, Coagulation and Metabolic Profile: ₹3,600.00
     - In-hospital Physical Therapy and Early Ambulation Protocol: ₹7,500.00
     - Central Hospital Pharmacy Prescribed Injectable Antibiotics: ₹14,200.00
     - Sterile Surgical Consumables, Drapes, Gowns and Gloves: ₹9,800.00
     - Post-operative Pain Management Epidural Infusion Protocol: ₹6,200.00
     - **Bill Total**: ₹3,18,000.00
   - **Line-item recall**: 100% (14/14)
   - **Amount accuracy**: 100% (14/14)

---

## 3. Test Results Before & After

### Before Fixes
- `test_settlement_ignores_needs_confirmation_bill`: FAILED (settlement was adopting unconfirmed bill amount).
- `test_line_item_amount_parsing`: FAILED (`LineItem` model and deterministic parser did not exist).
- `test_malformed_line_items_trigger_needs_confirmation`: FAILED (malformed items were untracked).
- `test_line_items_total_discrepancy_raises_flag`: FAILED (sum discrepancy check was missing).
- `DELETE /claims/{id}`: Missing endpoint (orphaning database entries and files).
- `DELETE /policies/{id}`: No cascade blocking on referenced claims (orphaning claim records).

### After Fixes
- All 12 unit and integration tests in `tests/claims/test_audit_fixes.py` PASS:
  - `test_settlement_ignores_needs_confirmation_bill` PASSED
  - `test_settlement_adopts_validated_bill` PASSED
  - `test_settlement_adopts_user_confirmed_bill` PASSED
  - `test_settlement_ignores_bill_with_unresolved_blocking_issue` PASSED
  - `test_line_item_amount_parsing` PASSED
  - `test_malformed_line_items_trigger_needs_confirmation` PASSED
  - `test_line_items_total_discrepancy_raises_flag` PASSED
  - `test_line_items_deduplication_across_chunks` PASSED
  - `test_fixtures_line_item_recall_and_amount_accuracy` PASSED
  - `test_slot_reupload_deletes_previous_file_from_disk` PASSED
  - `test_policy_deletion_blocks_with_409_when_claims_exist` PASSED
  - `test_claim_deletion_cleans_db_and_disk` PASSED
- Full claim suite: **70 passed, 0 failed in 7.43s**.

---

## 4. Deviations & Notes
- None. RAG, Q&A, and eligibility logic were completely preserved without modification.
