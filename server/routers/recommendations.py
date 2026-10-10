"""
FastAPI router for the AI-Powered Health Insurance Recommendation Engine.
Provides endpoints for running recommendations, retrieving the verified policy catalog,
triggering catalog refreshes, and accessing recommendation history.
"""

from __future__ import annotations

import logging
from datetime import datetime
from typing import Any, Dict, Optional
from fastapi import APIRouter, Depends, HTTPException, Request, status

try:
    from db import get_async_db, serialize_doc, to_object_id
    from models.recommendation import RecommendationRequest, RecommendationResponse
    from services.auth_service import get_current_user, get_current_user_optional
    from services.policy_crawler import policy_crawler_service
    from services.recommendation_engine import recommendation_engine
except ImportError:
    from server.db import get_async_db, serialize_doc, to_object_id
    from server.models.recommendation import RecommendationRequest, RecommendationResponse
    from server.services.auth_service import get_current_user, get_current_user_optional
    from server.services.policy_crawler import policy_crawler_service
    from server.services.recommendation_engine import recommendation_engine

logger = logging.getLogger("insureai.recommendations_router")

router = APIRouter(prefix="/api/recommendations", tags=["Health Insurance Recommendations"])


@router.post("", response_model=RecommendationResponse)
@router.post("/", response_model=RecommendationResponse)
async def get_policy_recommendations(
    payload: RecommendationRequest,
    current_user: Optional[Dict[str, Any]] = Depends(get_current_user_optional),
):
    """
    Generate tailored, deterministic health insurance recommendations for the user profile.
    Supports both guest visitors (minimal friction) and logged-in users.
    If authenticated, securely stores the recommendation search in user history.
    """
    try:
        # 1. Fetch catalog policies from DB or in-memory fallback
        catalog = await policy_crawler_service.get_all_catalog_policies()

        # 2. Run deterministic recommendation scoring engine
        response = recommendation_engine.generate_recommendations(
            request=payload,
            catalog_policies=catalog,
        )

        # 3. If authenticated, record search history asynchronously
        if current_user and current_user.get("_id"):
            try:
                db = get_async_db()
                u_oid = to_object_id(current_user["_id"])
                rec_doc = {
                    "user_id": u_oid,
                    "profile": payload.profile.model_dump(),
                    "top_recommendations": [item.model_dump() for item in response.top_recommendations],
                    "total_evaluated": response.total_eligible_evaluated,
                    "created_at": datetime.utcnow(),
                }
                await db.policy_recommendations.insert_one(rec_doc)
            except Exception as history_exc:
                logger.warning("Could not persist recommendation history: %s", history_exc)

        return response
    except Exception as exc:
        logger.exception("Error generating recommendations: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate recommendations: {str(exc)}",
        )


@router.get("/catalog")
async def get_policy_catalog():
    """
    Retrieve all verified Indian health insurance plans available in the recommendation catalog.
    """
    try:
        policies = await policy_crawler_service.get_all_catalog_policies()
        return {
            "success": True,
            "total_policies": len(policies),
            "policies": policies,
        }
    except Exception as exc:
        logger.exception("Error fetching policy catalog: %s", exc)
        raise HTTPException(status_code=500, detail="Could not retrieve policy catalog.")


@router.post("/refresh")
async def refresh_policy_catalog(
    current_user: Optional[Dict[str, Any]] = Depends(get_current_user_optional),
):
    """
    Trigger a catalog synchronization and brochure verification check.
    """
    try:
        res = await policy_crawler_service.seed_or_refresh_catalog(force_refresh=True)
        return {
            "success": True,
            "message": "Policy catalog synchronized successfully.",
            "details": res,
        }
    except Exception as exc:
        logger.exception("Error refreshing policy catalog: %s", exc)
        raise HTTPException(status_code=500, detail=str(exc))


@router.get("/history")
async def get_recommendation_history(
    current_user: Dict[str, Any] = Depends(get_current_user),
):
    """
    Retrieve prior recommendation consultations for the authenticated user.
    """
    try:
        u_oid = to_object_id(current_user["_id"])
        db = get_async_db()
        history = (
            await db.policy_recommendations.find({"user_id": {"$in": [u_oid, str(u_oid)]}})
            .sort("created_at", -1)
            .limit(20)
            .to_list(length=20)
        )
        return {"success": True, "history": [serialize_doc(h) for h in history]}
    except Exception as exc:
        logger.exception("Error reading recommendation history: %s", exc)
        raise HTTPException(status_code=500, detail="Could not retrieve recommendation history.")
