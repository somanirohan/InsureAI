"""
Reranker for candidate policy clauses.

Supports:
  - 'cross_encoder': neural sentence-transformers / flashrank cross-encoder if installed.
  - 'lexical_boost': token-overlap and title-match boosting over vector similarity scores.
  - 'none': returns retriever candidates unchanged.

Configured via RERANKER environment variable (default: lexical_boost).
"""

from __future__ import annotations

import logging
import os
import re
from typing import List

from app.claims.semantic.retriever import CandidateClause

logger = logging.getLogger("insureai.claims.semantic.reranker")


def _lexical_boost_score(query: str, candidate: CandidateClause) -> float:
    """Calculate boosted score combining vector score and exact keyword overlaps."""
    q_tokens = set(re.findall(r"\b[a-zA-Z0-9_-]+\b", query.lower()))
    if not q_tokens:
        return candidate.score

    clause_tokens = set(re.findall(r"\b[a-zA-Z0-9_-]+\b", candidate.text.lower()))
    title_tokens = set(re.findall(r"\b[a-zA-Z0-9_-]+\b", candidate.title.lower()))

    text_overlap = len(q_tokens.intersection(clause_tokens)) / max(len(q_tokens), 1)
    title_overlap = len(q_tokens.intersection(title_tokens)) / max(len(q_tokens), 1)

    # 60% semantic score + 25% text overlap + 15% title overlap
    boosted = 0.60 * candidate.score + 0.25 * text_overlap + 0.15 * title_overlap
    return round(boosted, 4)


def rerank_candidates(query: str, candidates: List[CandidateClause]) -> List[CandidateClause]:
    """
    Rerank candidate clauses based on the RERANKER setting.
    Gracefully falls back to lexical boost if cross-encoder libraries are not installed.
    """
    if not candidates:
        return []

    reranker_mode = os.getenv("RERANKER", "lexical_boost").lower().strip()

    if reranker_mode == "none":
        return sorted(candidates, key=lambda c: c.score, reverse=True)

    if reranker_mode == "cross_encoder":
        try:
            from sentence_transformers import CrossEncoder  # type: ignore
            # Local cross-encoder if available
            ce_model = CrossEncoder("cross-encoder/ms-marco-MiniLM-L-6-v2")
            pairs = [[query, c.text] for c in candidates]
            ce_scores = ce_model.predict(pairs)
            for c, sc in zip(candidates, ce_scores):
                c.score = float(sc)
            return sorted(candidates, key=lambda c: c.score, reverse=True)
        except Exception as exc:
            logger.info("Cross-encoder reranker unavailable (%s), falling back to lexical_boost", exc)

    # Default: lexical_boost
    for c in candidates:
        c.score = _lexical_boost_score(query, c)

    return sorted(candidates, key=lambda c: c.score, reverse=True)
