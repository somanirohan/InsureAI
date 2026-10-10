"""
Abbreviations and medical term expansion dictionary for InsureAI semantic matching.

Provides domain-specific normalization and abbreviation expansions for hospital billing,
surgical procedures, insurance terminology, and diagnostic acronyms.
"""

from __future__ import annotations

import re
from typing import Dict, List, Optional

# Canonical dictionary of medical, surgical, and insurance abbreviations
ABBREVIATIONS_MAP: Dict[str, str] = {
    # Hospital billing & accommodations
    "rm chg": "room rent charges",
    "rm chgs": "room rent charges",
    "rm rent": "room rent",
    "icu": "intensive care unit",
    "hpc": "high dependency unit care",
    "hdu": "high dependency unit",
    "ot": "operation theatre",
    "o.t.": "operation theatre",
    "ot chg": "operation theatre charges",
    "ot charges": "operation theatre charges",
    "pac": "pre anaesthetic checkup",
    "mo": "medical officer",
    "rso": "resident medical officer",
    "rmo": "resident medical officer",
    "nurs": "nursing charges",
    "nrs chg": "nursing care charges",

    # Surgical & clinical procedures
    "phaco": "phacoemulsification cataract surgery",
    "iol": "intraocular lens implant",
    "cataract iol": "phacoemulsification cataract surgery intraocular lens",
    "cabg": "coronary artery bypass graft cardiac surgery",
    "ptca": "percutaneous transluminal coronary angioplasty stent",
    "c-sec": "caesarean section delivery",
    "lscs": "lower segment caesarean section",
    "tka": "total knee arthroplasty knee replacement",
    "tkr": "total knee replacement surgery",
    "tha": "total hip arthroplasty hip replacement",
    "thr": "total hip replacement surgery",
    "turp": "transurethral resection of prostate",
    "app": "appendectomy appendix removal",
    "lap app": "laparoscopic appendectomy",
    "chole": "laparoscopic cholecystectomy gallbladder removal",
    "lap chole": "laparoscopic cholecystectomy",
    "hernia": "inguinal umbilical hernia repair mesh hernioplasty",
    "tonsil": "tonsillectomy adenoidectomy",

    # Diagnostic & laboratory
    "ecg": "electrocardiogram cardiac test",
    "ekg": "electrocardiogram cardiac test",
    "echo": "echocardiography cardiac ultrasound",
    "ct": "computed tomography scan",
    "mri": "magnetic resonance imaging scan",
    "usg": "ultrasound sonography scan",
    "cbc": "complete blood count hematology test",
    "lft": "liver function test",
    "kft": "kidney renal function test",
    "rft": "renal kidney function test",
    "cxr": "chest x-ray radiography",
    "pft": "pulmonary function test",

    # Insurance & regulatory policy terms
    "ped": "pre existing disease",
    "wp": "waiting period",
    "si": "sum insured",
    "pre-auth": "cashless pre authorization approval",
    "preauth": "cashless pre authorization approval",
    "tpa": "third party administrator",
    "dr.": "doctor physician surgeon consultant",
    "inj": "injection injectable medication",
    "ivf": "in vitro fertilisation assisted reproduction",
    "art": "assisted reproductive technology infertility treatment",
    "bariatric": "weight loss bariatric obesity surgery",
}


def expand_abbreviations(text: str) -> str:
    """
    Expand known medical and billing abbreviations in a query or bill description.
    Preserves original wording while appending or substituting canonical terms.

    Example:
        'phaco iol charges' -> 'phaco iol charges (phacoemulsification cataract surgery intraocular lens implant)'
    """
    if not text or not text.strip():
        return ""

    lowered = text.lower()
    expansions: List[str] = []

    # Check for whole-phrase matches first, then word-level matches
    # Sort keys by length descending to match longest phrases first
    sorted_abbrs = sorted(ABBREVIATIONS_MAP.items(), key=lambda x: len(x[0]), reverse=True)

    matched_keys = set()
    for abbr, full_term in sorted_abbrs:
        # Use word boundaries or start/end of string
        pattern = r'(?:\b|_)' + re.escape(abbr) + r'(?:\b|_)'
        if re.search(pattern, lowered):
            # Avoid redundant subsets (e.g. if 'ot chg' matched, don't also duplicate 'ot')
            if any(abbr in mk for mk in matched_keys):
                continue
            matched_keys.add(abbr)
            expansions.append(full_term)

    if not expansions:
        return text

    # Append expanded terminology to give high semantic recall without losing original literal tokens
    expansion_str = ", ".join(expansions)
    return f"{text} ({expansion_str})"


def get_canonical_term(token: str) -> Optional[str]:
    """Return canonical expansion for a single token if present in dictionary."""
    return ABBREVIATIONS_MAP.get(token.lower().strip())
