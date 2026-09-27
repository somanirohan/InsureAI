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
      - Validates user ownership of policy
      - Rejects non-ready policies
      - Maps MongoDB facts to app.rag structured_facts
      - Runs blocking RAG work in a background worker thread via asyncio.to_thread
      - Maps AnswerResult to frontend-compatible response
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
        if not question or not question.strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Question cannot be empty.",
            )

        db = get_async_db()
        u_oid = to_object_id(user_id)
        user_filter = {"$in": [u_oid, str(user_id)]} if u_oid else str(user_id)

        policy = None
        if policy_id:
            p_oid = to_object_id(policy_id)
            if not p_oid:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Invalid policy ID format: {policy_id}",
                )
            # Verify policy exists AND belongs to the user
            policy = await db.policies.find_one({"_id": p_oid, "user_id": user_filter})
            if not policy:
                # Check if policy exists under another user to prevent cross-tenant access
                existing = await db.policies.find_one({"_id": p_oid})
                if existing:
                    logger.warning("Access denied: user %s attempted to query policy %s", user_id, policy_id)
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="Access denied: you do not have permission to access this policy.",
                    )
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail=f"Policy {policy_id} not found.",
                )
        else:
            # Pick latest ready policy for user
            policy = await db.policies.find_one(
                {"user_id": user_filter, "status": "ready"},
                sort=[("uploaded_at", -1)],
            )
            if not policy:
                # Check if there is any policy in extracting/uploading status
                in_prog = await db.policies.find_one(
                    {"user_id": user_filter},
                    sort=[("uploaded_at", -1)],
                )
                if in_prog:
                    status_val = in_prog.get("status", "unknown")
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Your policy is currently in '{status_val}' status. Please wait for processing to complete.",
                    )
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="No active policy found. Please upload a policy PDF first.",
                )

        # 4. Reject policies that are not ready
        pol_status = policy.get("status")
        if pol_status != "ready":
            err_msg = policy.get("processing_error") or f"Policy is in '{pol_status}' status and cannot be queried."
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=err_msg,
            )

        # 5. Convert MongoDB policy.facts into structured_facts format expected by app.rag.qa
        mongo_facts = policy.get("facts", [])
        structured_facts = mongo_facts_to_rag_facts(mongo_facts)

        actual_policy_id = str(policy["_id"])

        # 6. Call answer_question in a worker thread so we do NOT block the event loop
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

        # 7. Convert AnswerResult to frontend-compatible response schema
        query_type = answer_result.source_path  # "structured" or "semantic"
        confidence_level = answer_result.confidence.lower()  # "high", "medium", "low"

        if query_type == "structured":
            verification_passed = True
            verification_notes = (
                answer_result.confidence_reason
                or "Grounded directly in authoritative policy facts with zero generation risk."
            )
        else:
            verif = answer_result.verification_result or {}
            verif_status = verif.get("status")
            verification_passed = verif_status in ("fully_supported", "partially_supported")
            verification_notes = (
                answer_result.confidence_reason
                or (f"Self-verification status: {verif_status}")
            )

        # Citations mapping
        citations = []
        for cite in answer_result.citations:
            chunk_vec_id = f"{actual_policy_id}_{cite.chunk_id}" if cite.chunk_id is not None else None
            citations.append({
                "policy_id": actual_policy_id,
                "chunk_vector_id": chunk_vec_id,
                "page_number": cite.page_number,
                "section_heading": f"Page {cite.page_number} Clause",
                "excerpt": cite.excerpt,
            })

        # Plain language transformation
        plain_lang = answer_result.answer
        if plain_language_requested:
            # Clean up markdown asterisks for plain language readers if desired
            clean_text = answer_result.answer.replace("**", "").replace("__", "")
            plain_lang = f"In simple terms: {clean_text}"

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
