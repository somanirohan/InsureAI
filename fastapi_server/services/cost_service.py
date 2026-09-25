import uuid
from datetime import datetime
from typing import Dict, Any, List, Optional
from bson import ObjectId
from fastapi_server.db import get_async_db

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
        has_copay_rider: bool = False
    ) -> Dict[str, Any]:
        t_key = treatment_name.lower().strip()
        benchmark = TREATMENT_BENCHMARKS.get(t_key, {"tier_1": 250000, "tier_2": 180000, "tier_3": 120000})

        base_cost = benchmark.get(hospital_tier, benchmark.get("tier_1", 250000))
        sum_insured = policy.get("sum_insured", 1000000.0) if policy else 1000000.0

        # Room rent cap calculation from policy facts
        room_rent_cap = sum_insured * 0.01
        if policy and policy.get("facts"):
            room_fact = next((f for f in policy["facts"] if f.get("category") == "room_rent_limit"), None)
            if room_fact and room_fact.get("fact_value_numeric"):
                room_rent_cap = room_fact["fact_value_numeric"]

        total_room_bill = room_rent_per_day * stay_days
        room_rent_copay_penalty = 0.0

        if room_rent_per_day > room_rent_cap and room_rent_cap > 0:
            excess_ratio = (room_rent_per_day - room_rent_cap) / room_rent_per_day
            room_rent_copay_penalty = round(base_cost * (excess_ratio * 0.4))

        excluded_items_cost = round(base_cost * 0.07)

        sublimit_penalty = 0.0
        sublimits_applied = []
        if "cataract" in t_key:
            cataract_cap = 40000.0
            if base_cost > cataract_cap:
                sublimit_penalty = base_cost - cataract_cap
                sublimits_applied.append({"item": "Cataract Procedure Cap", "cap": cataract_cap, "deduction": sublimit_penalty})

        copay_percentage = 0.0
        if not has_copay_rider and hospital_tier == "tier_1":
            copay_fact = next((f for f in policy.get("facts", []) if f.get("category") == "co_payment"), None) if policy else None
            copay_percentage = copay_fact.get("fact_value_numeric", 10.0) if copay_fact and copay_fact.get("fact_value_numeric") else 10.0

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
            "final_payable_by_user": out_of_pocket
        }

        return {
            "estimated_total_cost": base_cost,
            "covered_amount": payable_by_insurer,
            "out_of_pocket_amount": out_of_pocket,
            "cost_breakdown": breakdown
        }

    async def create_estimate(
        self,
        user_id: str,
        policy_id: str,
        treatment_name: str,
        hospital_tier: str,
        room_rent_per_day: float,
        stay_days: int
    ) -> Dict[str, Any]:
        db = get_async_db()
        try:
            p_id = ObjectId(policy_id)
        except Exception:
            p_id = policy_id

        policy = await db.policies.find_one({"_id": p_id, "user_id": str(user_id)})
        if not policy:
            raise Exception("Policy not found or access denied")

        calc = self.calculate_cost_breakdown(
            policy=policy,
            treatment_name=treatment_name,
            hospital_tier=hospital_tier,
            room_rent_per_day=room_rent_per_day,
            stay_days=stay_days
        )

        estimate_doc = {
            "user_id": str(user_id),
            "policy_id": str(policy_id),
            "treatment_name": treatment_name,
            "hospital_tier": hospital_tier,
            "estimated_total_cost": calc["estimated_total_cost"],
            "covered_amount": calc["covered_amount"],
            "out_of_pocket_amount": calc["out_of_pocket_amount"],
            "cost_breakdown": calc["cost_breakdown"],
            "what_if_variants": [],
            "created_at": datetime.utcnow()
        }

        result = await db.cost_estimates.insert_one(estimate_doc)
        estimate_doc["_id"] = str(result.inserted_id)
        return estimate_doc

    async def add_what_if_variant(self, user_id: str, estimate_id: str, changed_variable: str, new_value: str) -> Dict[str, Any]:
        db = get_async_db()
        try:
            e_id = ObjectId(estimate_id)
        except Exception:
            e_id = estimate_id

        estimate = await db.cost_estimates.find_one({"_id": e_id, "user_id": str(user_id)})
        if not estimate:
            raise Exception("Cost estimate not found")

        try:
            p_id = ObjectId(estimate["policy_id"])
        except Exception:
            p_id = estimate["policy_id"]

        policy = await db.policies.find_one({"_id": p_id, "user_id": str(user_id)})

        original_value = ""
        updated_tier = estimate["hospital_tier"]
        has_copay_rider = False
        custom_sum_insured = policy.get("sum_insured", 1000000.0) if policy else 1000000.0

        if changed_variable == "hospital_tier":
            original_value = estimate["hospital_tier"]
            updated_tier = new_value
        elif changed_variable == "rider":
            original_value = "No Copay Rider"
            has_copay_rider = new_value in ["zero_copay_rider", "true", "True"]
        elif changed_variable == "sum_insured":
            original_value = str(policy.get("sum_insured", 1000000) if policy else 1000000)
            custom_sum_insured = float(new_value)

        simulated_policy = dict(policy) if policy else {}
        simulated_policy["sum_insured"] = custom_sum_insured

        recalc = self.calculate_cost_breakdown(
            policy=simulated_policy,
            treatment_name=estimate["treatment_name"],
            hospital_tier=updated_tier,
            has_copay_rider=has_copay_rider
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
            "created_at": datetime.utcnow()
        }

        await db.cost_estimates.update_one(
            {"_id": e_id},
            {"$push": {"what_if_variants": variant}}
        )

        updated_estimate = await db.cost_estimates.find_one({"_id": e_id})
        updated_estimate["_id"] = str(updated_estimate["_id"])
        return {"estimate": updated_estimate, "variant": variant}

cost_estimator_service = CostEstimatorService()
