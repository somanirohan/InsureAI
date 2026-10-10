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

    # Pre-populate checklist from extracted policy facts
    rag_facts = mongo_facts_to_rag_facts(policy.get("facts", []))
    checklist_resp = build_claim_checklist(rag_facts)
    checklist_items: List[Dict[str, Any]] = []

    for group in checklist_resp.get("checklist", []):
        stage = group.get("stage", "unspecified")
        for it in group.get("items", []):
            checklist_items.append({
                "item_id": it["item_id"],
                "label": it["condition"],
                "stage": stage,
                "page_cite": it.get("page"),
                "status": "required",
                "document_id": None,
            })

    # Fallback to standard checklist items if policy has none
    if not checklist_items:
        standard_items = [
            ("preauth_form", "Pre-authorization request form", "before_admission"),
            ("discharge_summary", "Original discharge summary with clinical course", "after_discharge"),
            ("final_bill", "Itemized hospital final bill and payment receipts", "after_discharge"),
            ("investigation_reports", "Diagnostic and investigation test reports", "after_discharge"),
            ("identity_proof", "Government-issued photo identification proof", "before_admission"),
        ]
        for item_id, label, stage in standard_items:
            checklist_items.append({
                "item_id": item_id,
                "label": label,
                "stage": stage,
                "page_cite": None,
                "status": "required",
                "document_id": None,
            })

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
    checklist_resp = build_claim_checklist(rag_facts)

    existing_docs = {d["item_id"]: d for d in claim.get("documents", [])}
    new_items: List[Dict[str, Any]] = []

    for group in checklist_resp.get("checklist", []):
        stage = group.get("stage", "unspecified")
        for it in group.get("items", []):
            item_id = it["item_id"]
            existing_doc = existing_docs.get(item_id)
            item_status = "validated" if existing_doc and not existing_doc.get("needs_confirmation") else ("uploaded" if existing_doc else "required")
            new_items.append({
                "item_id": item_id,
                "label": it["condition"],
                "stage": stage,
                "page_cite": it.get("page"),
                "status": item_status,
                "document_id": existing_doc.get("document_id") if existing_doc else None,
            })

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

    # Process and validate document
    claim_doc_obj = process_uploaded_claim_document(
        file_path=file_path,
        filename=orig_filename,
        item_id=item_id,
        treatment=treatment,
        expected_patient_name=patient_name,
    )
    doc_dict = claim_doc_obj.model_dump()

    # Update or append document in claim
    docs = claim.get("documents", [])
    docs = [d for d in docs if d.get("item_id") != item_id]
    docs.append(doc_dict)
    claim["documents"] = docs

    # Update checklist item status
    checklist = claim.get("checklist", [])
    item_found = False
    for it in checklist:
        if it.get("item_id") == item_id:
            item_found = True
            it["document_id"] = claim_doc_obj.document_id
            it["status"] = "needs_confirmation" if claim_doc_obj.needs_confirmation else "validated"
            break

    if not item_found:
        # Dynamically append slot if uploaded item wasn't in original checklist
        checklist.append({
            "item_id": item_id,
            "label": item_id.replace("_", " ").title(),
            "stage": "after_discharge",
            "page_cite": None,
            "status": "needs_confirmation" if claim_doc_obj.needs_confirmation else "validated",
            "document_id": claim_doc_obj.document_id,
        })
    claim["checklist"] = checklist

    # Auto-transition to docs_validated if all checklist items are validated
    all_validated = all(it.get("status") == "validated" for it in checklist)
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
