"""
Deterministic Claim Checklist Builder.
Splits contractual policy conditions into:
1. Requirements (actions and deadlines) with parsed deadlines and due dates.
2. Document slots (uploadable files) mapped to controlled vocabulary IDs.
Adds standard suggested documents if the policy contains zero document items.
Idempotent and 100% deterministic with zero LLM calls.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple

from app.claims.checklist_classifier import (
    classify_condition,
    match_requirement_vocabulary,
    parse_deadline,
    split_document_list,
)
from app.claims.checklist_vocabulary import (
    DOCUMENT_TYPES,
    REQUIREMENT_TYPES,
    STANDARD_SUGGESTION_DOC_IDS,
)
from app.claims.models import ChecklistItem

logger = logging.getLogger("insureai.claims.builder")

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


def compute_due_date_for_deadline(
    deadline_info: Optional[Dict[str, Any]],
    admission_date: Optional[str] = None,
    discharge_date: Optional[str] = None,
) -> Tuple[Optional[str], Optional[str]]:
    """
    Compute due date string (YYYY-MM-DD) from deadline information and treatment dates.
    Returns: (computed_due_date: str | None, hint: str | None)
    """
    if not deadline_info or not isinstance(deadline_info, dict):
        return None, None

    anchor = deadline_info.get("anchor")
    val = deadline_info.get("value")
    unit = deadline_info.get("unit")
    direction = deadline_info.get("direction", "after")

    if not val or not unit:
        return None, None

    dt_format = "%Y-%m-%d"
    adm_dt: Optional[datetime] = None
    dis_dt: Optional[datetime] = None

    if admission_date:
        try:
            adm_dt = datetime.strptime(admission_date.strip(), dt_format)
        except ValueError:
            pass

    if discharge_date:
        try:
            dis_dt = datetime.strptime(discharge_date.strip(), dt_format)
        except ValueError:
            pass

    delta = timedelta(hours=val) if unit == "hours" else timedelta(days=val)

    if anchor == "before_admission":
        if not adm_dt:
            return None, "Set after you enter admission date"
        due_dt = adm_dt - delta
        return due_dt.strftime(dt_format), None

    if anchor == "after_admission":
        if not adm_dt:
            return None, "Set after you enter admission date"
        due_dt = adm_dt + delta
        return due_dt.strftime(dt_format), None

    if anchor == "after_discharge":
        if not dis_dt:
            if adm_dt:
                return None, "Set after you enter discharge date"
            return None, "Set after you enter admission/discharge dates"
        due_dt = dis_dt + delta
        return due_dt.strftime(dt_format), None

    return None, None


def build_claim_workflow_checklist(
    structured_facts: Optional[Dict[str, Any]],
    admission_date: Optional[str] = None,
    discharge_date: Optional[str] = None,
) -> List[ChecklistItem]:
    """
    Build a deterministic, split checklist (requirements and documents)
    for a claim from extracted policy facts.
    """
    facts = structured_facts or {}
    raw_conditions = facts.get("claim_conditions") or []

    # Filter valid raw conditions
    valid_conditions: List[Dict[str, Any]] = []
    for item in raw_conditions:
        if not isinstance(item, dict):
            continue
        cond = str(item.get("condition", "")).strip()
        page = item.get("page")
        if not cond or page is None:
            continue
        try:
            p_int = int(page)
        except (ValueError, TypeError):
            continue

        stage = str(item.get("stage", "unspecified")).lower().strip()
        if stage not in STAGE_ORDER:
            stage = "unspecified"

        valid_conditions.append({
            "condition": cond,
            "stage": stage,
            "page": p_int,
            "deadline": item.get("deadline"),
            "verified": bool(item.get("verified", False)),
        })

    requirements_list: List[ChecklistItem] = []
    documents_list: List[ChecklistItem] = []

    seen_req_ids: set[str] = set()
    seen_doc_ids: set[str] = set()

    for cond_dict in valid_conditions:
        text = cond_dict["condition"]
        page = cond_dict["page"]
        stage = cond_dict["stage"]
        explicit_dl_str = cond_dict["deadline"]

        parsed_dl = parse_deadline(text)
        classification = classify_condition(text, stage)

        # ── Handle Requirements ───────────────────────────────────────────────
        if classification in ("requirement", "mixed", "unknown"):
            matched_req_id = match_requirement_vocabulary(text)

            if matched_req_id:
                req_meta = REQUIREMENT_TYPES.get(matched_req_id, {})
                item_id = matched_req_id
                anchor = req_meta.get("anchor", stage)
                req_stage = anchor if anchor in STAGE_ORDER else stage

                # Fill label template with parsed deadline
                dl_formatted = parsed_dl.get("formatted") if parsed_dl else (explicit_dl_str or "")
                if dl_formatted:
                    label = req_meta["label_template"].format(deadline=dl_formatted).strip()
                    needs_conf = False
                else:
                    label = text.strip()
                    needs_conf = True
            else:
                if parsed_dl or classification in ("requirement", "unknown"):
                    item_id = f"req_{stage}"
                    label = text.strip()
                    req_stage = stage
                    needs_conf = True
                else:
                    item_id = None
                    label = None
                    needs_conf = False

            if item_id and item_id not in seen_req_ids:
                seen_req_ids.add(item_id)
                due_date, hint = compute_due_date_for_deadline(
                    parsed_dl, admission_date, discharge_date
                )
                dl_payload = parsed_dl.copy() if parsed_dl else {}
                if explicit_dl_str:
                    dl_payload["explicit_raw"] = str(explicit_dl_str)
                if due_date:
                    dl_payload["computed_due_date"] = due_date

                requirements_list.append(ChecklistItem(
                    item_id=item_id,
                    kind="requirement",
                    label=label,
                    description=None,
                    stage=req_stage,
                    page_cite=page,
                    original_text=text,
                    source="policy",
                    status="pending",
                    needs_confirmation=needs_conf,
                    deadline=dl_payload if dl_payload else None,
                    document_id=None,
                    due_date_hint=hint,
                ))

        # ── Handle Document Lists ─────────────────────────────────────────────
        if classification in ("document_list", "mixed"):
            doc_items = split_document_list(text)
            for d in doc_items:
                doc_id = d["matched_id"]
                if doc_id in seen_doc_ids:
                    continue
                seen_doc_ids.add(doc_id)

                # Default document stage
                doc_stage = stage if stage != "unspecified" else "after_discharge"

                documents_list.append(ChecklistItem(
                    item_id=doc_id,
                    kind="document",
                    label=d["label"],
                    description=d.get("description"),
                    stage=doc_stage,
                    page_cite=page,
                    original_text=text,
                    source="policy",
                    status="required",
                    needs_confirmation=d["needs_confirmation"],
                    deadline=None,
                    document_id=None,
                ))

    # Fallback: if zero document items found in the policy
    if not documents_list:
        for s_id in STANDARD_SUGGESTION_DOC_IDS:
            s_meta = DOCUMENT_TYPES.get(s_id, {})
            stage = "before_admission" if s_id == "id_proof" else "after_discharge"
            documents_list.append(ChecklistItem(
                item_id=s_id,
                kind="document",
                label=f"{s_meta.get('label', s_id)} (Commonly required - not found in your policy, confirm with your insurer)",
                description=s_meta.get("description"),
                stage=stage,
                page_cite=None,
                original_text="Standard commonly required claim document suggestion.",
                source="standard_suggestion",
                status="required",
                needs_confirmation=False,
                deadline=None,
                document_id=None,
            ))

    # Combine in stage order: first requirements, then documents within each stage
    full_checklist: List[ChecklistItem] = []
    for stage_key in STAGE_ORDER:
        reqs_in_stage = [r for r in requirements_list if r.stage == stage_key]
        docs_in_stage = [d for d in documents_list if d.stage == stage_key]
        full_checklist.extend(reqs_in_stage)
        full_checklist.extend(docs_in_stage)

    return full_checklist
