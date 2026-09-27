"""
Embedding-based query router for structured vs. semantic question routing.

Design rationale
----------------
Instead of using an LLM to classify whether a user question is asking for a
structured policy field or requires semantic document search (which adds ~1-2s
latency, token cost, and non-deterministic misclassifications), we use pure
embedding vector similarity.

How it works:
  1. Maintain a static dictionary mapping each known structured field to a list
     of prototypical reference phrases.
  2. Embed all reference phrases once using `get_embedder()` and cache the
     resulting vectors in memory so subsequent calls require zero extra
     reference embedding overhead.
  3. At query time:
     a. Embed the incoming user question (1 embedding call).
     b. Compute cosine similarity between the question vector and each
        reference phrase vector.
     c. For each structured field, compute the maximum similarity among its
        reference phrases.
     d. Identify the field with the highest similarity score.
     e. If the highest score exceeds `settings.router_similarity_threshold`
        (default: 0.75), route to that structured field.
     f. Otherwise, return None (indicating the semantic retrieval path).
"""

from __future__ import annotations

import logging
import math
from typing import Optional

from app.config import settings
from app.embeddings.factory import get_embedder

logger = logging.getLogger(__name__)


# ── Prototypical reference phrases per structured field ───────────────────────
#
# Each list contains canonical phrasings and common synonyms a user might ask.
# The query is compared against all of them; the max similarity score across
# a field's phrases represents the match confidence for that field.

STRUCTURED_FIELD_REFERENCES: dict[str, list[str]] = {
    "sum_insured": [
        "what is my sum insured",
        "total sum insured coverage amount",
        "maximum policy coverage limit",
        "what is the maximum coverage under this policy",
        "how much total coverage do I have",
        "basic sum insured",
    ],
    "room_rent_limit": [
        "what is the room rent limit",
        "room rent cap per day",
        "eligible room category and daily bed charges",
        "room rent capping and icu room rent charges",
        "daily hospital room rent limit",
        "maximum room rent allowed",
    ],
    "co_pay": [
        "what is the co-pay percentage",
        "mandatory copayment percentage on claims",
        "how much co-pay do I have to pay",
        "copay clause and deductible share",
        "is there a co-pay applicable",
    ],
    "deductible": [
        "what is the deductible amount",
        "policy deductible before insurance pays",
        "annual aggregate deductible",
        "deductible clause",
        "do I have to pay a deductible",
    ],
    "waiting_periods": [
        "what are the waiting periods",
        "waiting period for pre-existing disease ped",
        "initial waiting period 30 days",
        "specific illness 24 month waiting period",
        "maternity coverage waiting period",
        "how long do I have to wait before making a claim",
    ],
    "exclusions": [
        "what are the permanent exclusions",
        "list of excluded treatments not covered",
        "what is not covered under this health policy",
        "general exclusions and uncovered expenses",
        "is cosmetic or dental surgery excluded",
    ],
    "claim_conditions": [
        "what are the claim procedure conditions and requirements",
        "cashless claim pre-authorisation notice timeline",
        "documents required for reimbursement claim submission",
        "claim intimation timeline and settlement days",
        "how to file a claim and required documents",
    ],
}


# ── Embedding vector math helpers ─────────────────────────────────────────────

def _cosine_similarity(vec_a: list[float], vec_b: list[float]) -> float:
    """
    Compute cosine similarity between two float vectors.

    dot(a, b) / (norm(a) * norm(b))
    Returns 0.0 if either vector has zero magnitude.
    """
    if len(vec_a) != len(vec_b):
        raise ValueError(
            f"Vector dimension mismatch: {len(vec_a)} vs {len(vec_b)}"
        )

    dot_product = 0.0
    norm_a = 0.0
    norm_b = 0.0

    for a, b in zip(vec_a, vec_b):
        dot_product += a * b
        norm_a += a * a
        norm_b += b * b

    if norm_a <= 0.0 or norm_b <= 0.0:
        return 0.0

    return dot_product / (math.sqrt(norm_a) * math.sqrt(norm_b))


# ── Cached reference embeddings ───────────────────────────────────────────────

# Global cache: field_name -> list of reference vector embeddings
_CACHED_REFERENCE_VECTORS: Optional[dict[str, list[list[float]]]] = None


def warm_router_cache(force_refresh: bool = False) -> dict[str, list[list[float]]]:
    """
    Precompute and cache embedding vectors for all reference phrases.

    Called automatically on first route_question() call, or can be called
    explicitly during application startup to eliminate cold-start latency.
    """
    global _CACHED_REFERENCE_VECTORS

    if _CACHED_REFERENCE_VECTORS is not None and not force_refresh:
        return _CACHED_REFERENCE_VECTORS

    logger.info("Initializing and caching router reference embeddings...")
    embedder = get_embedder()

    # Flatten all phrases with their field tags to embed in one batch
    field_phrase_pairs: list[tuple[str, str]] = []
    for field_name, phrases in STRUCTURED_FIELD_REFERENCES.items():
        for phrase in phrases:
            field_phrase_pairs.append((field_name, phrase))

    phrases_to_embed = [phrase for _, phrase in field_phrase_pairs]
    logger.info("Embedding %d reference phrases across %d fields", len(phrases_to_embed), len(STRUCTURED_FIELD_REFERENCES))
    vectors = embedder.embed(phrases_to_embed)

    # Reconstruct mapping: field_name -> list of vectors
    cached: dict[str, list[list[float]]] = {
        field_name: [] for field_name in STRUCTURED_FIELD_REFERENCES
    }
    for (field_name, _), vec in zip(field_phrase_pairs, vectors):
        cached[field_name].append(vec)

    _CACHED_REFERENCE_VECTORS = cached
    logger.info("Router reference embeddings cached successfully.")
    return _CACHED_REFERENCE_VECTORS


# ── Public API ────────────────────────────────────────────────────────────────

def route_question_with_score(
    question: str,
    threshold: Optional[float] = None,
) -> tuple[Optional[str], float, dict[str, float]]:
    """
    Route question and return matched field, winning similarity score,
    and all per-field scores for inspection and testing.

    Args:
        question: User query string.
        threshold: Minimum cosine similarity required to trigger a structured
                   match. Defaults to settings.router_similarity_threshold (0.75).

    Returns:
        tuple of:
          - matched_field (str or None if below threshold)
          - max_score (float, between -1.0 and 1.0)
          - field_scores (dict mapping each field to its max similarity score)
    """
    if not question or not question.strip():
        return None, 0.0, {}

    effective_threshold = (
        threshold
        if threshold is not None
        else settings.router_similarity_threshold
    )

    # Ensure reference embeddings are warmed
    cached_vectors = warm_router_cache()

    # Embed the incoming question
    embedder = get_embedder()
    question_vec = embedder.embed_one(question.strip())

    field_scores: dict[str, float] = {}
    best_field: Optional[str] = None
    best_score: float = -1.0

    for field_name, ref_vectors in cached_vectors.items():
        # Score is maximum similarity against any reference phrase for this field
        max_field_score = max(
            (_cosine_similarity(question_vec, ref_vec) for ref_vec in ref_vectors),
            default=0.0,
        )
        field_scores[field_name] = max_field_score

        if max_field_score > best_score:
            best_score = max_field_score
            best_field = field_name

    matched_field = best_field if best_score >= effective_threshold else None

    logger.debug(
        "Question: '%s' -> Best: '%s' (score=%.4f, threshold=%.2f) -> Route: %s",
        question,
        best_field,
        best_score,
        effective_threshold,
        matched_field or "semantic",
    )

    return matched_field, best_score, field_scores


def route_question(
    question: str,
    threshold: Optional[float] = None,
) -> Optional[str]:
    """
    Route an incoming question to a structured field or the semantic path.

    Deterministic, fast, embedding-based router with zero LLM generation calls.

    Args:
        question: The user's question string.
        threshold: Optional cosine similarity threshold override.
                   Defaults to settings.router_similarity_threshold (0.75).

    Returns:
        Name of structured field (e.g. 'room_rent_limit', 'sum_insured',
        'co_pay', 'deductible', 'waiting_periods', 'exclusions',
        'claim_conditions') if similarity >= threshold, else None.
    """
    matched_field, _, _ = route_question_with_score(question, threshold=threshold)
    return matched_field
