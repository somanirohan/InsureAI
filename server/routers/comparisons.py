"""
Policy comparison router for InsureAI.
"""

from __future__ import annotations

import logging
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, status

try:
    from db import get_async_db, serialize_doc, to_object_id
    from models.comparison import CompareRequest
    from services.auth_service import get_current_user
    from services.comparison_service import comparison_service
except ImportError:
    from server.db import get_async_db, serialize_doc, to_object_id
    from server.models.comparison import CompareRequest
    from server.services.auth_service import get_current_user
    from server.services.comparison_service import comparison_service

logger = logging.getLogger("insureai.comparison")

router = APIRouter(prefix="/api/comparisons", tags=["Policy Comparison"])


@router.post("")
@router.post("/")
async def compare_policies(payload: CompareRequest, current_user: dict = Depends(get_current_user)):
    user_id = str(current_user["_id"])
    try:
        comparison_record = await comparison_service.compare_policies(
            user_id=user_id,
            policy_ids=payload.policy_ids,
        )
        return {"success": True, "comparison": comparison_record}
    except PermissionError:
        raise HTTPException(status_code=403, detail="One or more selected policies do not exist or access is restricted.")
    except ValueError as val_err:
        raise HTTPException(status_code=400, detail=str(val_err))
    except Exception as exc:
        logger.exception("Comparison error: %s", exc)
        raise HTTPException(status_code=400, detail=str(exc))


@router.get("/history")
async def get_comparison_history(current_user: dict = Depends(get_current_user)):
    u_oid = to_object_id(current_user["_id"])
    db = get_async_db()

    comparisons = (
        await db.policy_comparisons.find({"user_id": u_oid})
        .sort("created_at", -1)
        .to_list(length=100)
    )

    return {"comparisons": [serialize_doc(c) for c in comparisons]}
