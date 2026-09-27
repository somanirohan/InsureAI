"""
Cost estimator and what-if simulation service for InsureAI.
Uses authoritative policy facts from MongoDB, validates user inputs,
preserves explicit 0% copays, and preserves room rent and stay durations in what-if models.
"""

from __future__ import annotations

import logging
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional
from bson import ObjectId

try:
    from db import get_async_db, to_object_id
except ImportError:
    from server.db import get_async_db, to_object_id

logger = logging.getLogger("insureai.cost")

VALID_HOSPITAL_TIERS = {"tier_1", "tier_2", "tier_3"}

TREATMENT_BENCHMARKS = {
    "knee replacement": {"tier_1": 350000, "tier_2": 250000, "tier_3": 180000},
    "angioplasty": {"tier_1": 420000, "tier_2": 300000, "tier_3": 210000},
    "cataract surgery": {"tier_1": 65000, "tier_2": 45000, "tier_3": 30000},
    "appendectomy": {"tier_1": 150000, "tier_2": 110000, "tier_3": 75000},
    "chemotherapy (per cycle)": {"tier_1": 95000, "tier_2": 70000, "tier_3": 50000},
    "gallbladder removal": {"tier_1": 180000, "tier_2": 130000, "tier_3": 90000},
    "cardiac bypass (cabg)": {"tier_1": 600000, "tier_2": 450000, "tier_3": 320000},
}


class CostEstimatorService:
    def calculate_cost_breakdown(
        self,
        policy: Optional[Dict[str, Any]],
        treatment_name: str,
        hospital_tier: str,
        room_rent_per_day: float = 8000.0,
        stay_days: int = 4,
        voluntary_deductible: float = 0.0,
        has_copay_rider: bool = False,
    ) -> Dict[str, Any]:
        """
        Calculate realistic out-of-pocket costs and insurer payable amounts
        strictly using MongoDB policy facts.
        """
        if hospital_tier not in VALID_HOSPITAL_TIERS:
            raise ValueError(f"Invalid hospital tier '{hospital_tier}'. Must be one of: {VALID_HOSPITAL_TIERS}")

        if room_rent_per_day <= 0:
            raise ValueError(f"Room rent per day must be positive. Received: {room_rent_per_day}")

        if stay_days <= 0:
            raise ValueError(f"Stay duration must be positive. Received: {stay_days}")

        t_key = treatment_name.lower().strip()
        benchmark = TREATMENT_BENCHMARKS.get(t_key, {"tier_1": 250000, "tier_2": 180000, "tier_3": 120000})
        base_cost = float(benchmark.get(hospital_tier, benchmark.get("tier_1", 250000)))

        sum_insured = float(policy.get("sum_insured") or 1000000.0) if policy else 1000000.0

        # Facts inspection
        citations = []
        assumptions = []

        # Room rent cap
        room_rent_cap = sum_insured * 0.01
        room_fact = next((f for f in policy.get("facts", []) if f.get("category") == "room_rent_limit"), None) if policy else None
        if room_fact and room_fact.get("fact_value_numeric") is not None:
            room_rent_cap = float(room_fact["fact_value_numeric"])
            citations.append({
                "category": "room_rent_limit",
                "page": room_fact.get("source_page"),
                "text": room_fact.get("fact_value"),
            })
            assumptions.append(f"Room rent cap applied from policy fact: INR {room_rent_cap:,.0f}/day (Page {room_fact.get('source_page', '?')}).")
        else:
            assumptions.append(f"Standard room rent cap applied: 1% of Sum Insured (INR {room_rent_cap:,.0f}/day).")

        total_room_bill = room_rent_per_day * stay_days
        room_rent_copay_penalty = 0.0

        if room_rent_per_day > room_rent_cap and room_rent_cap > 0:
            excess_ratio = (room_rent_per_day - room_rent_cap) / room_rent_per_day
            room_rent_copay_penalty = round(base_cost * (excess_ratio * 0.4))
            assumptions.append(f"Room rent limit breached by INR {room_rent_per_day - room_rent_cap:,.0f}/day; proportionate deduction applied.")

        # Standard non-medical hospital consumables (~7% under typical IRDAI guidelines)
        excluded_items_cost = round(base_cost * 0.07)
        assumptions.append("7% estimated non-medical consumables deduction (PPE, gloves, administrative fees).")

        # Sublimits
        sublimit_penalty = 0.0
        sublimits_applied = []
        if "cataract" in t_key:
            cataract_cap = 40000.0
            if base_cost > cataract_cap:
                sublimit_penalty = base_cost - cataract_cap
                sublimits_applied.append({"item": "Cataract Procedure Cap", "cap": cataract_cap, "deduction": sublimit_penalty})
                assumptions.append("Cataract specific procedural sub-limit cap applied.")

        # Co-payment: check if explicit 0% exists
        copay_percentage = 0.0
        copay_fact = next((f for f in policy.get("facts", []) if f.get("category") in ("co_payment", "co_pay")), None) if policy else None

        if has_copay_rider:
            copay_percentage = 0.0
            assumptions.append("Zero Co-pay rider active: 0% co-payment applied.")
        elif copay_fact and copay_fact.get("fact_value_numeric") is not None:
            # Explicit 0.0% co-pay preserved!
            copay_percentage = float(copay_fact["fact_value_numeric"])
            citations.append({
                "category": "co_payment",
                "page": copay_fact.get("source_page"),
                "text": copay_fact.get("fact_value"),
            })
            assumptions.append(f"Co-pay percentage from policy facts: {copay_percentage}% (Page {copay_fact.get('source_page', '?')}).")
        else:
            copay_percentage = 10.0 if hospital_tier == "tier_1" else 0.0
            assumptions.append(f"Default network co-pay applied for {hospital_tier}: {copay_percentage}%.")

        eligible_amount = max(0.0, base_cost - room_rent_copay_penalty - excluded_items_cost - sublimit_penalty)
        deductible_deducted = min(eligible_amount, voluntary_deductible)
        post_deductible = eligible_amount - deductible_deducted
        copay_amount = round(post_deductible * (copay_percentage / 100.0))

        payable_by_insurer = min(sum_insured, max(0.0, post_deductible - copay_amount))
        out_of_pocket = base_cost - payable_by_insurer

        breakdown = {
            "base_hospital_charges": base_cost,
            "room_rent_applied": total_room_bill,
            "room_rent_cap_per_day": room_rent_cap,
            "room_rent_copay_penalty": room_rent_copay_penalty,
            "deductible_deducted": deductible_deducted,
            "copay_percentage": copay_percentage,
            "copay_amount": copay_amount,
            "sub_limit_caps_applied": sublimits_applied,
            "excluded_items_cost": excluded_items_cost,
            "final_payable_by_insurer": payable_by_insurer,
            "final_payable_by_user": out_of_pocket,
        }

        return {
            "estimated_total_cost": base_cost,
            "covered_amount": payable_by_insurer,
            "out_of_pocket_amount": out_of_pocket,
            "cost_breakdown": breakdown,
            "assumptions": assumptions,
            "citations": citations,
            "disclaimer": "These calculations are estimates based on standard IRDAI guidelines and extracted policy terms. Actual insurer claim settlement amounts are determined at claim processing time.",
        }

    async def create_estimate(
        self,
        user_id: str,
        policy_id: str,
        treatment_name: str,
        hospital_tier: str,
        room_rent_per_day: float,
        stay_days: int,
    ) -> Dict[str, Any]:
        """Create a persistent cost estimate record in MongoDB."""
        db = get_async_db()
        p_oid = to_object_id(policy_id)
        u_oid = to_object_id(user_id)
        if not p_oid or not u_oid:
            raise ValueError("Invalid user or policy identifier.")

        policy = await db.policies.find_one({"_id": p_oid, "user_id": u_oid})
        if not policy:
            raise PermissionError("Policy not found or access denied.")

        calc = self.calculate_cost_breakdown(
            policy=policy,
            treatment_name=treatment_name,
            hospital_tier=hospital_tier,
            room_rent_per_day=room_rent_per_day,
            stay_days=stay_days,
        )

        estimate_doc = {
            "user_id": u_oid,
            "policy_id": p_oid,
            "treatment_name": treatment_name,
            "hospital_tier": hospital_tier,
            "room_rent_per_day": room_rent_per_day,
            "stay_days": stay_days,
            "estimated_total_cost": calc["estimated_total_cost"],
            "covered_amount": calc["covered_amount"],
            "out_of_pocket_amount": calc["out_of_pocket_amount"],
            "cost_breakdown": calc["cost_breakdown"],
            "assumptions": calc["assumptions"],
            "citations": calc["citations"],
            "disclaimer": calc["disclaimer"],
            "what_if_variants": [],
            "created_at": datetime.utcnow(),
        }

        result = await db.cost_estimates.insert_one(estimate_doc)
        estimate_doc["_id"] = str(result.inserted_id)
        estimate_doc["user_id"] = str(estimate_doc["user_id"])
        estimate_doc["policy_id"] = str(estimate_doc["policy_id"])
        return estimate_doc

    async def add_what_if_variant(
        self,
        user_id: str,
        estimate_id: str,
        changed_variable: str,
        new_value: str,
    ) -> Dict[str, Any]:
        """
        Recalculate cost estimate with a modified parameter (e.g. tier, rider, sum insured).
        Preserves original room_rent_per_day and stay_days!
        """
        db = get_async_db()
        e_oid = to_object_id(estimate_id)
        u_oid = to_object_id(user_id)
        if not e_oid or not u_oid:
            raise ValueError("Invalid user or estimate identifier.")

        estimate = await db.cost_estimates.find_one({"_id": e_oid, "user_id": u_oid})
        if not estimate:
            raise PermissionError("Cost estimate not found or access denied.")

        p_oid = estimate["policy_id"]
        policy = await db.policies.find_one({"_id": p_oid, "user_id": u_oid})

        # Preserve original room rent and stay duration
        orig_room_rent = float(estimate.get("room_rent_per_day") or 8000.0)
        orig_stay_days = int(estimate.get("stay_days") or 4)

        original_value = ""
        updated_tier = estimate["hospital_tier"]
        has_copay_rider = False
        custom_sum_insured = float(policy.get("sum_insured") or 1000000.0) if policy else 1000000.0

        if changed_variable == "hospital_tier":
            original_value = estimate["hospital_tier"]
            if new_value not in VALID_HOSPITAL_TIERS:
                raise ValueError(f"Invalid hospital tier: {new_value}")
            updated_tier = new_value
        elif changed_variable == "rider":
            original_value = "No Copay Rider"
            has_copay_rider = new_value.lower() in ["zero_copay_rider", "true", "yes", "1"]
        elif changed_variable == "sum_insured":
            original_value = str(policy.get("sum_insured", 1000000) if policy else 1000000)
            custom_sum_insured = float(new_value)
        elif changed_variable == "room_rent":
            original_value = str(orig_room_rent)
            orig_room_rent = float(new_value)
        elif changed_variable == "stay_days":
            original_value = str(orig_stay_days)
            orig_stay_days = int(new_value)

        simulated_policy = dict(policy) if policy else {}
        simulated_policy["sum_insured"] = custom_sum_insured

        recalc = self.calculate_cost_breakdown(
            policy=simulated_policy,
            treatment_name=estimate["treatment_name"],
            hospital_tier=updated_tier,
            room_rent_per_day=orig_room_rent,
            stay_days=orig_stay_days,
            has_copay_rider=has_copay_rider,
        )

        variant = {
            "variant_id": str(uuid.uuid4()),
            "changed_variable": changed_variable,
            "original_value": original_value,
            "new_value": new_value,
            "recalculated_total_cost": recalc["estimated_total_cost"],
            "recalculated_covered_amount": recalc["covered_amount"],
            "recalculated_out_of_pocket": recalc["out_of_pocket_amount"],
            "cost_breakdown": recalc["cost_breakdown"],
            "assumptions": recalc["assumptions"],
            "created_at": datetime.utcnow(),
        }

        await db.cost_estimates.update_one(
            {"_id": e_oid},
            {"$push": {"what_if_variants": variant}}
        )

        updated_estimate = await db.cost_estimates.find_one({"_id": e_oid})
        updated_estimate["_id"] = str(updated_estimate["_id"])
        updated_estimate["user_id"] = str(updated_estimate["user_id"])
        updated_estimate["policy_id"] = str(updated_estimate["policy_id"])
        return {"estimate": updated_estimate, "variant": variant}


cost_estimator_service = CostEstimatorService()
