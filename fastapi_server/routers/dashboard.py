from fastapi import APIRouter, Depends
from fastapi_server.services.auth_service import get_current_user
from fastapi_server.db import get_async_db

router = APIRouter(prefix="/api/dashboard", tags=["Dashboard"])

@router.get("/summary")
async def get_dashboard_summary(current_user: dict = Depends(get_current_user)):
    user_id = str(current_user["_id"])
    db = get_async_db()

    total_policies = await db.policies.count_documents({"user_id": user_id})
    ready_policies = await db.policies.count_documents({"user_id": user_id, "status": "ready"})
    total_conversations = await db.conversations.count_documents({"user_id": user_id})
    total_estimates = await db.cost_estimates.count_documents({"user_id": user_id})
    total_comparisons = await db.policy_comparisons.count_documents({"user_id": user_id})

    recent_policies = await db.policies.find({"user_id": user_id}).sort("uploaded_at", -1).limit(3).to_list(length=3)
    for p in recent_policies:
        p["_id"] = str(p["_id"])

    recent_estimates = await db.cost_estimates.find({"user_id": user_id}).sort("created_at", -1).limit(3).to_list(length=3)
    for e in recent_estimates:
        e["_id"] = str(e["_id"])

    return {
        "user": current_user,
        "metrics": {
            "total_policies": total_policies,
            "ready_policies": ready_policies,
            "total_conversations": total_conversations,
            "total_estimates": total_estimates,
            "total_comparisons": total_comparisons
        },
        "recent_policies": recent_policies,
        "recent_estimates": recent_estimates
    }
