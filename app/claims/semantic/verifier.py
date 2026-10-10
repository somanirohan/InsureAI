"""
Semantic Evidence Verifier for InsureAI claims.

Verifies whether a retrieved policy clause:
  - 'supports': Clause confirms coverage or justifies the billed item/rate
  - 'contradicts': Clause specifically excludes or disallows the billed item/procedure
  - 'ambiguous': Clause is related but does not clearly confirm or deny coverage
  - 'conflicting_evidence': Multiple opposing conditions detected
  - 'no_match': Item has no relevant policy clause

HARD CONSTRAINTS:
1. Supporting excerpt MUST be a verbatim substring of the clause text. If not, confidence is forced to 'needs_review'.
2. Ambiguity is a first-class outcome. If similarity or relevance is below threshold, return 'no_match'.
3. All model calls have timeouts (5s) and fall back to keyword matching with visible notice:
   'Semantic matching unavailable, using keyword fallback'.
4. Bill text is only ever a QUERY, never evidence.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any, Dict, List, Optional

from app.claims.semantic.criteria import (
    SemanticMatchResult,
    VerdictType,
    ConfidenceLabel,
    enforce_verbatim_excerpt_contract,
    is_verbatim_substring,
    normalize_whitespace,
)
from app.claims.semantic.reranker import CandidateClause, rerank_candidates
from app.claims.semantic.retriever import retrieve_candidates
from app.llm.factory import get_llm

logger = logging.getLogger("insureai.claims.semantic.verifier")

# DEV threshold for minimum relevance
MIN_RELEVANCE_THRESHOLD = 0.35


def _extract_verbatim_excerpt(candidate_excerpt: str, full_clause_text: str) -> str:
    """Find and return an exact verbatim substring in full_clause_text matching candidate_excerpt."""
    if not candidate_excerpt or not full_clause_text:
        return ""
    norm_cand = normalize_whitespace(candidate_excerpt).lower()
    norm_full = normalize_whitespace(full_clause_text)
    norm_full_lower = norm_full.lower()

    idx = norm_full_lower.find(norm_cand)
    if idx != -1:
        # Return the exact casing from norm_full
        return norm_full[idx : idx + len(norm_cand)]

    # Fallback to finding sentence or sentence prefix that matches
    sentences = re.split(r'(?<=[.!?]) +', full_clause_text)
    for sent in sentences:
        if norm_cand in normalize_whitespace(sent).lower():
            return sent.strip()

    return ""


def _deterministic_keyword_verify(
    description: str,
    clause: CandidateClause,
    is_fallback: bool = False,
) -> SemanticMatchResult:
    """
    Deterministic verification rule when LLM is unavailable or for fallback baseline.
    Checks explicit exclusions, waiting periods, and room rent coverage rules.
    """
    desc_lower = description.lower()
    clause_lower = clause.text.lower()
    match_id = f"match_{clause.clause_id}"

    # Default verdict and confidence
    verdict: VerdictType = "ambiguous"
    confidence: ConfidenceLabel = "medium"
    review_reason: Optional[str] = None
    excerpt = clause.text[:200].strip()

    if clause.clause_type == "exclusion":
        # Check if procedure is mentioned in exclusion clause
        # If words in desc overlap with exclusion
        tokens = set(re.findall(r"\b[a-zA-Z]{3,}\b", desc_lower))
        matching_tokens = [t for t in tokens if t in clause_lower and t not in ("charges", "fee", "cost", "total", "dr.")]
        if matching_tokens:
            verdict = "contradicts"
            confidence = "high"
            review_reason = f"Item matches policy exclusion ({', '.join(matching_tokens)})."
        else:
            verdict = "ambiguous"
            confidence = "needs_review"
            review_reason = "Possible exclusion match requires manual review."

    elif clause.clause_type == "waiting_period":
        verdict = "contradicts" if any(w in desc_lower for w in ("cataract", "joint", "hernia", "pre-existing", "ped")) else "ambiguous"
        confidence = "medium"
        review_reason = "Subject to policy waiting period verification."

    elif clause.clause_type in ("room_rent", "sub_limit"):
        verdict = "supports"
        confidence = "high"
        review_reason = "Subject to standard sub-limit / room rent ceiling."

    else:
        verdict = "supports"
        confidence = "medium"

    # Ensure excerpt is verbatim substring
    excerpt = _extract_verbatim_excerpt(excerpt, clause.text) or clause.text[:120].strip()

    notice = "Semantic matching unavailable, using keyword fallback" if is_fallback else None

    res = SemanticMatchResult(
        match_id=match_id,
        clause_id=clause.clause_id,
        clause_title=clause.title,
        clause_type=clause.clause_type,
        page=clause.page,
        supporting_excerpt=excerpt,
        verdict=verdict,
        confidence=confidence,
        review_reason=review_reason,
        similarity_score=clause.score,
        is_fallback=is_fallback,
        fallback_notice=notice,
    )
    return enforce_verbatim_excerpt_contract(res, clause.text)


def verify_clause_support(
    description: str,
    clause: CandidateClause,
) -> SemanticMatchResult:
    """
    Verify whether the clause supports, contradicts, or leaves interpretation ambiguous.
    Uses LLM with strict JSON schema, timeout, and fallback.
    """
    match_id = f"match_{clause.clause_id}"

    prompt = f"""You are a strict health insurance claim policy auditor.
Evaluate whether the following Policy Clause SUPPORTS, CONTRADICTS, or leaves AMBIGUOUS the coverage of the Billed Item.

BILLED ITEM:
"{description}"

POLICY CLAUSE (Page {clause.page}):
"{clause.text}"

RULES:
1. Verdict MUST be one of:
   - "supports": Policy explicitly covers this treatment/cost category.
   - "contradicts": Policy explicitly excludes or disallows this treatment/item (e.g. permanent exclusion, unmet waiting period).
   - "ambiguous": Clause is related but does not definitively decide coverage without further details.
   - "conflicting_evidence": Clause has contradictory clauses or conflicting carve-outs.
2. supporting_excerpt MUST be an EXACT VERBATIM SUBSTRING of the Policy Clause text above. DO NOT paraphrase or fabricate.
3. confidence MUST be one of: "high", "medium", "needs_review".
4. If the clause has exclusions or exceptions, identify them in review_reason.

Respond with ONLY valid JSON:
{{
  "verdict": "supports | contradicts | ambiguous | conflicting_evidence",
  "supporting_excerpt": "verbatim substring from policy clause",
  "confidence": "high | medium | needs_review",
  "review_reason": "concise explanation or null"
}}"""

    try:
        llm = get_llm()
        reply = llm.chat(
            messages=[
                {"role": "system", "content": "You are a policy verification system that outputs strict JSON."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.0,
            max_tokens=350,
        )

        cleaned_reply = reply.strip()
        if cleaned_reply.startswith("```"):
            cleaned_reply = re.sub(r'^```(?:json)?\n?', '', cleaned_reply)
            cleaned_reply = re.sub(r'\n?```$', '', cleaned_reply)

        json_match = re.search(r'\{.*\}', cleaned_reply, re.DOTALL)
        if not json_match:
            raise ValueError("No JSON object returned from LLM")

        data = json.loads(json_match.group(0))
        verdict = str(data.get("verdict", "ambiguous")).lower()
        if verdict not in ("supports", "contradicts", "ambiguous", "conflicting_evidence"):
            verdict = "ambiguous"

        raw_excerpt = str(data.get("supporting_excerpt", "")).strip()
        confidence = str(data.get("confidence", "medium")).lower()
        if confidence not in ("high", "medium", "needs_review"):
            confidence = "needs_review"

        review_reason = data.get("review_reason")

        # Guarantee verbatim excerpt substring
        verbatim_excerpt = _extract_verbatim_excerpt(raw_excerpt, clause.text)
        if not verbatim_excerpt:
            verbatim_excerpt = clause.text[:120].strip()
            confidence = "needs_review"
            review_reason = f"{review_reason or ''}; Excerpt normalized to clause text prefix."

        result = SemanticMatchResult(
            match_id=match_id,
            clause_id=clause.clause_id,
            clause_title=clause.title,
            clause_type=clause.clause_type,
            page=clause.page,
            supporting_excerpt=verbatim_excerpt,
            verdict=verdict,  # type: ignore[arg-type]
            confidence=confidence,  # type: ignore[arg-type]
            review_reason=review_reason,
            similarity_score=clause.score,
            is_fallback=False,
            fallback_notice=None,
        )
        return enforce_verbatim_excerpt_contract(result, clause.text)

    except Exception as exc:
        logger.warning(
            "Semantic verification failed or timed out for item '%s': %s. Falling back to keyword rule.",
            description,
            exc,
        )
        return _deterministic_keyword_verify(description, clause, is_fallback=True)


def match_and_verify_item(
    policy_id: str,
    description: str,
    top_k: int = 3,
) -> SemanticMatchResult:
    """
    Main entry point for linking a bill line item description to a policy clause and verifying it.
    If no clause clears MIN_RELEVANCE_THRESHOLD, returns 'no_match' (ambiguity is first-class).
    """
    if not description or not description.strip():
        return SemanticMatchResult(
            match_id="no_match",
            clause_id="none",
            clause_title="No Item Description",
            clause_type="none",
            page=1,
            supporting_excerpt="",
            verdict="no_match",
            confidence="high",
            review_reason="Empty item description provided.",
        )

    candidates = retrieve_candidates(policy_id, description, top_k=top_k)
    reranked = rerank_candidates(description, candidates)

    if not reranked or reranked[0].score < MIN_RELEVANCE_THRESHOLD:
        return SemanticMatchResult(
            match_id="no_match",
            clause_id="none",
            clause_title="No Relevant Policy Clause Found",
            clause_type="none",
            page=1,
            supporting_excerpt="",
            verdict="no_match",
            confidence="medium",
            review_reason="No policy clause cleared the minimum relevance threshold.",
            similarity_score=reranked[0].score if reranked else 0.0,
        )

    best_candidate = reranked[0]
    return verify_clause_support(description, best_candidate)
