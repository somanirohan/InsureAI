"""
Policy management router for InsureAI.
Handles secure PDF file upload with MIME/size/extension validation,
policy retrieval, status polling, and cascaded deletion.
"""

from __future__ import annotations

import logging
import os
import uuid
from datetime import datetime
from typing import Optional
from bson import ObjectId
from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, UploadFile, status

try:
    from config import settings
    from db import get_async_db, serialize_doc, to_object_id
    from services.auth_service import get_current_user
    from services.policy_service import policy_service
except ImportError:
    from server.config import settings
    from server.db import get_async_db, serialize_doc, to_object_id
    from server.services.auth_service import get_current_user
    from server.services.policy_service import policy_service

logger = logging.getLogger("insureai.policies")

router = APIRouter(prefix="/api/policies", tags=["Policies"])

os.makedirs(settings.UPLOAD_DIR, exist_ok=True)


@router.post("/upload", status_code=status.HTTP_201_CREATED)
async def upload_policy(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    insurer_name: Optional[str] = Form(None),
    policy_type: Optional[str] = Form(None),
    current_user: dict = Depends(get_current_user),
):
    """
    Securely upload a policy PDF document:
      - Validates filename and .pdf extension
      - Validates application/pdf MIME type
      - Generates safe unique server-side filename (prevents path traversal)
      - Enforces max upload size limit
      - Queues background extraction and vector indexing
    """
    if not file or not file.filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No file provided.",
        )

    # 1. Validate file extension
    orig_filename = os.path.basename(file.filename)
    if not orig_filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid file format. Only PDF documents (.pdf) are supported.",
        )

    # 2. Validate MIME type
    if file.content_type and file.content_type.lower() != "application/pdf":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid MIME type '{file.content_type}'. Must be application/pdf.",
        )

    # 3. Prevent path traversal by generating a safe unique server-side filename
    safe_filename = f"{uuid.uuid4().hex}_{datetime.utcnow().strftime('%Y%m%d%H%M%S')}.pdf"
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    file_path = os.path.join(settings.UPLOAD_DIR, safe_filename)

    max_bytes = settings.MAX_FILE_SIZE_MB * 1024 * 1024
    total_written = 0

    try:
        with open(file_path, "wb") as buffer:
            while True:
                chunk = await file.read(1024 * 1024)  # 1MB buffer
                if not chunk:
                    break
                total_written += len(chunk)
                if total_written > max_bytes:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"File exceeds maximum allowed size of {settings.MAX_FILE_SIZE_MB}MB.",
                    )
                buffer.write(chunk)
    except HTTPException:
        if os.path.exists(file_path):
            os.remove(file_path)
        raise
    except Exception as exc:
        if os.path.exists(file_path):
            os.remove(file_path)
        logger.exception("Error saving uploaded file: %s", exc)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to save uploaded file on server.",
        )

    # 4. Create policy record in MongoDB
    u_oid = to_object_id(current_user["_id"])
    now = datetime.utcnow()

    policy_doc = {
        "user_id": u_oid,
        "file_name": orig_filename,
        "file_path": file_path,
        "file_size_bytes": total_written,
        "insurer_name": insurer_name,
        "policy_type": policy_type,
        "policy_number": None,
        "sum_insured": None,
        "premium_amount": None,
        "status": "uploading",
        "ocr_used": False,
        "red_flag_summary": None,
        "facts": [],
        "processing_error": None,
        "uploaded_at": now,
        "indexed_at": None,
        "updated_at": now,
    }

    db = get_async_db()
    res = await db.policies.insert_one(policy_doc)
    p_oid = res.inserted_id
    policy_doc["_id"] = str(p_oid)
    policy_doc["user_id"] = str(u_oid)

    # 5. Dispatch background extraction & indexing task
    background_tasks.add_task(
        policy_service.process_policy_document,
        str(p_oid),
        str(u_oid),
    )

    return {
        "success": True,
        "message": "Policy uploaded successfully. AI extraction pipeline started.",
        "policy": serialize_doc(policy_doc),
    }


@router.get("/")
@router.get("")
async def get_user_policies(current_user: dict = Depends(get_current_user)):
    """Retrieve all policies belonging to the authenticated user."""
    u_oid = to_object_id(current_user["_id"])
    db = get_async_db()

    policies = (
        await db.policies.find({"user_id": u_oid})
        .sort("uploaded_at", -1)
        .to_list(length=100)
    )

    return {"policies": [serialize_doc(p) for p in policies]}


@router.get("/{policy_id}")
async def get_policy_by_id(policy_id: str, current_user: dict = Depends(get_current_user)):
    """Retrieve a single policy document by ID with verification of user ownership."""
    u_oid = to_object_id(current_user["_id"])
    p_oid = to_object_id(policy_id)
    if not p_oid:
        raise HTTPException(status_code=400, detail="Invalid policy ID format.")

    db = get_async_db()
    policy = await db.policies.find_one({"_id": p_oid, "user_id": u_oid})
    if not policy:
        # Check if policy belongs to another user
        existing = await db.policies.find_one({"_id": p_oid})
        if existing:
            raise HTTPException(status_code=403, detail="Access denied to this policy.")
        raise HTTPException(status_code=404, detail="Policy document not found.")

    return {"policy": serialize_doc(policy)}


@router.delete("/{policy_id}")
async def delete_policy(policy_id: str, current_user: dict = Depends(get_current_user)):
    """Cascade delete a policy and its isolated Chroma collection."""
    u_oid = to_object_id(current_user["_id"])
    p_oid = to_object_id(policy_id)
    if not p_oid:
        raise HTTPException(status_code=400, detail="Invalid policy ID format.")

    try:
        result = await policy_service.delete_policy_cascade(str(u_oid), str(p_oid))
        return result
    except PermissionError:
        raise HTTPException(status_code=403, detail="Access denied or policy not found.")
    except Exception as exc:
        logger.exception("Error deleting policy: %s", exc)
        raise HTTPException(status_code=400, detail=str(exc))
