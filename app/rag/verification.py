"""
Self-verification module for semantic answer grounding.

Design rationale
----------------
To protect users and adjudicators from LLM hallucinations in health insurance
answers, every generated answer on the semantic path must pass a dedicated,
narrow verification check before it is presented to the user.

A separate LLM call evaluates:
  1. Does the cited source passage EXPLICITLY support the claims made in the draft answer?
  2. Is there any contradiction or ungrounded extrapolation?
  3. Support status:
     - "fully_supported": Every key claim in the answer is backed by text evidence.
     - "partially_supported": The answer is mostly supported, but involves minor interpretation or inference.
     - "unsupported": The passage does not prove the claim, or directly contradicts it.

This isolates hallucinated answers and informs the confidence scoring module.
"""

from __future__ import annotations

import json
import logging
import re
from typing import Any

from app.llm.factory import get_llm

logger = logging.getLogger(__name__)


# ── JSON parsing helper ───────────────────────────────────────────────────────

def _strip_json_fences(raw: str) -> str:
    raw = re.sub(r"^```(?:json)?\s*", "", raw.strip(), flags=re.IGNORECASE)
    raw = re.sub(r"\s*```$", "", raw.strip())
    start = raw.find("{")
    end = raw.rfind("}")
    if start != -1 and end != -1 and end > start:
        raw = raw[start : end + 1]
    return raw.strip()


def _parse_verification_response(raw: str) -> dict[str, Any]:
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass
    cleaned = _strip_json_fences(raw)
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError as exc:
        logger.warning("Failed to parse verification response as JSON: %s (raw: %s)", exc, raw[:200])
        # Defensive fallback: if parsing fails, fail safe (mark unsupported)
        return {
            "supported": False,
            "verification_status": "unsupported",
            "reasoning": "Verification response format could not be verified.",
        }


# ── Verification prompt ───────────────────────────────────────────────────────

_VERIFICATION_SYSTEM_PROMPT = """\
You are an uncompromising, strict legal auditor for health insurance claims.

Your task is to verify whether a DRAFT ANSWER is faithfully supported by the provided SOURCE PASSAGE.

RULES:
1. Compare every factual claim in the DRAFT ANSWER directly against the SOURCE PASSAGE.
2. If the passage does not explicitly mention or confirm the claim, mark it as unsupported.
3. Be especially vigilant against:
   - Numerical errors (wrong percentage, wrong amount, wrong days).
   - Inverted coverage (stating something is covered when it is excluded, or vice versa).
   - Hallucinated terms not found in the passage.
4. Output ONLY a valid JSON object matching the schema below. No markdown fences, no conversational preamble.

OUTPUT SCHEMA:
{
  "supported": true | false,
  "verification_status": "fully_supported" | "partially_supported" | "unsupported",
  "reasoning": "<short 1-2 sentence explanation of why the claim is supported, partial, or unsupported>",
  "evidence_quote": "<verbatim excerpt from passage supporting the claim, or empty string if unsupported>"
}
"""


# ── Public API ────────────────────────────────────────────────────────────────

def verify_answer(claim: str, passage: str) -> dict[str, Any]:
    """
    Verify whether a draft answer / claim is grounded in the cited source passage.

    Args:
        claim: The generated draft answer or specific claim to check.
        passage: The text of the retrieved chunk(s) cited as source evidence.

    Returns:
        Dict with:
          - supported (bool)
          - verification_status ('fully_supported' | 'partially_supported' | 'unsupported')
          - reasoning (str)
          - evidence_quote (str)
    """
    if not claim or not claim.strip():
        return {
            "supported": False,
            "verification_status": "unsupported",
            "reasoning": "Empty claim provided.",
            "evidence_quote": "",
        }

    if not passage or not passage.strip():
        return {
            "supported": False,
            "verification_status": "unsupported",
            "reasoning": "No source passage provided to verify against.",
            "evidence_quote": "",
        }

    user_message = (
        f"SOURCE PASSAGE:\n\"\"\"\n{passage.strip()}\n\"\"\"\n\n"
        f"DRAFT ANSWER TO VERIFY:\n\"\"\"\n{claim.strip()}\n\"\"\"\n\n"
        "Verify if the draft answer is faithfully grounded in the source passage."
    )

    llm = get_llm()
    messages = [
        {"role": "system", "content": _VERIFICATION_SYSTEM_PROMPT},
        {"role": "user", "content": user_message},
    ]

    raw_response = llm.chat(messages, temperature=0.0, format="json", max_tokens=512)
    result = _parse_verification_response(raw_response)

    # Normalize fields
    supported = bool(result.get("supported", False))
    status = result.get("verification_status", "unsupported")
    if status not in ("fully_supported", "partially_supported", "unsupported"):
        status = "fully_supported" if supported else "unsupported"

    return {
        "supported": supported,
        "verification_status": status,
        "reasoning": str(result.get("reasoning", "")),
        "evidence_quote": str(result.get("evidence_quote", "")),
    }
