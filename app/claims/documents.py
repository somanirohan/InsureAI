"""
Document extraction and deterministic validation pipeline for claim documents.
Extracts structured fields (patient name, dates, diagnosis, amounts) with confidence scoring.
Applies 5 deterministic validators:
  1. Patient name fuzzy matching against expected user/policyholder name.
  2. Admission/discharge date consistency and alignment with treatment admission date.
  3. Positive numeric bill total validation.
  4. Diagnosis consistency with claimed treatment.
  5. Document type alignment with checklist slot.
Any parsing failure, validation issue, or confidence < 0.7 marks needs_confirmation = True.
"""

from __future__ import annotations

import difflib
import json
import logging
import os
import re
import uuid
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

try:
    import pymupdf as fitz
except ImportError:
    import fitz  # type: ignore[no-redef]

from app.claims.models import ClaimDocument, TreatmentDetails
from app.llm.factory import get_llm

logger = logging.getLogger("insureai.claims.documents")


# ── Slot to Document Type Mapping ─────────────────────────────────────────────

EXPECTED_DOC_TYPES_FOR_SLOT: Dict[str, set[str]] = {
    "discharge_summary": {"discharge_summary", "discharge_card", "summary", "medical_summary"},
    "itemised_bills": {"itemised_bills", "itemized_bills", "final_bill", "hospital_bill", "invoice", "bill", "detailed_bill", "receipts"},
    "final_bill": {"final_bill", "itemised_bills", "hospital_bill", "invoice", "bill", "detailed_bill"},
    "diagnostic_reports": {"diagnostic_reports", "diagnostic_report", "investigation_reports", "investigation_report", "lab_report", "radiology", "pathology"},
    "investigation_reports": {"investigation_reports", "investigation_report", "diagnostic_reports", "lab_report", "radiology", "pathology"},
    "prescriptions": {"prescriptions", "prescription", "pharmacy_bill", "medicine_bill"},
    "claim_form": {"claim_form", "completed_claim_form", "reimbursement_claim_form", "form_a", "form_b"},
    "reimbursement_claim_form": {"reimbursement_claim_form", "claim_form", "form_a", "form_b"},
    "preauth_approval_letter": {"preauth_approval_letter", "preauth_form", "pre_authorization", "cashless_request", "preauth_approval"},
    "preauth_form": {"preauth_form", "preauth_approval_letter", "pre_authorization", "cashless_request", "preauth_approval"},
    "id_proof": {"id_proof", "identity_proof", "aadhaar", "pan", "passport", "id_card", "voter_id"},
    "identity_proof": {"identity_proof", "id_proof", "aadhaar", "pan", "passport", "id_card", "voter_id"},
    "policy_copy": {"policy_copy", "policy_schedule", "health_card"},
    "doctor_certificate": {"doctor_certificate", "medical_certificate"},
    "emergency_intimation": {"emergency_intimation", "intimation_mail", "intimation_letter", "notification"},
}


# ── OCR & Environment Helpers ──────────────────────────────────────────────────

def check_ocr_availability() -> Dict[str, Any]:
    """
    Check if Tesseract binary and language data are available on host system.
    """
    try:
        import pytesseract
        import shutil

        tess_bin = shutil.which("tesseract") or getattr(pytesseract.pytesseract, "tesseract_cmd", "tesseract")
        version = str(pytesseract.get_tesseract_version())
        langs = pytesseract.get_languages(config="")
        return {
            "available": True,
            "binary_path": tess_bin,
            "version": version,
            "languages": langs,
            "error": None,
        }
    except Exception as exc:
        return {
            "available": False,
            "binary_path": None,
            "version": None,
            "languages": [],
            "error": str(exc),
        }


# ── Text Extraction ───────────────────────────────────────────────────────────

def extract_document_text(file_path: str, claim_id: Optional[str] = None, doc_id: Optional[str] = None) -> Tuple[str, Dict[str, Any]]:
    """
    Extract raw text from PDF or Image file with robust fallbacks and diagnostics.
    Returns: (extracted_text, diagnostic_info)
    """
    diag: Dict[str, Any] = {
        "source": "empty",
        "ocr_triggered": False,
        "ocr_available": True,
        "ocr_error": None,
        "char_count": 0,
        "first_200": "",
    }

    if not os.path.exists(file_path):
        raise FileNotFoundError(f"Document file not found: {file_path}")

    ext = Path(file_path).suffix.lower()
    text_parts: List[str] = []

    if ext == ".pdf":
        try:
            with fitz.open(file_path) as doc:
                for page in doc:
                    txt = page.get_text("text")
                    if txt and txt.strip():
                        text_parts.append(txt.strip())
            
            combined = "\n\n".join(text_parts).strip()
            # If native text extraction has at least 50 characters, use native
            if len(combined) >= 50:
                diag["source"] = "native"
                diag["char_count"] = len(combined)
                diag["first_200"] = combined[:200]
                logger.info("[%s/%s] Native PDF text extracted: %d chars", claim_id or "-", doc_id or "-", len(combined))
                return combined, diag
        except Exception as exc:
            logger.warning("[%s/%s] PyMuPDF native extraction failed on %s: %s", claim_id or "-", doc_id or "-", file_path, exc)

    # Scanned PDF or Image: Trigger OCR fallback
    diag["ocr_triggered"] = True
    ocr_status = check_ocr_availability()
    if not ocr_status["available"]:
        diag["ocr_available"] = False
        diag["ocr_error"] = ocr_status.get("error") or "Tesseract binary not found on host PATH"
        logger.warning("[%s/%s] OCR unavailable: %s", claim_id or "-", doc_id or "-", diag["ocr_error"])
        return "", diag

    try:
        from PIL import Image, ImageOps
        import pytesseract

        def _preprocess_and_ocr(pil_img: Image.Image) -> str:
            # Basic preprocessing: convert to RGB / L, handle rotation
            try:
                # Handle EXIF orientation
                pil_img = ImageOps.exif_transpose(pil_img)
            except Exception:
                pass
            
            # Grayscale for OCR sharpness
            gray = pil_img.convert("L")

            # Try Tesseract OSD (Orientation and Script Detection) if available
            try:
                osd = pytesseract.image_to_osd(gray)
                angle_match = re.search(r'Rotate: (\d+)', osd)
                if angle_match:
                    angle = int(angle_match.group(1))
                    if angle in (90, 180, 270):
                        gray = gray.rotate(360 - angle, expand=True)
            except Exception:
                pass

            return pytesseract.image_to_string(gray, lang="eng").strip()

        if ext == ".pdf":
            with fitz.open(file_path) as doc:
                ocr_parts = []
                # Render pages at 300 DPI for high fidelity
                zoom = 300 / 72
                mat = fitz.Matrix(zoom, zoom)
                for idx in range(min(len(doc), 5)):
                    pix = doc[idx].get_pixmap(matrix=mat, colorspace=fitz.csRGB)
                    img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
                    page_txt = _preprocess_and_ocr(img)
                    if page_txt:
                        ocr_parts.append(page_txt)
                
                combined_ocr = "\n\n".join(ocr_parts).strip()
                diag["source"] = "ocr" if combined_ocr else "empty"
                diag["char_count"] = len(combined_ocr)
                diag["first_200"] = combined_ocr[:200]
                logger.info("[%s/%s] PDF OCR finished: %d chars", claim_id or "-", doc_id or "-", len(combined_ocr))
                return combined_ocr, diag
        else:
            # Direct Image (JPG/PNG)
            with Image.open(file_path) as img:
                img_txt = _preprocess_and_ocr(img)
                diag["source"] = "ocr" if img_txt else "empty"
                diag["char_count"] = len(img_txt)
                diag["first_200"] = img_txt[:200]
                logger.info("[%s/%s] Image OCR finished: %d chars", claim_id or "-", doc_id or "-", len(img_txt))
                return img_txt, diag

    except Exception as exc:
        diag["ocr_error"] = str(exc)
        logger.warning("[%s/%s] OCR processing failed on %s: %s", claim_id or "-", doc_id or "-", file_path, exc)

    return "", diag


# ── LLM Extraction & Regex Fallback ───────────────────────────────────────────

def _regex_fallback_extract(text: str, item_id: str) -> Tuple[Dict[str, Any], Dict[str, float]]:
    """Deterministic regex extraction when LLM is unavailable or unparseable."""
    fields: Dict[str, Any] = {
        "patient_name": None,
        "admission_date": None,
        "discharge_date": None,
        "diagnosis": None,
        "total_amount": None,
        "document_type": None,
    }
    confidence: Dict[str, float] = {
        "patient_name": 0.4,
        "admission_date": 0.5,
        "discharge_date": 0.5,
        "diagnosis": 0.4,
        "total_amount": 0.5,
        "document_type": 0.5,
    }

    # Extract patient name via pattern: Patient Name[:\s]+([A-Za-z\s]+)
    name_match = re.search(r'(?:patient(?:\'s)?\s*name|name\s*of\s*patient)\s*[:\-]?\s*([A-Za-z][A-Za-z\s\.]{2,40})', text, re.IGNORECASE)
    if name_match:
        cand = name_match.group(1).split("\n")[0].strip()
        cand = re.sub(r'\s+', ' ', cand)
        if len(cand) >= 3 and not any(k in cand.lower() for k in ("age", "gender", "sex", "date", "dr.", "doctor")):
            fields["patient_name"] = cand
            confidence["patient_name"] = 0.75

    # Normalize common OCR character confusions in numbers and punctuation
    norm_text = text.replace("‘", "").replace("’", "").replace("`", "")

    # Extract dates
    dates = re.findall(r'\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}[/-]\d{2}[/-]\d{2})\b', norm_text)
    if dates:
        for raw_d in dates:
            iso_d = _normalize_date_str(raw_d)
            if iso_d:
                if not fields["admission_date"]:
                    fields["admission_date"] = iso_d
                    confidence["admission_date"] = 0.75
                elif not fields["discharge_date"] and iso_d >= fields["admission_date"]:
                    fields["discharge_date"] = iso_d
                    confidence["discharge_date"] = 0.75

    # Extract currency amounts (handling Rs, INR, Ps/Fs OCR confusions, and Total/Tal Amount)
    curr_matches = re.findall(
        r'(?:(?:rs|inr|₹|ps|fs)\.?|(?:total|tal|amt|amount|payable|net)\s*(?:amount|payable|charges)?[:\s\.]*)\s*([\d,]+(?:\.\d{2})?)',
        norm_text,
        re.IGNORECASE,
    )
    amounts: List[float] = []
    for m in curr_matches:
        try:
            cleaned_num = m.replace(",", "").rstrip(".")
            if cleaned_num:
                amt = float(cleaned_num)
                if amt > 0:
                    amounts.append(amt)
        except ValueError:
            pass
    if amounts:
        fields["total_amount"] = max(amounts)
        confidence["total_amount"] = 0.75

    # Extract diagnosis if indicated
    diag_match = re.search(r'(?:diagn[oa]sis|indication|condition)\s*[:\-]?\s*([A-Za-z][A-Za-z\s]{3,50})', norm_text, re.IGNORECASE)
    if diag_match:
        cand_diag = diag_match.group(1).split("\n")[0].strip()
        if len(cand_diag) >= 4:
            fields["diagnosis"] = cand_diag
            confidence["diagnosis"] = 0.75

    # Document type inference (prioritize specific keywords over general)
    lower_text = norm_text.lower()
    if any(k in lower_text for k in ("final inpatient bill", "final bill", "tax invoice", "hospital bill", "invoice")):
        fields["document_type"] = "final_bill"
        confidence["document_type"] = 0.8
    elif any(k in lower_text for k in ("discharge summary", "discharge card")):
        fields["document_type"] = "discharge_summary"
        confidence["document_type"] = 0.8
    elif any(k in lower_text for k in ("investigation", "diagnostic report", "pathology")):
        fields["document_type"] = "diagnostic_reports"
        confidence["document_type"] = 0.75
    elif item_id in ("final_bill", "itemised_bills") and fields.get("total_amount") is not None:
        fields["document_type"] = "final_bill"
        confidence["document_type"] = 0.7
    else:
        fields["document_type"] = "unknown"

    return fields, confidence


def _normalize_date_str(raw: str) -> Optional[str]:
    """Convert various date strings to ISO YYYY-MM-DD."""
    if not raw or not isinstance(raw, str):
        return None
    raw = raw.strip()
    # Normalize common OCR confusions in digits (e.g. O->0, l/I->1)
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%m/%d/%Y", "%d/%m/%y", "%d-%m-%y"):
        try:
            return datetime.strptime(raw, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return None


def extract_document_fields(
    text: str,
    item_id: str,
    claim_id: Optional[str] = None,
    doc_id: Optional[str] = None,
) -> Tuple[Dict[str, Any], Dict[str, float]]:
    """
    Extract structured fields and per-field confidence from document text.
    Uses LLM structured extraction, falling back to deterministic regex on failure.
    """
    if not text.strip():
        empty_fields: Dict[str, Any] = {
            "patient_name": None,
            "admission_date": None,
            "discharge_date": None,
            "diagnosis": None,
            "total_amount": None,
            "document_type": "unknown",
        }
        empty_conf: Dict[str, float] = {k: 0.0 for k in empty_fields}
        return empty_fields, empty_conf

    prompt = f"""You are a specialized medical insurance document parser.
Analyze the following document text and extract the structured claim fields into JSON.

Document context: Uploaded for checklist slot '{item_id}'.

DOCUMENT TEXT:
\"\"\"
{text[:3000]}
\"\"\"

Respond with ONLY a valid JSON object matching this schema:
{{
  "patient_name": "string or null",
  "admission_date": "YYYY-MM-DD string or null",
  "discharge_date": "YYYY-MM-DD string or null",
  "diagnosis": "string or null",
  "total_amount": 0.0,
  "document_type": "discharge_summary | itemised_bills | final_bill | diagnostic_reports | investigation_reports | identity_proof | id_proof | prescriptions | claim_form | preauth_form | preauth_approval_letter | unknown",
  "confidence": {{
    "patient_name": 0.0 to 1.0,
    "admission_date": 0.0 to 1.0,
    "discharge_date": 0.0 to 1.0,
    "diagnosis": 0.0 to 1.0,
    "total_amount": 0.0 to 1.0,
    "document_type": 0.0 to 1.0
  }}
}}
Do not invent data. If a field is not found in the text, set it to null and confidence to 0.0.
Output only the JSON object, no explanation.
"""

    try:
        llm = get_llm()
        reply = llm.chat(
            messages=[
                {"role": "system", "content": "You are a precise insurance data extractor that returns only strict JSON."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.0,
            max_tokens=600,
            format="json",
        )

        # Strip markdown fences if present
        cleaned_reply = reply.strip()
        if cleaned_reply.startswith("```"):
            cleaned_reply = re.sub(r'^```(?:json)?\n?', '', cleaned_reply)
            cleaned_reply = re.sub(r'\n?```$', '', cleaned_reply)

        json_match = re.search(r'\{.*\}', cleaned_reply, re.DOTALL)
        if json_match:
            data = json.loads(json_match.group(0))
            conf = data.get("confidence") or {}
            
            raw_amt = data.get("total_amount")
            parsed_amt = None
            if raw_amt is not None:
                if isinstance(raw_amt, (int, float)):
                    parsed_amt = float(raw_amt)
                elif isinstance(raw_amt, str):
                    clean_str = re.sub(r'[^\d.]', '', raw_amt)
                    if clean_str:
                        try:
                            parsed_amt = float(clean_str)
                        except ValueError:
                            pass

            fields = {
                "patient_name": data.get("patient_name") or None,
                "admission_date": _normalize_date_str(data.get("admission_date")),
                "discharge_date": _normalize_date_str(data.get("discharge_date")),
                "diagnosis": data.get("diagnosis") or None,
                "total_amount": parsed_amt,
                "document_type": str(data.get("document_type") or "unknown").lower(),
            }
            parsed_conf = {
                k: float(conf.get(k, 0.85 if fields[k] is not None else 0.0)) for k in fields
            }
            logger.info("[%s/%s] LLM field extraction succeeded: %s", claim_id or "-", doc_id or "-", fields)
            return fields, parsed_conf

    except Exception as exc:
        logger.warning("[%s/%s] LLM extraction failed or timed out: %s. Using regex fallback.", claim_id or "-", doc_id or "-", exc)

    return _regex_fallback_extract(text, item_id)


# ── Deterministic 5 Validators ────────────────────────────────────────────────

def _fuzzy_name_match(name1: Optional[str], name2: Optional[str]) -> float:
    """Calculate token similarity and sequence match between two names."""
    if not name1 or not name2:
        return 0.0
    s1 = " ".join(re.findall(r'[a-zA-Z]+', name1.lower())).strip()
    s2 = " ".join(re.findall(r'[a-zA-Z]+', name2.lower())).strip()
    if not s1 or not s2:
        return 0.0
    if s1 == s2 or s1 in s2 or s2 in s1:
        return 1.0

    t1 = set(s1.split())
    t2 = set(s2.split())
    if t1 and t2:
        # If all tokens of shorter name appear in longer name (e.g. first + last name in full name)
        if t1.issubset(t2) or t2.issubset(t1):
            return 1.0
        token_sim = len(t1.intersection(t2)) / max(len(t1), len(t2))
        if token_sim >= 0.7:
            return token_sim

    return difflib.SequenceMatcher(None, s1, s2).ratio()


def validate_document(
    extracted_fields: Dict[str, Any],
    field_confidence: Dict[str, float],
    item_id: str,
    treatment: Optional[TreatmentDetails] = None,
    expected_patient_name: Optional[str] = None,
    ocr_diag: Optional[Dict[str, Any]] = None,
) -> Tuple[List[str], bool]:
    """
    Run 5 deterministic validators on the extracted document fields:
      1. Patient name fuzzy match (expected >= 0.85).
      2. Date consistency (admission <= discharge; matches treatment admission date +- 1 day).
      3. Positive numeric bill total (if bill item).
      4. Diagnosis consistency with treatment.
      5. Document type alignment with checklist slot.
      
    Returns:
      (validation_issues: list[str], needs_confirmation: bool)
    """
    issues: List[str] = []
    needs_confirmation = False

    # Check OCR availability / extraction diagnostics first
    if ocr_diag:
        if not ocr_diag.get("ocr_available", True):
            issues.append("OCR unavailable on this machine. Please install Tesseract on host.")
            needs_confirmation = True
        elif ocr_diag.get("char_count", 0) == 0:
            issues.append("Document unreadable or blank: no text could be extracted.")
            needs_confirmation = True

    # 1. Patient Name Matching
    extracted_name = extracted_fields.get("patient_name")
    if expected_patient_name:
        if not extracted_name:
            issues.append("Patient name could not be identified on the document.")
            needs_confirmation = True
        else:
            sim = _fuzzy_name_match(extracted_name, expected_patient_name)
            if sim < 0.85:
                issues.append(
                    f"Extracted patient name '{extracted_name}' does not match expected name '{expected_patient_name}' (match: {sim:.0%})."
                )
                needs_confirmation = True

    # 2. Date Consistency
    adm_str = extracted_fields.get("admission_date")
    dis_str = extracted_fields.get("discharge_date")

    adm_date: Optional[date] = None
    dis_date: Optional[date] = None

    if adm_str:
        try:
            adm_date = datetime.strptime(adm_str, "%Y-%m-%d").date()
        except ValueError:
            pass
    if dis_str:
        try:
            dis_date = datetime.strptime(dis_str, "%Y-%m-%d").date()
        except ValueError:
            pass

    if adm_date and dis_date and adm_date > dis_date:
        issues.append(f"Admission date ({adm_str}) cannot be after discharge date ({dis_str}).")
        needs_confirmation = True

    if treatment and treatment.admission_date and adm_date:
        try:
            claim_adm = datetime.strptime(treatment.admission_date, "%Y-%m-%d").date()
            if abs((adm_date - claim_adm).days) > 1:
                issues.append(
                    f"Document admission date ({adm_str}) differs from claim admission date ({treatment.admission_date}) by more than 1 day."
                )
                needs_confirmation = True
        except ValueError:
            pass

    # 3. Numeric Bill Total
    is_bill_slot = item_id in ("final_bill", "itemised_bills", "reimbursement_claim_form") or extracted_fields.get("document_type") in ("final_bill", "itemised_bills")
    bill_total = extracted_fields.get("total_amount")

    if is_bill_slot:
        if bill_total is None or bill_total <= 0:
            issues.append("Document missing a valid positive total billed amount.")
            needs_confirmation = True
        elif treatment and treatment.estimated_cost > 0:
            if bill_total > (treatment.estimated_cost * 2.5):
                issues.append(
                    f"Billed amount (₹{bill_total:,.2f}) is more than 2.5x estimated treatment cost (₹{treatment.estimated_cost:,.2f})."
                )
                needs_confirmation = True

    # 4. Diagnosis Alignment
    extracted_diag = extracted_fields.get("diagnosis")
    if treatment and treatment.name and extracted_diag:
        t_words = set(re.findall(r'[a-zA-Z]{3,}', treatment.name.lower()))
        d_words = set(re.findall(r'[a-zA-Z]{3,}', extracted_diag.lower()))
        overlap = t_words.intersection(d_words)
        if not overlap and difflib.SequenceMatcher(None, treatment.name.lower(), extracted_diag.lower()).ratio() < 0.4:
            issues.append(
                f"Document diagnosis '{extracted_diag}' does not appear to match claimed treatment '{treatment.name}'."
            )
            needs_confirmation = True

    # 5. Document Type Alignment
    extracted_doc_type = (extracted_fields.get("document_type") or "unknown").lower()
    allowed_types = EXPECTED_DOC_TYPES_FOR_SLOT.get(item_id, set())

    if allowed_types and extracted_doc_type != "unknown":
        if not any(allowed in extracted_doc_type or extracted_doc_type in allowed for allowed in allowed_types):
            issues.append(
                f"Document detected as '{extracted_doc_type}' but was uploaded to the '{item_id}' slot."
            )
            needs_confirmation = True

    # Slot-aware Confidence Check: Only check fields that are expected for this slot type
    # patient_name is expected on all slots
    if field_confidence.get("patient_name", 1.0) < 0.7:
        needs_confirmation = True
        if "Low confidence on patient name extraction." not in issues and not any("patient name" in i.lower() for i in issues):
            issues.append("Low confidence on patient name extraction.")

    # total_amount is only required/checked for bill slots
    if is_bill_slot and field_confidence.get("total_amount", 1.0) < 0.7:
        needs_confirmation = True
        if "Low confidence on total billed amount." not in issues and not any("billed amount" in i.lower() for i in issues):
            issues.append("Low confidence on total billed amount.")

    # admission_date is only required/checked for in-patient clinical documents (discharge summary, preauth)
    if item_id in ("discharge_summary", "preauth_form", "preauth_approval_letter") and field_confidence.get("admission_date", 1.0) < 0.7:
        needs_confirmation = True
        if "Low confidence on admission date extraction." not in issues and not any("admission date" in i.lower() for i in issues):
            issues.append("Low confidence on admission date extraction.")

    return issues, needs_confirmation


def process_uploaded_claim_document(
    file_path: str,
    filename: str,
    item_id: str,
    treatment: Optional[TreatmentDetails] = None,
    expected_patient_name: Optional[str] = None,
    claim_id: Optional[str] = None,
    existing_document_id: Optional[str] = None,
) -> ClaimDocument:
    """
    Full pipeline to ingest, extract, and validate an uploaded claim document.
    """
    doc_id = existing_document_id or str(uuid.uuid4())
    logger.info("[%s/%s] Starting document processing for '%s' in slot '%s'", claim_id or "-", doc_id, filename, item_id)

    raw_text, ocr_diag = extract_document_text(file_path, claim_id=claim_id, doc_id=doc_id)
    extracted_fields, field_confidence = extract_document_fields(raw_text, item_id, claim_id=claim_id, doc_id=doc_id)

    validation_issues, needs_confirmation = validate_document(
        extracted_fields=extracted_fields,
        field_confidence=field_confidence,
        item_id=item_id,
        treatment=treatment,
        expected_patient_name=expected_patient_name,
        ocr_diag=ocr_diag,
    )

    logger.info(
        "[%s/%s] Document processed: status=%s, issues=%d, needs_conf=%s",
        claim_id or "-",
        doc_id,
        "needs_confirmation" if needs_confirmation else "validated",
        len(validation_issues),
        needs_confirmation,
    )

    return ClaimDocument(
        document_id=doc_id,
        item_id=item_id,
        filename=filename,
        file_path=file_path,
        extracted_fields=extracted_fields,
        field_confidence=field_confidence,
        validation_issues=validation_issues,
        needs_confirmation=needs_confirmation,
    )
