"""
Claim Readiness Checklist builder for InsureAI.

Design rationale
----------------
Constructs an authoritative, policy-grounded checklist of procedural requirements
grouped by admission lifecycle stage:
  1. before_admission  -> "Before admission"
  2. during_stay        -> "During hospital stay"
  3. after_discharge    -> "After discharge"
  4. unspecified        -> "Other requirements"

Every item is strictly derived from pre-extracted, upload-time-verified policy facts.
No LLM calls are made at question time, guaranteeing instant response and zero hallucination.
"""

from __future__ import annotations

import logging
from typing import Any, Optional

logger = logging.getLogger(__name__)

STAGE_ORDER = [
    "before_admission",
    "during_stay",
    "after_discharge",
    "unspecified",
]

STAGE_LABELS = {
    "before_admission": "Before admission",
    "during_stay": "During hospital stay",
    "after_discharge": "After discharge",
    "unspecified": "Other requirements",
}

# Standard, visually separated general guidance (explicitly distinguished from contract terms)
GENERAL_ADVICE = [
    "Carry a government-issued photo ID (Aadhaar / Voter ID / Passport) and your active health insurance card.",
    "Report to the hospital's Insurance / TPA helpdesk immediately upon arrival.",
    "Retain copies of all doctor prescriptions, diagnostic reports, and final itemised bills.",
]


def normalize_item_id(condition: str, stage: str = "unspecified") -> str:
    """
    Map variable contractual condition strings across different policies into
    stable, canonical checklist item IDs (e.g. 'preauth_form', 'final_bill').
    """
    import re
    c_lower = (condition or "").lower().strip()
    if any(k in c_lower for k in ("pre-auth", "preauth", "planned hospitalisation", "prior approval")):
        return "preauth_form"
    if any(k in c_lower for k in ("emergency", "24 hours", "notification is required within")):
        return "emergency_intimation"
    if any(k in c_lower for k in ("reimbursement", "claim form", "completed claim form")):
        return "reimbursement_claim_form"
    if any(k in c_lower for k in ("discharge summary", "discharge card")):
        return "discharge_summary"
    if any(k in c_lower for k in ("itemised bills", "itemized bills", "hospital bill", "final bill", "receipts", "cash receipt")):
        return "final_bill"
    if any(k in c_lower for k in ("diagnostic reports", "prescriptions", "lab reports", "investigation reports")):
        return "investigation_reports"
    if any(k in c_lower for k in ("id card", "identity proof", "aadhaar", "pan card")):
        return "identity_proof"

    # Deterministic fallback slug
    clean = re.sub(r"[^a-z0-9]+", "_", c_lower).strip("_")
    words = clean.split("_")[:4]
    slug = "_".join(w for w in words if w) if words else f"{stage}_requirement"
    return slug[:40] or "other_requirement"


def build_claim_checklist(
    structured_facts: Optional[dict[str, Any]],
    heads_up: Optional[str] = None,
) -> dict[str, Any]:
    """
    Build a deterministic Claim Readiness Checklist from extracted policy facts.

    Args:
        structured_facts: Pre-extracted facts dictionary from extract_structured_facts().
        heads_up: Optional scenario-aware coverage advisory string (e.g. waiting period / exclusion alert).

    Returns:
        Dict with:
          - checklist: list of stage groups, each with stage, label, and items
          - confidence: "High" | "Medium" | "Low"
          - confidence_reason: str explaining the confidence level
          - source: "structured"
          - answer: plain-language markdown text representing the checklist
          - pages: list of unique integer page numbers cited
          - citations: list of citation dicts
          - general_advice: list of non-policy general tips
          - heads_up: optional heads-up message
    """
    facts = structured_facts or {}
    raw_conditions = facts.get("claim_conditions") or []

    # Filter only items that have an explicit condition and page reference
    valid_conditions: list[dict[str, Any]] = []
    for item in raw_conditions:
        if not isinstance(item, dict):
            continue
        cond = str(item.get("condition", "")).strip()
        page = item.get("page")
        if not cond or page is None:
            # Strictly exclude items without explicit condition or page citation
            continue

        stage = str(item.get("stage", "unspecified")).lower().strip()
        if stage not in STAGE_ORDER:
            stage = "unspecified"

        deadline = item.get("deadline")
        if deadline is not None:
            deadline = str(deadline).strip()
            if deadline.lower() in ("null", "none", "n/a", ""):
                deadline = None

        verified = bool(item.get("verified", False))

        try:
            page_int = int(page)
        except (ValueError, TypeError):
            continue

        valid_conditions.append({
            "condition": cond,
            "stage": stage,
            "deadline": deadline,
            "page": page_int,
            "page_number": page_int,
            "verified": verified,
        })

    # Case A: No valid claim conditions found in the policy
    if not valid_conditions:
        msg = (
            "We couldn't find specific claim requirements or procedural conditions in this policy document. "
            "Please confirm claim deadlines and document requirements directly with your insurance provider."
        )
        if heads_up:
            msg = f"{heads_up}\n\n{msg}"

        return {
            "checklist": [],
            "confidence": "Low",
            "confidence_reason": "No policy-backed claim conditions were identified in the document.",
            "source": "structured",
            "answer": msg,
            "pages": [],
            "citations": [],
            "general_advice": GENERAL_ADVICE,
            "heads_up": heads_up,
        }

    # Case B: Group by stage in strict sequential order
    grouped_items: dict[str, list[dict[str, Any]]] = {stage: [] for stage in STAGE_ORDER}
    for item in valid_conditions:
        grouped_items[item["stage"]].append(item)

    checklist_groups = []
    all_pages: set[int] = set()
    all_verified = True

    for stage in STAGE_ORDER:
        items = grouped_items[stage]
        if not items:
            continue

        stage_items = []
        for it in items:
            all_pages.add(it["page"])
            if not it["verified"]:
                all_verified = False

            stage_items.append({
                "item_id": it.get("item_id") or normalize_item_id(it["condition"], stage),
                "condition": it["condition"],
                "deadline": it["deadline"],
                "page": it["page"],
                "page_number": it["page"],
                "verified": it["verified"],
            })

        checklist_groups.append({
            "stage": stage,
            "label": STAGE_LABELS[stage],
            "items": stage_items,
        })

    # Calibrated confidence scoring
    if all_verified:
        confidence = "High"
        conf_reason = "All claim requirements are verified and grounded directly in cited policy clauses."
    else:
        confidence = "Medium"
        conf_reason = "Claim requirements were extracted from policy clauses; some items require insurer confirmation."

    # Build human-readable plain-language Markdown answer
    answer_lines: list[str] = []

    if heads_up:
        answer_lines.append(heads_up)
        answer_lines.append("")

    answer_lines.append("Here are the steps your policy requires to file a claim successfully:")
    answer_lines.append("")

    for group in checklist_groups:
        answer_lines.append(f"### {group['label']}")
        for it in group["items"]:
            deadline_badge = f" *(Deadline: **{it['deadline']}**)*" if it["deadline"] else ""
            verif_badge = "" if it["verified"] else " ⚠️ *(confirm with insurer)*"
            answer_lines.append(
                f"- [ ] {it['condition']}{deadline_badge} [Page {it['page']}]{verif_badge}"
            )
        answer_lines.append("")

    # Visually distinct general advice block
    answer_lines.append("> ℹ️ **General advice — not from your policy:**")
    for tip in GENERAL_ADVICE:
        answer_lines.append(f"> - {tip}")

    full_answer_text = "\n".join(answer_lines).strip()

    # Build citation list
    citations = [
        {
            "page_number": it["page"],
            "excerpt": it["condition"],
            "section_heading": STAGE_LABELS[it["stage"]],
        }
        for it in valid_conditions
    ]

    return {
        "checklist": checklist_groups,
        "confidence": confidence,
        "confidence_reason": conf_reason,
        "source": "structured",
        "answer": full_answer_text,
        "pages": sorted(list(all_pages)),
        "citations": citations,
        "general_advice": GENERAL_ADVICE,
        "heads_up": heads_up,
    }
