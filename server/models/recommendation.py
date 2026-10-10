"""
Data models for the AI-Powered Health Insurance Recommendation Engine.
Defines user profile input schemas, scoring weights, and explainable recommendation responses.
"""

from __future__ import annotations

from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field, field_validator


class FamilyMember(BaseModel):
    relation: str = Field(..., description="Relation to primary insured: 'spouse', 'child', 'parent'")
    age: int = Field(..., ge=0, le=100, description="Age in years")


class UserProfile(BaseModel):
    age: int = Field(..., ge=18, le=100, description="Primary insured age")
    coverage_type: str = Field("individual", description="'individual' or 'family_floater'")
    family_members: List[FamilyMember] = Field(default_factory=list)
    sum_insured_preference: Optional[float] = Field(
        None, description="Desired sum insured in INR (e.g. 500000, 1000000, 2500000)"
    )
    annual_budget: Optional[float] = Field(
        None, description="Preferred annual premium budget in INR (e.g. 15000, 25000)"
    )
    city_tier: Optional[str] = Field("tier_1", description="'tier_1' (Metro) or 'tier_2_non_metro'")
    city: Optional[str] = Field(None, description="City name (optional)")
    pin_code: Optional[str] = Field(None, description="6-digit Indian PIN code (optional)")
    pre_existing_conditions: List[str] = Field(
        default_factory=list, description="List of pre-existing conditions (e.g. ['diabetes', 'hypertension'])"
    )
    feature_preferences: List[str] = Field(
        default_factory=list,
        description="Priority features: ['highest_claim_settlement_ratio', 'no_room_rent_capping', 'zero_copay', 'shortest_ped_wait', 'restoration_benefit', 'maternity_benefit', 'high_hospital_network']",
    )
    min_claim_settlement_ratio: Optional[float] = Field(
        None,
        ge=70.0,
        le=100.0,
        description="Minimum acceptable IRDAI Claim Settlement Ratio % (e.g. 90.0, 95.0, 97.0) — paramount selection parameter",
    )
    claim_settlement_priority: Optional[str] = Field(
        "highest",
        description="Priority weighting for Claim Settlement Ratio: 'highest', 'strict_97', 'strict_95', 'standard'",
    )
    existing_insurance: Optional[str] = Field(
        "none", description="Existing insurance: 'none', 'employer_corporate', 'individual_retail'"
    )
    voluntary_income: Optional[float] = Field(
        None, description="Voluntary annual income in INR for additional affordability context (optional)"
    )

    @field_validator("coverage_type")
    @classmethod
    def validate_coverage_type(cls, v: str) -> str:
        clean = v.lower().strip()
        if clean not in ["individual", "family_floater"]:
            return "individual"
        return clean

    @field_validator("city_tier")
    @classmethod
    def validate_city_tier(cls, v: Optional[str]) -> str:
        if not v:
            return "tier_1"
        clean = v.lower().strip()
        if "tier_2" in clean or "non_metro" in clean or "tier 2" in clean:
            return "tier_2_non_metro"
        return "tier_1"


class ScoringWeights(BaseModel):
    claim_settlement: float = Field(0.35, ge=0.0, le=1.0, description="Paramount factor: IRDAI Claim Settlement Ratio (highest weight)")
    affordability: float = Field(0.22, ge=0.0, le=1.0)
    coverage: float = Field(0.18, ge=0.0, le=1.0)
    waiting_periods: float = Field(0.12, ge=0.0, le=1.0)
    hospital_network: float = Field(0.08, ge=0.0, le=1.0)
    terms: float = Field(0.05, ge=0.0, le=1.0)

    def normalized(self) -> Dict[str, float]:
        total = (
            self.claim_settlement
            + self.affordability
            + self.coverage
            + self.waiting_periods
            + self.hospital_network
            + self.terms
        )
        if total <= 0:
            return {
                "claim_settlement": 0.35,
                "affordability": 0.22,
                "coverage": 0.18,
                "waiting_periods": 0.12,
                "hospital_network": 0.08,
                "terms": 0.05,
            }
        return {
            "claim_settlement": self.claim_settlement / total,
            "affordability": self.affordability / total,
            "coverage": self.coverage / total,
            "waiting_periods": self.waiting_periods / total,
            "hospital_network": self.hospital_network / total,
            "terms": self.terms / total,
        }


class RecommendationRequest(BaseModel):
    profile: UserProfile
    custom_weights: Optional[ScoringWeights] = None


class MatchBreakdown(BaseModel):
    claim_settlement_score: float = Field(..., description="Score out of 35 (IRDAI Claim Settlement Ratio - Paramount Factor)")
    affordability_score: float = Field(..., description="Score out of 22")
    coverage_score: float = Field(..., description="Score out of 18")
    waiting_period_score: float = Field(..., description="Score out of 12")
    hospital_network_score: float = Field(..., description="Score out of 8")
    terms_score: float = Field(..., description="Score out of 5")
    overall_score: float = Field(..., description="Normalized score 0-100")
    scoring_details: Dict[str, str] = Field(default_factory=dict)


class PolicyRecommendationItem(BaseModel):
    product_id: str
    insurer_name: str
    product_name: str
    coverage_types: List[str]
    recommended_sum_insured: float
    estimated_annual_premium: float
    claim_settlement_ratio: float = Field(
        97.0,
        description="Official IRDAI Claim Settlement Ratio percentage (e.g. 98.4%)",
    )
    premium_type: str = Field(
        "indicative_estimate",
        description="'indicative_estimate', 'verified_quote', 'advertised_starting', 'unverified'",
    )
    premium_badge: str = Field(
        "Indicative Estimate",
        description="Human-readable label: 'Indicative Estimate', 'Starting From', 'Verified Quote'",
    )
    premium_notes: str
    overall_match_score: float
    rank: int
    badge: Optional[str] = None
    why_recommended: str
    key_benefits: List[str]
    waiting_periods_summary: Dict[str, str]
    room_rent_summary: str
    copay_summary: str
    restoration_summary: str
    network_hospitals_count: int
    key_limitations: List[str]
    unmet_preferences: List[str] = Field(default_factory=list)
    match_breakdown: MatchBreakdown
    official_brochure_url: Optional[str] = None
    verification_status: str = "verified_catalog"
    quote_source_link: Optional[str] = None


class RecommendationResponse(BaseModel):
    success: bool = True
    user_profile_summary: Dict[str, Any]
    assumptions_made: List[str]
    top_recommendations: List[PolicyRecommendationItem]
    runner_up_recommendations: List[PolicyRecommendationItem] = Field(default_factory=list)
    total_eligible_evaluated: int
    crawler_capacity: int = Field(50, description="Active crawler capacity for policy discovery and verification")
    scoring_weights: Dict[str, float]
    disclaimer: str

