"""
Unit tests for deterministic Claim Eligibility Engine.
Tests all 5 checks, conservative matching, blocking/info flags, and IRDAI compliance.
"""

import pytest
from app.claims.eligibility import evaluate_eligibility
from app.claims.models import TreatmentDetails


@pytest.fixture
def sample_treatment():
    return TreatmentDetails(
        name="Cataract Surgery",
        hospital="Apollo Hospital",
        admission_date="2024-04-10",
        discharge_date="2024-04-11",
        room_type="Single Private AC",
        estimated_cost=65000.0,
    )


@pytest.fixture
def sample_policy_facts():
    return {
        "sum_insured": {"value": "₹ 5,00,000", "page": 1},
        "room_rent_limit": {"value": "1% of Sum Insured per day", "page": 2},
        "co_pay": {"value": "10%", "page": 3},
        "deductible": {"value": "₹ 0", "page": 3},
        "waiting_periods": [
            {"condition": "Pre-existing Diseases (PED)", "period": "48 months", "page": 4},
            {"condition": "Cataract surgery and treatments", "period": "24 months", "page": 4},
            {"condition": "Joint Replacement", "period": "24 months", "page": 5},
        ],
        "exclusions": [
            {"item": "Cosmetic, aesthetic and obesity treatment", "page": 8},
            {"item": "Hazardous adventure sports injuries", "page": 8},
        ],
        "claim_conditions": [],
    }


def test_eligibility_waiting_period_unmet(sample_policy_facts, sample_treatment):
    """Policy age < 24 months should fail specific waiting period and flag blocking."""
    # Policy inception 6 months before today
    policy_start = "2023-10-01"
    today = "2024-04-15"

    result = evaluate_eligibility(
        policy_facts=sample_policy_facts,
        treatment=sample_treatment,
        policy_start_date=policy_start,
        today=today,
    )

    # Check 2 should fail
    wp_check = next(c for c in result.checks if c.check == "specific_waiting_period_check")
    assert wp_check.result == "fail"
    assert "Page 4" in wp_check.source

    # Should have a blocking flag
    blocking_flags = [f for f in result.flags if f.severity == "blocking"]
    assert len(blocking_flags) >= 1
    assert any(f.flag_id == "waiting_period_unmet" for f in blocking_flags)


def test_eligibility_waiting_period_satisfied(sample_policy_facts, sample_treatment):
    """Policy age > 24 months should pass specific waiting period."""
    policy_start = "2021-01-01"
    today = "2024-04-15"

    result = evaluate_eligibility(
        policy_facts=sample_policy_facts,
        treatment=sample_treatment,
        policy_start_date=policy_start,
        today=today,
    )

    wp_check = next(c for c in result.checks if c.check == "specific_waiting_period_check")
    assert wp_check.result == "pass"


def test_eligibility_exclusion_match(sample_policy_facts):
    """Excluded procedure should fail exclusions check and raise blocking flag."""
    treatment = TreatmentDetails(
        name="Cosmetic Rhinoplasty Surgery",
        hospital="Care Clinic",
        admission_date="2024-04-10",
        room_type="Single Private AC",
        estimated_cost=80000.0,
    )

    result = evaluate_eligibility(
        policy_facts=sample_policy_facts,
        treatment=treatment,
        policy_start_date="2020-01-01",
        today="2024-04-15",
    )

    exc_check = next(c for c in result.checks if c.check == "exclusions_check")
    assert exc_check.result == "fail"
    assert "Page 8" in exc_check.source

    blocking_flags = [f for f in result.flags if f.severity == "blocking"]
    assert any(f.flag_id == "exclusion_conflict" for f in blocking_flags)


def test_eligibility_sum_insured_exceeded(sample_policy_facts):
    """Cost exceeding sum insured surfaces a worth-confirming flag."""
    treatment = TreatmentDetails(
        name="Appendectomy",
        hospital="City Hospital",
        admission_date="2024-04-10",
        room_type="Single Private AC",
        estimated_cost=700000.0,  # Exceeds 5 Lakh SI
    )

    result = evaluate_eligibility(
        policy_facts=sample_policy_facts,
        treatment=treatment,
        policy_start_date="2020-01-01",
        today="2024-04-15",
    )

    cost_check = next(c for c in result.checks if c.check == "cost_and_sublimits_check")
    assert cost_check.result == "flag"

    si_flags = [f for f in result.flags if f.flag_id == "sum_insured_exceeded"]
    assert len(si_flags) == 1
    assert si_flags[0].severity == "worth-confirming"


def test_eligibility_deluxe_room_proportionate_deduction(sample_policy_facts):
    """Deluxe room with 1% room rent cap triggers proportionate deduction warning flag."""
    treatment = TreatmentDetails(
        name="Appendectomy",
        hospital="City Hospital",
        admission_date="2024-04-10",
        room_type="Super Deluxe Suite",
        estimated_cost=150000.0,
    )

    result = evaluate_eligibility(
        policy_facts=sample_policy_facts,
        treatment=treatment,
        policy_start_date="2020-01-01",
        today="2024-04-15",
    )

    rr_flags = [f for f in result.flags if f.flag_id == "room_rent_proportionate_deduction"]
    assert len(rr_flags) == 1
    assert rr_flags[0].severity == "worth-confirming"


def test_eligibility_irdai_ped_cap_override(sample_policy_facts, sample_treatment):
    """Policy specifying 48 months PED triggers IRDAI 36-month statutory cap override flag."""
    result = evaluate_eligibility(
        policy_facts=sample_policy_facts,
        treatment=sample_treatment,
        policy_start_date="2020-01-01",
        today="2024-04-15",
    )

    irdai_check = next(c for c in result.checks if c.check == "irdai_baseline_check")
    assert irdai_check.result == "flag"

    cap_flags = [f for f in result.flags if f.flag_id == "irdai_ped_cap_override"]
    assert len(cap_flags) == 1
    assert cap_flags[0].severity == "info"
    assert "IRDAI" in cap_flags[0].citation
