from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime

class CompareRequest(BaseModel):
    policy_ids: List[str]

class PolicyComparisonResponse(BaseModel):
    id: str = Field(alias="_id")
    user_id: str
    policy_ids: List[str]
    comparison_result: Dict[str, Any]
    created_at: Optional[datetime] = None

    class Config:
        populate_by_name = True
