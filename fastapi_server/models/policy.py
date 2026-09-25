from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime

class FactModel(BaseModel):
    fact_id: str
    category: str  # coverage_category, sum_insured, sub_limit, waiting_period, exclusion, room_rent_limit, co_payment, deductible, claim_condition
    fact_key: str
    fact_value: str
    fact_value_numeric: Optional[float] = None
    unit: Optional[str] = None
    source_page: Optional[int] = None
    source_section: Optional[str] = None
    extraction_confidence: Optional[str] = "high"

class RedFlagSummaryModel(BaseModel):
    waiting_periods: List[str] = []
    major_exclusions: List[str] = []
    room_rent_cap: Optional[str] = None
    copay_percentage: Optional[str] = None
    notes: List[str] = []

class PolicyResponse(BaseModel):
    id: str = Field(alias="_id")
    user_id: str
    file_name: str
    file_path: Optional[str] = None
    file_size_bytes: Optional[int] = 0
    insurer_name: Optional[str] = None
    policy_type: Optional[str] = None
    policy_number: Optional[str] = None
    sum_insured: Optional[float] = None
    premium_amount: Optional[float] = None
    status: str = "uploading"  # uploading, extracting, indexed, ready, failed
    ocr_used: bool = False
    red_flag_summary: Optional[RedFlagSummaryModel] = None
    facts: List[FactModel] = []
    uploaded_at: Optional[datetime] = None
    indexed_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    class Config:
        populate_by_name = True

class PolicyListResponse(BaseModel):
    policies: List[Dict[str, Any]]
