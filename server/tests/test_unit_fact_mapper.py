"""
Unit tests for fact_mapper.py
Tests bidirectional mapping, explicit zero values, numeric parsing,
and handling of missing/malformed fields.
"""

import sys
from pathlib import Path

# Add project root and server to sys.path
repo_root = Path(__file__).resolve().parent.parent.parent
server_dir = repo_root / "server"
for p in (str(repo_root), str(server_dir)):
    if p not in sys.path:
        sys.path.insert(0, p)

import pytest
from server.services.fact_mapper import (
    rag_facts_to_mongo_facts,
    mongo_facts_to_rag_facts,
    _parse_numeric_and_unit,
)


def test_parse_numeric_and_unit():
    # Percentage
    val, unit = _parse_numeric_and_unit("10%")
    assert val == 10.0
    assert unit == "%"

    # Explicit 0%
    val, unit = _parse_numeric_and_unit("0%")
    assert val == 0.0
    assert unit == "%"

    val, unit = _parse_numeric_and_unit("0% co-payment in network")
    assert val == 0.0
    assert unit == "%"

    # Rupee amounts
    val, unit = _parse_numeric_and_unit("INR 10,00,000")
    assert val == 1000000.0
    assert unit == "INR"

    val, unit = _parse_numeric_and_unit("Rs. 15,00,000")
    assert val == 1500000.0
    assert unit == "INR"

    val, unit = _parse_numeric_and_unit("₹ 5,00,000")
    assert val == 500000.0
    assert unit == "INR"

    # Durations
    val, unit = _parse_numeric_and_unit("36 months")
    assert val == 36.0
    assert unit == "months"

    val, unit = _parse_numeric_and_unit("30 days")
    assert val == 30.0
    assert unit == "days"

    # Non-numeric
    val, unit = _parse_numeric_and_unit("Not applicable")
    assert val is None
    assert unit is None


def test_rag_to_mongo_mapping_complete():
    rag_in = {
        "sum_insured": {"value": "INR 10,00,000", "page": 2},
        "room_rent_limit": {"value": "1% of Sum Insured per day", "page": 4},
        "co_pay": {"value": "0%", "page": 7},
        "deductible": None,
        "waiting_periods": [
            {"condition": "Pre-existing disease", "period": "36 months", "page": 9},
            {"condition": "Initial waiting", "period": "30 days", "page": 9},
        ],
        "exclusions": [
            {"item": "Cosmetic surgery", "page": 11},
            {"item": "Experimental treatment", "page": 11},
        ],
        "claim_conditions": [
            {"condition": "Pre-authorization required within 48 hours", "page": 14},
        ],
    }

    mongo_facts = rag_facts_to_mongo_facts(rag_in)

    # 1 sum_insured, 1 room_rent, 1 co_pay, 2 waiting, 2 exclusions, 1 claim = 8 facts
    assert len(mongo_facts) == 8

    # Check sum_insured
    si = next(f for f in mongo_facts if f["category"] == "sum_insured")
    assert si["fact_value"] == "INR 10,00,000"
    assert si["fact_value_numeric"] == 1000000.0
    assert si["unit"] == "INR"
    assert si["source_page"] == 2
    assert "fact_id" in si

    # Check co_pay: must preserve explicit 0.0
    cp = next(f for f in mongo_facts if f["category"] == "co_payment")
    assert cp["fact_value"] == "0%"
    assert cp["fact_value_numeric"] == 0.0
    assert cp["unit"] == "%"
    assert cp["source_page"] == 7

    # Check waiting periods
    wps = [f for f in mongo_facts if f["category"] == "waiting_period"]
    assert len(wps) == 2
    assert wps[0]["fact_value_numeric"] == 36.0
    assert wps[0]["unit"] == "months"

    # Check exclusions
    excls = [f for f in mongo_facts if f["category"] == "exclusion"]
    assert len(excls) == 2
    assert excls[0]["fact_value"] == "Cosmetic surgery"
    assert excls[0]["source_page"] == 11


def test_mongo_to_rag_mapping():
    mongo_facts = [
        {
            "fact_id": "fact-1",
            "category": "sum_insured",
            "fact_key": "sum_insured",
            "fact_value": "INR 10,00,000",
            "fact_value_numeric": 1000000.0,
            "unit": "INR",
            "source_page": 2,
            "extraction_confidence": "high",
        },
        {
            "fact_id": "fact-2",
            "category": "room_rent_limit",
            "fact_key": "room_rent_limit",
            "fact_value": "1% of Sum Insured",
            "fact_value_numeric": None,
            "unit": None,
            "source_page": 4,
            "extraction_confidence": "high",
        },
        {
            "fact_id": "fact-3",
            "category": "co_payment",
            "fact_key": "co_payment",
            "fact_value": "0%",
            "fact_value_numeric": 0.0,
            "unit": "%",
            "source_page": 7,
            "extraction_confidence": "high",
        },
        {
            "fact_id": "fact-4",
            "category": "waiting_period",
            "fact_key": "waiting_period_1",
            "fact_value": "Pre-existing disease: 36 months",
            "source_page": 9,
            "metadata": {"condition": "Pre-existing disease", "period": "36 months"},
        },
        {
            "fact_id": "fact-5",
            "category": "exclusion",
            "fact_key": "exclusion_1",
            "fact_value": "Cosmetic surgery",
            "source_page": 11,
            "metadata": {"item": "Cosmetic surgery"},
        },
        {
            "fact_id": "fact-6",
            "category": "claim_condition",
            "fact_key": "claim_condition_1",
            "fact_value": "Pre-authorization within 48 hours",
            "source_page": 14,
            "metadata": {"condition": "Pre-authorization within 48 hours"},
        },
    ]

    rag_out = mongo_facts_to_rag_facts(mongo_facts)

    assert rag_out["sum_insured"] == {"value": "INR 10,00,000", "page": 2}
    assert rag_out["room_rent_limit"] == {"value": "1% of Sum Insured", "page": 4}
    assert rag_out["co_pay"] == {"value": "0%", "page": 7}
    assert rag_out["deductible"] is None
    assert len(rag_out["waiting_periods"]) == 1
    assert rag_out["waiting_periods"][0]["condition"] == "Pre-existing disease"
    assert rag_out["waiting_periods"][0]["period"] == "36 months"
    assert rag_out["waiting_periods"][0]["page"] == 9
    assert len(rag_out["exclusions"]) == 1
    assert rag_out["exclusions"][0]["item"] == "Cosmetic surgery"
    assert len(rag_out["claim_conditions"]) == 1


def test_missing_and_empty_facts():
    # Empty dictionary
    assert rag_facts_to_mongo_facts({}) == []
    assert rag_facts_to_mongo_facts(None) == []

    # Round trip on empty
    empty_rag = mongo_facts_to_rag_facts([])
    assert empty_rag["sum_insured"] is None
    assert empty_rag["waiting_periods"] == []
    assert empty_rag["exclusions"] == []
    assert empty_rag["claim_conditions"] == []


if __name__ == "__main__":
    test_parse_numeric_and_unit()
    test_rag_to_mongo_mapping_complete()
    test_mongo_to_rag_mapping()
    test_missing_and_empty_facts()
    print("All fact mapper unit tests passed!")
