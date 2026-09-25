from datetime import datetime
from typing import Dict, Any, List
from bson import ObjectId
from fastapi_server.db import get_async_db

class ComparisonService:
    async def compare_policies(self, user_id: str, policy_ids: List[str]) -> Dict[str, Any]:
        if not policy_ids or len(policy_ids) < 2:
            raise Exception("At least 2 policies are required for comparison")

        db = get_async_db()

        query_ids = []
        for pid in policy_ids:
            try:
                query_ids.append(ObjectId(pid))
            except Exception:
                query_ids.append(pid)

        # Enforce user_id scoping (NFR 5.3)
        policies = await db.policies.find({
            "_id": {"$in": query_ids},
            "user_id": str(user_id)
        }).to_list(length=100)

        if len(policies) != len(policy_ids):
            raise Exception("One or more selected policies do not exist or access is restricted")

        metadata = [
            {
                "policy_id": str(p["_id"]),
                "insurer_name": p.get("insurer_name"),
                "policy_type": p.get("policy_type"),
                "policy_number": p.get("policy_number"),
                "sum_insured": p.get("sum_insured"),
                "premium_amount": p.get("premium_amount")
            }
            for p in policies
        ]

        def helper_extract_fact(policy, category):
            facts = policy.get("facts", [])
            f = next((fact for fact in facts if fact.get("category") == category), None)
            return f["fact_value"] if f else "Standard / None"

        coverage_diff = {}
        premium_diff = {}
        room_rent_diff = {}
        waiting_periods_diff = {}
        copay_diff = {}
        exclusions_diff = {}

        for p in policies:
            pid = str(p["_id"])
            sum_ins = p.get("sum_insured")
            coverage_diff[pid] = f"INR {sum_ins:,.0f}" if sum_ins else "Not Specified"
            prem = p.get("premium_amount")
            premium_diff[pid] = f"INR {prem:,.0f}/yr" if prem else "Not Specified"
            room_rent_diff[pid] = helper_extract_fact(p, "room_rent_limit")
            copay_diff[pid] = helper_extract_fact(p, "co_payment")

            waiting = [f["fact_value"] for f in p.get("facts", []) if f.get("category") == "waiting_period"]
            waiting_periods_diff[pid] = waiting if waiting else ["Standard IRDAI waiting periods"]

            red_flags = p.get("red_flag_summary", {})
            exclusions_diff[pid] = red_flags.get("major_exclusions", [])

        comparison_result = {
            "policies_metadata": metadata,
            "coverage_comparison": coverage_diff,
            "premium_comparison": premium_diff,
            "room_rent_comparison": room_rent_diff,
            "waiting_periods_comparison": waiting_periods_diff,
            "copay_comparison": copay_diff,
            "exclusions_diff": exclusions_diff
        }

        comparison_record = {
            "user_id": str(user_id),
            "policy_ids": [str(pid) for pid in policy_ids],
            "comparison_result": comparison_result,
            "created_at": datetime.utcnow()
        }

        result = await db.policy_comparisons.insert_one(comparison_record)
        comparison_record["_id"] = str(result.inserted_id)

        return comparison_record

comparison_service = ComparisonService()
