"""
Automated pytest test suite for InsureAI Health Insurance Recommendation Engine.
Tests scoring model, deterministic filters, profile variations, crawler, and API endpoints.
"""

import pytest
from fastapi.testclient import TestClient

from server.main import app
from server.models.recommendation import (
    FamilyMember,
    RecommendationRequest,
    ScoringWeights,
    UserProfile,
)
from server.services.policy_crawler import CURATED_INDIAN_POLICIES, policy_crawler_service
from server.services.recommendation_engine import recommendation_engine


@pytest.fixture
def api_client():
    return TestClient(app)


def test_catalog_loaded():
    """Verify curated Indian health insurance catalog contains authentic policies."""
    assert len(CURATED_INDIAN_POLICIES) >= 10
    product_ids = [p["product_id"] for p in CURATED_INDIAN_POLICIES]
    assert "hdfc-optima-secure" in product_ids
    assert "care-supreme" in product_ids
    assert "star-premier-health" in product_ids
    assert "niva-bupa-reassure-2" in product_ids


def test_first_time_individual_recommendation():
    """Verify standard individual buyer recommendation returns top 3 ranked plans."""
    profile = UserProfile(
        age=28,
        coverage_type="individual",
        sum_insured_preference=1000000,
        annual_budget=15000,
        city_tier="tier_1",
    )
    res = recommendation_engine.generate_recommendations(RecommendationRequest(profile=profile))

    assert res.success is True
    assert len(res.top_recommendations) == 3
    assert res.top_recommendations[0].rank == 1
    assert res.top_recommendations[0].overall_match_score >= res.top_recommendations[1].overall_match_score
    assert res.top_recommendations[0].badge is not None
    assert len(res.top_recommendations[0].why_recommended) > 10


def test_family_floater_recommendation():
    """Verify family floater calculations properly incorporate dependent ages and floater multipliers."""
    profile = UserProfile(
        age=36,
        coverage_type="family_floater",
        family_members=[
            FamilyMember(relation="spouse", age=33),
            FamilyMember(relation="child", age=6),
        ],
        sum_insured_preference=1500000,
        annual_budget=28000,
        city_tier="tier_1",
    )
    res = recommendation_engine.generate_recommendations(RecommendationRequest(profile=profile))

    assert res.success is True
    assert len(res.top_recommendations) == 3
    for rec in res.top_recommendations:
        assert rec.estimated_annual_premium > 0
        assert "family_floater" in rec.coverage_types


def test_pre_existing_disease_prioritization():
    """Verify policies with shorter PED waiting periods (e.g. 12 or 24 months) rank highest when PED is declared."""
    profile = UserProfile(
        age=44,
        coverage_type="individual",
        sum_insured_preference=1000000,
        annual_budget=25000,
        pre_existing_conditions=["diabetes", "hypertension"],
    )
    res = recommendation_engine.generate_recommendations(RecommendationRequest(profile=profile))

    top_plan = res.top_recommendations[0]
    ped_wait = top_plan.waiting_periods_summary["pre_existing"]
    # Should prioritize plans with 12 or 24 months wait over 36 or 48 months
    assert "12" in ped_wait or "24" in ped_wait


def test_missing_optional_questions_assumptions():
    """Verify user can skip all optional questions and system makes transparent assumptions."""
    profile = UserProfile(age=32)  # Only age specified!
    res = recommendation_engine.generate_recommendations(RecommendationRequest(profile=profile))

    assert res.success is True
    assert len(res.top_recommendations) == 3
    assert len(res.assumptions_made) >= 2


def test_age_eligibility_hard_filter():
    """Verify policies with maximum entry age below user age are filtered out."""
    profile = UserProfile(age=72, coverage_type="individual")
    res = recommendation_engine.generate_recommendations(RecommendationRequest(profile=profile))

    # Should only return policies that allow entry above 65 (e.g. Care Supreme allows up to 99)
    for rec in res.top_recommendations:
        policy_item = next(p for p in CURATED_INDIAN_POLICIES if p["product_id"] == rec.product_id)
        assert policy_item["max_entry_age"] >= 72


def test_custom_scoring_weights():
    """Verify configurable weights alter ranking proportionally."""
    profile = UserProfile(age=30, annual_budget=12000, sum_insured_preference=1000000)

    # Heavily weight affordability (70%) vs standard
    heavy_budget_weights = ScoringWeights(
        affordability=0.70,
        coverage=0.10,
        waiting_periods=0.10,
        hospital_network=0.05,
        terms=0.05,
    )
    res = recommendation_engine.generate_recommendations(
        RecommendationRequest(profile=profile, custom_weights=heavy_budget_weights)
    )

    top_plan = res.top_recommendations[0]
    # Under heavy affordability weight, one of the lowest cost plans should win
    assert top_plan.estimated_annual_premium <= 13500


def test_api_catalog_endpoint(api_client):
    """Test GET /api/recommendations/catalog returns full policy catalog."""
    res = api_client.get("/api/recommendations/catalog")
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    assert data["total_policies"] >= 10


def test_api_recommendation_endpoint(api_client):
    """Test POST /api/recommendations produces compliant structured recommendations."""
    payload = {
        "profile": {
            "age": 27,
            "coverage_type": "individual",
            "sum_insured_preference": 1000000,
            "annual_budget": 14000,
            "city_tier": "tier_1",
            "pre_existing_conditions": [],
            "feature_preferences": ["no_room_rent_capping", "zero_copay"],
        }
    }
    res = api_client.post("/api/recommendations", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["success"] is True
    assert len(data["top_recommendations"]) == 3
    assert "disclaimer" in data
