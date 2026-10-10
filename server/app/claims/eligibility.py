"""
Deterministic Eligibility Evaluation Engine.
Evaluates treatment details against extracted policy facts and IRDAI statutory baselines.
Never uses LLMs for eligibility verdicts. All checks cite policy pages or IRDAI references.
"""

from __future__ import annotations

import re
from datetime import date, datetime
from typing import Any, Dict, List, Optional, Tuple

from app.claims.irdai import (
    get_free_look_period_min_days,
    get_moratorium_period_months,
    get_ped_waiting_period_max_months,
    load_irdai_reference,
)
from app.claims.models import (
    EligibilityCheck,
    EligibilityFlag,
    EligibilityResult,
    TreatmentDetails,
)


def _parse_date(date_str: Optional[str]) -> Optional[date]:
    """Parse ISO date or standard YYYY-MM-DD string."""
    if not date_str or not isinstance(date_str, str):
        return None
    cleaned = date_str.strip().split("T")[0]
    for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%Y/%m/%d"):
        try:
            return datetime.strptime(cleaned, fmt).date()
        except ValueError:
            continue
    return None


def _calculate_months_between(start_d: date, end_d: date) -> float:
    """Calculate approximate calendar months between two dates."""
    days = (end_d - start_d).days
    if days < 0:
        return 0.0
    return days / 30.4375


def _extract_numeric_sum_insured(val: Any) -> Optional[float]:
    """Parse numeric sum insured from dict, string, or number."""
    if val is None:
        return None
    if isinstance(val, (int, float)):
        return float(val)
    if isinstance(val, dict):
        raw = val.get("value")
    else:
        raw = str(val)

    if not raw or not isinstance(raw, str):
        return None

    # Check for Lakhs / Crores
    mult_match = re.search(r'([\d,]+(?:\.\d+)?)\s*(lakhs?|lacs?|crores?|cr|thousand|k)\b', raw, re.IGNORECASE)
    if mult_match:
        try:
            base_num = float(mult_match.group(1).replace(",", ""))
            unit = mult_match.group(2).lower()
            if unit in ("lakh", "lakhs", "lac", "lacs"):
                return base_num * 100_000.0
            if unit in ("crore", "crores", "cr"):
                return base_num * 10_000_000.0
            if unit in ("thousand", "k"):
                return base_num * 1_000.0
        except (ValueError, TypeError):
            pass

    # Generic numbers with commas
    num_match = re.search(r'[\d,]+(?:\.\d+)?', raw)
    if num_match:
        try:
            return float(num_match.group(0).replace(",", ""))
        except (ValueError, TypeError):
            pass
    return None


def _extract_period_months(period_str: Optional[str]) -> Optional[int]:
    """Extract month count from waiting period string like '24 months', '2 years', '30 days'."""
    if not period_str or not isinstance(period_str, str):
        return None
    text = period_str.lower().strip()

    # Years
    yr_match = re.search(r'(\d+)\s*(?:year|yr)s?', text)
    if yr_match:
        return int(yr_match.group(1)) * 12

    # Months
    mo_match = re.search(r'(\d+)\s*(?:month|mo)s?', text)
    if mo_match:
        return int(mo_match.group(1))

    # Days
    day_match = re.search(r'(\d+)\s*days?', text)
    if day_match:
        days = int(day_match.group(1))
        return max(1, round(days / 30))

    return None


def _tokenize_text(text: str) -> set[str]:
    """Tokenize and filter stop words for conservative fuzzy matching."""
    stop_words = {
        "and", "or", "the", "a", "an", "of", "for", "in", "to", "with",
        "treatment", "surgery", "procedure", "condition", "disease", "ailment",
    }
    words = re.findall(r'[a-zA-Z]{3,}', text.lower())
    return {w for w in words if w not in stop_words}


def evaluate_eligibility(
    policy_facts: Dict[str, Any],
    treatment: TreatmentDetails,
    policy_start_date: Optional[str] = None,
    today: Optional[str] = None,
    irdai_reference: Optional[Dict[str, Any]] = None,
) -> EligibilityResult:
    """
    Pure deterministic evaluation of claim eligibility against policy facts and IRDAI reference.
    
    5 Deterministic Checks:
      1. Exclusions check: Treatment against policy permanent & general exclusions.
      2. Specific waiting period check: Policy age vs named ailments waiting periods.
      3. PED waiting period check: Policy age vs PED waiting period & IRDAI statutory cap.
      4. Cost vs sum insured & room-rent sub-limit check.
      5. Policy vs IRDAI baseline compliance check.
    """
    checks: List[EligibilityCheck] = []
    flags: List[EligibilityFlag] = []

    # Parse dates
    today_date = _parse_date(today) or date.today()
    start_date = _parse_date(policy_start_date)
    policy_age_months = _calculate_months_between(start_date, today_date) if start_date else None

    irdai_data = irdai_reference or load_irdai_reference()
    ped_max_cap = get_ped_waiting_period_max_months()
    ped_ref_meta = irdai_data.get("ped_waiting_period_max_months", {})

    treatment_name = treatment.name.strip()
    treatment_tokens = _tokenize_text(treatment_name)

    # ──────────────────────────────────────────────────────────────────────────
    # Check 1: Exclusions Check
    # ──────────────────────────────────────────────────────────────────────────
    exclusions = policy_facts.get("exclusions") or []
    matched_exclusion: Optional[Dict[str, Any]] = None
    partial_exclusion_matches: List[Tuple[Dict[str, Any], float]] = []

    for exc in exclusions:
        if not isinstance(exc, dict):
            continue
        item_text = str(exc.get("item", "")).strip()
        if not item_text:
            continue

        item_tokens = _tokenize_text(item_text)

        # Direct containment check
        if treatment_name.lower() in item_text.lower() or item_text.lower() in treatment_name.lower():
            matched_exclusion = exc
            break

        # Token overlap check
        if treatment_tokens and item_tokens:
            overlap = treatment_tokens.intersection(item_tokens)
            overlap_ratio = len(overlap) / len(treatment_tokens)
            if overlap_ratio >= 0.5:
                matched_exclusion = exc
                break
            elif overlap_ratio >= 0.25:
                partial_exclusion_matches.append((exc, overlap_ratio))

    if matched_exclusion:
        exc_text = matched_exclusion.get("item", "")
        page = matched_exclusion.get("page", 1)
        checks.append(EligibilityCheck(
            check="exclusions_check",
            result="fail",
            detail=f"Treatment '{treatment_name}' matches permanent policy exclusion: '{exc_text}'.",
            source=f"Policy Clause on Page {page}",
        ))
        flags.append(EligibilityFlag(
            flag_id="exclusion_conflict",
            label="Excluded Procedure",
            severity="blocking",
            detail=f"The treatment '{treatment_name}' matches policy exclusion '{exc_text}'. Insurer is likely to deny coverage.",
            citation=f"Page {page}",
        ))
    elif partial_exclusion_matches:
        top_match, _ = max(partial_exclusion_matches, key=lambda x: x[1])
        exc_text = top_match.get("item", "")
        page = top_match.get("page", 1)
        checks.append(EligibilityCheck(
            check="exclusions_check",
            result="flag",
            detail=f"Treatment '{treatment_name}' has keywords matching policy exclusion '{exc_text}'. Requires medical confirmation.",
            source=f"Policy Clause on Page {page}",
        ))
        flags.append(EligibilityFlag(
            flag_id="potential_exclusion",
            label="Potential Exclusion Ambiguity",
            severity="worth-confirming",
            detail=f"Verify with doctor that '{treatment_name}' does not fall under exclusion '{exc_text}'.",
            citation=f"Page {page}",
        ))
    elif not exclusions:
        checks.append(EligibilityCheck(
            check="exclusions_check",
            result="unable_to_determine",
            detail="No exclusion clauses found in extracted policy facts.",
            source="Policy Document",
        ))
    else:
        checks.append(EligibilityCheck(
            check="exclusions_check",
            result="pass",
            detail=f"Treatment '{treatment_name}' does not match any of the {len(exclusions)} listed policy exclusions.",
            source="Policy Exclusions Section",
        ))

    # ──────────────────────────────────────────────────────────────────────────
    # Check 2: Specific Waiting Period Check
    # ──────────────────────────────────────────────────────────────────────────
    waiting_periods = policy_facts.get("waiting_periods") or []
    matched_wp: Optional[Dict[str, Any]] = None
    specific_wp_req_months: Optional[int] = None

    for wp in waiting_periods:
        if not isinstance(wp, dict):
            continue
        cond_text = str(wp.get("condition", "")).strip()
        if not cond_text or "pre-existing" in cond_text.lower() or "ped" in cond_text.lower():
            continue

        wp_tokens = _tokenize_text(cond_text)
        if (
            treatment_name.lower() in cond_text.lower()
            or cond_text.lower() in treatment_name.lower()
            or (treatment_tokens and wp_tokens and len(treatment_tokens.intersection(wp_tokens)) >= 1)
        ):
            matched_wp = wp
            specific_wp_req_months = _extract_period_months(wp.get("period"))
            break

    if matched_wp and specific_wp_req_months is not None:
        wp_cond = matched_wp.get("condition")
        page = matched_wp.get("page", 1)
        if policy_age_months is None:
            checks.append(EligibilityCheck(
                check="specific_waiting_period_check",
                result="unable_to_determine",
                detail=f"Treatment matches specific waiting period '{wp_cond}' ({specific_wp_req_months} months), but policy inception date is missing.",
                source=f"Page {page}",
            ))
            flags.append(EligibilityFlag(
                flag_id="missing_policy_age",
                label="Policy Inception Date Required",
                severity="worth-confirming",
                detail=f"Provide policy inception date to verify if {specific_wp_req_months}-month waiting period for '{wp_cond}' is satisfied.",
                citation=f"Page {page}",
            ))
        elif policy_age_months < specific_wp_req_months:
            checks.append(EligibilityCheck(
                check="specific_waiting_period_check",
                result="fail",
                detail=f"Policy age ({policy_age_months:.1f} months) has not satisfied the required {specific_wp_req_months}-month waiting period for '{wp_cond}'.",
                source=f"Page {page}",
            ))
            flags.append(EligibilityFlag(
                flag_id="waiting_period_unmet",
                label="Specific Waiting Period Not Met",
                severity="blocking",
                detail=f"Condition '{wp_cond}' requires {specific_wp_req_months} months of continuous coverage. Current policy age is {policy_age_months:.1f} months.",
                citation=f"Page {page}",
            ))
        else:
            checks.append(EligibilityCheck(
                check="specific_waiting_period_check",
                result="pass",
                detail=f"Policy age ({policy_age_months:.1f} months) satisfies the {specific_wp_req_months}-month waiting period for '{wp_cond}'.",
                source=f"Page {page}",
            ))
    else:
        # Check general initial waiting period (e.g. 30 days)
        if policy_age_months is not None and policy_age_months < 1.0:
            checks.append(EligibilityCheck(
                check="specific_waiting_period_check",
                result="flag",
                detail=f"Policy age is less than 30 days ({policy_age_months:.1f} months). General 30-day initial waiting period may apply unless accidental.",
                source="Standard Policy Waiting Period Clause",
            ))
            flags.append(EligibilityFlag(
                flag_id="initial_waiting_period",
                label="Initial 30-Day Waiting Period",
                severity="worth-confirming",
                detail="Non-accidental hospitalizations within the first 30 days of policy inception are typically not payable.",
            ))
        else:
            checks.append(EligibilityCheck(
                check="specific_waiting_period_check",
                result="pass",
                detail="Treatment does not fall under any active specific ailment waiting period.",
                source="Policy Waiting Periods Section",
            ))

    # ──────────────────────────────────────────────────────────────────────────
    # Check 3: Pre-Existing Disease (PED) Waiting Period Check
    # ──────────────────────────────────────────────────────────────────────────
    ped_entry: Optional[Dict[str, Any]] = None
    for wp in waiting_periods:
        if not isinstance(wp, dict):
            continue
        cond_text = str(wp.get("condition", "")).lower()
        if "pre-existing" in cond_text or "pre existing" in cond_text or "ped" in cond_text:
            ped_entry = wp
            break

    ped_period_months = _extract_period_months(ped_entry.get("period")) if ped_entry else None
    ped_page = ped_entry.get("page", 1) if ped_entry else None

    if ped_entry and ped_period_months is not None:
        if policy_age_months is None:
            checks.append(EligibilityCheck(
                check="ped_waiting_period_check",
                result="unable_to_determine",
                detail=f"Policy specifies {ped_period_months}-month PED waiting period, but policy start date was not provided.",
                source=f"Page {ped_page}",
            ))
        elif policy_age_months < ped_period_months:
            checks.append(EligibilityCheck(
                check="ped_waiting_period_check",
                result="flag",
                detail=f"Policy age is {policy_age_months:.1f} months, which is within the policy's stated {ped_period_months}-month PED waiting period.",
                source=f"Page {ped_page}",
            ))
            flags.append(EligibilityFlag(
                flag_id="ped_risk",
                label="PED Waiting Period Verification",
                severity="worth-confirming",
                detail=f"If '{treatment_name}' is declared or treated as a pre-existing condition, coverage requires {ped_period_months} months of continuous coverage.",
                citation=f"Page {ped_page}",
            ))
        else:
            checks.append(EligibilityCheck(
                check="ped_waiting_period_check",
                result="pass",
                detail=f"Policy age ({policy_age_months:.1f} months) satisfies the {ped_period_months}-month PED waiting period.",
                source=f"Page {ped_page}",
            ))
    else:
        checks.append(EligibilityCheck(
            check="ped_waiting_period_check",
            result="pass",
            detail="No separate PED waiting period clause identified.",
            source="Policy Facts",
        ))

    # ──────────────────────────────────────────────────────────────────────────
    # Check 4: Cost vs Sum Insured & Room Rent Sub-limit
    # ──────────────────────────────────────────────────────────────────────────
    sum_insured_raw = policy_facts.get("sum_insured")
    si_num = _extract_numeric_sum_insured(sum_insured_raw)
    si_page = sum_insured_raw.get("page", 1) if isinstance(sum_insured_raw, dict) else 1

    room_rent_raw = policy_facts.get("room_rent_limit")
    room_rent_str = room_rent_raw.get("value", "") if isinstance(room_rent_raw, dict) else str(room_rent_raw or "")
    room_page = room_rent_raw.get("page", 1) if isinstance(room_rent_raw, dict) else 1

    cost_issues: List[str] = []

    if si_num is not None and treatment.estimated_cost > si_num:
        diff = treatment.estimated_cost - si_num
        cost_issues.append(f"Estimated cost (₹{treatment.estimated_cost:,.0f}) exceeds sum insured (₹{si_num:,.0f}) by ₹{diff:,.0f}.")
        flags.append(EligibilityFlag(
            flag_id="sum_insured_exceeded",
            label="Estimated Cost Exceeds Sum Insured",
            severity="worth-confirming",
            detail=f"Estimated cost of ₹{treatment.estimated_cost:,.0f} exceeds policy sum insured of ₹{si_num:,.0f}. The difference must be borne out-of-pocket.",
            citation=f"Page {si_page}",
        ))

    # Room rent limit check: e.g. "1% of Sum Insured", "Single Private Room", etc.
    if room_rent_str:
        lower_rr = room_rent_str.lower()
        lower_room = treatment.room_type.lower()
        if "1%" in lower_rr and si_num:
            daily_room_cap = si_num * 0.01
            if "deluxe" in lower_room or "suite" in lower_room:
                flags.append(EligibilityFlag(
                    flag_id="room_rent_proportionate_deduction",
                    label="Proportionate Deduction Risk",
                    severity="worth-confirming",
                    detail=f"Policy has a room rent cap of 1% (₹{daily_room_cap:,.0f}/day). Choosing '{treatment.room_type}' will trigger proportionate deductions across all hospital bill heads.",
                    citation=f"Page {room_page}",
                ))
                cost_issues.append("Room type may exceed daily cap, triggering proportionate deductions.")

    if cost_issues:
        checks.append(EligibilityCheck(
            check="cost_and_sublimits_check",
            result="flag",
            detail="; ".join(cost_issues),
            source=f"Page {si_page}",
        ))
    else:
        si_desc = f"₹{si_num:,.0f}" if si_num else "specified limit"
        checks.append(EligibilityCheck(
            check="cost_and_sublimits_check",
            result="pass",
            detail=f"Estimated cost (₹{treatment.estimated_cost:,.0f}) is within sum insured ({si_desc}).",
            source=f"Page {si_page}",
        ))

    # ──────────────────────────────────────────────────────────────────────────
    # Check 5: Regulatory Baseline Compliance (IRDAI)
    # ──────────────────────────────────────────────────────────────────────────
    irdai_discrepancies: List[str] = []

    if ped_period_months is not None and ped_period_months > ped_max_cap:
        source_doc = ped_ref_meta.get("source", "IRDAI Master Circular")
        clause = ped_ref_meta.get("clause", "")
        cite_str = f"{source_doc} (Clause: {clause})" if clause else source_doc
        msg = (
            f"Policy specifies a {ped_period_months}-month PED waiting period, but IRDAI regulations cap PED waiting "
            f"periods at {ped_max_cap} months. The policy cannot enforce waiting periods beyond {ped_max_cap} months."
        )
        irdai_discrepancies.append(msg)
        flags.append(EligibilityFlag(
            flag_id="irdai_ped_cap_override",
            label="IRDAI Statutory PED Protection",
            severity="info",
            detail=msg,
            citation=cite_str,
        ))

    if irdai_discrepancies:
        checks.append(EligibilityCheck(
            check="irdai_baseline_check",
            result="flag",
            detail="; ".join(irdai_discrepancies),
            source="IRDAI Regulatory Baseline",
        ))
    else:
        checks.append(EligibilityCheck(
            check="irdai_baseline_check",
            result="pass",
            detail=f"Policy clauses comply with statutory IRDAI baselines (PED waiting period cap: {ped_max_cap} months).",
            source="IRDAI Regulatory Baseline",
        ))

    return EligibilityResult(
        checks=checks,
        flags=flags,
        evaluated_at=datetime.utcnow().isoformat(),
    )
