"""
Fact mapping adapter between app.rag structured facts and MongoDB facts collection.

Exposes two explicit functions:
  - rag_facts_to_mongo_facts(rag_facts: dict[str, Any]) -> list[dict[str, Any]]
  - mongo_facts_to_rag_facts(mongo_facts: list[dict[str, Any]]) -> dict[str, Any]
"""

from __future__ import annotations

import re
import uuid
from typing import Any, Optional


def _parse_numeric_and_unit(val_str: Optional[str]) -> tuple[Optional[float], Optional[str]]:
    """
    Parse a numeric value and unit from an extracted string only when evidence supports it.
    Returns (numeric_value, unit). If not reliably determinable, returns (None, None).
    Preserves explicit zeros (e.g. '0%', '0 co-pay').
    """
    if not val_str or not isinstance(val_str, str):
        return None, None

    text = val_str.strip()

    # Explicit percentage check, e.g. '10%', '0%', '0% co-pay'
    pct_match = re.search(r'\b(\d+(?:\.\d+)?)\s*%', text)
    if pct_match:
        try:
            return float(pct_match.group(1)), "%"
        except (ValueError, TypeError):
            pass

    # Rupee currency match: e.g. 'Rs. 10,00,000', 'INR 15,00,000', '₹ 5,00,000'
    curr_match = re.search(r'(?:rs\.?|inr|₹)\s*([\d,]+(?:\.\d+)?)', text, re.IGNORECASE)
    if curr_match:
        try:
            clean_num = curr_match.group(1).replace(",", "")
            return float(clean_num), "INR"
        except (ValueError, TypeError):
            pass

    # Standalone plain currency without symbol if in sum_insured/deductible like '10,00,000'
    pure_num_match = re.fullmatch(r'([\d,]+(?:\.\d+)?)', text)
    if pure_num_match:
        try:
            clean_num = pure_num_match.group(1).replace(",", "")
            return float(clean_num), None
        except (ValueError, TypeError):
            pass

    # Time durations: e.g. '36 months', '30 days', '2 years'
    time_match = re.search(r'\b(\d+)\s*(months?|days?|years?)\b', text, re.IGNORECASE)
    if time_match:
        try:
            num = float(time_match.group(1))
            unit = time_match.group(2).lower()
            return num, unit
        except (ValueError, TypeError):
            pass

    return None, None


def rag_facts_to_mongo_facts(rag_facts: Optional[dict[str, Any]]) -> list[dict[str, Any]]:
    """
    Convert app.rag structured facts dictionary into MongoDB facts schema.

    Schema per Mongo fact item:
      {
        "fact_id": str (uuid),
        "category": str,
        "fact_key": str,
        "fact_value": str,
        "fact_value_numeric": float | None,
        "unit": str | None,
        "source_page": int | None,
        "source_section": str | None,
        "extraction_confidence": "high" | "medium" | "low",
        "metadata": dict | None  (optional extra fields to preserve lossless structure)
      }
    """
    if not rag_facts or not isinstance(rag_facts, dict):
        return []

    mongo_facts: list[dict[str, Any]] = []

    # 1. Scalar fields: metadata, sum_insured, room_rent_limit, co_pay, deductible, premium
    scalar_mappings = [
        ("insurer_name", "policy_metadata", "insurer_name"),
        ("policy_type", "policy_metadata", "policy_type"),
        ("policy_number", "policy_metadata", "policy_number"),
        ("premium_amount", "premium", "premium_amount"),
        ("sum_insured", "sum_insured", "sum_insured"),
        ("room_rent_limit", "room_rent_limit", "room_rent_limit"),
        ("co_pay", "co_payment", "co_payment"),
        ("deductible", "deductible", "deductible"),
    ]

    for rag_key, category, fact_key in scalar_mappings:
        item = rag_facts.get(rag_key)
        if isinstance(item, dict) and item.get("value") is not None:
            val_str = str(item.get("value")).strip()
            if val_str:
                page = item.get("page")
                numeric_val, unit = _parse_numeric_and_unit(val_str)
                mongo_facts.append({
                    "fact_id": str(uuid.uuid4()),
                    "category": category,
                    "fact_key": fact_key,
                    "fact_value": val_str,
                    "fact_value_numeric": numeric_val,
                    "unit": unit,
                    "source_page": int(page) if page is not None else None,
                    "source_section": None,
                    "extraction_confidence": "high",
                    "metadata": None,
                })

    # 2. Waiting periods (list of dicts with condition, period, page)
    waiting_periods = rag_facts.get("waiting_periods")
    if isinstance(waiting_periods, list):
        for idx, wp in enumerate(waiting_periods):
            if isinstance(wp, dict) and (wp.get("condition") or wp.get("period")):
                cond = str(wp.get("condition", "")).strip()
                period = str(wp.get("period", "")).strip()
                fact_val = f"{cond}: {period}" if cond and period else (cond or period)
                page = wp.get("page")
                numeric_val, unit = _parse_numeric_and_unit(period)
                mongo_facts.append({
                    "fact_id": str(uuid.uuid4()),
                    "category": "waiting_period",
                    "fact_key": f"waiting_period_{idx + 1}",
                    "fact_value": fact_val,
                    "fact_value_numeric": numeric_val,
                    "unit": unit,
                    "source_page": int(page) if page is not None else None,
                    "source_section": None,
                    "extraction_confidence": "high",
                    "metadata": {
                        "condition": cond,
                        "period": period,
                    },
                })

    # 3. Exclusions (list of dicts with item, page)
    exclusions = rag_facts.get("exclusions")
    if isinstance(exclusions, list):
        for idx, ex in enumerate(exclusions):
            if isinstance(ex, dict) and ex.get("item"):
                item_text = str(ex.get("item")).strip()
                page = ex.get("page")
                mongo_facts.append({
                    "fact_id": str(uuid.uuid4()),
                    "category": "exclusion",
                    "fact_key": f"exclusion_{idx + 1}",
                    "fact_value": item_text,
                    "fact_value_numeric": None,
                    "unit": None,
                    "source_page": int(page) if page is not None else None,
                    "source_section": None,
                    "extraction_confidence": "high",
                    "metadata": {
                        "item": item_text,
                    },
                })

    # 4. Claim conditions (list of dicts with condition, page)
    claim_conditions = rag_facts.get("claim_conditions")
    if isinstance(claim_conditions, list):
        for idx, cc in enumerate(claim_conditions):
            if isinstance(cc, dict) and cc.get("condition"):
                cond_text = str(cc.get("condition")).strip()
                page = cc.get("page")
                mongo_facts.append({
                    "fact_id": str(uuid.uuid4()),
                    "category": "claim_condition",
                    "fact_key": f"claim_condition_{idx + 1}",
                    "fact_value": cond_text,
                    "fact_value_numeric": None,
                    "unit": None,
                    "source_page": int(page) if page is not None else None,
                    "source_section": None,
                    "extraction_confidence": "high",
                    "metadata": {
                        "condition": cond_text,
                    },
                })

    return mongo_facts


def mongo_facts_to_rag_facts(mongo_facts: Optional[list[dict[str, Any]]]) -> dict[str, Any]:
    """
    Convert MongoDB facts list back into the structured_facts dictionary expected by app.rag.qa.

    Expected structure:
      {
        "sum_insured": {"value": str, "page": int} | None,
        "room_rent_limit": {"value": str, "page": int} | None,
        "co_pay": {"value": str, "page": int} | None,
        "deductible": {"value": str, "page": int} | None,
        "waiting_periods": [{"condition": str, "period": str, "page": int}, ...],
        "exclusions": [{"item": str, "page": int}, ...],
        "claim_conditions": [{"condition": str, "page": int}, ...]
      }
    """
    rag_facts: dict[str, Any] = {
        "sum_insured": None,
        "room_rent_limit": None,
        "co_pay": None,
        "deductible": None,
        "waiting_periods": [],
        "exclusions": [],
        "claim_conditions": [],
    }

    if not mongo_facts or not isinstance(mongo_facts, list):
        return rag_facts

    for fact in mongo_facts:
        if not isinstance(fact, dict):
            continue

        cat = (fact.get("category") or "").lower()
        key = (fact.get("fact_key") or "").lower()
        val = fact.get("fact_value")
        page = fact.get("source_page")
        meta = fact.get("metadata") or {}

        if cat == "sum_insured" or "sum_insured" in key:
            if rag_facts["sum_insured"] is None and val is not None:
                rag_facts["sum_insured"] = {
                    "value": str(val),
                    "page": int(page) if page is not None else 1,
                }

        elif cat == "room_rent_limit" or "room_rent" in key:
            if rag_facts["room_rent_limit"] is None and val is not None:
                rag_facts["room_rent_limit"] = {
                    "value": str(val),
                    "page": int(page) if page is not None else 1,
                }

        elif cat in ("co_payment", "co_pay", "copay") or "copay" in key or "co_payment" in key:
            if rag_facts["co_pay"] is None and val is not None:
                rag_facts["co_pay"] = {
                    "value": str(val),
                    "page": int(page) if page is not None else 1,
                }

        elif cat == "deductible" or "deductible" in key:
            if rag_facts["deductible"] is None and val is not None:
                rag_facts["deductible"] = {
                    "value": str(val),
                    "page": int(page) if page is not None else 1,
                }

        elif cat == "waiting_period" or "waiting_period" in key:
            cond = meta.get("condition")
            period = meta.get("period")
            if not cond or not period:
                # Parse from fact_value (format "Condition: Period")
                if val and ":" in str(val):
                    parts = str(val).split(":", 1)
                    cond = parts[0].strip()
                    period = parts[1].strip()
                else:
                    cond = str(val) if val else "Waiting period"
                    period = str(val) if val else ""
            rag_facts["waiting_periods"].append({
                "condition": cond,
                "period": period,
                "page": int(page) if page is not None else 1,
            })

        elif cat == "exclusion" or "exclusion" in key:
            item_text = meta.get("item") or val
            if item_text:
                rag_facts["exclusions"].append({
                    "item": str(item_text),
                    "page": int(page) if page is not None else 1,
                })

        elif cat == "claim_condition" or "claim" in key or "condition" in key:
            cond_text = meta.get("condition") or val
            if cond_text:
                rag_facts["claim_conditions"].append({
                    "condition": str(cond_text),
                    "page": int(page) if page is not None else 1,
                })

    return rag_facts
