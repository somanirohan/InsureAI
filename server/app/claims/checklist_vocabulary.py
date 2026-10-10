"""
Controlled vocabulary for Claim Checklist items.
Defines canonical Document Types and Requirement Types with stable identifiers,
plain-English labels, single-sentence descriptions, and synonym matching dictionaries.
"""

from __future__ import annotations
from typing import Any, Dict, List

# ── 1. Document Types Vocabulary ──────────────────────────────────────────────

DOCUMENT_TYPES: Dict[str, Dict[str, Any]] = {
    "discharge_summary": {
        "label": "Discharge Summary",
        "description": "The hospital's summary of your diagnosis, treatment course, and discharge condition.",
        "synonyms": [
            "original discharge summary",
            "discharge summary",
            "discharge card",
            "discharge certificate",
            "clinical summary",
            "medical summary",
        ],
    },
    "itemised_bills": {
        "label": "Itemised Hospital Bills & Receipts",
        "description": "All detailed hospital bills and payment receipts with itemised service and medicine breakups.",
        "synonyms": [
            "all itemised bills and receipts",
            "itemised bills and receipts",
            "itemized bills and receipts",
            "all itemised bills",
            "all itemized bills",
            "itemised hospital bills",
            "itemized hospital bills",
            "itemised bills",
            "itemized bills",
            "itemised bill",
            "itemized bill",
            "final hospital bill",
            "final bill",
            "hospital bill",
            "hospital bills",
            "payment receipts",
            "cash receipts",
            "receipts",
            "cash receipt",
        ],
    },
    "diagnostic_reports": {
        "label": "Diagnostic & Investigation Reports",
        "description": "All lab, pathology, and radiology test reports supporting your clinical diagnosis.",
        "synonyms": [
            "diagnostic reports",
            "diagnostic report",
            "investigation reports",
            "investigation report",
            "all diagnostic reports",
            "all investigation reports",
            "pathology reports",
            "pathology report",
            "radiology reports",
            "radiology report",
            "lab reports",
            "lab report",
            "laboratory reports",
            "x-ray reports",
            "mri reports",
            "ct scan reports",
            "blood test reports",
        ],
    },
    "prescriptions": {
        "label": "Doctor Prescriptions & Pharmacy Bills",
        "description": "Attending medical practitioner prescriptions, treatment advice sheets, and pharmacy invoices.",
        "synonyms": [
            "prescriptions",
            "prescription",
            "doctor prescriptions",
            "doctor's prescriptions",
            "medical prescriptions",
            "pharmacy bills",
            "chemist bills",
            "medicine bills",
            "medicines bills",
            "treatment sheets",
        ],
    },
    "claim_form": {
        "label": "Completed Claim Form",
        "description": "Duly completed and signed insurance claim submission form (Part A and Part B).",
        "synonyms": [
            "duly completed claim form",
            "duly completed and signed claim form",
            "completed claim form",
            "duly filled claim form",
            "signed claim form",
            "claim form",
            "claim form part a",
            "claim form part b",
            "reimbursement claim form",
        ],
    },
    "preauth_approval_letter": {
        "label": "Pre-Authorization Approval Letter",
        "description": "Written cashless approval letter or initial pre-authorisation sanction note from the TPA or insurer.",
        "synonyms": [
            "pre-authorisation approval letter",
            "pre-authorization approval letter",
            "preauthorisation approval letter",
            "preauthorization approval letter",
            "pre-auth approval letter",
            "preauth approval letter",
            "cashless approval letter",
            "pre-authorisation letter",
            "pre-authorization letter",
            "preauth approval",
            "pre-auth approval",
        ],
    },
    "id_proof": {
        "label": "Government Photo ID Proof",
        "description": "Government-issued photo identification proof of the patient (Aadhaar, PAN Card, Passport, or Voter ID).",
        "synonyms": [
            "photocopy of id proof",
            "copy of id proof",
            "government photo id proof",
            "photo id proof",
            "identity proof",
            "id proof",
            "id card",
            "aadhaar card",
            "aadhaar",
            "pan card",
            "pan",
            "passport",
            "voter id",
        ],
    },
    "policy_copy": {
        "label": "Health Insurance Policy Copy",
        "description": "Copy of the active health insurance policy schedule, certificate of insurance, or health e-card.",
        "synonyms": [
            "policy copy",
            "insurance policy copy",
            "copy of policy",
            "policy schedule",
            "health card",
            "insurance card",
            "tpa card",
        ],
    },
    "doctor_certificate": {
        "label": "Treating Doctor Certificate",
        "description": "Certificate from the attending medical practitioner specifying the diagnosis and necessity of hospitalization.",
        "synonyms": [
            "doctor certificate",
            "treating doctor certificate",
            "attending doctor certificate",
            "medical certificate",
            "certificate of medical practitioner",
            "physician certificate",
            "doctor's report",
        ],
    },
    "investigation_reports": {
        "label": "Investigation Reports",
        "description": "All specialized medical investigation reports, ECGs, scans, and diagnostic evidence.",
        "synonyms": [
            "investigation reports",
            "investigation report",
            "special investigation reports",
        ],
    },
}

# Mapping overlapping types canonicalized to primary vocabulary keys
DOC_CANONICAL_ALIASES: Dict[str, str] = {
    "investigation_reports": "diagnostic_reports",
}


# ── 2. Requirement Types Vocabulary ───────────────────────────────────────────

REQUIREMENT_TYPES: Dict[str, Dict[str, Any]] = {
    "preauthorisation": {
        "label_template": "Request pre-authorisation {deadline}",
        "anchor": "before_admission",
        "synonyms": [
            "pre-authorisation",
            "preauthorisation",
            "pre-authorization",
            "preauthorization",
            "prior authorisation",
            "prior authorization",
            "cashless pre-authorisation",
            "cashless pre-authorization",
            "prior approval",
            "planned hospitalisation",
            "planned hospitalization",
        ],
    },
    "admission_intimation": {
        "label_template": "Notify insurer or TPA of admission {deadline}",
        "anchor": "after_admission",
        "synonyms": [
            "notification is required",
            "notification within",
            "intimation is required",
            "intimation within",
            "intimate the insurer",
            "intimate the company",
            "intimate the tpa",
            "notify the company",
            "notify the insurer",
            "notify the tpa",
            "emergency hospitalisation",
            "emergency hospitalization",
        ],
    },
    "claim_filing_deadline": {
        "label_template": "Submit reimbursement claim documents {deadline}",
        "anchor": "after_discharge",
        "synonyms": [
            "claims for reimbursement must be filed",
            "claims for reimbursement must be submitted",
            "claim documents must be submitted",
            "claims must be filed",
            "claims must be submitted",
            "reimbursement claim must be filed",
            "reimbursement claims must be filed",
            "file claim within",
            "submit claim within",
            "submission of claim within",
        ],
    },
    "generic_requirement": {
        "label_template": "{text}",
        "anchor": "unspecified",
        "synonyms": [],
    },
}

# Standard suggestion documents when a policy contains 0 documents
STANDARD_SUGGESTION_DOC_IDS = [
    "discharge_summary",
    "itemised_bills",
    "claim_form",
    "id_proof",
]
