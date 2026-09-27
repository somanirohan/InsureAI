"""
Dashboard summary router for InsureAI.
"""

from __future__ import annotations

from fastapi import APIRouter, Depends

try:
    from db import get_async_db, serialize_doc, to_object_id
    from services.auth_service import get_current_user
except ImportError:
    from server.db import get_async_db, serialize_doc, to_object_id
    from server.services.auth_service import get_current_user

router = APIRouter(prefix="/api/dashboard", tags=["Dashboard"])


@router.get("/summary")
async def get_dashboard_summary(current_user: dict = Depends(get_current_user)):
    u_oid = to_object_id(current_user["_id"])
    db = get_async_db()

    total_policies = await db.policies.count_documents({"user_id": u_oid})
    ready_policies = await db.policies.count_documents({"user_id": u_oid, "status": "ready"})
    total_conversations = await db.conversations.count_documents({"user_id": u_oid})
    total_estimates = await db.cost_estimates.count_documents({"user_id": u_oid})
    total_comparisons = await db.policy_comparisons.count_documents({"user_id": u_oid})

    recent_policies = (
        await db.policies.find({"user_id": u_oid})
        .sort("uploaded_at", -1)
        .limit(3)
        .to_list(length=3)
    )

    recent_estimates = (
        await db.cost_estimates.find({"user_id": u_oid})
        .sort("created_at", -1)
        .limit(3)
        .to_list(length=3)
    )

    return {
        "user": serialize_doc(current_user),
        "metrics": {
            "total_policies": total_policies,
            "ready_policies": ready_policies,
            "total_conversations": total_conversations,
            "total_estimates": total_estimates,
            "total_comparisons": total_comparisons,
        },
        "recent_policies": [serialize_doc(p) for p in recent_policies],
        "recent_estimates": [serialize_doc(e) for e in recent_estimates],
    }
