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
    "final_bill": {"final_bill", "hospital_bill", "invoice", "bill", "detailed_bill"},
    "investigation_reports": {"investigation_reports", "investigation_report", "lab_report", "diagnostic_report", "radiology", "pathology"},
    "identity_proof": {"identity_proof", "aadhaar", "pan", "passport", "id_card", "voter_id"},
    "preauth_form": {"preauth_form", "pre_authorization", "cashless_request", "preauth_approval"},
    "reimbursement_claim_form": {"reimbursement_claim_form", "claim_form", "form_a", "form_b"},
    "emergency_intimation": {"emergency_intimation", "intimation_mail", "intimation_letter", "notification"},
}


# ── Text Extraction ───────────────────────────────────────────────────────────

def extract_document_text(file_path: str) -> str:
    """Extract raw text from PDF or Image file with robust fallbacks."""
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"Document file not found: {file_path}")

    ext = Path(file_path).suffix.lower()

    if ext == ".pdf":
        text_parts: List[str] = []
        try:
            with fitz.open(file_path) as doc:
                for page in doc:
                    txt = page.get_text("text")
                    if txt and txt.strip():
                        text_parts.append(txt.strip())
            
            combined = "\n\n".join(text_parts)
            if combined.strip():
                return combined
        except Exception as exc:
            logger.warning("PyMuPDF text extraction failed on %s: %s", file_path, exc)

    # Fallback / image OCR
    try:
        from PIL import Image
        import pytesseract

        if ext == ".pdf":
            # Render first 3 pages to images for OCR
            with fitz.open(file_path) as doc:
                ocr_parts = []
                for idx in range(min(len(doc), 3)):
                    pix = doc[idx].get_pixmap(dpi=150)
                    img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
                    ocr_txt = pytesseract.image_to_string(img)
                    if ocr_txt.strip():
                        ocr_parts.append(ocr_txt.strip())
                return "\n\n".join(ocr_parts)
        else:
            img = Image.open(file_path)
            return pytesseract.image_to_string(img)
    except Exception as exc:
        logger.warning("OCR processing unavailable or failed for %s: %s", file_path, exc)

    return ""


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

    # Extract dates
    dates = re.findall(r'\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2})\b', text)
    if dates:
        for raw_d in dates:
            iso_d = _normalize_date_str(raw_d)
            if iso_d:
                if not fields["admission_date"]:
                    fields["admission_date"] = iso_d
                elif not fields["discharge_date"] and iso_d >= fields["admission_date"]:
                    fields["discharge_date"] = iso_d

    # Extract currency amounts
    curr_matches = re.findall(r'(?:rs\.?|inr|₹)\s*([\d,]+(?:\.\d{2})?)', text, re.IGNORECASE)
    amounts: List[float] = []
    for m in curr_matches:
        try:
            amt = float(m.replace(",", ""))
            if amt > 0:
                amounts.append(amt)
        except ValueError:
            pass
    if amounts:
        fields["total_amount"] = max(amounts)

    # Document type inference
    lower_text = text.lower()
    if "discharge" in lower_text or "summary" in lower_text:
        fields["document_type"] = "discharge_summary"
    elif "bill" in lower_text or "invoice" in lower_text or "receipt" in lower_text:
        fields["document_type"] = "final_bill"
    elif "investigation" in lower_text or "report" in lower_text or "pathology" in lower_text:
        fields["document_type"] = "investigation_reports"
    else:
        fields["document_type"] = "unknown"

    return fields, confidence


def _normalize_date_str(raw: str) -> Optional[str]:
    """Convert various date strings to ISO YYYY-MM-DD."""
    if not raw or not isinstance(raw, str):
        return None
    raw = raw.strip()
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%m/%d/%Y", "%d/%m/%y", "%d-%m-%y"):
        try:
            return datetime.strptime(raw, fmt).strftime("%Y-%m-%d")
        except ValueError:
            continue
    return None


def extract_document_fields(
    text: str,
    item_id: str,
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
{text[:4000]}
\"\"\"

Respond with ONLY a valid JSON object matching this schema:
{{
  "patient_name": "string or null",
  "admission_date": "YYYY-MM-DD string or null",
  "discharge_date": "YYYY-MM-DD string or null",
  "diagnosis": "string or null",
  "total_amount": 0.0,
  "document_type": "discharge_summary | final_bill | investigation_reports | identity_proof | preauth_form | unknown",
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
        )

        json_match = re.search(r'\{.*\}', reply, re.DOTALL)
        if json_match:
            data = json.loads(json_match.group(0))
            conf = data.get("confidence") or {}
            fields = {
                "patient_name": data.get("patient_name"),
                "admission_date": _normalize_date_str(data.get("admission_date")),
                "discharge_date": _normalize_date_str(data.get("discharge_date")),
                "diagnosis": data.get("diagnosis"),
                "total_amount": float(data.get("total_amount")) if data.get("total_amount") is not None else None,
                "document_type": str(data.get("document_type") or "unknown").lower(),
            }
            parsed_conf = {
                k: float(conf.get(k, 0.5)) for k in fields
            }
            return fields, parsed_conf

    except Exception as exc:
        logger.warning("LLM extraction failed or timed out: %s. Using regex fallback.", exc)

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
    is_bill_slot = item_id in ("final_bill", "reimbursement_claim_form") or extracted_fields.get("document_type") == "final_bill"
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

    # Confidence check: Any critical field < 0.7 triggers confirmation requirement
    for field_name, conf_val in field_confidence.items():
        if field_name in ("patient_name", "total_amount", "admission_date") and conf_val < 0.7:
            needs_confirmation = True

    return issues, needs_confirmation


def process_uploaded_claim_document(
    file_path: str,
    filename: str,
    item_id: str,
    treatment: Optional[TreatmentDetails] = None,
    expected_patient_name: Optional[str] = None,
) -> ClaimDocument:
    """
    Full pipeline to ingest, extract, and validate an uploaded claim document.
    """
    doc_id = str(uuid.uuid4())
    raw_text = extract_document_text(file_path)

    extracted_fields, field_confidence = extract_document_fields(raw_text, item_id)
    validation_issues, needs_confirmation = validate_document(
        extracted_fields=extracted_fields,
        field_confidence=field_confidence,
        item_id=item_id,
        treatment=treatment,
        expected_patient_name=expected_patient_name,
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
