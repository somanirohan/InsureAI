from fastapi import APIRouter, HTTPException, Depends
from bson import ObjectId

from fastapi_server.models.cost import CostEstimateRequest, WhatIfRequest
from fastapi_server.services.auth_service import get_current_user
from fastapi_server.services.cost_service import cost_estimator_service, TREATMENT_BENCHMARKS
from fastapi_server.db import get_async_db

router = APIRouter(prefix="/api/cost", tags=["Cost Estimator & What-If"])

@router.get("/benchmarks")
async def get_benchmarks(current_user: dict = Depends(get_current_user)):
    return {"benchmarks": TREATMENT_BENCHMARKS}

@router.post("/estimate")
async def create_estimate(payload: CostEstimateRequest, current_user: dict = Depends(get_current_user)):
    user_id = str(current_user["_id"])
    try:
        estimate = await cost_estimator_service.create_estimate(
            user_id=user_id,
            policy_id=payload.policy_id,
            treatment_name=payload.treatment_name,
            hospital_tier=payload.hospital_tier,
            room_rent_per_day=payload.room_rent_per_day,
            stay_days=payload.stay_days
        )
        return {"success": True, "estimate": estimate}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/estimate/{estimate_id}/what-if")
async def add_what_if_variant(estimate_id: str, payload: WhatIfRequest, current_user: dict = Depends(get_current_user)):
    user_id = str(current_user["_id"])
    try:
        res = await cost_estimator_service.add_what_if_variant(
            user_id=user_id,
            estimate_id=estimate_id,
            changed_variable=payload.changed_variable,
            new_value=payload.new_value
        )
        return {"success": True, "estimate": res["estimate"], "variant": res["variant"]}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/history")
async def get_estimate_history(current_user: dict = Depends(get_current_user)):
    user_id = str(current_user["_id"])
    db = get_async_db()

    estimates = await db.cost_estimates.find({"user_id": user_id}).sort("created_at", -1).to_list(length=100)
    for e in estimates:
        e["_id"] = str(e["_id"])

    return {"estimates": estimates}
