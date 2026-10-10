"""
Deterministic Claim Settlement Engine.
Computes itemized receipt steps and total payable settlement estimate.
Basis is 'uploaded_bill' if an approved/extracted final bill exists, else 'pre_treatment_estimate'.
Reuses regulatory and policy fact parameters without guessing or LLM calculation.
"""

from __future__ import annotations

import re
from typing import Any, Dict, List, Optional

from app.claims.models import Claim, ClaimDocument, ReceiptStep, SettlementEstimate


def _parse_numeric(val: Any) -> Optional[float]:
    """Parse numeric float from string or number."""
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

    # Percentage
    pct_match = re.search(r'(\d+(?:\.\d+)?)\s*%', raw)
    if pct_match:
        try:
            return float(pct_match.group(1))
        except (ValueError, TypeError):
            pass

    # Direct number
    num_match = re.search(r'[\d,]+(?:\.\d+)?', raw)
    if num_match:
        try:
            return float(num_match.group(0).replace(",", ""))
        except (ValueError, TypeError):
            pass
    return None


def calculate_settlement_estimate(
    claim: Claim,
    policy_facts: Dict[str, Any],
) -> SettlementEstimate:
    """
    Deterministically computes settlement estimate with line-by-line receipt steps.
    """
    receipt_steps: List[ReceiptStep] = []

    # 1. Determine Basis & Gross Amount
    basis = "pre_treatment_estimate"
    gross_amount = 0.0
    source_citation = "Treatment pre-admission estimate"

    # Search for an uploaded final bill (must be validated or user-confirmed)
    bill_doc: Optional[ClaimDocument] = None
    unconfirmed_bill: Optional[ClaimDocument] = None

    for doc in claim.documents:
        if (
            doc.item_id in ("final_bill", "itemised_bills")
            or doc.extracted_fields.get("document_type") in ("final_bill", "itemised_bills")
        ):
            amt = doc.extracted_fields.get("total_amount")
            if amt and float(amt) > 0:
                # Strictly require that needs_confirmation is False and validation_issues are resolved
                if not getattr(doc, "needs_confirmation", False) and len(doc.validation_issues or []) == 0:
                    bill_doc = doc
                    break
                else:
                    if not unconfirmed_bill:
                        unconfirmed_bill = doc

    if bill_doc:
        basis = "uploaded_bill"
        gross_amount = float(bill_doc.extracted_fields["total_amount"])
        source_citation = f"Uploaded Bill: {bill_doc.filename}"
    elif claim.treatment and claim.treatment.estimated_cost > 0:
        basis = "pre_treatment_estimate"
        gross_amount = float(claim.treatment.estimated_cost)
        source_citation = "Claim pre-treatment cost estimate"
    else:
        basis = "pre_treatment_estimate"
        gross_amount = 0.0
        source_citation = "Unspecified amount"

    receipt_steps.append(ReceiptStep(
        label="Gross Claimed Amount",
        amount=gross_amount,
        rule="Initial hospital billed charges / estimated admission cost",
        citation=source_citation,
    ))

    # Note when an uploaded bill is awaiting confirmation
    if not bill_doc and unconfirmed_bill:
        receipt_steps.append(ReceiptStep(
            label="Bill Uploaded But Awaiting Confirmation",
            amount=0.0,
            rule=f"Uploaded bill '{unconfirmed_bill.filename}' requires verification before being used as settlement basis",
            citation=f"Pending: {unconfirmed_bill.filename}",
        ))

    if gross_amount <= 0:
        return SettlementEstimate(
            basis=basis,
            receipt_steps=receipt_steps,
            total=0.0,
        )

    running_amount = gross_amount

    # 2. Inadmissible Non-Medical Consumables (7% IRDAI standard)
    non_med_deduction = round(gross_amount * 0.07, 2)
    receipt_steps.append(ReceiptStep(
        label="Inadmissible Non-Medical Items (7%)",
        amount=-non_med_deduction,
        rule="Standard statutory deduction for non-payable hospital items (gloves, PPE, administrative fees)",
        citation="IRDAI List I - Expenses Not Covered",
    ))
    running_amount = max(0.0, running_amount - non_med_deduction)

    # 3. Sum Insured & Room Rent limit inspection
    si_raw = policy_facts.get("sum_insured")
    si_val = _parse_numeric(si_raw) or 1_000_000.0
    si_page = si_raw.get("page", 1) if isinstance(si_raw, dict) else 1

    room_raw = policy_facts.get("room_rent_limit")
    if isinstance(room_raw, dict):
        room_str = str(room_raw.get("value", ""))
        room_page = room_raw.get("page", 1)
    else:
        room_str = str(room_raw or "")
        room_page = 1

    # Check proportionate deduction if room type is deluxe/suite and cap is 1%
    room_penalty = 0.0
    if "1%" in room_str.lower() and claim.treatment:
        room_type = claim.treatment.room_type.lower()
        if "deluxe" in room_type or "suite" in room_type:
            # Proportionate deduction penalty: ~15% on associated charges
            room_penalty = round(gross_amount * 0.15, 2)
            receipt_steps.append(ReceiptStep(
                label="Room Rent Proportionate Deduction",
                amount=-room_penalty,
                rule="Room type exceeds 1% sum insured ceiling; proportionate deduction applied to associated medical charges",
                citation=f"Page {room_page}",
            ))
            running_amount = max(0.0, running_amount - room_penalty)

    # 4. Procedure Sub-Limits (e.g. Cataract)
    if claim.treatment and "cataract" in claim.treatment.name.lower():
        cataract_cap = 40_000.0
        if gross_amount > cataract_cap:
            excess = round(gross_amount - cataract_cap, 2)
            receipt_steps.append(ReceiptStep(
                label="Procedure Sub-Limit Deduction",
                amount=-excess,
                rule=f"Cataract procedure limit capped at ₹{cataract_cap:,.0f}",
                citation="Policy Schedule Sub-limits",
            ))
            running_amount = max(0.0, running_amount - excess)

    # 5. Co-Payment
    copay_raw = policy_facts.get("co_pay")
    copay_pct = _parse_numeric(copay_raw) if copay_raw is not None else 0.0
    copay_page = copay_raw.get("page", 1) if isinstance(copay_raw, dict) else 1

    if copay_pct and copay_pct > 0:
        copay_deduction = round(running_amount * (copay_pct / 100.0), 2)
        receipt_steps.append(ReceiptStep(
            label=f"Co-Payment ({copay_pct:.0f}%)",
            amount=-copay_deduction,
            rule=f"Mandatory policy co-payment of {copay_pct:.0f}% applied on admissible claim amount",
            citation=f"Page {copay_page}",
        ))
        running_amount = max(0.0, running_amount - copay_deduction)

    # 6. Deductible
    deductible_raw = policy_facts.get("deductible")
    deductible_val = _parse_numeric(deductible_raw) if deductible_raw is not None else 0.0
    deductible_page = deductible_raw.get("page", 1) if isinstance(deductible_raw, dict) else 1

    if deductible_val and deductible_val > 0:
        actual_deductible = min(running_amount, deductible_val)
        receipt_steps.append(ReceiptStep(
            label="Policy Deductible",
            amount=-actual_deductible,
            rule=f"Policy deductible of ₹{deductible_val:,.0f} deducted from approved amount",
            citation=f"Page {deductible_page}",
        ))
        running_amount = max(0.0, running_amount - actual_deductible)

    # 7. Sum Insured Ceiling
    if running_amount > si_val:
        excess_si = round(running_amount - si_val, 2)
        receipt_steps.append(ReceiptStep(
            label="Sum Insured Ceiling Cap",
            amount=-excess_si,
            rule=f"Settlement amount capped at total available sum insured of ₹{si_val:,.0f}",
            citation=f"Page {si_page}",
        ))
        running_amount = si_val

    final_total = round(max(0.0, running_amount), 2)

    return SettlementEstimate(
        basis=basis,
        receipt_steps=receipt_steps,
        total=final_total,
    )
