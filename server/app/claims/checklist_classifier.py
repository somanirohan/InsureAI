"""
Deterministic checklist item classifier, document list splitter, and deadline parser.
Pure functions without any LLM calls.
"""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional, Tuple

from app.claims.checklist_vocabulary import (
    DOC_CANONICAL_ALIASES,
    DOCUMENT_TYPES,
    REQUIREMENT_TYPES,
)

FILLER_WORDS = [
    r"\ball\b",
    r"\boriginal\b",
    r"\bduly completed and signed\b",
    r"\bduly completed\b",
    r"\bduly filled\b",
    r"\bduly\b",
    r"\bphotocopy of\b",
    r"\bcopy of\b",
    r"\bcopies of\b",
    r"\band\b",
    r"\ba\b",
    r"\ban\b",
    r"\bthe\b",
    r"\bany\b",
    r"\bother\b",
]

DOC_PREFIX_REGEX = re.compile(
    r"^(?:required documents|documents required|documents to be submitted|"
    r"the following documents must be submitted|list of documents|mandatory documents|"
    r"documents needed|documents)\s*[:\-–—]\s*",
    re.IGNORECASE,
)


# ── 1. Deadline Parser ────────────────────────────────────────────────────────

def parse_deadline(text: str) -> Optional[Dict[str, Any]]:
    """
    Deterministically parse timeframe, unit, anchor, and direction from a sentence.
    Returns None if not confident.
    """
    if not text:
        return None

    cleaned = text.lower()

    # Pattern A: "at least X hours/days prior [to admission]" or "X hours/days before admission"
    m_prior = re.search(
        r"(?:at least\s+)?(\d+)\s*(hours?|hrs?|days?)\s*(?:prior|before|in advance)(?:\s+to\s+(?:admission|hospitali[sz]ation))?",
        cleaned,
    )
    if m_prior:
        val = int(m_prior.group(1))
        unit = "hours" if "h" in m_prior.group(2) else "days"
        return {
            "value": val,
            "unit": unit,
            "anchor": "before_admission",
            "direction": "before",
            "raw": m_prior.group(0).strip(),
            "formatted": f"at least {val} {unit} before admission",
        }

    # Pattern B: "within X hours/days of admission" or "within X hours/days of hospitalisation"
    m_adm = re.search(
        r"within\s+(\d+)\s*(hours?|hrs?|days?)\s*(?:of|from)\s+(?:admission|hospitali[sz]ation|emergency)",
        cleaned,
    )
    if m_adm:
        val = int(m_adm.group(1))
        unit = "hours" if "h" in m_adm.group(2) else "days"
        return {
            "value": val,
            "unit": unit,
            "anchor": "after_admission",
            "direction": "after",
            "raw": m_adm.group(0).strip(),
            "formatted": f"within {val} {unit} of admission",
        }

    # Pattern C: "within X days/hours of discharge [from hospital]"
    m_dis = re.search(
        r"within\s+(\d+)\s*(hours?|hrs?|days?)\s*(?:of|from)\s+(?:discharge|leaving hospital)(?:\s+from\s+hospital)?",
        cleaned,
    )
    if m_dis:
        val = int(m_dis.group(1))
        unit = "hours" if "h" in m_dis.group(2) else "days"
        return {
            "value": val,
            "unit": unit,
            "anchor": "after_discharge",
            "direction": "after",
            "raw": m_dis.group(0).strip(),
            "formatted": f"within {val} {unit} of discharge",
        }

    # Pattern D: "within X days" (general)
    m_gen = re.search(r"within\s+(\d+)\s*(hours?|hrs?|days?)\b", cleaned)
    if m_gen:
        val = int(m_gen.group(1))
        unit = "hours" if "h" in m_gen.group(2) else "days"
        anchor = "after_discharge" if val >= 15 else "after_admission"
        return {
            "value": val,
            "unit": unit,
            "anchor": anchor,
            "direction": "after",
            "raw": m_gen.group(0).strip(),
            "formatted": f"within {val} {unit}",
        }

    return None


# ── 2. Vocabulary Matcher Helper ─────────────────────────────────────────────

def _clean_segment_for_matching(segment: str) -> str:
    """Normalize text and strip filler words for synonym matching."""
    s = segment.lower().strip()
    s = re.sub(r"^[0-9]+[\.\)\-]\s*", "", s)  # strip leading numbering like "1." or "a)"
    for filler in FILLER_WORDS:
        s = re.sub(filler, " ", s, flags=re.IGNORECASE)
    s = re.sub(r"[^\w\s]", " ", s)
    return " ".join(s.split())


def match_document_vocabulary(segment: str) -> Optional[str]:
    """
    Match a text segment against DOCUMENT_TYPES synonyms, longest synonym first.
    Returns canonical vocabulary ID or None.
    """
    clean_seg = _clean_segment_for_matching(segment)
    raw_seg_lower = segment.lower()

    # Collect all (synonym, doc_id) sorted by descending synonym length
    candidates: List[Tuple[str, str]] = []
    for doc_id, doc_meta in DOCUMENT_TYPES.items():
        canonical_id = DOC_CANONICAL_ALIASES.get(doc_id, doc_id)
        for syn in doc_meta.get("synonyms", []):
            candidates.append((syn.lower().strip(), canonical_id))

    candidates.sort(key=lambda x: len(x[0]), reverse=True)

    # 1. Direct substring check on raw text
    for syn, c_id in candidates:
        if syn in raw_seg_lower:
            return c_id

    # 2. Check on normalized text
    for syn, c_id in candidates:
        clean_syn = _clean_segment_for_matching(syn)
        if clean_syn and (clean_syn in clean_seg or clean_seg in clean_syn):
            return c_id

    return None


def match_requirement_vocabulary(text: str) -> Optional[str]:
    """
    Match an action or deadline sentence against REQUIREMENT_TYPES.
    """
    raw_lower = text.lower()
    candidates: List[Tuple[str, str]] = []
    for req_id, req_meta in REQUIREMENT_TYPES.items():
        if req_id == "generic_requirement":
            continue
        for syn in req_meta.get("synonyms", []):
            candidates.append((syn.lower().strip(), req_id))

    candidates.sort(key=lambda x: len(x[0]), reverse=True)

    for syn, r_id in candidates:
        if syn in raw_lower:
            return r_id

    # Fallback to anchor mapping if deadline was parsed
    dl = parse_deadline(text)
    if dl:
        anchor = dl.get("anchor")
        if anchor == "before_admission":
            return "preauthorisation"
        elif anchor == "after_admission":
            return "admission_intimation"
        elif anchor == "after_discharge":
            return "claim_filing_deadline"

    return None


# ── 3. Document List Splitter ────────────────────────────────────────────────

def split_document_list(text: str) -> List[Dict[str, Any]]:
    """
    Split a document list sentence into distinct document items with vocabulary IDs.
    - Strips leading "Required documents:" markers.
    - Splits on commas, semicolons, and newlines.
    - Only splits a segment on 'and' / '&' / '/' if it contains two DISTINCT vocabulary matches.
      e.g. 'itemised bills and receipts' stays ONE item (itemised_bills).
    - Unmatched segments become 'other_<slug>' with needs_confirmation=True.
    - De-duplicates by ID, merging citations.
    """
    if not text:
        return []

    # Strip leading marker
    stripped = DOC_PREFIX_REGEX.sub("", text.strip())

    # Initial split on punctuation: comma, semicolon, newline, bullet points
    # Also handle numbered bullets: "1. ... 2. ... "
    numbered_parts = re.split(r"(?:;\s*|\n+|\r+|\t+|•|\b(?:\d+|[a-zA-Z])\.\s+)", stripped)
    initial_segments: List[str] = []
    for p in numbered_parts:
        # Split on commas
        subparts = [sp.strip() for sp in p.split(",") if sp.strip()]
        initial_segments.extend(subparts)

    refined_segments: List[str] = []

    for seg in initial_segments:
        seg_clean = seg.strip(" .")
        if not seg_clean:
            continue

        # Check if segment contains conjunctions (" and ", " & ", " along with ", " together with ", " / ")
        conjunction_split = re.split(r"\s+(?:and|&|along with|together with)\s+|\s*/\s*", seg_clean, flags=re.IGNORECASE)
        if len(conjunction_split) > 1:
            # Check matches of parts
            part_matches = [match_document_vocabulary(p) for p in conjunction_split if p.strip()]
            valid_distinct = set(m for m in part_matches if m is not None)

            # Special case: does the FULL segment match a known compound synonym?
            full_match = match_document_vocabulary(seg_clean)
            if full_match and (len(valid_distinct) <= 1):
                # Whole segment matches e.g. "itemised bills and receipts" -> 1 item
                refined_segments.append(seg_clean)
            elif len(valid_distinct) >= 2:
                # Two distinct vocabulary items e.g. "original discharge summary and duly completed claim form"
                for sub in conjunction_split:
                    if sub.strip():
                        refined_segments.append(sub.strip())
            else:
                refined_segments.append(seg_clean)
        else:
            refined_segments.append(seg_clean)

    # Now match each segment to vocabulary or generate other_<slug>
    results: List[Dict[str, Any]] = []
    seen_ids: Dict[str, Dict[str, Any]] = {}

    for raw_seg in refined_segments:
        raw_seg = raw_seg.strip(" .")
        if not raw_seg:
            continue

        # Strip trailing deadline phrases from document segment display
        clean_doc_seg = re.sub(
            r"\s+(?:within\s+\d+\s+(?:days|hours).*|at least\s+\d+\s+(?:hours|days).*)$",
            "",
            raw_seg,
            flags=re.IGNORECASE,
        ).strip()
        matched_id = match_document_vocabulary(clean_doc_seg or raw_seg)

        if matched_id:
            doc_meta = DOCUMENT_TYPES.get(matched_id, {})
            item_id = matched_id
            label = doc_meta.get("label", item_id.replace("_", " ").title())
            desc = doc_meta.get("description", "")
            needs_conf = False
        else:
            # Fallback slug: other_<slug>
            slug = re.sub(r"[^a-z0-9]+", "_", clean_doc_seg.lower()).strip("_")
            words = [w for w in slug.split("_") if w not in ("a", "an", "the", "and", "or", "of", "all")][:3]
            sub_slug = "_".join(words) if words else "document"
            item_id = f"other_{sub_slug}"[:40]
            label = clean_doc_seg.strip()
            desc = "Confirm this document requirement with your hospital or insurer."
            needs_conf = True

        if item_id in seen_ids:
            # Merge segment
            existing = seen_ids[item_id]
            if raw_seg not in existing["raw_segments"]:
                existing["raw_segments"].append(raw_seg)
        else:
            entry = {
                "segment": clean_doc_seg,
                "matched_id": item_id,
                "label": label,
                "description": desc,
                "needs_confirmation": needs_conf,
                "raw_segments": [raw_seg],
            }
            seen_ids[item_id] = entry
            results.append(entry)

    return results


# ── 4. Condition Classifier ──────────────────────────────────────────────────

def classify_condition(text: str, stage: str = "unspecified") -> str:
    """
    Classify a policy condition into:
      - "requirement": pure action or deadline reminder
      - "document_list": listing of uploadable documents
      - "mixed": contains both an action/deadline and document listing
      - "unknown": unclassifiable
    """
    if not text or not text.strip():
        return "unknown"

    t = text.strip()
    is_doc_prefix = bool(DOC_PREFIX_REGEX.search(t))
    req_match = match_requirement_vocabulary(t)
    parsed_dl = parse_deadline(t)
    doc_splits = split_document_list(t)

    # Document signals
    has_recognized_docs = any(not it["needs_confirmation"] for it in doc_splits)
    has_multiple_docs = len(doc_splits) >= 2

    # Requirement signals
    has_action_words = any(
        kw in t.lower()
        for kw in (
            "must be requested",
            "must be filed",
            "must be submitted",
            "notification is required",
            "intimation is required",
            "intimate",
            "notify",
            "intimation",
            "notification",
            "must request",
            "must submit",
            "must file",
            "must provide",
            "prior approval",
            "helpline",
            "call customer care",
            "request pre",
            "as early as",
        )
    )

    if has_recognized_docs and (req_match or parsed_dl or has_action_words):
        # Mixed: contains documents AND an action/deadline
        return "mixed"

    if is_doc_prefix or (has_recognized_docs and not (req_match or parsed_dl or has_action_words)):
        return "document_list"

    if req_match or parsed_dl or has_action_words:
        return "requirement"

    return "unknown"
