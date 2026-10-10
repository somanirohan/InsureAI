# OCR and Claim Document Pipeline Debug & Diagnostic Report

## Environment & Dependency Audit

| Check | Result | Details |
|---|---|---|
| **OS / Architecture** | macOS (Darwin 25.0.0 / arm64) | Running locally without Docker |
| **Python Environment** | Python 3.11.15 (`/opt/homebrew/opt/python@3.11/bin/python3.11`) | Also Apple Python 3.9 present |
| **Tesseract Binary** | **NOT INSTALLED** | `which tesseract` / `tesseract --version` exited 127 (`command not found`). Not present in `/opt/homebrew/bin`, `/usr/local/bin`, or system PATH. |
| **Language Data** | **MISSING** | No Tesseract tessdata available due to missing binary. |
| **Python OCR Wrapper** | `pytesseract` 0.3.13 installed | Default `tesseract_cmd` is `'tesseract'`. Calling `pytesseract.image_to_string` raises `TesseractNotFoundError: tesseract is not installed or it's not in your PATH`. |
| **PyMuPDF Resolution** | 150 DPI in `app/claims/documents.py:91` | Under the required 200-300 DPI for high-accuracy OCR text recognition (contrast with `app/ingestion/pdf_extract.py` which uses 300 DPI: `300/72 ≈ 4.17`). |
| **LLM Provider & Reachability** | Reachable via Groq API | Model `qwen/qwen3.8-27b`, base URL `https://api.groq.com/openai/v1`. Endpoint reachable, but **exceeds rate limits (429 TPM/OTPM)** on larger prompts / default `max_tokens=2048`. |

---

## Pipeline Stage Tracing Matrix (Step 1 Reproduction)

Four synthetic fixtures were tested through the pipeline:
1. `tests/claims/fixtures/clean_bill.pdf` (Clean text-based PDF bill)
2. `tests/claims/fixtures/scanned_bill.pdf` (Scanned image embedded in PDF, no text layer)
3. `tests/claims/fixtures/photo_bill.jpg` (Direct image photograph of bill)
4. `tests/claims/fixtures/discharge_summary.pdf` (Clean text-based discharge summary PDF)

| Test File | Stage (a): Text Extraction | Stage (b): OCR Fallback Trigger & Result | Stage (c): Raw LLM Response / JSON Parsing | Stage (d): Extracted Fields & Confidence | Stage (e): Validator Results & Reasons | Stage (f): Status & `needs_confirmation` | Pass / Fail |
|---|---|---|---|---|---|---|---|
| **1. clean_bill.pdf** (Text PDF, slot: `final_bill`) | Length: 528 chars. First 200: `"APOLLO HOSPITALS ENTERPRISE LTD\nFINAL INPATIENT BILL / TAX INVOICE\nBill No: INV-2024-98431\nPatient Name: Ramesh Sharma\nAdmission Date: 2024-05-10..."` | Native PyMuPDF text extracted; OCR fallback not triggered. | LLM call failed with HTTP 429 (`Request too large for model qwen/qwen3.8-27b... Limit 1000, Requested 1230`). Triggered regex fallback. Regex parsed dates and amount, but missed `patient_name` and misclassified `document_type` as `"discharge_summary"`. | `patient_name`: null (conf: 0.4)<br>`total_amount`: 245000.0 (conf: 0.5)<br>`admission_date`: 2024-05-10 (conf: 0.5)<br>`document_type`: "discharge_summary" (conf: 0.5) | 1. Name: Patient name could not be identified.<br>2. Doc Type: Detected as `discharge_summary` but uploaded to `final_bill`.<br>3. Confidence: All fields < 0.7. | `needs_confirmation: True`<br>Issues: Name missing, wrong slot detected. | **FAIL** (False positive on clean text PDF) |
| **2. scanned_bill.pdf** (Scanned PDF, slot: `final_bill`) | Length: 0 chars. No native text layer. | Native text empty (< threshold). Triggered OCR fallback. PyMuPDF rendered at 150 DPI. OCR crashed with `TesseractNotFoundError` caught and logged. | No text extracted. Empty fields returned with confidence 0.0 without calling LLM. | `patient_name`: null (0.0)<br>`total_amount`: null (0.0)<br>`document_type`: "unknown" (0.0) | 1. Name missing.<br>2. Total amount missing in bill slot.<br>3. Confidence = 0.0. | `needs_confirmation: True`<br>Generic issues: Name missing, amount missing. No mention that OCR failed/missing. | **FAIL** (Silent OCR failure, misattributed reasons) |
| **3. photo_bill.jpg** (JPG bill photo, slot: `final_bill`) | Length: 0 chars. Image file. | Direct image branch called `pytesseract.image_to_string(img)`. Crashed with `TesseractNotFoundError` caught and logged. | No text extracted. Empty fields returned with confidence 0.0 without calling LLM. | `patient_name`: null (0.0)<br>`total_amount`: null (0.0)<br>`document_type`: "unknown" (0.0) | 1. Name missing.<br>2. Total amount missing in bill slot.<br>3. Confidence = 0.0. | `needs_confirmation: True`<br>No explicit indication of OCR failure. | **FAIL** (Silent OCR failure, misattributed reasons) |
| **4. discharge_summary.pdf** (Text PDF, slot: `discharge_summary`) | Length: 573 chars. First 200: `"FORTIS MEMORIAL RESEARCH INSTITUTE\nDISCHARGE SUMMARY\nPatient Name: Ramesh Sharma\nAge / Gender: 58 Y / Male\nAdmission Date: 2024-05-10..."` | Native PyMuPDF text extracted; OCR fallback not triggered. | LLM succeeded. Returned valid JSON. Parsed `patient_name`: "Ramesh Sharma", dates: "2024-05-10" / "2024-05-14", `diagnosis`: "Severe Osteoarthritis...", `document_type`: "discharge_summary". `total_amount`: 0.0 (conf: 0.0). | `patient_name`: "Ramesh Sharma" (1.0)<br>`admission_date`: "2024-05-10" (1.0)<br>`discharge_date`: "2024-05-14" (1.0)<br>`diagnosis`: "Severe..." (1.0)<br>`total_amount`: 0.0 (0.0)<br>`document_type`: "discharge_summary" (1.0) | All 5 domain validators PASSED: Name matches 100%, dates valid, diagnosis aligned, doc type matches. **However, line 396 confidence check flagged document because `total_amount` confidence is 0.0 (< 0.7)** even though a discharge summary is NOT a bill and has no amount! | `needs_confirmation: True`<br>Issues: `[]` (empty list!). The UI shows "needs verification" with zero explanation. | **FAIL** (False positive on non-bill document due to unconditional `total_amount` confidence threshold check) |

---

## Confirmed Root Causes

1. **Host Environment: Missing Tesseract binary**:
   - `tesseract` binary is not installed on the host macOS machine or not on PATH.
   - Pytesseract raises `TesseractNotFoundError`.
   - The exception is caught silently in `extract_document_text`, returning `""` without recording the failure reason.

2. **Unconditional `total_amount` Confidence Guard in `validate_document`**:
   - In `app/claims/documents.py:396`:
     ```python
     for field_name, conf_val in field_confidence.items():
         if field_name in ("patient_name", "total_amount", "admission_date") and conf_val < 0.7:
             needs_confirmation = True
     ```
   - For a `discharge_summary`, `preauth_form`, `diagnostic_reports`, or `id_proof`, `total_amount` is naturally `null` / `0.0` with confidence `0.0`.
   - This causes **every non-bill document** (even 100% perfectly extracted and valid ones) to be forced into `needs_confirmation = True` with `validation_issues = []`!

3. **Inadequate DPI & Lack of Image Preprocessing**:
   - PyMuPDF renders pages at `dpi=150` in `app/claims/documents.py:91`, which degrades OCR accuracy for small print on bills and reports. Needs 300 DPI (`zoom = 300 / 72`).
   - Direct image processing does not do basic preprocessing (grayscale conversion, EXIF/rotation handling).

4. **Weak / Fragile Regex Fallback in `_regex_fallback_extract`**:
   - `patient_name` extraction has no regex extraction in fallback at all (always returns `null`).
   - Document type regex checks for `"summary"` before `"bill"`, misidentifying bills that contain "summary of charges" or "bill summary".
   - When LLM fails (e.g. rate limit 429), clean documents fail immediately due to regex fallback weaknesses.

5. **LLM Parameter Tuning (Groq OTPM Rate Limits & Strict JSON)**:
   - `OpenAICompatibleProvider` defaults `max_tokens` to 2048, which exceeds Groq's on-demand free tier OTPM limit (1000 tokens) on `qwen/qwen3.8-27b`, resulting in HTTP 429 errors.
   - Prompts in `extract_document_fields` should specify `max_tokens=600` or `format="json"`.

6. **Missing Failure Transparency and UI Visibility**:
   - When OCR is unavailable or fails, or when extraction yields empty text, `needs_confirmation` is set but the specific reason ("OCR unavailable on this machine", "No readable text extracted", etc.) is not added to `validation_issues`.
   - The UI does not show the specific reason banner if `validation_issues` is empty or if OCR is unavailable.

---

## Verification & Fix Summary (Steps 2, 3, & 4)

### 1. Fixes Applied
- **Host Environment & Tesseract Availability**:
  - Tesseract 5.5.3 installed on host machine via Homebrew (`/opt/homebrew/bin/tesseract`).
  - Implemented `check_ocr_availability()` in `app/claims/documents.py` to inspect Tesseract binary, version, and language packs (`eng`, `osd`).
  - Added OCR diagnostics to `GET /api/health` and startup logging.
  - Added graceful fallback: if Tesseract is missing, uploads succeed, and the document is explicitly flagged with `"OCR unavailable on this machine. Please install Tesseract on host."`
- **Resolution & Preprocessing**:
  - Upgraded PyMuPDF rendering from 150 DPI to 300 DPI (`zoom = 300 / 72`) with `fitz.csRGB`.
  - Added PIL `ImageOps.exif_transpose` and rotation detection to handle photo scans and phone camera orientations.
- **Validation False Positives Resolved**:
  - Removed unconditional `total_amount` confidence checking for non-bill slots (`discharge_summary`, `diagnostic_reports`, `id_proof`). Non-bill documents now validate without being flagged for missing bills.
  - Slot-aware confidence guards: `patient_name` checked across all documents; `total_amount` checked strictly on bill slots (`final_bill`, `itemised_bills`); `admission_date` checked on clinical inpatient documents.
- **LLM Rate Limit Handling (Groq OTPM & JSON formatting)**:
  - Added `max_tokens=600`, markdown fence stripping, and tolerant currency/amount parsing (currency symbols, commas, INR/Rs).
  - Enhanced regex fallback to parse patient names, dates, amounts, and document types cleanly if LLM hits rate limits.
- **Failure Transparency in UI**:
  - Updated `DocumentCard` in `DocumentChecklistSection.jsx` to render the exact failure reason (e.g., `Reason: Document missing a valid positive total billed amount.`) on the card itself, not just a generic badge.
- **Re-run Pipeline Action**:
  - Added `POST /api/claims/{claim_id}/documents/{document_id}/reprocess` endpoint.
  - Added a "Re-run" button in the claim documents UI to reprocess documents without re-uploading.
- **CLI Diagnostic Script**:
  - Created `scripts/debug_document.py <file_path>` for terminal inspection of OCR text, LLM extraction, and validators.

### 2. Synthetic Test Documents Evaluation Before & After

| Fixture / Scenario | Document Slot | Status Before Fix | Status After Fix | Validation Reason / Behavior |
|---|---|---|---|---|
| `clean_bill.pdf` (Clean text PDF) | `final_bill` | `needs_confirmation` (False positive) | **`validated`** | Native text extracted (528 chars); fields extracted; 0 issues. |
| `scanned_bill.pdf` (Scanned image in PDF) | `final_bill` | `needs_confirmation` (Silent OCR crash) | **`validated`** | 300 DPI OCR triggered; all fields extracted; 0 issues. |
| `photo_bill.jpg` (Photograph of bill) | `final_bill` | `needs_confirmation` (Silent OCR crash) | **`validated`** | Direct image OCR triggered; fields extracted; 0 issues. |
| `discharge_summary.pdf` (Discharge summary) | `discharge_summary` | `needs_confirmation` (False positive on missing bill amount) | **`validated`** | Extracted cleanly; non-bill slot exempt from bill total validator; 0 issues. |
| `scanned_bill.pdf` with Tesseract mocked missing | `final_bill` | Silent crash | **`needs_confirmation`** | Flagged with `"OCR unavailable on this machine. Please install Tesseract on host."` |
| `blank.png` (Blank image) | `final_bill` | Silent crash | **`needs_confirmation`** | Flagged with `"Document unreadable or blank: no text could be extracted."` |
| Flawed: Wrong Patient Name | `final_bill` | `needs_confirmation` | **`needs_confirmation`** | Flagged with `"Extracted patient name 'Sunita Verma' does not match expected name 'Ramesh Sharma'"` |
| Flawed: Discharge before Admission | `final_bill` | `needs_confirmation` | **`needs_confirmation`** | Flagged with `"Admission date (2024-05-20) cannot be after discharge date (2024-05-14)."` |
| Flawed: Bill missing total | `final_bill` | `needs_confirmation` | **`needs_confirmation`** | Flagged with `"Document missing a valid positive total billed amount."` |
| Flawed: Bill uploaded to discharge slot | `discharge_summary` | `needs_confirmation` | **`needs_confirmation`** | Flagged with `"Document detected as 'final_bill' but was uploaded to the 'discharge_summary' slot."` |

- **Before Fix:** 0 of 4 synthetic documents reached `validated` (all failed into `needs_confirmation`).
- **After Fix:** 4 of 4 clean synthetic documents reached `validated`; all 4 flawed documents remained strictly flagged with exact, descriptive reason strings.
- **Full Regression Test Suite:** All 58 tests in `tests/claims/` passed (0 regressions).
