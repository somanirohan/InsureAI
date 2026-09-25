from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime

class CostEstimateRequest(BaseModel):
    policy_id: str
    treatment_name: str
    hospital_tier: str = "tier_1"
    room_rent_per_day: float = 8000.0
    stay_days: int = 4

class WhatIfRequest(BaseModel):
    changed_variable: str
    new_value: str

class WhatIfVariantModel(BaseModel):
    variant_id: str
    changed_variable: str
    original_value: str
    new_value: str
    recalculated_total_cost: float
    recalculated_covered_amount: float
    recalculated_out_of_pocket: float
    cost_breakdown: Dict[str, Any]
    created_at: Optional[datetime] = None

class CostEstimateResponse(BaseModel):
    id: str = Field(alias="_id")
    user_id: str
    policy_id: str
    treatment_name: str
    hospital_tier: str
    estimated_total_cost: float
    covered_amount: float
    out_of_pocket_amount: float
    cost_breakdown: Dict[str, Any]
    what_if_variants: List[WhatIfVariantModel] = []
    created_at: Optional[datetime] = None

    class Config:
        populate_by_name = True
