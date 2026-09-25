from fastapi import APIRouter, HTTPException, Depends
from bson import ObjectId

try:
    from models.comparison import CompareRequest
    from services.auth_service import get_current_user
    from services.comparison_service import comparison_service
    from db import get_async_db
except ImportError:
    from server.models.comparison import CompareRequest
    from server.services.auth_service import get_current_user
    from server.services.comparison_service import comparison_service
    from server.db import get_async_db

router = APIRouter(prefix="/api/comparisons", tags=["Policy Comparison"])

@router.post("")
@router.post("/")
async def compare_policies(payload: CompareRequest, current_user: dict = Depends(get_current_user)):
    user_id = str(current_user["_id"])
    try:
        comparison_record = await comparison_service.compare_policies(
            user_id=user_id,
            policy_ids=payload.policy_ids
        )
        return {"success": True, "comparison": comparison_record}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/history")
async def get_comparison_history(current_user: dict = Depends(get_current_user)):
    user_id = str(current_user["_id"])
    db = get_async_db()

    comparisons = await db.policy_comparisons.find({"user_id": user_id}).sort("created_at", -1).to_list(length=100)
    for c in comparisons:
        c["_id"] = str(c["_id"])

    return {"comparisons": comparisons}
