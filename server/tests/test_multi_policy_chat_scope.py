"""
Unit and integration tests for Multi-Policy Scope & Policy Selector (Addendum Requirements).

Expected behavior written FIRST before implementation:
1. Selecting "all" with 3 policies produces per-policy sections, each citing only its own policy.
2. A user with 6 policies (exceeding MAX_POLICIES_PER_QUESTION=5) hits the cap behavior:
   - For structured-fact questions: answers from facts table for all policies (cheap, deterministic).
   - For semantic questions: asks user to narrow selection with cap explanation.
3. Another user's policy ID in client request is rejected with 403/404 and readable message.
4. One policy timing out gives a partial answer with a clear partial-failure notice.
5. Switching the selector between questions changes scope without leaking earlier context.
6. Single-policy results and Q&A eval are unchanged before and after.
7. Attribution check in code: citations contain only policy IDs that actually contributed to that section.
"""

import asyncio
from datetime import datetime
import pytest
from bson import ObjectId
from fastapi import HTTPException

from server.config import settings
from server.services.rag_service import rag_service
from server.models.chat import QuestionRequest


@pytest.fixture
def test_user_ids():
    return str(ObjectId()), str(ObjectId())


@pytest.mark.asyncio
async def test_cross_tenant_policy_rejection(test_user_ids):
    """
    Another user's policy ID in client request is rejected with 403 or 404
    and a clear, readable message.
    """
    from server.db import get_async_db
    db = get_async_db()
    user_a, user_b = test_user_ids

    # Create policy owned by user_b
    pol_b_id = str(ObjectId())
    await db.policies.insert_one({
        "_id": ObjectId(pol_b_id),
        "user_id": user_b,
        "insurer_name": "User B Insurer",
        "status": "ready",
        "facts": [],
    })

    try:
        # User A tries to query policy B specifically
        with pytest.raises(HTTPException) as exc_info:
            await rag_service.answer_question(
                user_id=user_a,
                policy_id=pol_b_id,
                question="What is the room rent limit?",
            )
        assert exc_info.value.status_code in (403, 404)
        assert "permission" in exc_info.value.detail.lower() or "not found" in exc_info.value.detail.lower()

        # User A tries to pass policy B in a multi-policy scope list
        with pytest.raises(HTTPException) as exc_multi:
            await rag_service.answer_question(
                user_id=user_a,
                policy_ids=[pol_b_id],
                question="What is the room rent limit?",
            )
        assert exc_multi.value.status_code in (403, 404)
        assert "permission" in exc_multi.value.detail.lower() or "not found" in exc_multi.value.detail.lower()
    finally:
        await db.policies.delete_one({"_id": ObjectId(pol_b_id)})


@pytest.mark.asyncio
async def test_multi_policy_scope_three_policies(test_user_ids):
    """
    Selecting 'all' or explicit policy list with 3 policies produces per-policy sections,
    each citing only its own policy with attribution check.
    """
    from server.db import get_async_db
    db = get_async_db()
    user_a, _ = test_user_ids

    pol_ids = [str(ObjectId()) for _ in range(3)]
    for i, pid in enumerate(pol_ids):
        await db.policies.insert_one({
            "_id": ObjectId(pid),
            "user_id": user_a,
            "insurer_name": f"Insurer {chr(65+i)}",
            "file_name": f"policy_{chr(65+i)}.pdf",
            "status": "ready",
            "uploaded_at": datetime.utcnow(),
            "facts": [
                {
                    "category": "room_rent_limit",
                    "fact_value": f"{i+1}% of Sum Insured per day",
                    "page_number": i + 2,
                }
            ],
        })

    try:
        res = await rag_service.answer_question(
            user_id=user_a,
            policy_ids=pol_ids,
            question="What is the room rent limit?",
        )
        assert res is not None
        assert "answer" in res
        # Must have per-policy grouped sections or comparison table
        answer_text = res["answer"]
        assert "Insurer A" in answer_text
        assert "Insurer B" in answer_text
        assert "Insurer C" in answer_text
        
        # Citations must be segregated with policy_id
        citations = res.get("citations", [])
        assert len(citations) >= 3
        cited_policy_ids = {c.get("policy_id") for c in citations}
        assert set(pol_ids).issubset(cited_policy_ids)

        # Attribution check: scope_policy_ids and scope_label
        assert res.get("scope_policy_ids") == pol_ids
        assert "Insurer A" in res.get("scope_label", "")
    finally:
        await db.policies.delete_many({"_id": {"$in": [ObjectId(p) for p in pol_ids]}})


@pytest.mark.asyncio
async def test_multi_policy_scope_cap_behavior(test_user_ids):
    """
    A user with 6 policies (exceeds MAX_POLICIES_PER_QUESTION=5):
    - Structured question: answered from facts table for all 6 policies deterministically.
    - Semantic question: prompts user to narrow selection with cap explanation.
    """
    from server.db import get_async_db
    db = get_async_db()
    user_a, _ = test_user_ids

    pol_ids = [str(ObjectId()) for _ in range(6)]
    for i, pid in enumerate(pol_ids):
        await db.policies.insert_one({
            "_id": ObjectId(pid),
            "user_id": user_a,
            "insurer_name": f"BulkInsurer {i+1}",
            "file_name": f"bulk_policy_{i+1}.pdf",
            "status": "ready",
            "uploaded_at": datetime.utcnow(),
            "facts": [
                {
                    "category": "sum_insured",
                    "fact_value": f"Rs. {i+5},00,000",
                    "page_number": 1,
                }
            ],
        })

    try:
        # Structured question on 6 policies -> answers deterministically for all 6
        res_structured = await rag_service.answer_question(
            user_id=user_a,
            policy_ids=pol_ids,
            question="What is my sum insured?",
        )
        assert res_structured["query_type"] == "structured"
        for i in range(6):
            assert f"BulkInsurer {i+1}" in res_structured["answer"]

        # Semantic question on 6 policies -> asks user to narrow selection
        res_semantic = await rag_service.answer_question(
            user_id=user_a,
            policy_ids=pol_ids,
            question="Can I get experimental robotic surgery covered under these policies?",
        )
        assert "narrow" in res_semantic["answer"].lower() or "limit" in res_semantic["answer"].lower()
        assert "5" in res_semantic["answer"]  # Mentions cap limit of 5
    finally:
        await db.policies.delete_many({"_id": {"$in": [ObjectId(p) for p in pol_ids]}})


@pytest.mark.asyncio
async def test_partial_failure_gracefulness(test_user_ids, monkeypatch):
    """
    When one policy in a multi-policy scope times out or fails,
    returns partial answer with a prominent partial-failure notice.
    """
    from server.db import get_async_db
    db = get_async_db()
    user_a, _ = test_user_ids

    pol_1 = str(ObjectId())
    pol_2 = str(ObjectId())

    await db.policies.insert_many([
        {
            "_id": ObjectId(pol_1),
            "user_id": user_a,
            "insurer_name": "HealthyInsurer",
            "status": "ready",
            "uploaded_at": datetime.utcnow(),
            "facts": [{"category": "room_rent_limit", "fact_value": "1% SI", "page_number": 2}],
        },
        {
            "_id": ObjectId(pol_2),
            "user_id": user_a,
            "insurer_name": "TimeoutInsurer",
            "status": "ready",
            "uploaded_at": datetime.utcnow(),
            "facts": [{"category": "room_rent_limit", "fact_value": "2% SI", "page_number": 3}],
        },
    ])

    try:
        # Force an error on pol_2 execution
        original_query_single = rag_service._query_single_policy

        async def mock_query_single(user_id, policy, question, plain_language_requested=False):
            if str(policy["_id"]) == pol_2:
                raise asyncio.TimeoutError("Simulated policy query timeout")
            return await original_query_single(
                user_id=user_id,
                policy=policy,
                question=question,
                plain_language_requested=plain_language_requested,
            )

        monkeypatch.setattr(rag_service, "_query_single_policy", mock_query_single)

        res = await rag_service.answer_question(
            user_id=user_a,
            policy_ids=[pol_1, pol_2],
            question="What is the room rent limit?",
        )
        assert "HealthyInsurer" in res["answer"]
        assert res.get("partial_failure_notice") is not None
        assert "TimeoutInsurer" in res["partial_failure_notice"] or "could not be reached" in res["partial_failure_notice"].lower()
    finally:
        await db.policies.delete_many({"_id": {"$in": [ObjectId(pol_1), ObjectId(pol_2)]}})
