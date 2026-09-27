"""
Structured facts extractor for insurance policies (Single-Pass with Page Markers).

Design rationale
----------------
Rather than making 13 separate LLM calls over isolated chunks (which causes
severe queue latency on local models, context fragmentation when clauses cross
chunk boundaries, and complex merge logic), we use a unified single-pass
extraction with explicit page markers: `=== PAGE N ===`.

Why this is optimal:
  1. Standard health insurance policies are ~8–20 pages (~3,500 to 8,000 tokens),
     which easily fits into the 32k–128k context window of modern LLMs.
  2. Exactly ONE LLM call is made for the entire document (~20–30s total).
  3. The model maintains holistic document context (e.g. connecting Clause 2.1
     hospitalisation limits on page 4 with Clause 4 exclusions on page 5).
  4. Explicit `=== PAGE N ===` markers allow the LLM to anchor every extracted
     fact, waiting period, exclusion, and claim condition to its exact 1-based
     physical PDF page number with zero guesswork.

Chunks produced by `chunking.py` are preserved for semantic retrieval and vector
store indexing (ChromaDB), where fine-grained chunk retrieval is the right tool.
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
    """
    Remove markdown code fences and trim to the outermost JSON object.

    Handles:
    - ```json ... ``` markdown blocks
    - ``` ... ``` plain blocks
    - Conversational preambles or postscripts
    """
    raw = re.sub(r"^```(?:json)?\s*", "", raw.strip(), flags=re.IGNORECASE)
    raw = re.sub(r"\s*```$", "", raw.strip())
    start = raw.find("{")
    end = raw.rfind("}")
    if start != -1 and end != -1 and end > start:
        raw = raw[start : end + 1]
    return raw.strip()


def _parse_json_object(raw: str) -> dict[str, Any]:
    """Parse LLM output as a JSON object with strip-and-retry fallback."""
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass
    cleaned = _strip_json_fences(raw)
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError as exc:
        raise ValueError(
            f"LLM returned non-JSON. Parse error: {exc}\n"
            f"Raw output (first 400 chars): {raw[:400]}"
        ) from exc


# ── Prompt construction ───────────────────────────────────────────────────────

_EXTRACTION_SYSTEM_PROMPT = """\
You are a precise, meticulous insurance policy data analyst.

Your task is to extract key structured facts from the provided policy text.
The document contains page markers in the format `=== PAGE N ===`.

RULES (Follow strictly):
1. Extract ONLY facts that have EXPLICIT textual evidence in the policy.
2. NEVER guess, assume, interpolate, or extrapolate.
3. For every extracted item or field, you MUST record the exact page number (integer) from the `=== PAGE N ===` marker where the evidence was found.
4. For amounts, limits, and percentages, preserve the exact wording as written in the text (e.g. "Rs. 10,00,000", "1% of Sum Insured per day", "20% co-payment").
5. If a field is not found in the text, omit it or set it to null. Do NOT invent placeholder values.
6. Return ONLY a valid JSON object matching the schema below. No markdown fences, no conversational preamble, no postscript.

OUTPUT SCHEMA:
{
  "sum_insured": {"value": "<exact text>", "page": <int>} or null,
  "room_rent_limit": {"value": "<exact text>", "page": <int>} or null,
  "co_pay": {"value": "<exact text>", "page": <int>} or null,
  "deductible": {"value": "<exact text>", "page": <int>} or null,
  "waiting_periods": [
    {"condition": "<condition name>", "period": "<waiting period>", "page": <int>}
  ],
  "exclusions": [
    {"item": "<exact exclusion item as stated>", "page": <int>}
  ],
  "claim_conditions": [
    {"condition": "<exact claim condition, notice timeline, or doc requirement>", "page": <int>}
  ]
}

FIELD EXPLANATIONS:
- sum_insured: Overall maximum coverage amount (e.g. "Rs. 10,00,000").
- room_rent_limit: Daily cap on room/bed charges (e.g. "1% of Sum Insured per day").
- co_pay: Co-payment percentage or cost share paid by insured (e.g. "20% co-payment").
- deductible: Initial deductible paid by insured before policy pays (null if none).
- waiting_periods: List of pre-existing, specific illness, initial, or maternity waiting periods.
- exclusions: List of medical treatments, conditions, or expenses permanently not covered.
- claim_conditions: Cashless notice deadlines, reimbursement document submission windows, settlement timelines.
"""


def _build_document_corpus(items: Sequence[Union[PageText, Chunk]]) -> str:
    """
    Format pages or chunks into a single text corpus with clear page anchors.
    """
    if not items:
        return ""

    # Check if passing PageText or Chunk objects
    first = items[0]
    corpus_parts: list[str] = []

    if isinstance(first, PageText):
        for p in items:  # type: ignore[union-attr]
            if p.text.strip():
                corpus_parts.append(f"=== PAGE {p.page_number} ===\n{p.text.strip()}")
    elif isinstance(first, Chunk):
        # Group chunks by page to avoid redundant page headers
        current_page = None
        page_chunks: list[str] = []
        for c in items:  # type: ignore[union-attr]
            if c.page_number != current_page:
                if current_page is not None and page_chunks:
                    corpus_parts.append(f"=== PAGE {current_page} ===\n" + "\n\n".join(page_chunks))
                current_page = c.page_number
                page_chunks = [c.text.strip()]
            else:
                page_chunks.append(c.text.strip())
        if current_page is not None and page_chunks:
            corpus_parts.append(f"=== PAGE {current_page} ===\n" + "\n\n".join(page_chunks))
    else:
        raise TypeError(f"Expected sequence of PageText or Chunk, got {type(first)}")

    return "\n\n".join(corpus_parts)


# ── Public API ────────────────────────────────────────────────────────────────

def extract_structured_facts(
    document: Sequence[Union[PageText, Chunk]],
) -> dict[str, Any]:
    """
    Extract a structured facts dictionary from a policy's pages or chunks.

    Performs a single-pass LLM extraction with full document context and
    page markers.  This is fast (1 single LLM call), cost-effective, and
    eliminates context fragmentation while preserving exact page citations.

    Args:
        document: Sequence of PageText (from extract_pages) or Chunk (from chunk_pages).

    Returns:
        Dict conforming to the structured facts schema:
        - sum_insured (dict with 'value' and 'page' or None)
        - room_rent_limit (dict with 'value' and 'page' or None)
        - co_pay (dict with 'value' and 'page' or None)
        - deductible (dict with 'value' and 'page' or None)
        - waiting_periods (list of dicts with 'condition', 'period', 'page')
        - exclusions (list of dicts with 'item', 'page')
        - claim_conditions (list of dicts with 'condition', 'page')
    """
    if not document:
        raise ValueError("Document sequence is empty — nothing to extract from.")

    corpus = _build_document_corpus(document)
    logger.info("Starting single-pass structured extraction (%d characters, 1 LLM call)", len(corpus))

    llm = get_llm()
    messages = [
        {"role": "system", "content": _EXTRACTION_SYSTEM_PROMPT},
        {
            "role": "user",
            "content": f"POLICY TEXT TO ANALYZE:\n\n{corpus}\n\nExtract all structured facts according to the schema.",
        },
    ]

    raw_response = llm.chat(messages, temperature=0.0)
    data = _parse_json_object(raw_response)

    # Clean and standardize output dict
    facts: dict[str, Any] = {
        "sum_insured": data.get("sum_insured") if isinstance(data.get("sum_insured"), dict) else None,
        "room_rent_limit": data.get("room_rent_limit") if isinstance(data.get("room_rent_limit"), dict) else None,
        "co_pay": data.get("co_pay") if isinstance(data.get("co_pay"), dict) else None,
        "deductible": data.get("deductible") if isinstance(data.get("deductible"), dict) else None,
        "waiting_periods": [item for item in data.get("waiting_periods", []) if isinstance(item, dict)],
        "exclusions": [item for item in data.get("exclusions", []) if isinstance(item, dict)],
        "claim_conditions": [item for item in data.get("claim_conditions", []) if isinstance(item, dict)],
    }

    # Filter out scalar entries that have no value
    for k in ("sum_insured", "room_rent_limit", "co_pay", "deductible"):
        if facts[k] and not facts[k].get("value"):
            facts[k] = None

    logger.info(
        "Structured extraction complete — sum_insured: %s | waiting_periods: %d | exclusions: %d | claim_conditions: %d",
        bool(facts["sum_insured"]),
        len(facts["waiting_periods"]),
        len(facts["exclusions"]),
        len(facts["claim_conditions"]),
    )

    return facts


# ── Debug Helper ──────────────────────────────────────────────────────────────

def pretty_print_facts(facts: dict[str, Any]) -> None:
    """Print extracted facts in a clean, human-readable format."""
    print(f"\n{'='*75}")
    print("  EXTRACTED STRUCTURED POLICY FACTS (1-PASS WITH PAGE CITATIONS)")
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
