"""
Confidence labeling module for insurance policy Q&A answers.

Design rationale
----------------
Health insurance users need transparent, calibrated confidence labels so they
know when an answer is an indisputable contract rule versus an interpretation
of general clauses.

Confidence Tiers:
  - "High":
      * Structured-path direct hit (zero hallucination, verbatim facts).
      * Semantic answer that passed verification with a strong source match
        ("fully_supported" and good vector similarity).
  - "Medium":
      * Semantic answer passed verification, but match was partial or
        interpretive ("partially_supported").
  - "Low":
      * Verification failed ("unsupported").
      * No relevant chunks found in the policy.
      * Contradictions detected between draft answer and text.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Literal, Optional

logger = logging.getLogger(__name__)

ConfidenceLevel = Literal["High", "Medium", "Low"]


@dataclass
class ConfidenceAssessment:
    """
    Confidence assessment metadata attached to every answer.

    Attributes:
        level: "High" | "Medium" | "Low"
        reason: Human-readable rationale for the assigned confidence.
        is_reliable: True if High or Medium; False if Low.
    """
    level: ConfidenceLevel
    reason: str
    is_reliable: bool


def assign_confidence(
    source_path: Literal["structured", "semantic"],
    verification_result: Optional[dict] = None,
    retrieval_similarity: float = 0.0,
    has_source_chunks: bool = True,
) -> ConfidenceAssessment:
    """
    Assign a confidence tier to a generated or extracted answer.

    Args:
        source_path: "structured" if answered from facts JSON, "semantic" if from RAG retrieval.
        verification_result: Dict output from verify_answer() (semantic path only).
        retrieval_similarity: Cosine similarity of the top retrieved chunk.
        has_source_chunks: Whether any source chunks were found.

    Returns:
        ConfidenceAssessment object.
    """
    # ── Path 1: Structured Direct Hit ─────────────────────────────────────────
    if source_path == "structured":
        return ConfidenceAssessment(
            level="High",
            reason="Grounded directly in extracted policy contract facts with zero generation risk.",
            is_reliable=True,
        )

    # ── Path 2: Semantic Path ─────────────────────────────────────────────────
    if not has_source_chunks:
        return ConfidenceAssessment(
            level="Low",
            reason="No relevant policy clauses were found in the uploaded document.",
            is_reliable=False,
        )

    if not verification_result:
        return ConfidenceAssessment(
            level="Low",
            reason="Answer did not complete the self-verification check.",
            is_reliable=False,
        )

    status = verification_result.get("verification_status", "unsupported")
    supported = verification_result.get("supported", False)

    if supported and status == "fully_supported":
        if retrieval_similarity >= 0.60:
            return ConfidenceAssessment(
                level="High",
                reason="Answer passed independent verification with a strong direct source match.",
                is_reliable=True,
            )
        else:
            return ConfidenceAssessment(
                level="Medium",
                reason="Answer passed verification, but retrieval similarity to source was moderate.",
                is_reliable=True,
            )

    elif supported and status == "partially_supported":
        return ConfidenceAssessment(
            level="Medium",
            reason="Answer is partially supported by the text, but involves interpretive inference.",
            is_reliable=True,
        )

    else:
        # Verification failed
        reasoning = verification_result.get("reasoning", "Claims not supported by cited source passage.")
        return ConfidenceAssessment(
            level="Low",
            reason=f"Verification failed: {reasoning}",
            is_reliable=False,
        )
