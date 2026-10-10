"""
Pydantic and MongoDB schema definitions for Claim Processing Workflow.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, Field

# ── Status Types ─────────────────────────────────────────────────────────────

ClaimStatusType = Literal[
    "draft",
    "eligibility_checked",
    "docs_pending",
    "docs_validated",
    "ready_to_submit",
    "submitted",
    "under_review",
    "settled",
    "rejected",
    "query_raised",
]

ChecklistItemStatusType = Literal[
    "required",
    "uploaded",
    "validated",
    "flagged",
    "needs_confirmation",
    "pending",
    "done",
]

CheckResultType = Literal["pass", "fail", "flag", "unable_to_determine"]
FlagSeverityType = Literal["info", "worth-confirming", "blocking"]
SettlementBasisType = Literal["pre_treatment_estimate", "uploaded_bill"]


# ── Sub-models ───────────────────────────────────────────────────────────────

class TreatmentDetails(BaseModel):
    name: str = Field(..., min_length=2, description="Treatment or procedure name")
    hospital: str = Field(..., min_length=2, description="Hospital name")
    admission_date: str = Field(..., description="Admission date in ISO string format (YYYY-MM-DD)")
    discharge_date: Optional[str] = Field(None, description="Discharge date in ISO string format (YYYY-MM-DD)")
    room_type: str = Field(default="Single Private AC", description="Eligible or chosen room type")
    estimated_cost: float = Field(..., gt=0, description="Estimated or billed treatment cost")


class EligibilityCheck(BaseModel):
    check: str
    result: CheckResultType
    detail: str
    source: str


class EligibilityFlag(BaseModel):
    flag_id: str
    label: str
    severity: FlagSeverityType
    detail: str
    citation: Optional[str] = None
    item_id: Optional[str] = None


class EligibilityResult(BaseModel):
    checks: List[EligibilityCheck] = Field(default_factory=list)
    flags: List[EligibilityFlag] = Field(default_factory=list)
    evaluated_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())


class ChecklistItem(BaseModel):
    item_id: str
    kind: Literal["document", "requirement"] = "document"
    label: str
    description: Optional[str] = None
    stage: str = "unspecified"
    page_cite: Optional[int] = None
    original_text: str = ""
    source: Literal["policy", "standard_suggestion"] = "policy"
    status: ChecklistItemStatusType = "required"
    needs_confirmation: bool = False
    deadline: Optional[Dict[str, Any]] = None
    document_id: Optional[str] = None
    due_date_hint: Optional[str] = None


class ClaimDocument(BaseModel):
    document_id: str
    item_id: str
    filename: str
    file_path: Optional[str] = None
    extracted_fields: Dict[str, Any] = Field(default_factory=dict)
    field_confidence: Dict[str, float] = Field(default_factory=dict)
    validation_issues: List[str] = Field(default_factory=list)
    needs_confirmation: bool = False


class ReceiptStep(BaseModel):
    label: str
    amount: float
    rule: str
    citation: str


class SettlementEstimate(BaseModel):
    basis: SettlementBasisType = "pre_treatment_estimate"
    receipt_steps: List[ReceiptStep] = Field(default_factory=list)
    total: float = 0.0


class TimelineEntry(BaseModel):
    timestamp: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
    event: str
    note: Optional[str] = None


# ── Top-level Claim Model ────────────────────────────────────────────────────

class Claim(BaseModel):
    claim_id: str
    user_id: str
    policy_id: str
    status: ClaimStatusType = "draft"
    treatment: Optional[TreatmentDetails] = None
    eligibility_result: Optional[EligibilityResult] = None
    checklist: List[ChecklistItem] = Field(default_factory=list)
    documents: List[ClaimDocument] = Field(default_factory=list)
    settlement_estimate: Optional[SettlementEstimate] = None
    timeline: List[TimelineEntry] = Field(default_factory=list)
    created_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.utcnow().isoformat())


# ── API Request Models ───────────────────────────────────────────────────────

class CreateClaimRequest(BaseModel):
    policy_id: str


class UpdateTreatmentRequest(BaseModel):
    name: str = Field(..., min_length=2)
    hospital: str = Field(..., min_length=2)
    admission_date: str
    discharge_date: Optional[str] = None
    room_type: str = "Single Private AC"
    estimated_cost: float = Field(..., gt=0)


class UpdateStatusRequest(BaseModel):
    status: ClaimStatusType
    note: Optional[str] = None


class ConfirmDocumentFieldsRequest(BaseModel):
    confirmed_fields: Dict[str, Any]
