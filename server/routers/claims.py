"""
Claim processing workflow router for InsureAI.
Coordinates end-to-end claim lifecycle from creation to manual settlement tracking.
Enforces ownership validation, deterministic eligibility, document validation,
qualitative readiness checks, and immutable timeline logging.
"""

from __future__ import annotations

import logging
import os
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional
from bson import ObjectId
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel

try:
    from config import settings
    from db import get_async_db, serialize_doc, to_object_id
    from services.auth_service import get_current_user
    from services.fact_mapper import mongo_facts_to_rag_facts
except ImportError:
    from server.config import settings
    from server.db import get_async_db, serialize_doc, to_object_id
    from server.services.auth_service import get_current_user
    from server.services.fact_mapper import mongo_facts_to_rag_facts

from app.claims.builder import build_claim_workflow_checklist
from app.claims.documents import process_uploaded_claim_document, validate_document
from app.claims.eligibility import evaluate_eligibility
from app.claims.models import (
    ChecklistItem,
    Claim,
    ClaimDocument,
    ConfirmDocumentFieldsRequest,
    CreateClaimRequest,
    TreatmentDetails,
    UpdateStatusRequest,
    UpdateTreatmentRequest,
)
from app.claims.readiness import compute_claim_readiness
from app.claims.settlement import calculate_settlement_estimate
from app.claims.transitions import transition_claim, validate_claim_transition
from app.rag.checklist import build_claim_checklist

logger = logging.getLogger("insureai.claims")

router = APIRouter(prefix="/api/claims", tags=["Claims"])


# ── Helper Functions ──────────────────────────────────────────────────────────

async def _get_claim_or_404(claim_id: str, user_id: str) -> Dict[str, Any]:
    """Retrieve claim and verify ownership."""
    db = get_async_db()
    claim = await db.claims.find_one({"claim_id": claim_id, "user_id": user_id})
    if not claim:
        # Check if exists for another user
        existing = await db.claims.find_one({"claim_id": claim_id})
        if existing:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied to this claim.")
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Claim not found.")
    return claim


async def _get_policy_or_404(policy_id: str, user_id: str) -> Dict[str, Any]:
    """Retrieve policy and verify ownership."""
    db = get_async_db()
    p_oid = to_object_id(policy_id)
    if not p_oid:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid policy ID format.")
    u_oid = to_object_id(user_id)
    policy = await db.policies.find_one({"_id": p_oid, "user_id": u_oid})
    if not policy:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Policy not found or access denied.")
    return policy


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("", status_code=status.HTTP_201_CREATED)
@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_claim(
    payload: CreateClaimRequest,
    current_user: dict = Depends(get_current_user),
):
    """Create a new claim against an uploaded policy."""
    user_id = str(current_user["_id"])
    policy = await _get_policy_or_404(payload.policy_id, user_id)

    claim_id = str(uuid.uuid4())
    now_iso = datetime.utcnow().isoformat()

    # Pre-populate checklist using deterministic workflow checklist builder
    rag_facts = mongo_facts_to_rag_facts(policy.get("facts", []))
    workflow_items = build_claim_workflow_checklist(rag_facts)
    checklist_items: List[Dict[str, Any]] = [item.model_dump() for item in workflow_items]

    claim_doc: Dict[str, Any] = {
        "claim_id": claim_id,
        "user_id": user_id,
        "policy_id": str(policy["_id"]),
        "status": "draft",
        "treatment": None,
        "eligibility_result": None,
        "checklist": checklist_items,
        "documents": [],
        "settlement_estimate": None,
        "timeline": [
            {
                "timestamp": now_iso,
                "event": "Claim draft initialized",
                "note": f"Claim created for policy {policy.get('policy_number') or policy.get('file_name', '')}",
            }
        ],
        "created_at": now_iso,
        "updated_at": now_iso,
    }

    db = get_async_db()
    await db.claims.insert_one(claim_doc)

    return {"success": True, "claim": serialize_doc(claim_doc)}


@router.get("")
@router.get("/")
async def list_claims(current_user: dict = Depends(get_current_user)):
    """Retrieve all claims for the current user."""
    user_id = str(current_user["_id"])
    db = get_async_db()
    claims = await db.claims.find({"user_id": user_id}).sort("created_at", -1).to_list(100)
    return {"claims": [serialize_doc(c) for c in claims]}


@router.get("/{claim_id}")
async def get_claim(claim_id: str, current_user: dict = Depends(get_current_user)):
    """Retrieve a single claim by claim_id."""
    user_id = str(current_user["_id"])
    claim = await _get_claim_or_404(claim_id, user_id)
    return {"claim": serialize_doc(claim)}


@router.put("/{claim_id}/treatment")
async def update_treatment(
    claim_id: str,
    payload: UpdateTreatmentRequest,
    current_user: dict = Depends(get_current_user),
):
    """Update treatment details for a claim."""
    user_id = str(current_user["_id"])
    claim = await _get_claim_or_404(claim_id, user_id)

    now_iso = datetime.utcnow().isoformat()
    treatment_data = payload.model_dump()

    timeline = claim.get("timeline", [])
    timeline.append({
        "timestamp": now_iso,
        "event": "Treatment details updated",
        "note": f"Treatment set to '{payload.name}' at '{payload.hospital}'",
    })

    db = get_async_db()
    await db.claims.update_one(
        {"claim_id": claim_id},
        {"$set": {
            "treatment": treatment_data,
            "timeline": timeline,
            "updated_at": now_iso,
        }}
    )

    claim["treatment"] = treatment_data
    claim["timeline"] = timeline
    return {"success": True, "claim": serialize_doc(claim)}


@router.post("/{claim_id}/eligibility")
async def evaluate_claim_eligibility(
    claim_id: str,
    current_user: dict = Depends(get_current_user),
):
    """
    Run deterministic claim eligibility checks against policy facts.
    Transitions claim from 'draft' to 'eligibility_checked'.
    """
    user_id = str(current_user["_id"])
    claim = await _get_claim_or_404(claim_id, user_id)

    if not claim.get("treatment"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot evaluate eligibility: treatment details are missing.",
        )

    treatment = TreatmentDetails(**claim["treatment"])
    policy = await _get_policy_or_404(claim["policy_id"], user_id)
    rag_facts = mongo_facts_to_rag_facts(policy.get("facts", []))

    policy_start_date = policy.get("policy_start_date") or policy.get("uploaded_at")
    if isinstance(policy_start_date, datetime):
        policy_start_date = policy_start_date.strftime("%Y-%m-%d")

    eligibility_res = evaluate_eligibility(
        policy_facts=rag_facts,
        treatment=treatment,
        policy_start_date=str(policy_start_date) if policy_start_date else None,
    )

    # Transition status
    if claim.get("status") == "draft":
        transition_claim(
            claim,
            target_status="eligibility_checked",
            event_label="Eligibility evaluated",
            note="Completed 5 deterministic policy checks",
        )
    else:
        now_iso = datetime.utcnow().isoformat()
        claim.setdefault("timeline", []).append({
            "timestamp": now_iso,
            "event": "Eligibility re-evaluated",
            "note": "Re-ran 5 deterministic policy checks",
        })

    claim["eligibility_result"] = eligibility_res.model_dump()
    claim["updated_at"] = datetime.utcnow().isoformat()

    db = get_async_db()
    await db.claims.update_one(
        {"claim_id": claim_id},
        {"$set": {
            "status": claim["status"],
            "eligibility_result": claim["eligibility_result"],
            "timeline": claim["timeline"],
            "updated_at": claim["updated_at"],
        }}
    )

    return {"success": True, "claim": serialize_doc(claim), "eligibility_result": eligibility_res.model_dump()}


@router.post("/{claim_id}/checklist")
async def refresh_claim_checklist(
    claim_id: str,
    current_user: dict = Depends(get_current_user),
):
    """
    Generate or refresh the policy-cited claim checklist.
    Transitions claim to 'docs_pending' if at 'eligibility_checked'.
    """
    user_id = str(current_user["_id"])
    claim = await _get_claim_or_404(claim_id, user_id)
    policy = await _get_policy_or_404(claim["policy_id"], user_id)

    rag_facts = mongo_facts_to_rag_facts(policy.get("facts", []))
    treatment = claim.get("treatment") or {}
    adm_date = treatment.get("admission_date")
    dis_date = treatment.get("discharge_date")

    workflow_items = build_claim_workflow_checklist(
        rag_facts,
        admission_date=adm_date,
        discharge_date=dis_date,
    )

    existing_items = {it["item_id"]: it for it in claim.get("checklist", [])}
    existing_docs = {d["item_id"]: d for d in claim.get("documents", [])}
    new_items: List[Dict[str, Any]] = []

    for w_it in workflow_items:
        item_dict = w_it.model_dump()
        item_id = item_dict["item_id"]

        if item_dict["kind"] == "requirement":
            if item_id in existing_items and existing_items[item_id].get("status") == "done":
                item_dict["status"] = "done"
        else:
            existing_doc = existing_docs.get(item_id)
            if existing_doc:
                item_dict["document_id"] = existing_doc.get("document_id")
                item_dict["status"] = "needs_confirmation" if existing_doc.get("needs_confirmation") else "validated"

        new_items.append(item_dict)

    if not new_items:
        new_items = claim.get("checklist", [])

    claim["checklist"] = new_items

    if claim.get("status") == "eligibility_checked":
        transition_claim(
            claim,
            target_status="docs_pending",
            event_label="Checklist confirmed",
            note=f"Initialized {len(new_items)} checklist items for document collection",
        )

    now_iso = datetime.utcnow().isoformat()
    claim["updated_at"] = now_iso

    db = get_async_db()
    await db.claims.update_one(
        {"claim_id": claim_id},
        {"$set": {
            "status": claim["status"],
            "checklist": claim["checklist"],
            "timeline": claim["timeline"],
            "updated_at": claim["updated_at"],
        }}
    )

    return {"success": True, "claim": serialize_doc(claim)}


class MarkRequirementDoneRequest(BaseModel):
    done: bool = True
    note: Optional[str] = None


@router.put("/{claim_id}/checklist/{item_id}/done")
async def mark_checklist_item_done(
    claim_id: str,
    item_id: str,
    payload: Optional[MarkRequirementDoneRequest] = None,
    current_user: dict = Depends(get_current_user),
):
    """
    Mark a requirement checklist item as done or pending (user-attested).
    Rejects document slots with HTTP 400.
    Appends an immutable timeline entry.
    """
    user_id = str(current_user["_id"])
    claim = await _get_claim_or_404(claim_id, user_id)

    is_done = payload.done if payload is not None else True
    user_note = payload.note if payload is not None else None

    checklist = claim.get("checklist", [])
    target_item = next((it for it in checklist if it.get("item_id") == item_id), None)
    if not target_item:
        raise HTTPException(status_code=404, detail=f"Checklist item '{item_id}' not found.")

    if target_item.get("kind") == "document":
        raise HTTPException(
            status_code=400,
            detail=f"Cannot mark document item '{item_id}' as done. Upload a document file instead.",
        )

    target_status = "done" if is_done else "pending"
    target_item["status"] = target_status

    now_iso = datetime.utcnow().isoformat()
    action_str = "completed" if is_done else "pending"
    claim.setdefault("timeline", []).append({
        "timestamp": now_iso,
        "event": f"Requirement '{target_item.get('label')}' marked as {action_str}",
        "note": user_note or f"Action item '{item_id}' self-attested as {action_str}",
    })

    claim["updated_at"] = now_iso
    db = get_async_db()
    await db.claims.update_one(
        {"claim_id": claim_id},
        {"$set": {
            "checklist": claim["checklist"],
            "timeline": claim["timeline"],
            "updated_at": claim["updated_at"],
        }}
    )

    return {"success": True, "claim": serialize_doc(claim), "item": target_item}


@router.post("/{claim_id}/documents", status_code=status.HTTP_201_CREATED)
async def upload_claim_document(
    claim_id: str,
    file: UploadFile = File(...),
    item_id: str = Form(...),
    current_user: dict = Depends(get_current_user),
):
    """
    Upload a document for a specific checklist slot.
    Extracts fields with confidence and applies 5 deterministic validators.
    """
    user_id = str(current_user["_id"])
    claim = await _get_claim_or_404(claim_id, user_id)

    if not file or not file.filename:
        raise HTTPException(status_code=400, detail="No file provided.")

    orig_filename = os.path.basename(file.filename)
    ext = Path(orig_filename).suffix.lower()
    if ext not in (".pdf", ".png", ".jpg", ".jpeg"):
        raise HTTPException(
            status_code=400,
            detail="Unsupported format. Only PDF, PNG, JPG files are allowed.",
        )

    # Check if item_id is an action/deadline requirement slot or unknown
    checklist = claim.get("checklist", [])
    target_slot = next((it for it in checklist if it.get("item_id") == item_id), None)

    if target_slot:
        if target_slot.get("kind") == "requirement":
            # Optional proof upload ONLY for preauthorisation (links to preauth_approval_letter)
            if item_id in ("preauthorisation", "preauth_form", "preauth_approval_letter"):
                pass
            else:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"Item '{item_id}' is an action/deadline requirement, not an uploadable document slot. Mark it as done instead of uploading a file.",
                )
    else:
        from app.claims.checklist_vocabulary import DOCUMENT_TYPES, REQUIREMENT_TYPES
        if item_id in REQUIREMENT_TYPES and item_id not in ("preauthorisation", "preauth_form"):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Item '{item_id}' is an action/deadline requirement, not an uploadable document slot. Mark it as done instead of uploading a file.",
            )
        elif item_id not in DOCUMENT_TYPES and not item_id.startswith("other_"):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Unknown checklist item slot '{item_id}'.",
            )

    # Delete previous document file from disk if re-uploading to the same slot
    existing_doc_for_slot = next((d for d in claim.get("documents", []) if d.get("item_id") == item_id), None)
    if existing_doc_for_slot and existing_doc_for_slot.get("file_path"):
        old_fpath = existing_doc_for_slot["file_path"]
        if os.path.exists(old_fpath):
            try:
                os.remove(old_fpath)
                logger.info("[%s] Deleted previous document file from disk: %s", claim_id, old_fpath)
            except OSError as err:
                logger.warning("[%s] Failed to delete previous document file %s: %s", claim_id, old_fpath, err)

    # Save file safely
    doc_dir = os.path.join(settings.UPLOAD_DIR, "claims", claim_id)
    os.makedirs(doc_dir, exist_ok=True)
    safe_name = f"{uuid.uuid4().hex}{ext}"
    file_path = os.path.join(doc_dir, safe_name)

    content = await file.read()
    with open(file_path, "wb") as f:
        f.write(content)

    treatment = TreatmentDetails(**claim["treatment"]) if claim.get("treatment") else None
    patient_name = current_user.get("full_name") or current_user.get("name") or current_user.get("email", "").split("@")[0]

    # Process and validate document (clears old validation results completely)
    claim_doc_obj = process_uploaded_claim_document(
        file_path=file_path,
        filename=orig_filename,
        item_id=item_id,
        treatment=treatment,
        expected_patient_name=patient_name,
        claim_id=claim_id,
    )
    doc_dict = claim_doc_obj.model_dump()

    # Update or append document in claim (replaces old validation state completely)
    docs = claim.get("documents", [])
    docs = [d for d in docs if d.get("item_id") != item_id]
    docs.append(doc_dict)
    claim["documents"] = docs

    # Update checklist item status
    item_found = False
    for it in checklist:
        if it.get("item_id") == item_id:
            item_found = True
            it["document_id"] = claim_doc_obj.document_id
            if it.get("kind") == "requirement":
                it["status"] = "done"
            else:
                it["status"] = "needs_confirmation" if claim_doc_obj.needs_confirmation else "validated"
            break

    if not item_found:
        # Dynamically append slot if uploaded item wasn't in original checklist
        checklist.append({
            "item_id": item_id,
            "kind": "document",
            "label": item_id.replace("_", " ").title(),
            "stage": "after_discharge",
            "page_cite": None,
            "status": "needs_confirmation" if claim_doc_obj.needs_confirmation else "validated",
            "document_id": claim_doc_obj.document_id,
        })
    claim["checklist"] = checklist

    # Auto-transition to docs_validated if all policy-sourced document items are validated
    policy_docs = [
        it for it in checklist
        if it.get("kind", "document") == "document" and it.get("source", "policy") == "policy"
    ]
    all_validated = all(it.get("status") == "validated" for it in policy_docs) if policy_docs else all(it.get("status") == "validated" for it in checklist)
    if all_validated and claim.get("status") == "docs_pending":
        transition_claim(
            claim,
            target_status="docs_validated",
            event_label="All documents validated",
            note="All checklist slots fulfilled without pending confirmation issues",
        )
    else:
        now_iso = datetime.utcnow().isoformat()
        claim.setdefault("timeline", []).append({
            "timestamp": now_iso,
            "event": "Document uploaded",
            "note": f"Uploaded '{orig_filename}' for slot '{item_id}'",
        })

    claim["updated_at"] = datetime.utcnow().isoformat()
    db = get_async_db()
    await db.claims.update_one(
        {"claim_id": claim_id},
        {"$set": {
            "documents": claim["documents"],
            "checklist": claim["checklist"],
            "status": claim["status"],
            "timeline": claim["timeline"],
            "updated_at": claim["updated_at"],
        }}
    )

    return {"success": True, "claim": serialize_doc(claim), "document": doc_dict}


@router.post("/{claim_id}/documents/{document_id}/reprocess")
async def reprocess_claim_document(
    claim_id: str,
    document_id: str,
    current_user: dict = Depends(get_current_user),
):
    """
    Re-run the full extraction and validation pipeline on an already uploaded document.
    Clears old validation issues and updates checklist status.
    """
    user_id = str(current_user["_id"])
    claim = await _get_claim_or_404(claim_id, user_id)

    target_doc = next((d for d in claim.get("documents", []) if d.get("document_id") == document_id), None)
    if not target_doc:
        raise HTTPException(status_code=404, detail="Document not found on this claim.")

    file_path = target_doc.get("file_path")
    if not file_path or not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Document file not found on disk.")

    treatment = TreatmentDetails(**claim["treatment"]) if claim.get("treatment") else None
    patient_name = current_user.get("full_name") or current_user.get("name") or current_user.get("email", "").split("@")[0]

    # Re-run full pipeline
    processed_doc = process_uploaded_claim_document(
        file_path=file_path,
        filename=target_doc.get("filename", "document"),
        item_id=target_doc.get("item_id", ""),
        treatment=treatment,
        expected_patient_name=patient_name,
        claim_id=claim_id,
        existing_document_id=document_id,
    )
    doc_dict = processed_doc.model_dump()

    # Update document in claim
    docs = [d for d in claim.get("documents", []) if d.get("document_id") != document_id]
    docs.append(doc_dict)
    claim["documents"] = docs

    # Update checklist item status
    for it in claim.get("checklist", []):
        if it.get("document_id") == document_id:
            it["status"] = "needs_confirmation" if processed_doc.needs_confirmation else "validated"
            break

    now_iso = datetime.utcnow().isoformat()
    claim.setdefault("timeline", []).append({
        "timestamp": now_iso,
        "event": "Document re-processed",
        "note": f"Re-ran OCR extraction on '{target_doc.get('filename')}'",
    })
    claim["updated_at"] = now_iso

    db = get_async_db()
    await db.claims.update_one(
        {"claim_id": claim_id},
        {"$set": {
            "documents": claim["documents"],
            "checklist": claim["checklist"],
            "timeline": claim["timeline"],
            "updated_at": claim["updated_at"],
        }}
    )

    return {"success": True, "claim": serialize_doc(claim), "document": doc_dict}


@router.post("/{claim_id}/documents/{document_id}/validate")
async def revalidate_claim_document(
    claim_id: str,
    document_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Re-run deterministic validators on an existing uploaded document."""
    user_id = str(current_user["_id"])
    claim = await _get_claim_or_404(claim_id, user_id)

    target_doc = next((d for d in claim.get("documents", []) if d.get("document_id") == document_id), None)
    if not target_doc:
        raise HTTPException(status_code=404, detail="Document not found on this claim.")

    treatment = TreatmentDetails(**claim["treatment"]) if claim.get("treatment") else None
    patient_name = current_user.get("full_name") or current_user.get("name") or current_user.get("email", "").split("@")[0]

    issues, needs_conf = validate_document(
        extracted_fields=target_doc.get("extracted_fields", {}),
        field_confidence=target_doc.get("field_confidence", {}),
        item_id=target_doc.get("item_id", ""),
        treatment=treatment,
        expected_patient_name=patient_name,
    )

    target_doc["validation_issues"] = issues
    target_doc["needs_confirmation"] = needs_conf

    # Update checklist item
    for it in claim.get("checklist", []):
        if it.get("document_id") == document_id:
            it["status"] = "needs_confirmation" if needs_conf else "validated"
            break

    claim["updated_at"] = datetime.utcnow().isoformat()
    db = get_async_db()
    await db.claims.update_one(
        {"claim_id": claim_id},
        {"$set": {
            "documents": claim["documents"],
            "checklist": claim["checklist"],
            "updated_at": claim["updated_at"],
        }}
    )

    return {"success": True, "document": target_doc}


@router.put("/{claim_id}/documents/{document_id}/confirm")
async def confirm_document_fields(
    claim_id: str,
    document_id: str,
    payload: ConfirmDocumentFieldsRequest,
    current_user: dict = Depends(get_current_user),
):
    """User manually confirms or updates extracted fields on a flagged document."""
    user_id = str(current_user["_id"])
    claim = await _get_claim_or_404(claim_id, user_id)

    target_doc = next((d for d in claim.get("documents", []) if d.get("document_id") == document_id), None)
    if not target_doc:
        raise HTTPException(status_code=404, detail="Document not found on this claim.")

    # Apply confirmed fields
    target_doc["extracted_fields"].update(payload.confirmed_fields)
    if payload.line_items is not None:
        target_doc["line_items"] = [li.model_dump() for li in payload.line_items]
    target_doc["needs_confirmation"] = False
    target_doc["validation_issues"] = []  # User has explicitly verified fields

    # Update checklist status
    for it in claim.get("checklist", []):
        if it.get("document_id") == document_id:
            it["status"] = "validated"
            break

    # Check if all items are now validated
    checklist = claim.get("checklist", [])
    if all(it.get("status") == "validated" for it in checklist) and claim.get("status") == "docs_pending":
        transition_claim(
            claim,
            target_status="docs_validated",
            event_label="All documents validated",
            note="Manual confirmation resolved remaining document issues",
        )
    else:
        now_iso = datetime.utcnow().isoformat()
        claim.setdefault("timeline", []).append({
            "timestamp": now_iso,
            "event": "Document fields confirmed",
            "note": f"User confirmed fields for document '{target_doc.get('filename')}'",
        })

    claim["updated_at"] = datetime.utcnow().isoformat()
    db = get_async_db()
    await db.claims.update_one(
        {"claim_id": claim_id},
        {"$set": {
            "documents": claim["documents"],
            "checklist": claim["checklist"],
            "status": claim["status"],
            "timeline": claim["timeline"],
            "updated_at": claim["updated_at"],
        }}
    )

    return {"success": True, "claim": serialize_doc(claim), "document": target_doc}


@router.post("/{claim_id}/settlement")
async def calculate_claim_settlement(
    claim_id: str,
    current_user: dict = Depends(get_current_user),
):
    """
    Calculate deterministic settlement estimate.
    Uses 'uploaded_bill' basis if a valid bill exists, else 'pre_treatment_estimate'.
    """
    user_id = str(current_user["_id"])
    claim_dict = await _get_claim_or_404(claim_id, user_id)
    policy = await _get_policy_or_404(claim_dict["policy_id"], user_id)
    rag_facts = mongo_facts_to_rag_facts(policy.get("facts", []))

    claim_model = Claim(**claim_dict)
    settlement_estimate = calculate_settlement_estimate(claim_model, rag_facts)

    now_iso = datetime.utcnow().isoformat()
    claim_dict.setdefault("timeline", []).append({
        "timestamp": now_iso,
        "event": "Settlement estimate computed",
        "note": f"Estimated payable: ₹{settlement_estimate.total:,.2f} (basis: {settlement_estimate.basis})",
    })

    claim_dict["settlement_estimate"] = settlement_estimate.model_dump()
    claim_dict["updated_at"] = now_iso

    db = get_async_db()
    await db.claims.update_one(
        {"claim_id": claim_id},
        {"$set": {
            "settlement_estimate": claim_dict["settlement_estimate"],
            "timeline": claim_dict["timeline"],
            "updated_at": claim_dict["updated_at"],
        }}
    )

    return {"success": True, "settlement_estimate": settlement_estimate.model_dump()}


@router.get("/{claim_id}/review")
async def get_claim_review(
    claim_id: str,
    current_user: dict = Depends(get_current_user),
):
    """
    Aggregate the complete submission package review screen.
    Includes qualitative readiness counts, aggregated flags, and blocking checks.
    """
    user_id = str(current_user["_id"])
    claim_dict = await _get_claim_or_404(claim_id, user_id)
    policy = await _get_policy_or_404(claim_dict["policy_id"], user_id)

    claim_model = Claim(**claim_dict)
    readiness = compute_claim_readiness(claim_model)

    return {
        "claim": serialize_doc(claim_dict),
        "policy": {
            "policy_id": str(policy["_id"]),
            "policy_number": policy.get("policy_number"),
            "insurer_name": policy.get("insurer_name"),
            "sum_insured": policy.get("sum_insured"),
        },
        "readiness": readiness.model_dump(),
        "settlement_estimate": claim_dict.get("settlement_estimate"),
        "can_submit": readiness.can_submit,
        "submission_blockers": readiness.submission_blockers,
    }


@router.post("/{claim_id}/status")
async def update_claim_status(
    claim_id: str,
    payload: UpdateStatusRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    Transition claim lifecycle status with state machine and readiness guard.
    Moving to 'ready_to_submit' enforces zero blockers and all items complete.
    Manual tracking post-submission is explicitly logged.
    """
    user_id = str(current_user["_id"])
    claim_dict = await _get_claim_or_404(claim_id, user_id)

    # Readiness guard for ready_to_submit
    if payload.status == "ready_to_submit":
        claim_model = Claim(**claim_dict)
        readiness = compute_claim_readiness(claim_model)
        if not readiness.can_submit:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot transition to 'ready_to_submit': {'; '.join(readiness.submission_blockers)}",
            )

    # Perform validated state machine transition (raises 409 if invalid)
    transition_claim(
        claim_dict,
        target_status=payload.status,
        note=payload.note,
        event_label=f"Status set to '{payload.status}'",
    )

    db = get_async_db()
    await db.claims.update_one(
        {"claim_id": claim_id},
        {"$set": {
            "status": claim_dict["status"],
            "timeline": claim_dict["timeline"],
            "updated_at": claim_dict["updated_at"],
        }}
    )

    return {"success": True, "claim": serialize_doc(claim_dict)}


@router.get("/{claim_id}/timeline")
async def get_claim_timeline(
    claim_id: str,
    current_user: dict = Depends(get_current_user),
):
    """Retrieve immutable timeline log for the claim."""
    user_id = str(current_user["_id"])
    claim = await _get_claim_or_404(claim_id, user_id)
    return {"timeline": claim.get("timeline", [])}


@router.delete("/{claim_id}", status_code=status.HTTP_200_OK)
async def delete_claim(
    claim_id: str,
    current_user: dict = Depends(get_current_user),
):
    """
    Delete a claim, its MongoDB record, and all associated document files on disk.
    Enforces ownership check.
    """
    import shutil
    user_id = str(current_user["_id"])
    claim = await _get_claim_or_404(claim_id, user_id)

    db = get_async_db()
    # 1. Delete MongoDB claim record
    del_res = await db.claims.delete_one({"claim_id": claim_id, "user_id": user_id})
    if del_res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Claim not found or access denied.")

    # 2. Delete uploads folder on disk for this claim
    claim_dir = os.path.join(settings.UPLOAD_DIR, "claims", claim_id)
    if os.path.exists(claim_dir):
        try:
            shutil.rmtree(claim_dir, ignore_errors=True)
            logger.info("Deleted claim uploads directory: %s", claim_dir)
        except Exception as exc:
            logger.warning("Failed to remove claim directory %s: %s", claim_dir, exc)

    return {
        "success": True,
        "message": f"Claim {claim_id} and all associated files deleted successfully.",
    }


# ── Semantic Evidence Matching & Verification Endpoints ───────────────────────

@router.post("/{claim_id}/evidence/match")
async def match_policy_evidence_for_claim(
    claim_id: str,
    current_user: dict = Depends(get_current_user),
):
    """
    Run semantic matching and verification of claim line items and treatment against policy clauses.
    Stores results in claim.evidence_matches with verbatim excerpts, verdicts, and declared confidence.
    """
    from app.claims.models import ConfirmEvidenceMatchRequest, EvidenceMatch
    from app.claims.semantic.verifier import match_and_verify_item

    user_id = str(current_user["_id"])
    claim = await _get_claim_or_404(claim_id, user_id)
    policy_id = claim.get("policy_id")
    if not policy_id:
        raise HTTPException(status_code=400, detail="Claim has no associated policy.")

    # Gather items to match: line items from uploaded bills, or treatment name
    items_to_match: List[str] = []
    for doc in claim.get("documents", []):
        for li in doc.get("line_items", []):
            desc = li.get("description", "").strip()
            if desc and desc not in items_to_match:
                items_to_match.append(desc)

    treatment = claim.get("treatment")
    if treatment and treatment.get("name"):
        t_name = treatment["name"].strip()
        if t_name not in items_to_match:
            items_to_match.append(t_name)

    if not items_to_match:
        return {"success": True, "matches": [], "message": "No line items or treatment details available to match."}

    existing_matches = {m.get("item_description"): m for m in claim.get("evidence_matches", [])}
    new_matches: List[Dict[str, Any]] = []

    for item_desc in items_to_match:
        # If user already confirmed a match for this item, preserve it
        if item_desc in existing_matches and existing_matches[item_desc].get("user_confirmed"):
            new_matches.append(existing_matches[item_desc])
            continue

        verified = match_and_verify_item(str(policy_id), item_desc)
        match_record = EvidenceMatch(
            match_id=f"ev_{uuid.uuid4().hex[:8]}",
            item_description=item_desc,
            clause_id=verified.clause_id,
            clause_title=verified.clause_title,
            clause_type=verified.clause_type,
            page=verified.page,
            supporting_excerpt=verified.supporting_excerpt,
            verdict=verified.verdict,
            confidence=verified.confidence,
            review_reason=verified.review_reason,
            similarity_score=verified.similarity_score,
            is_fallback=verified.is_fallback,
            fallback_notice=verified.fallback_notice,
            user_confirmed=False,
        ).model_dump()
        new_matches.append(match_record)

    db = get_async_db()
    await db.claims.update_one(
        {"claim_id": claim_id, "user_id": user_id},
        {"$set": {
            "evidence_matches": new_matches,
            "updated_at": datetime.utcnow().isoformat(),
        }}
    )

    return {"success": True, "matches": new_matches}


@router.get("/{claim_id}/evidence")
async def get_policy_evidence_for_claim(
    claim_id: str,
    current_user: dict = Depends(get_current_user),
):
    """
    Retrieve current policy evidence matches for a claim.
    """
    user_id = str(current_user["_id"])
    claim = await _get_claim_or_404(claim_id, user_id)
    return {"evidence_matches": claim.get("evidence_matches", [])}


@router.put("/{claim_id}/evidence/{match_id}/confirm")
async def confirm_policy_evidence_match(
    claim_id: str,
    match_id: str,
    req: ConfirmEvidenceMatchRequest,
    current_user: dict = Depends(get_current_user),
):
    """
    Allow user or reviewer to confirm, accept, or override a policy evidence match.
    """
    user_id = str(current_user["_id"])
    claim = await _get_claim_or_404(claim_id, user_id)
    matches = claim.get("evidence_matches", [])

    target_match = next((m for m in matches if m.get("match_id") == match_id), None)
    if not target_match:
        raise HTTPException(status_code=404, detail=f"Evidence match '{match_id}' not found.")

    target_match["user_confirmed"] = req.user_confirmed
    target_match["confirmed_by"] = user_id
    if req.verdict:
        target_match["verdict"] = req.verdict
    if req.note:
        target_match["review_reason"] = f"{target_match.get('review_reason') or ''} [User Note: {req.note}]".strip()

    db = get_async_db()
    await db.claims.update_one(
        {"claim_id": claim_id, "user_id": user_id},
        {"$set": {
            "evidence_matches": matches,
            "updated_at": datetime.utcnow().isoformat(),
        }}
    )

    return {"success": True, "match": target_match}
