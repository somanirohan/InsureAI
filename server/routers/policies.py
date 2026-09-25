import os
import shutil
from datetime import datetime
from typing import Optional
from bson import ObjectId
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File, Form, BackgroundTasks, status

try:
    from services.auth_service import get_current_user
    from services.policy_service import policy_service
    from db import get_async_db
    from config import settings
except ImportError:
    from server.services.auth_service import get_current_user
    from server.services.policy_service import policy_service
    from server.db import get_async_db
    from server.config import settings

router = APIRouter(prefix="/api/policies", tags=["Policies"])

os.makedirs(settings.UPLOAD_DIR, exist_ok=True)

@router.post("/upload", status_code=status.HTTP_201_CREATED)
async def upload_policy(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    insurer_name: Optional[str] = Form("Star Health & Allied Insurance"),
    policy_type: Optional[str] = Form("individual_health"),
    current_user: dict = Depends(get_current_user)
):
    if not file.filename:
        raise HTTPException(status_code=400, detail="No policy file uploaded")

    user_id = str(current_user["_id"])
    saved_filename = f"{int(datetime.utcnow().timestamp())}_{file.filename}"
    file_path = os.path.join(settings.UPLOAD_DIR, saved_filename)

    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(file.file, buffer)

    file_size = os.path.getsize(file_path)

    policy_doc = {
        "user_id": user_id,
        "file_name": file.filename,
        "file_path": file_path,
        "file_size_bytes": file_size,
        "insurer_name": insurer_name,
        "policy_type": policy_type,
        "policy_number": None,
        "sum_insured": None,
        "premium_amount": None,
        "status": "uploading",
        "ocr_used": False,
        "red_flag_summary": None,
        "facts": [],
        "uploaded_at": datetime.utcnow(),
        "indexed_at": None,
        "updated_at": datetime.utcnow()
    }

    db = get_async_db()
    res = await db.policies.insert_one(policy_doc)
    policy_id = str(res.inserted_id)
    policy_doc["_id"] = policy_id

    background_tasks.add_task(policy_service.process_policy_document, policy_id, user_id)

    return {
        "success": True,
        "message": "Policy uploaded successfully. Extraction pipeline queued in background.",
        "policy": policy_doc
    }

@router.get("/")
async def get_user_policies(current_user: dict = Depends(get_current_user)):
    db = get_async_db()
    user_id = str(current_user["_id"])

    policies = await db.policies.find({"user_id": user_id}).sort("uploaded_at", -1).to_list(length=100)
    for p in policies:
        p["_id"] = str(p["_id"])

    return {"policies": policies}

@router.get("/{policy_id}")
async def get_policy_by_id(policy_id: str, current_user: dict = Depends(get_current_user)):
    db = get_async_db()
    user_id = str(current_user["_id"])

    try:
        p_id = ObjectId(policy_id)
    except Exception:
        p_id = policy_id

    policy = await db.policies.find_one({"_id": p_id, "user_id": user_id})
    if not policy:
        raise HTTPException(status_code=404, detail="Policy document not found")

    policy["_id"] = str(policy["_id"])
    return {"policy": policy}

@router.delete("/{policy_id}")
async def delete_policy(policy_id: str, current_user: dict = Depends(get_current_user)):
    user_id = str(current_user["_id"])
    try:
        result = await policy_service.delete_policy_cascade(user_id, policy_id)
        return result
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
