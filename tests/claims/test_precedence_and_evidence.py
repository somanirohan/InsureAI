"""
Tests for Phase 3: Workflow Integration, Precedence Resolution, and API Endpoints.
"""

import pytest
from app.claims.precedence import (
    PRECEDENCE_RANKS,
    get_document_precedence_rank,
    resolve_conflicting_amounts,
    resolve_conflicting_dates,
)
from app.claims.models import Claim, ClaimDocument, LineItem, SettlementEstimate, TreatmentDetails
from app.claims.settlement import calculate_settlement_estimate


def test_precedence_table_ranks():
    # Statutory guideline highest, final bill above itemised bills, above estimates
    assert get_document_precedence_rank("irda_guideline") > get_document_precedence_rank("user_confirmed")
    assert get_document_precedence_rank("user_confirmed") > get_document_precedence_rank("final_bill")
    assert get_document_precedence_rank("final_bill") > get_document_precedence_rank("itemised_bills")
    assert get_document_precedence_rank("itemised_bills") > get_document_precedence_rank("preauth_approval_letter")
    assert get_document_precedence_rank("preauth_approval_letter") > get_document_precedence_rank("pre_treatment_estimate")


def test_resolve_conflicting_amounts_precedence():
    candidates = [
        ("pre_treatment_estimate", 120000.0, "est_1"),
        ("final_bill", 145000.0, "fb_1"),
        ("itemised_bills", 142000.0, "ib_1"),
    ]
    winner_src, winner_amt, winner_id = resolve_conflicting_amounts(candidates)
    assert winner_src == "final_bill"
    assert winner_amt == 145000.0
    assert winner_id == "fb_1"


def test_resolve_conflicting_amounts_user_confirmed_wins():
    candidates = [
        ("final_bill", 145000.0, "fb_1"),
        ("user_confirmed", 138000.0, "usr_1"),
        ("pre_treatment_estimate", 120000.0, "est_1"),
    ]
    winner_src, winner_amt, _ = resolve_conflicting_amounts(candidates)
    assert winner_src == "user_confirmed"
    assert winner_amt == 138000.0


def test_resolve_conflicting_dates_precedence():
    candidates = [
        ("pre_treatment_estimate", "2026-05-10", "est_1"),
        ("discharge_summary", "2026-05-12", "ds_1"),
        ("final_bill", "2026-05-14", "fb_1"),
    ]
    winner_src, winner_date, _ = resolve_conflicting_dates(candidates)
    assert winner_src == "final_bill"
    assert winner_date == "2026-05-14"


def test_settlement_receipt_with_unconfirmed_line_items_guard():
    # If a bill is unconfirmed (needs_confirmation=True), settlement math falls back to pre-treatment estimate
    claim = Claim(
        claim_id="claim_unconf_test",
        user_id="user_123",
        policy_id="pol_123",
        treatment=TreatmentDetails(
            name="Knee Arthroscopy",
            hospital="Apollo Hospital",
            admission_date="2026-06-01",
            estimated_cost=80000.0,
        ),
        documents=[
            ClaimDocument(
                document_id="doc_1",
                item_id="final_bill",
                filename="bill_with_conf_flag.pdf",
                extracted_fields={"total_amount": 95000.0, "document_type": "final_bill"},
                needs_confirmation=True,
                validation_issues=["Total amount differs from line item sum"],
            )
        ],
    )
    facts = {"sum_insured": 500000.0, "room_rent_limit": "1% per day"}
    est = calculate_settlement_estimate(claim, facts)
    assert est.basis == "pre_treatment_estimate"
    # Should include step noting unconfirmed bill awaiting confirmation
    awaiting_step = next((s for s in est.receipt_steps if "Awaiting Confirmation" in s.label), None)
    assert awaiting_step is not None
