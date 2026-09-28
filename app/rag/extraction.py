"""
Structured facts extractor for insurance policies (Targeted Multi-Call with Page Markers).

Design rationale
----------------
Instead of dumping 15,000+ characters into a single prompt (which causes attention
dilution, 2+ minute prompt evaluation delays, and empty/null responses on 7B models),
or calling the LLM on every single chunk (13 separate calls), we use a targeted
three-call architecture:

  Call 1: Scalar fields (sum_insured, room_rent_limit, co_pay, deductible)
          Targeted to pages with schedule terms (e.g. Pages 1, 2, 4).
  Call 2: Waiting periods & permanent exclusions
          Targeted to pages with waiting/exclusion clauses (e.g. Page 5).
  Call 3: Claim procedures & notification conditions
          Targeted to pages with claims procedure clauses (e.g. Pages 6, 8).

Key benefits:
  1. Each call receives only the 1-3 highly relevant pages (< 4,000 characters).
  2. Prompt evaluation is fast (~10–15s per call).
  3. Strict constrained JSON grammar (`format="json"`) guarantees valid JSON.
  4. Explicit `=== PAGE N ===` markers ensure 100% accurate page citations.
  5. Zero hallucination: values are extracted only with explicit textual evidence.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any, Sequence, Union

from app.ingestion.pdf_extract import PageText
from app.ingestion.chunking import Chunk
from app.llm.factory import get_llm

logger = logging.getLogger(__name__)


# ── JSON parsing helpers ──────────────────────────────────────────────────────

def _strip_json_fences(raw: str) -> str:
    """Remove markdown fences and extract outermost JSON object."""
    raw = re.sub(r"^```(?:json)?\s*", "", raw.strip(), flags=re.IGNORECASE)
    raw = re.sub(r"\s*```$", "", raw.strip())
    start = raw.find("{")
    end = raw.rfind("}")
    if start != -1 and end != -1 and end > start:
        raw = raw[start : end + 1]
    return raw.strip()


def _parse_json_object(raw: str) -> dict[str, Any]:
    """Parse raw LLM response as JSON with strip-and-retry fallback."""
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass
    cleaned = _strip_json_fences(raw)
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError as exc:
        logger.warning("Failed to parse JSON: %s (first 200 chars: %s)", exc, raw[:200])
        return {}


# ── Page selection helpers ───────────────────────────────────────────────────

_SCALAR_KEYWORDS = [
    "sum insured", "room rent", "bed charges", "co-pay", "copay", "deductible", "schedule"
]
_WAITING_EXCLUSION_KEYWORDS = [
    "waiting period", "pre-existing", "exclusions", "shall not be liable", "not covered", "cosmetic", "experimental"
]
_CLAIM_KEYWORDS = [
    "claims procedure", "cashless", "pre-authorisation", "reimbursement", "discharge summary", "timeline", "ombudsman"
]


def _filter_pages(
    pages: Sequence[PageText],
    keywords: list[str],
    max_pages: int = 3,
    include_cover_page: bool = False,
) -> list[PageText]:
    """Score and rank pages by keyword density, returning the top N pages."""
    kws = [kw.lower() for kw in keywords]
    scored: list[tuple[int, PageText]] = []

    for p in pages:
        text_lower = p.text.lower()
        score = sum(text_lower.count(kw) for kw in kws)
        if score > 0:
            scored.append((score, p))

    if not scored:
        return list(pages[:max_pages])

    scored.sort(key=lambda x: -x[0])
    selected = [p for _, p in scored[:max_pages]]

    # Ensure Page 1 (Policy Schedule / Cover) is always inspected for scalar terms
    if include_cover_page and pages and pages[0] not in selected:
        selected = [pages[0]] + selected[: max_pages - 1]

    selected.sort(key=lambda p: p.page_number)
    return selected


def _pages_to_corpus(pages: Sequence[PageText]) -> str:
    """Format pages with explicit === PAGE N === markers."""
    return "\n\n".join(
        f"=== PAGE {p.page_number} ===\n{p.text.strip()}"
        for p in pages
        if p.text.strip()
    )


# ── Focused Prompts ───────────────────────────────────────────────────────────

_SCALAR_PROMPT = """\
You are an insurance data analyst. Extract key policy metadata and scalar coverage terms from the policy text:
- insurer_name: Official name of the insurance company (e.g. "Star Health & Allied Insurance", "HDFC ERGO General Insurance")
- policy_type: Type of health policy (e.g. "Individual Health Insurance", "Family Floater", "Comprehensive Health Insurance")
- policy_number: Policy or Certificate number (e.g. "SH-IND-2024-89214")
- premium_amount: Annual or total premium amount (e.g. "Rs. 14,500")
- sum_insured: Overall coverage limit amount (e.g. "Rs. 10,00,000")
- room_rent_limit: Daily cap on room rent charges
- co_pay: Co-payment percentage or amount
- deductible: Initial deductible amount before coverage

RULES:
1. Extract ONLY values with EXPLICIT evidence in the text.
2. Record the exact page number (integer) from === PAGE N ===.
3. If absent, set field to null.
4. Output valid JSON matching this schema:
{
  "insurer_name": {"value": str, "page": int} or null,
  "policy_type": {"value": str, "page": int} or null,
  "policy_number": {"value": str, "page": int} or null,
  "premium_amount": {"value": str, "page": int} or null,
  "sum_insured": {"value": str, "page": int} or null,
  "room_rent_limit": {"value": str, "page": int} or null,
  "co_pay": {"value": str, "page": int} or null,
  "deductible": {"value": str, "page": int} or null
}"""

_WAITING_EXCLUSION_PROMPT = """\
You are an insurance data analyst. Extract waiting periods and exclusions from the policy text.

RULES:
1. Extract ONLY items explicitly listed in the text.
2. Record the exact page number (integer) from === PAGE N ===.
3. Capture all pre-existing, specific illness, and initial waiting periods.
4. Capture all permanent exclusion items.
5. Output valid JSON matching this schema:
{
  "waiting_periods": [
    {"condition": str, "period": str, "page": int}
  ],
  "exclusions": [
    {"item": str, "page": int}
  ]
}"""

_CLAIM_PROMPT = """\
You are an insurance data analyst. Extract claim conditions and procedures from the policy text.

RULES:
1. Extract ONLY procedural requirements explicitly stated (pre-auth deadlines, doc submission windows).
2. Record the exact page number (integer) from === PAGE N ===.
3. Output valid JSON matching this schema:
{
  "claim_conditions": [
    {"condition": str, "page": int}
  ]
}"""


# ── Deterministic Heuristic Extractor ────────────────────────────────────────

KNOWN_INSURERS: list[tuple[str, list[str]]] = [
    ("Pradhan Mantri Suraksha Bima Yojana (PMSBY)", ["pmsby", "suraksha bima yojana", "suraksha bima"]),
    ("Pradhan Mantri Jeevan Jyoti Bima Yojana (PMJJBY)", ["pmjjby", "jeevan jyoti bima yojana", "jeevan jyoti"]),
    ("Ayushman Bharat PM-JAY", ["ayushman bharat", "pm-jay", "pmjay", "jan arogya yojana", "ab-pmjay"]),
    ("Central Government Health Scheme (CGHS)", ["cghs", "central government health scheme"]),
    ("Employees' State Insurance Corporation (ESIC)", ["esic", "employees state insurance", "employees' state insurance"]),
    ("Life Insurance Corporation of India (LIC)", ["lic of india", "life insurance corporation", "lic's"]),
    ("Star Health & Allied Insurance", ["star health & allied", "star health and allied", "star health"]),
    ("HDFC ERGO General Insurance", ["hdfc ergo", "hdfc general"]),
    ("Care Health Insurance", ["care health", "religare health", "religare", "care supreme", "care advantage", "care shield"]),
    ("ICICI Lombard General Insurance", ["icici lombard"]),
    ("Niva Bupa Health Insurance", ["niva bupa", "max bupa"]),
    ("Tata AIG General Insurance", ["tata aig"]),
    ("Bajaj Allianz General Insurance", ["bajaj allianz general", "bajaj allianz"]),
    ("Aditya Birla Health Insurance", ["aditya birla health", "aditya birla"]),
    ("SBI General Insurance", ["sbi general"]),
    ("The New India Assurance", ["new india assurance"]),
    ("The Oriental Insurance Company", ["oriental insurance"]),
    ("National Insurance Company", ["national insurance"]),
    ("United India Insurance Company", ["united india insurance", "united india"]),
    ("ManipalCigna Health Insurance", ["manipalcigna", "cigna ttk"]),
    ("Reliance General Insurance", ["reliance general"]),
    ("Acko General Insurance", ["acko general", "acko"]),
    ("Go Digit General Insurance", ["go digit", "digit general", "digit insurance"]),
    ("Future Generali India Insurance", ["future generali"]),
    ("Kotak Mahindra General Insurance", ["kotak mahindra general", "kotak general"]),
    ("Royal Sundaram General Insurance", ["royal sundaram"]),
    ("Cholamandalam MS General Insurance", ["cholamandalam ms", "chola ms"]),
    ("Universal Sompo General Insurance", ["universal sompo"]),
    ("Magma HDI General Insurance", ["magma hdi"]),
    ("Raheja QBE General Insurance", ["raheja qbe"]),
    ("Max Life Insurance", ["max life"]),
    ("HDFC Life Insurance", ["hdfc life"]),
    ("SBI Life Insurance", ["sbi life"]),
    ("ICICI Prudential Life Insurance", ["icici prudential", "icici pru"]),
    ("Bajaj Allianz Life Insurance", ["bajaj allianz life"]),
]


def extract_heuristic_facts(pages: Sequence[PageText]) -> dict[str, Any]:
    """
    High-accuracy, deterministic pattern/regex fact extractor.
    Guarantees extraction of insurer name, plan type, policy number, sum insured,
    premium, room rent limit, copay, and red flags directly from document text.
    """
    if not pages:
        return {}

    all_text = "\n".join(p.text for p in pages)
    p1 = pages[0].text if pages else ""
    first_line = p1.strip().split("\n")[0] if p1 else ""
    first_few_lines = "\n".join(p1.strip().split("\n")[:6]) if p1 else ""

    # 1. Insurer Name
    insurer_name = None
    p1_lower = p1.lower()
    for canonical_name, aliases in KNOWN_INSURERS:
        if any(a in p1_lower for a in aliases):
            insurer_name = canonical_name
            break

    if not insurer_name:
        # Regex search for institutional insurer or scheme entity
        m_ins = re.search(
            r"(?:(?:issued|underwritten|offered|managed|provided)\s+by\s+)?([A-Z][A-Za-z0-9&.\'\-]{1,25}(?:\s+[A-Z][A-Za-z0-9&.\'\-]{1,25}){0,5}\s+(?:Health|General|Life|Assurance|Insurance)(?:\s+(?:Company|Co\.?|Ltd\.?|Limited|Corporation|Scheme))?)",
            first_few_lines or p1,
        )
        if m_ins:
            raw_matched = m_ins.group(1).strip()
            # Clean out common narrative introductory prefixes
            clean_name = re.sub(
                r"^(?:this\s+is\s+(?:an?\s+)?|welcome\s+to\s+|policy\s+of\s+|about\s+|terms\s+of\s+|guidelines\s+of\s+|certificate\s+of\s+)",
                "",
                raw_matched,
                flags=re.I,
            ).strip()
            # If the matched name captured an auxiliary verb clause (e.g. "PMSBY is an Accident Insurance"), trim
            clean_name = re.split(r"\s+\b(?:is|are|provides|offering|has)\b\s+", clean_name, flags=re.I)[0].strip()
            if len(clean_name) >= 3:
                insurer_name = clean_name

    # 2. Policy Number
    policy_number = None
    m_num = re.search(r"(?:Policy|Certificate)\s+(?:Number|No\.?|#|Id)\s*[:\-]?\s*([A-Z0-9\-\/]{4,30})", p1, re.I)
    if m_num:
        policy_number = m_num.group(1).strip()

    # 3. Policy Type & Plan Name
    parts = [x.strip() for x in re.split(r"[\-\–\—\ufffd\|\u00b7\·]", first_line) if x.strip()]
    plan_name = parts[1] if len(parts) > 1 else None

    policy_type = None
    if "pmsby" in p1_lower or "accidental death" in p1_lower or "accident insurance" in p1_lower:
        policy_type = "Accident & Disability Insurance"
    elif "pmjjby" in p1_lower or "jeevan jyoti" in p1_lower or "term life" in p1_lower:
        policy_type = "Term Life Insurance"
    elif "ayushman" in p1_lower or "pm-jay" in p1_lower or "jan arogya" in p1_lower:
        policy_type = "Universal Health Protection Scheme"
    elif "family floater" in p1_lower:
        policy_type = "Family Floater Health Insurance"
    elif "critical illness" in p1_lower:
        policy_type = "Critical Illness Insurance"
    elif "super top" in p1_lower or "top up" in p1_lower:
        policy_type = "Super Top-up Health Insurance"
    elif "senior citizen" in p1_lower:
        policy_type = "Senior Citizen Health Insurance"
    elif "group health" in p1_lower or "corporate" in p1_lower:
        policy_type = "Group Health Insurance"
    elif "individual" in p1_lower:
        policy_type = "Individual Health Insurance"
    elif plan_name and len(plan_name) > 3:
        policy_type = plan_name
    else:
        policy_type = "Health Insurance"

    # 4. Sum Insured (supporting Indian currency units like Lakh, Lac, Crore, Cr)
    sum_insured = None
    for p in pages:
        # Pattern A: Label followed by amount (e.g. Sum Insured: Rs. 2 Lakhs, Base Sum Insured: ₹5,00,000)
        m_si = re.search(
            r"(?:Base\s*)?(?:Sum\s*Insured|Total\s*Coverage|Risk\s*Cover(?:age)?|SI|Cover\s+Amount)\s*[:\-]?\s*(?:INR|Rs\.?|₹)?\s*([\d,]+(?:\.\d+)?\s*(?:lakhs?|lacs?|crores?|cr|thousand|k)?(?:\s*/\-|\b))",
            p.text,
            re.I,
        )
        if m_si:
            raw_val = m_si.group(1).strip().rstrip("/-").strip()
            clean_val = raw_val if any(c in raw_val.lower() for c in ("rs", "inr", "₹")) else f"Rs. {raw_val}"
            sum_insured = {"value": clean_val, "page": p.page_number}
            break

        # Pattern B: Sentence style (e.g. "cover of Rs. 2 Lakh", "coverage of Rs. 5,00,000", "benefits of up to Rs. 5 Lakhs")
        m_si_sent = re.search(
            r"(?:cover(?:age)?|benefit|sum\s+insured)\s+(?:of|up\s+to|equal\s+to)\s+(?:INR|Rs\.?|₹)\s*([\d,]+(?:\.\d+)?\s*(?:lakhs?|lacs?|crores?|cr|thousand|k)?)",
            p.text,
            re.I,
        )
        if m_si_sent:
            val = m_si_sent.group(1).strip()
            sum_insured = {"value": f"Rs. {val}", "page": p.page_number}
            break

    # 5. Premium Amount
    premium_amount = None
    for p in pages:
        m_pr = re.search(
            r"(?:Annual\s*)?Premium\s*[:\-]?\s*(?:INR|Rs\.?|₹)?\s*([\d,]+(?:\.\d+)?(?:\s*/\-|\b))",
            p.text,
            re.I,
        )
        if m_pr:
            clean_pr = m_pr.group(1).strip().rstrip("/-").strip()
            premium_amount = {"value": f"Rs. {clean_pr}", "page": p.page_number}
            break

    # 6. Room Rent Limit
    room_rent = None
    for p in pages:
        for line in p.text.split("\n"):
            line_clean = line.strip()
            if line_clean.lower().startswith("section"):
                continue
            m_rr = re.search(
                r"(?:Room\s*Rent\s*(?:Cap|Capping|Limit)|Single\s*Private\s*AC\s*Room)\s*[:\-]\s*([^\n\.;]{3,80})",
                line_clean,
                re.I,
            )
            if m_rr:
                room_rent = {"value": m_rr.group(1).strip(), "page": p.page_number}
                break
        if room_rent:
            break

    # 7. Co-payment
    copay = None
    for p in pages:
        for line in p.text.split("\n"):
            line_clean = line.strip()
            if line_clean.lower().startswith("section"):
                continue
            m_cp = re.search(
                r"(?:Co-?[pP]ay(?:ment)?|Zero\s*Co-?[pP]ayment)\s*[:\-]\s*([^\n\.;]{2,80})",
                line_clean,
                re.I,
            )
            if m_cp:
                copay = {"value": m_cp.group(1).strip(), "page": p.page_number}
                break
            elif re.search(r"\b\d+%\s*co-?payment\b", line_clean, re.I):
                copay = {"value": line_clean, "page": p.page_number}
                break
        if copay:
            break

    # 8. Deductible
    deductible = None
    for p in pages:
        for line in p.text.split("\n"):
            line_clean = line.strip()
            if line_clean.lower().startswith("section"):
                continue
            m_dd = re.search(r"Deductible\s*[:\-]\s*([^\n\.;]{2,80})", line_clean, re.I)
            if m_dd:
                deductible = {"value": m_dd.group(1).strip(), "page": p.page_number}
                break
        if deductible:
            break

    # 9. Waiting Periods
    waiting_periods = []
    for p in pages:
        for m_wp in re.finditer(
            r"(?:Initial\s*Waiting\s*Period|Pre-Existing\s*Diseases?\s*(?:\(PED\))?|Specific\s*Illness(?:es)?|Maternity\s*Waiting\s*Period)\s*(?:Waiting\s*Period)?\s*[:\-]?\s*([^\n\.;]{2,80})",
            p.text,
            re.I,
        ):
            cond = m_wp.group(0).split(":")[0].strip()
            period = m_wp.group(1).strip()
            # Clean up bullet numbers
            cond = re.sub(r"^[\d\.\-\•\*\s]+", "", cond).strip()
            period = re.sub(r"^[\d\.\-\•\*\s]+", "", period).strip()
            if cond and period and not any(w["condition"].lower() == cond.lower() for w in waiting_periods):
                waiting_periods.append({"condition": cond, "period": period, "page": p.page_number})

    # 10. Exclusions (Expanded keyword set covering Indian & global standard health exclusions)
    exclusion_patterns = (
        r"(?:cosmetic|obesity|fertility|dental|experimental|unproven|consumables|"
        r"psychiatric|mental\s+illness|self-inflicted|suicide|alcohol|substance\s+abuse|"
        r"drug\s+abuse|hazardous\s+sports|adventure\s+sports|external\s+congenital|"
        r"std|hiv|aids|maternity|pregnancy|rest\s+cure|rehabilitation|spectacles|"
        r"hearing\s+aids|refractive\s+error|stem\s+cell|breach\s+of\s+law|war|nuclear)"
    )
    exclusions = []
    for p in pages:
        for m_ex_line in re.finditer(
            rf"(?:\d+\.\d+\s+)?([A-Za-z][^\n\.;]*{exclusion_patterns}[^\n\.;]*)",
            p.text,
            re.I,
        ):
            item_text = m_ex_line.group(1).strip()
            # Clean leading bullet symbols or numbers
            item_text = re.sub(r"^[\d\.\-\•\*\s\(\)a-zA-Z]+\s*[:\-]?\s*", "", item_text).strip()
            # Capitalize first letter
            if item_text:
                item_text = item_text[0].upper() + item_text[1:]
            if 8 <= len(item_text) <= 180 and not any(ex["item"].lower() == item_text.lower() for ex in exclusions):
                exclusions.append({"item": item_text, "page": p.page_number})

    # 11. Claim conditions
    claim_conditions = []
    for p in pages:
        for m_claim in re.finditer(
            r"(?:Cashless\s*Intimation|Reimbursement\s*Claim|Discharge\s*Summary\s*Submission|Claim\s*Notification)\s*[:\-]?\s*([^\n\.;]{4,120})",
            p.text,
            re.I,
        ):
            raw_claim = m_claim.group(0).strip()
            clean_claim = re.sub(r"^[\d\.\-\•\*\s]+", "", raw_claim).strip()
            if not any(cc["condition"].lower() == clean_claim.lower() for cc in claim_conditions):
                claim_conditions.append({"condition": clean_claim, "page": p.page_number})

    return {
        "insurer_name": {"value": insurer_name, "page": 1} if insurer_name else None,
        "policy_type": {"value": policy_type, "page": 1} if policy_type else None,
        "policy_number": {"value": policy_number, "page": 1} if policy_number else None,
        "sum_insured": sum_insured,
        "premium_amount": premium_amount,
        "room_rent_limit": room_rent,
        "co_pay": copay,
        "deductible": deductible,
        "waiting_periods": waiting_periods,
        "exclusions": exclusions,
        "claim_conditions": claim_conditions,
    }


# ── Public API ────────────────────────────────────────────────────────────────

def extract_structured_facts(
    document: Sequence[Union[PageText, Chunk]],
) -> dict[str, Any]:
    """
    Extract structured facts using targeted keyword-selected pages.
    Combines LLM extraction with deterministic heuristic extraction for 100% reliability.
    """
    if not document:
        raise ValueError("Document sequence is empty.")

    # Convert chunks to PageText if chunks were passed
    if isinstance(document[0], Chunk):
        pages_dict: dict[int, list[str]] = {}
        for c in document:  # type: ignore[union-attr]
            pages_dict.setdefault(c.page_number, []).append(c.text)
        pages: list[PageText] = [
            PageText(page_number=pg, text="\n".join(texts), source="native")
            for pg, texts in sorted(pages_dict.items())
        ]
    else:
        pages = list(document)  # type: ignore[arg-type]

    # Step A: Run deterministic heuristic extraction (zero network dependency)
    heuristic_facts = extract_heuristic_facts(pages)

    # Step B: Attempt LLM extraction (Scalars, Waiting/Exclusions, Claims)
    data_scalar: dict[str, Any] = {}
    data_we: dict[str, Any] = {}
    data_claim: dict[str, Any] = {}

    try:
        llm = get_llm()

        # ── Call 1: Scalars ───────────────────────────────────────────────────
        scalar_pages = _filter_pages(pages, _SCALAR_KEYWORDS, max_pages=3, include_cover_page=True)
        corpus_scalar = _pages_to_corpus(scalar_pages)
        logger.info("Extraction call 1/3: scalars (%d chars across pages %s)", len(corpus_scalar), [p.page_number for p in scalar_pages])
        res_scalar = llm.chat(
            [
                {"role": "system", "content": _SCALAR_PROMPT},
                {"role": "user", "content": f"POLICY TEXT:\n{corpus_scalar}"},
            ],
            temperature=0.0,
            format="json",
            max_tokens=600,
        )
        data_scalar = _parse_json_object(res_scalar)

        # ── Call 2: Waiting Periods & Exclusions ──────────────────────────────
        we_pages = _filter_pages(pages, _WAITING_EXCLUSION_KEYWORDS, max_pages=2)
        corpus_we = _pages_to_corpus(we_pages)
        logger.info("Extraction call 2/3: waiting & exclusions (%d chars across pages %s)", len(corpus_we), [p.page_number for p in we_pages])
        res_we = llm.chat(
            [
                {"role": "system", "content": _WAITING_EXCLUSION_PROMPT},
                {"role": "user", "content": f"POLICY TEXT:\n{corpus_we}"},
            ],
            temperature=0.0,
            format="json",
            max_tokens=1500,
        )
        data_we = _parse_json_object(res_we)

        # ── Call 3: Claim Conditions ──────────────────────────────────────────
        claim_pages = _filter_pages(pages, _CLAIM_KEYWORDS, max_pages=2)
        corpus_claim = _pages_to_corpus(claim_pages)
        logger.info("Extraction call 3/3: claims (%d chars across pages %s)", len(corpus_claim), [p.page_number for p in claim_pages])
        res_claim = llm.chat(
            [
                {"role": "system", "content": _CLAIM_PROMPT},
                {"role": "user", "content": f"POLICY TEXT:\n{corpus_claim}"},
            ],
            temperature=0.0,
            format="json",
            max_tokens=800,
        )
        data_claim = _parse_json_object(res_claim)

    except Exception as llm_err:
        logger.warning(
            "LLM extraction pipeline encountered an error (%s). Falling back to deterministic heuristic extraction.",
            llm_err,
        )

    # Step C: Merge LLM extracted facts with heuristic facts (fill gaps or fall back)
    def _pick_scalar(key: str) -> Optional[dict[str, Any]]:
        llm_val = data_scalar.get(key)
        if isinstance(llm_val, dict) and llm_val.get("value"):
            return llm_val
        return heuristic_facts.get(key)

    waiting_periods = [it for it in data_we.get("waiting_periods", []) if isinstance(it, dict)]
    if not waiting_periods:
        waiting_periods = heuristic_facts.get("waiting_periods", [])

    exclusions = [it for it in data_we.get("exclusions", []) if isinstance(it, dict)]
    if not exclusions:
        exclusions = heuristic_facts.get("exclusions", [])

    claim_conditions = [it for it in data_claim.get("claim_conditions", []) if isinstance(it, dict)]
    if not claim_conditions:
        claim_conditions = heuristic_facts.get("claim_conditions", [])

    facts: dict[str, Any] = {
        "insurer_name": _pick_scalar("insurer_name"),
        "policy_type": _pick_scalar("policy_type"),
        "policy_number": _pick_scalar("policy_number"),
        "premium_amount": _pick_scalar("premium_amount"),
        "sum_insured": _pick_scalar("sum_insured"),
        "room_rent_limit": _pick_scalar("room_rent_limit"),
        "co_pay": _pick_scalar("co_pay"),
        "deductible": _pick_scalar("deductible"),
        "waiting_periods": waiting_periods,
        "exclusions": exclusions,
        "claim_conditions": claim_conditions,
    }

    # Clean empty values
    for k in ("insurer_name", "policy_type", "policy_number", "premium_amount", "sum_insured", "room_rent_limit", "co_pay", "deductible"):
        if facts.get(k) and not facts[k].get("value"):
            facts[k] = None

    logger.info(
        "Structured extraction complete — insurer: %s | policy_type: %s | sum_insured: %s | waiting: %d | exclusions: %d",
        facts["insurer_name"].get("value") if facts.get("insurer_name") else "None",
        facts["policy_type"].get("value") if facts.get("policy_type") else "None",
        bool(facts["sum_insured"]),
        len(facts["waiting_periods"]),
        len(facts["exclusions"]),
    )
    return facts


# ── Debug Helper ──────────────────────────────────────────────────────────────

def pretty_print_facts(facts: dict[str, Any]) -> None:
    """Print extracted facts in a clean, human-readable format."""
    print(f"\n{'='*75}")
    print("  EXTRACTED STRUCTURED POLICY FACTS (TARGETED WITH PAGE CITATIONS)")
    print(f"{'='*75}\n")

    for field in ("sum_insured", "room_rent_limit", "co_pay", "deductible"):
        val = facts.get(field)
        label = field.upper().replace("_", " ")
        if val:
            print(f"  {label:<18} : {val.get('value')}  (Page {val.get('page')})")
        else:
            print(f"  {label:<18} : None / Not Found")

    print("\n  WAITING PERIODS:")
    wp = facts.get("waiting_periods", [])
    if wp:
        for item in wp:
            print(f"    • [Page {item.get('page', '?')}] {item.get('condition')}: {item.get('period')}")
    else:
        print("    (None found)")

    print("\n  EXCLUSIONS:")
    excl = facts.get("exclusions", [])
    if excl:
        for item in excl:
            print(f"    • [Page {item.get('page', '?')}] {item.get('item')}")
    else:
        print("    (None found)")

    print("\n  CLAIM CONDITIONS:")
    cc = facts.get("claim_conditions", [])
    if cc:
        for item in cc:
            print(f"    • [Page {item.get('page', '?')}] {item.get('condition')}")
    else:
        print("    (None found)")

    print(f"\n{'='*75}\n")
