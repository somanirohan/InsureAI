"""
Unit tests for the FastAPI RAG adapter (server/services/rag_service.py).
Tests all validation, access control, fact mapping, thread offloading,
verification mapping, confidence mapping, and citation integrity.
Uses mocks for MongoDB and app.rag.qa.answer_question.
"""

import asyncio
import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

repo_root = Path(__file__).resolve().parent.parent.parent
server_dir = repo_root / "server"
for p in (str(repo_root), str(server_dir)):
    if p not in sys.path:
        sys.path.insert(0, p)

import pytest
from bson import ObjectId
from fastapi import HTTPException

from app.rag.qa import AnswerResult, Citation
from server.services.rag_service import rag_service


# ── Fixtures & Mock Helpers ───────────────────────────────────────────────────

@pytest.fixture
def mock_db():
    """Mock MongoDB database with policies collection."""
    db = MagicMock()
    db.policies = MagicMock()
    return db


def create_sample_policy(
    user_id: ObjectId,
    policy_id: ObjectId,
    status: str = "ready",
    facts: list = None,
    processing_error: str = None,
):
    """Helper to create a standard policy document."""
    return {
        "_id": policy_id,
        "user_id": user_id,
        "policy_name": "Star Health Comprehensive",
        "status": status,
        "processing_error": processing_error,
        "facts": facts or [],
    }


# ── Requirement 1: Validate the question ──────────────────────────────────────

@pytest.mark.asyncio
async def test_empty_question_returns_400():
    """Empty or whitespace-only questions must be rejected with HTTP 400."""
    with pytest.raises(HTTPException) as exc_info:
        await rag_service.answer_question(
            user_id=str(ObjectId()),
            policy_id=str(ObjectId()),
            question="",
        )
    assert exc_info.value.status_code == 400
    assert exc_info.value.detail == "Question cannot be empty."

    with pytest.raises(HTTPException) as exc_info_ws:
        await rag_service.answer_question(
            user_id=str(ObjectId()),
            policy_id=str(ObjectId()),
            question="    \n \t  ",
        )
    assert exc_info_ws.value.status_code == 400
    assert exc_info_ws.value.detail == "Question cannot be empty."


# ── Requirement 2: Validate User and Policy ───────────────────────────────────

@pytest.mark.asyncio
async def test_invalid_policy_id_returns_400():
    """An invalid policy ID format must be rejected with HTTP 400."""
    with pytest.raises(HTTPException) as exc_info:
        await rag_service.answer_question(
            user_id=str(ObjectId()),
            policy_id="invalid-not-an-objectid",
            question="What is the room rent limit?",
        )
    assert exc_info.value.status_code == 400
    assert "Invalid policy ID format" in exc_info.value.detail


@pytest.mark.asyncio
async def test_missing_policy_returns_404(mock_db):
    """If a specified policy ID does not exist anywhere, return HTTP 404."""
    user_id = ObjectId()
    policy_id = ObjectId()

    mock_db.policies.find_one = AsyncMock(return_value=None)

    with patch("server.services.rag_service.get_async_db", return_value=mock_db):
        with pytest.raises(HTTPException) as exc_info:
            await rag_service.answer_question(
                user_id=str(user_id),
                policy_id=str(policy_id),
                question="What is the room rent limit?",
            )
        assert exc_info.value.status_code == 404
        assert "not found" in exc_info.value.detail.lower()


@pytest.mark.asyncio
async def test_no_policy_provided_and_user_has_no_policies_returns_404(mock_db):
    """When policy_id is omitted and user has zero policies, return HTTP 404."""
    user_id = ObjectId()
    mock_db.policies.find_one = AsyncMock(return_value=None)

    with patch("server.services.rag_service.get_async_db", return_value=mock_db):
        with pytest.raises(HTTPException) as exc_info:
            await rag_service.answer_question(
                user_id=str(user_id),
                policy_id=None,
                question="What is my sum insured?",
            )
        assert exc_info.value.status_code == 404
        assert "no policy found" in exc_info.value.detail.lower()


@pytest.mark.asyncio
async def test_cross_user_policy_access_returns_403(mock_db):
    """Attempting to access another user's policy must return HTTP 403 Forbidden."""
    user_id = ObjectId()
    other_user_id = ObjectId()
    policy_id = ObjectId()

    other_policy = create_sample_policy(
        user_id=other_user_id,
        policy_id=policy_id,
        status="ready",
    )

    # First find_one (scoped to user) returns None, second (global by _id) returns doc
    mock_db.policies.find_one = AsyncMock(side_effect=[None, other_policy])

    with patch("server.services.rag_service.get_async_db", return_value=mock_db):
        with pytest.raises(HTTPException) as exc_info:
            await rag_service.answer_question(
                user_id=str(user_id),
                policy_id=str(policy_id),
                question="What is the room rent limit?",
            )
        assert exc_info.value.status_code == 403
        assert "Access denied" in exc_info.value.detail


# ── Requirement 3: Reject Non-Ready Policies ──────────────────────────────────

@pytest.mark.asyncio
@pytest.mark.parametrize("bad_status", ["uploading", "extracting", "indexed", "failed"])
async def test_non_ready_policy_rejected(mock_db, bad_status):
    """Policies with status != 'ready' must be rejected with HTTP 400."""
    user_id = ObjectId()
    policy_id = ObjectId()

    policy = create_sample_policy(
        user_id=user_id,
        policy_id=policy_id,
        status=bad_status,
        processing_error="Corrupted PDF text stream" if bad_status == "failed" else None,
    )
    mock_db.policies.find_one = AsyncMock(return_value=policy)

    with patch("server.services.rag_service.get_async_db", return_value=mock_db):
        with pytest.raises(HTTPException) as exc_info:
            await rag_service.answer_question(
                user_id=str(user_id),
                policy_id=str(policy_id),
                question="What is the co-pay?",
            )
        assert exc_info.value.status_code == 400
        if bad_status == "failed":
            assert "Corrupted PDF text stream" in exc_info.value.detail
        else:
            assert bad_status in exc_info.value.detail


@pytest.mark.asyncio
async def test_omitted_policy_id_latest_still_processing_returns_400(mock_db):
    """When policy_id is omitted and the latest policy is still extracting, return HTTP 400."""
    user_id = ObjectId()
    policy_in_prog = create_sample_policy(
        user_id=user_id,
        policy_id=ObjectId(),
        status="extracting",
    )

    # First find_one (ready) returns None, second find_one (latest) returns extracting doc
    mock_db.policies.find_one = AsyncMock(side_effect=[None, policy_in_prog])

    with patch("server.services.rag_service.get_async_db", return_value=mock_db):
        with pytest.raises(HTTPException) as exc_info:
            await rag_service.answer_question(
                user_id=str(user_id),
                policy_id=None,
                question="What is my co-pay?",
            )
        assert exc_info.value.status_code == 400
        assert "extracting" in exc_info.value.detail


# ── Requirement 4 & 5: Fact Conversion & app.rag.qa.answer_question in Thread ──

@pytest.mark.asyncio
async def test_mongodb_facts_mapped_and_rag_orchestrator_called(mock_db):
    """
    MongoDB facts must be converted via mongo_facts_to_rag_facts and passed to
    app.rag.qa.answer_question running inside asyncio.to_thread.
    """
    user_id = ObjectId()
    policy_id = ObjectId()

    mongo_facts = [
        {
            "category": "sum_insured",
            "fact_key": "sum_insured",
            "fact_value": "INR 10,00,000",
            "source_page": 2,
        },
        {
            "category": "co_payment",
            "fact_key": "co_payment",
            "fact_value": "0%",
            "source_page": 4,
        },
        {
            "category": "waiting_period",
            "fact_key": "waiting_period_1",
            "fact_value": "Pre-existing diseases: 36 months",
            "source_page": 5,
            "metadata": {"condition": "Pre-existing diseases", "period": "36 months"},
        },
    ]

    policy = create_sample_policy(
        user_id=user_id,
        policy_id=policy_id,
        status="ready",
        facts=mongo_facts,
    )
    mock_db.policies.find_one = AsyncMock(return_value=policy)

    mock_answer_result = AnswerResult(
        question="What is my sum insured?",
        answer="The Sum Insured under this policy is **INR 10,00,000** (found on Page 2).",
        source_path="structured",
        confidence="High",
        confidence_reason="Authoritative policy fact extracted from document schedule.",
        pages=[2],
        citations=[Citation(page_number=2, excerpt="Sum Insured: INR 10,00,000")],
        structured_field="sum_insured",
    )

    with patch("server.services.rag_service.get_async_db", return_value=mock_db):
        with patch("server.services.rag_service.answer_question", return_value=mock_answer_result) as mock_qa:
            with patch("asyncio.to_thread", wraps=asyncio.to_thread) as spy_to_thread:
                res = await rag_service.answer_question(
                    user_id=str(user_id),
                    policy_id=str(policy_id),
                    question="What is my sum insured?",
                )

                # Confirm asyncio.to_thread was invoked
                assert spy_to_thread.called
                # Confirm answer_question was called with exact mapped facts
                mock_qa.assert_called_once()
                call_kwargs = mock_qa.call_args[1] if mock_qa.call_args[1] else mock_qa.call_args.kwargs
                assert call_kwargs["policy_id"] == str(policy_id)
                assert call_kwargs["question"] == "What is my sum insured?"

                mapped_facts = call_kwargs["structured_facts"]
                assert mapped_facts["sum_insured"]["value"] == "INR 10,00,000"
                assert mapped_facts["sum_insured"]["page"] == 2
                assert mapped_facts["co_pay"]["value"] == "0%"  # explicit zero preserved
                assert len(mapped_facts["waiting_periods"]) == 1

                # Confirm structured answer outputs
                assert res["query_type"] == "structured"
                assert res["confidence_level"] == "high"
                assert res["verification_passed"] is True
                assert "Authoritative policy fact" in res["verification_notes"]


# ── Requirement 6 & 7: Verification & Confidence Mapping ─────────────────────

@pytest.mark.asyncio
async def test_semantic_fully_supported_maps_to_verification_passed_true(mock_db):
    """Semantic path with verification_status='fully_supported' maps to verification_passed=True."""
    user_id = ObjectId()
    policy_id = ObjectId()
    policy = create_sample_policy(user_id=user_id, policy_id=policy_id, status="ready")
    mock_db.policies.find_one = AsyncMock(return_value=policy)

    mock_result = AnswerResult(
        question="Is cataract covered?",
        answer="Cataract is covered up to Rs. 40,000 per eye [Page 3].",
        source_path="semantic",
        confidence="High",
        confidence_reason="Answer fully supported by source excerpts.",
        pages=[3],
        citations=[Citation(page_number=3, excerpt="Cataract surgery cap: Rs. 40,000", chunk_id=2)],
        verification_result={
            "supported": True,
            "verification_status": "fully_supported",
            "reasoning": "Direct evidence found in Section 3.",
        },
    )

    with patch("server.services.rag_service.get_async_db", return_value=mock_db):
        with patch("server.services.rag_service.answer_question", return_value=mock_result):
            res = await rag_service.answer_question(
                user_id=str(user_id),
                policy_id=str(policy_id),
                question="Is cataract covered?",
            )
            assert res["query_type"] == "semantic"
            assert res["confidence_level"] == "high"
            assert res["verification_passed"] is True
            assert res["verification_notes"] == "Direct evidence found in Section 3."


@pytest.mark.asyncio
async def test_semantic_partially_supported_maps_to_verification_passed_true(mock_db):
    """Semantic path with verification_status='partially_supported' maps to verification_passed=True."""
    user_id = ObjectId()
    policy_id = ObjectId()
    policy = create_sample_policy(user_id=user_id, policy_id=policy_id, status="ready")
    mock_db.policies.find_one = AsyncMock(return_value=policy)

    mock_result = AnswerResult(
        question="Can I get AYUSH treatment?",
        answer="AYUSH is covered under government-recognized hospitals [Page 5].",
        source_path="semantic",
        confidence="Medium",
        confidence_reason="Partially supported with minor interpretation.",
        pages=[5],
        citations=[Citation(page_number=5, excerpt="Alternative treatments in Govt hospitals", chunk_id=7)],
        verification_result={
            "supported": True,
            "verification_status": "partially_supported",
            "reasoning": "Passage specifies AYUSH under defined conditions.",
        },
    )

    with patch("server.services.rag_service.get_async_db", return_value=mock_db):
        with patch("server.services.rag_service.answer_question", return_value=mock_result):
            res = await rag_service.answer_question(
                user_id=str(user_id),
                policy_id=str(policy_id),
                question="Can I get AYUSH treatment?",
            )
            assert res["query_type"] == "semantic"
            assert res["confidence_level"] == "medium"
            assert res["verification_passed"] is True
            assert res["verification_notes"] == "Passage specifies AYUSH under defined conditions."


@pytest.mark.asyncio
async def test_semantic_unsupported_maps_to_verification_passed_false(mock_db):
    """Semantic path with verification_status='unsupported' maps to verification_passed=False."""
    user_id = ObjectId()
    policy_id = ObjectId()
    policy = create_sample_policy(user_id=user_id, policy_id=policy_id, status="ready")
    mock_db.policies.find_one = AsyncMock(return_value=policy)

    mock_result = AnswerResult(
        question="Is robotic surgery covered without limit?",
        answer="⚠️ Note: The policy text does not conclusively verify this claim.",
        source_path="semantic",
        confidence="Low",
        confidence_reason="Verification failed.",
        pages=[6],
        citations=[Citation(page_number=6, excerpt="Robotic surgery sub-limit Rs. 1,00,000", chunk_id=9)],
        verification_result={
            "supported": False,
            "verification_status": "unsupported",
            "reasoning": "Passage explicitly caps robotic surgery at Rs. 1,00,000.",
        },
    )

    with patch("server.services.rag_service.get_async_db", return_value=mock_db):
        with patch("server.services.rag_service.answer_question", return_value=mock_result):
            res = await rag_service.answer_question(
                user_id=str(user_id),
                policy_id=str(policy_id),
                question="Is robotic surgery covered without limit?",
            )
            assert res["query_type"] == "semantic"
            assert res["confidence_level"] == "low"
            assert res["verification_passed"] is False
            assert "Passage explicitly caps" in res["verification_notes"]


@pytest.mark.asyncio
async def test_missing_verification_result_maps_to_verification_passed_false(mock_db):
    """Semantic path with missing verification result maps safely to verification_passed=False."""
    user_id = ObjectId()
    policy_id = ObjectId()
    policy = create_sample_policy(user_id=user_id, policy_id=policy_id, status="ready")
    mock_db.policies.find_one = AsyncMock(return_value=policy)

    mock_result = AnswerResult(
        question="Random question?",
        answer="No clauses found.",
        source_path="semantic",
        confidence="Low",
        confidence_reason="No source passages available.",
        pages=[],
        citations=[],
        verification_result=None,
    )

    with patch("server.services.rag_service.get_async_db", return_value=mock_db):
        with patch("server.services.rag_service.answer_question", return_value=mock_result):
            res = await rag_service.answer_question(
                user_id=str(user_id),
                policy_id=str(policy_id),
                question="Random question?",
            )
            assert res["verification_passed"] is False


# ── Requirement 8: Citation Integrity & No Fabricated Section Heading ─────────

@pytest.mark.asyncio
async def test_citations_preserve_fields_and_no_fabricated_section_heading(mock_db):
    """
    Citations must preserve page_number, chunk_id, and excerpt.
    Crucially, section_heading must remain None if not authentically provided
    (never fabricate 'Page N Clause').
    """
    user_id = ObjectId()
    policy_id = ObjectId()
    policy = create_sample_policy(user_id=user_id, policy_id=policy_id, status="ready")
    mock_db.policies.find_one = AsyncMock(return_value=policy)

    mock_result = AnswerResult(
        question="What are the room rent rules?",
        answer="Room rent is capped at 1% per day [Page 4].",
        source_path="semantic",
        confidence="High",
        confidence_reason="Strong groundings.",
        pages=[4],
        citations=[
            Citation(page_number=4, excerpt="Room rent limit is 1% of Sum Insured", chunk_id=5),
            Citation(page_number=4, excerpt="ICU charges capped at 2%", chunk_id=6),
        ],
        verification_result={"supported": True, "verification_status": "fully_supported"},
    )

    with patch("server.services.rag_service.get_async_db", return_value=mock_db):
        with patch("server.services.rag_service.answer_question", return_value=mock_result):
            res = await rag_service.answer_question(
                user_id=str(user_id),
                policy_id=str(policy_id),
                question="What are the room rent rules?",
            )

            citations = res["citations"]
            assert len(citations) == 2

            # Check citation 1
            c1 = citations[0]
            assert c1["policy_id"] == str(policy_id)
            assert c1["chunk_vector_id"] == f"{str(policy_id)}_5"
            assert c1["page_number"] == 4
            assert c1["excerpt"] == "Room rent limit is 1% of Sum Insured"
            # Verify NO fabricated section heading:
            assert c1["section_heading"] is None

            # Check citation 2
            c2 = citations[1]
            assert c2["chunk_vector_id"] == f"{str(policy_id)}_6"
            assert c2["section_heading"] is None


# ── Requirement 9 & 10: Plain Language Mode & API Response Format ──────────────

@pytest.mark.asyncio
async def test_plain_language_mode_preserves_original_answer(mock_db):
    """
    When plain_language_requested=True, a simplified version is returned under
    plain_language while preserving the original answer completely.
    """
    user_id = ObjectId()
    policy_id = ObjectId()
    policy = create_sample_policy(user_id=user_id, policy_id=policy_id, status="ready")
    mock_db.policies.find_one = AsyncMock(return_value=policy)

    original_answer = "The policy requires a **36-month** waiting period for __Pre-Existing Diseases__."
    mock_result = AnswerResult(
        question="What is the PED waiting period?",
        answer=original_answer,
        source_path="structured",
        confidence="High",
        confidence_reason="Authoritative policy fact.",
        pages=[5],
        citations=[Citation(page_number=5, excerpt="PED: 36 months")],
    )

    with patch("server.services.rag_service.get_async_db", return_value=mock_db):
        with patch("server.services.rag_service.answer_question", return_value=mock_result):
            res = await rag_service.answer_question(
                user_id=str(user_id),
                policy_id=str(policy_id),
                question="What is the PED waiting period?",
                plain_language_requested=True,
            )

            # Original answer preserved verbatim
            assert res["answer"] == original_answer
            # Plain language simplified
            assert "In simple terms:" in res["plain_language"]
            assert "**" not in res["plain_language"]
            assert "__" not in res["plain_language"]
            assert "36-month" in res["plain_language"]
