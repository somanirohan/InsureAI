"""
Unit tests for cost_service.py
Tests tier validation, positive room rent/stay validation,
explicit 0% co-payment preservation, and what-if input preservation.
"""

import sys
from pathlib import Path

repo_root = Path(__file__).resolve().parent.parent.parent
server_dir = repo_root / "server"
for p in (str(repo_root), str(server_dir)):
    if p not in sys.path:
        sys.path.insert(0, p)

import pytest
from server.services.cost_service import CostEstimatorService


def test_invalid_tier_rejected():
    service = CostEstimatorService()
    with pytest.raises(ValueError, match="Invalid hospital tier"):
        service.calculate_cost_breakdown(
            policy=None,
            treatment_name="knee replacement",
            hospital_tier="tier_5",
        )


def test_negative_room_rent_rejected():
    service = CostEstimatorService()
    with pytest.raises(ValueError, match="Room rent per day must be positive"):
        service.calculate_cost_breakdown(
            policy=None,
            treatment_name="knee replacement",
            hospital_tier="tier_1",
            room_rent_per_day=-100.0,
        )


def test_zero_stay_days_rejected():
    service = CostEstimatorService()
    with pytest.raises(ValueError, match="Stay duration must be positive"):
        service.calculate_cost_breakdown(
            policy=None,
            treatment_name="knee replacement",
            hospital_tier="tier_1",
            stay_days=0,
        )


def test_explicit_zero_copay_preserved():
    service = CostEstimatorService()
    policy = {
        "sum_insured": 1500000.0,
        "facts": [
            {
                "category": "co_payment",
                "fact_value": "0% co-pay across all network hospitals",
                "fact_value_numeric": 0.0,
                "unit": "%",
                "source_page": 5,
            },
            {
                "category": "room_rent_limit",
                "fact_value": "No Room Rent Limit",
                "fact_value_numeric": 15000.0,
                "unit": "INR/day",
                "source_page": 3,
            }
        ]
    }

    res = service.calculate_cost_breakdown(
        policy=policy,
        treatment_name="knee replacement",
        hospital_tier="tier_1",
        room_rent_per_day=12000.0,
        stay_days=3,
    )

    bd = res["cost_breakdown"]
    # Co-pay percentage must be explicitly 0.0%, NOT falling back to 10%
    assert bd["copay_percentage"] == 0.0
    assert bd["copay_amount"] == 0.0
    assert "0%" in res["assumptions"][1] or "0.0%" in res["assumptions"][1] or any("0.0%" in a or "0%" in a for a in res["assumptions"])


def test_what_if_preserves_inputs():
    service = CostEstimatorService()
    # Baseline breakdown
    res = service.calculate_cost_breakdown(
        policy=None,
        treatment_name="knee replacement",
        hospital_tier="tier_1",
        room_rent_per_day=9500.0,
        stay_days=5,
    )
    assert res["cost_breakdown"]["room_rent_applied"] == 9500.0 * 5

    # Changing hospital tier to tier_2 while preserving room rent (9500) and stay (5)
    recalc = service.calculate_cost_breakdown(
        policy=None,
        treatment_name="knee replacement",
        hospital_tier="tier_2",
        room_rent_per_day=9500.0,
        stay_days=5,
    )
    assert recalc["cost_breakdown"]["room_rent_applied"] == 9500.0 * 5
    assert recalc["estimated_total_cost"] == 250000.0
