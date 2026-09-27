"""
FastAPI adapter for the advanced RAG system under app/.
Orchestrates policy lookup, access control, fact mapping, and asynchronous execution
of app.rag.qa.answer_question.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any, Dict, Optional
from bson import ObjectId
from fastapi import HTTPException, status

try:
    from db import get_async_db, to_object_id
    from services.fact_mapper import mongo_facts_to_rag_facts
except ImportError:
    from server.db import get_async_db, to_object_id
    from server.services.fact_mapper import mongo_facts_to_rag_facts

from app.rag.qa import answer_question, AnswerResult

logger = logging.getLogger("insureai.rag")


class RagService:
    """
    Adapter around app.rag.qa.answer_question.
    Adheres strictly to the target architecture:
      - Validates non-empty question (HTTP 400)
      - Validates user ownership of policy and ObjectId format (HTTP 400 / 403 / 404)
      - Rejects non-ready policies with stored error or status (HTTP 400)
      - Maps MongoDB facts to app.rag structured_facts
      - Runs blocking RAG work in a background worker thread via asyncio.to_thread
      - Maps AnswerResult verification_status, confidence, citations, and plain language
    """

    async def answer_question(
        self,
        user_id: str,
        policy_id: Optional[str],
        question: str,
        plain_language_requested: bool = False,
    ) -> Dict[str, Any]:
        """
        Main RAG question-answering entrypoint for FastAPI.
        """
        # 1. Validate the question: Reject empty or whitespace-only questions
        if not question or not question.strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Question cannot be empty.",
            )

        db = get_async_db()
        u_oid = to_object_id(user_id)
        user_filter = {"$in": [u_oid, str(user_id)]} if u_oid else str(user_id)

        # 2. Validate the user and policy
        policy = None
        clean_policy_id = str(policy_id).strip() if policy_id is not None and str(policy_id).strip() != "" else None

        if clean_policy_id:
            p_oid = to_object_id(clean_policy_id)
            if not p_oid:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid policy ID format: {clean_policy_id}",
                )

            # Query by both policy ID and user ownership
            policy = await db.policies.find_one({"_id": p_oid, "user_id": user_filter})
            if not policy:
                # Check if the policy exists under another user (cross-tenant access)
                existing = await db.policies.find_one({"_id": p_oid})
                if existing:
                    logger.warning("Access denied: user %s attempted to query policy %s belonging to another user", user_id, clean_policy_id)
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="Access denied: you do not have permission to access this policy.",
                    )
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Policy {clean_policy_id} not found.",
                )
        else:
            # When policy_id is not provided:
            # Select the latest ready policy belonging to the current user
            policy = await db.policies.find_one(
                {"user_id": user_filter, "status": "ready"},
                sort=[("uploaded_at", -1)],
            )
            if not policy:
                # Check if the user has any policy that is still processing or in another status
                latest_user_policy = await db.policies.find_one(
                    {"user_id": user_filter},
                    sort=[("uploaded_at", -1)],
                )
                if latest_user_policy:
                    curr_status = latest_user_policy.get("status", "unknown")
                    err_msg = (
                        latest_user_policy.get("processing_error")
                        or f"Policy is currently in '{curr_status}' status. Please wait for processing to complete."
                    )
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=err_msg,
                    )
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="No policy found for user. Please upload a policy PDF first.",
                )

        # 3. Reject policies that are not ready
        pol_status = policy.get("status")
        if pol_status != "ready":
            err_msg = (
                policy.get("processing_error")
                or f"Policy is in '{pol_status}' status and cannot be queried."
            )
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=err_msg,
            )

        # 4. Convert stored facts
        mongo_facts = policy.get("facts", [])
        structured_facts = mongo_facts_to_rag_facts(mongo_facts)

        actual_policy_id = str(policy["_id"])

        # 5. Call the advanced RAG orchestrator in a worker thread via asyncio.to_thread
        logger.info(
            "Running RAG query for user %s, policy %s: '%s'",
            user_id,
            actual_policy_id,
            question[:50],
        )
        answer_result: AnswerResult = await asyncio.to_thread(
            answer_question,
            policy_id=actual_policy_id,
            question=question,
            structured_facts=structured_facts,
        )

        # 6. Map verification correctly
        query_type = answer_result.source_path  # "structured" or "semantic"

        if query_type == "structured":
            verification_passed = True
            verification_notes = (
                answer_result.confidence_reason
                or "Authoritative policy fact extracted from document schedule."
            )
        else:
            verif = answer_result.verification_result or {}
            verif_status = verif.get("verification_status")
            verification_passed = verif_status in (
                "fully_supported",
                "partially_supported",
            )
            verification_notes = (
                verif.get("reasoning")
                or answer_result.confidence_reason
                or f"Self-verification status: {verif_status or 'unverified'}"
            )

        # 7. Map confidence ("High" -> "high", "Medium" -> "medium", "Low" -> "low")
        confidence_level = (answer_result.confidence or "low").lower()
        if confidence_level not in ("high", "medium", "low"):
            confidence_level = "low"

        # 8. Map citations without inventing metadata
        citations = []
        for cite in answer_result.citations:
            chunk_vec_id = (
                f"{actual_policy_id}_{cite.chunk_id}"
                if getattr(cite, "chunk_id", None) is not None
                else None
            )
            citations.append({
                "policy_id": actual_policy_id,
                "chunk_vector_id": chunk_vec_id,
                "page_number": cite.page_number,
                "section_heading": getattr(cite, "section_heading", None),
                "excerpt": cite.excerpt,
            })

        # 9. Plain-language response
        plain_lang = answer_result.answer
        if plain_language_requested:
            clean_text = answer_result.answer.replace("**", "").replace("__", "").strip()
            plain_lang = f"In simple terms: {clean_text}"

        # 10. Preserve API response format
        return {
            "query_type": query_type,
            "answer": answer_result.answer,
            "plain_language": plain_lang,
            "confidence_level": confidence_level,
            "verification_passed": verification_passed,
            "verification_notes": verification_notes,
            "citations": citations,
        }


rag_service = RagService()
