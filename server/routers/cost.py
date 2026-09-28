"""
Cost estimator and what-if simulation routes for InsureAI.
"""

from __future__ import annotations

import logging
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query, status

try:
    from db import get_async_db, serialize_doc, to_object_id
    from models.cost import CostEstimateRequest, WhatIfRequest
    from services.auth_service import get_current_user
    from services.cost_service import TREATMENT_BENCHMARKS, cost_estimator_service
    from services.rate_card_service import rate_card_service
except ImportError:
    from server.db import get_async_db, serialize_doc, to_object_id
    from server.models.cost import CostEstimateRequest, WhatIfRequest
    from server.services.auth_service import get_current_user
    from server.services.cost_service import TREATMENT_BENCHMARKS, cost_estimator_service
    from server.services.rate_card_service import rate_card_service

logger = logging.getLogger("insureai.cost")

router = APIRouter(prefix="/api/cost", tags=["Cost Estimator & What-If"])


@router.get("/benchmarks")
async def get_benchmarks(current_user: dict = Depends(get_current_user)):
    """Return standard hospital treatment benchmarks and rate card status."""
    return {
        "benchmarks": TREATMENT_BENCHMARKS,
        "rate_card_loaded": rate_card_service.is_loaded,
        "rate_card_total_treatments": rate_card_service.total_treatments,
        "rate_card_categories": rate_card_service.categories,
    }


@router.get("/rate-card/search")
async def search_rate_card(
    q: str = Query("", description="Search query for treatment name"),
    category: str = Query("", description="Filter by category"),
    limit: int = Query(20, ge=1, le=50),
    current_user: dict = Depends(get_current_user),
):
    """
    Search the CGHS Rate Card for treatments by name.
    Returns matching treatments with NABH/Non-NABH rates.
    """
    if not rate_card_service.is_loaded:
        raise HTTPException(status_code=503, detail="Rate card data not loaded.")

    results = rate_card_service.search_treatments(
        query=q,
        category=category if category else None,
        limit=limit,
    )
    return {
        "query": q,
        "total_results": len(results),
        "treatments": results,
    }


@router.get("/rate-card/categories")
async def get_rate_card_categories(
    current_user: dict = Depends(get_current_user),
):
    """Return all treatment categories from the rate card."""
    if not rate_card_service.is_loaded:
        raise HTTPException(status_code=503, detail="Rate card data not loaded.")

    categories = []
    for cat in rate_card_service.categories:
        treatments = rate_card_service.get_treatments_by_category(cat)
        categories.append({
            "name": cat,
            "count": len(treatments),
        })
    return {"categories": categories}


@router.get("/rate-card/treatment/{sr_no}")
async def get_rate_card_treatment(
    sr_no: int,
    current_user: dict = Depends(get_current_user),
):
    """Look up a specific treatment by serial number from the rate card."""
    if not rate_card_service.is_loaded:
        raise HTTPException(status_code=503, detail="Rate card data not loaded.")

    treatment = rate_card_service.get_treatment_by_sr_no(sr_no)
    if not treatment:
        raise HTTPException(status_code=404, detail=f"Treatment #{sr_no} not found.")
    return {"treatment": treatment}


@router.post("/estimate")
async def create_estimate(
    payload: CostEstimateRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    Calculate and persist an out-of-pocket medical cost estimate
    based strictly on extracted policy facts.
    """
    u_oid = to_object_id(current_user["_id"])
    p_oid = to_object_id(payload.policy_id)
    if not p_oid:
        raise HTTPException(status_code=400, detail="Invalid policy ID format.")

    try:
        estimate = await cost_estimator_service.create_estimate(
            user_id=str(u_oid),
            policy_id=str(p_oid),
            treatment_name=payload.treatment_name,
            hospital_tier=payload.hospital_tier,
            room_rent_per_day=payload.room_rent_per_day,
            stay_days=payload.stay_days,
        )
        return {"success": True, "estimate": serialize_doc(estimate)}
    except PermissionError:
        raise HTTPException(status_code=403, detail="Policy not found or access denied.")
    except ValueError as val_err:
        raise HTTPException(status_code=400, detail=str(val_err))
    except Exception as exc:
        logger.exception("Error generating cost estimate: %s", exc)
        raise HTTPException(status_code=400, detail=str(exc))


@router.post("/estimate/{estimate_id}/what-if")
async def add_what_if_variant(
    estimate_id: str,
    payload: WhatIfRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    Add a what-if simulation variant to an existing estimate,
    preserving original room rent and stay duration.
    """
    u_oid = to_object_id(current_user["_id"])
    e_oid = to_object_id(estimate_id)
    if not e_oid:
        raise HTTPException(status_code=400, detail="Invalid estimate ID format.")

    try:
        res = await cost_estimator_service.add_what_if_variant(
            user_id=str(u_oid),
            estimate_id=str(e_oid),
            changed_variable=payload.changed_variable,
            new_value=payload.new_value,
        )
        return {
            "success": True,
            "estimate": serialize_doc(res["estimate"]),
            "variant": res["variant"],
        }
    except PermissionError:
        raise HTTPException(status_code=403, detail="Estimate not found or access denied.")
    except ValueError as val_err:
        raise HTTPException(status_code=400, detail=str(val_err))
    except Exception as exc:
        logger.exception("Error adding what-if variant: %s", exc)
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/history")
async def get_estimate_history(current_user: dict = Depends(get_current_user)):
    """Retrieve historical cost estimates for the authenticated user."""
    u_oid = to_object_id(current_user["_id"])
    db = get_async_db()

    estimates = (
        await db.cost_estimates.find({"user_id": u_oid})
        .sort("created_at", -1)
        .to_list(length=100)
    )

    return {"estimates": [serialize_doc(e) for e in estimates]}
