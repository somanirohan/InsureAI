"""
Policy comparison service for InsureAI.
Compares extracted facts and coverages across multiple user policies.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Dict, List
from bson import ObjectId

try:
    from db import get_async_db, serialize_doc, to_object_id
except ImportError:
    from server.db import get_async_db, serialize_doc, to_object_id

logger = logging.getLogger("insureai.comparison")


class ComparisonService:
    async def compare_policies(self, user_id: str, policy_ids: List[str]) -> Dict[str, Any]:
        if not policy_ids or len(policy_ids) < 2:
            raise ValueError("At least 2 policies are required for comparison.")

        u_oid = to_object_id(user_id)
        p_oids = [to_object_id(pid) for pid in policy_ids]
        if not u_oid or any(p is None for p in p_oids):
            raise ValueError("Invalid user or policy identifier.")

        db = get_async_db()
        policies = await db.policies.find({
            "_id": {"$in": p_oids},
            "user_id": u_oid,
        }).to_list(length=100)

        if len(policies) != len(policy_ids):
            raise PermissionError("One or more selected policies do not exist or access is restricted.")

        metadata = [
            {
                "policy_id": str(p["_id"]),
                "insurer_name": p.get("insurer_name"),
                "policy_type": p.get("policy_type"),
                "policy_number": p.get("policy_number"),
                "sum_insured": p.get("sum_insured"),
                "premium_amount": p.get("premium_amount"),
            }
            for p in policies
        ]

        def _get_fact(policy: dict, category: str) -> str:
            facts = policy.get("facts", [])
            f = next((fact for fact in facts if fact.get("category") == category), None)
            return f["fact_value"] if f else "Standard / None"

        coverage_diff: dict[str, str] = {}
        premium_diff: dict[str, str] = {}
        room_rent_diff: dict[str, str] = {}
        waiting_periods_diff: dict[str, list[str]] = {}
        copay_diff: dict[str, str] = {}
        exclusions_diff: dict[str, list[str]] = {}

        for p in policies:
            pid = str(p["_id"])
            sum_ins = p.get("sum_insured")
            coverage_diff[pid] = f"INR {sum_ins:,.0f}" if sum_ins else "Not Specified"
            prem = p.get("premium_amount")
            premium_diff[pid] = f"INR {prem:,.0f}/yr" if prem else "Not Specified"
            room_rent_diff[pid] = _get_fact(p, "room_rent_limit")
            copay_diff[pid] = _get_fact(p, "co_payment")

            waiting = [
                f["fact_value"]
                for f in p.get("facts", [])
                if f.get("category") == "waiting_period" and f.get("fact_value")
            ]
            waiting_periods_diff[pid] = waiting if waiting else ["Standard IRDAI waiting periods"]

            red_flags = p.get("red_flag_summary") or {}
            exclusions_diff[pid] = red_flags.get("major_exclusions", [])

        comparison_result = {
            "policies_metadata": metadata,
            "coverage_comparison": coverage_diff,
            "premium_comparison": premium_diff,
            "room_rent_comparison": room_rent_diff,
            "waiting_periods_comparison": waiting_periods_diff,
            "copay_comparison": copay_diff,
            "exclusions_diff": exclusions_diff,
        }

        comparison_record = {
            "user_id": u_oid,
            "policy_ids": p_oids,
            "comparison_result": comparison_result,
            "created_at": datetime.utcnow(),
        }

        result = await db.policy_comparisons.insert_one(comparison_record)
        comparison_record["_id"] = str(result.inserted_id)

        return serialize_doc(comparison_record)


comparison_service = ComparisonService()
