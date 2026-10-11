"""
FastAPI adapter for the advanced RAG system under app/.
Orchestrates policy lookup, access control, multi-policy scope resolution,
fact mapping, and asynchronous execution of app.rag.qa.answer_question.
"""

from __future__ import annotations

import asyncio
import inspect
import logging
import re
from typing import Any, Dict, List, Optional, Sequence, Union
from bson import ObjectId
from fastapi import HTTPException, status

try:
    from config import settings
    from db import get_async_db, to_object_id
    from services.fact_mapper import mongo_facts_to_rag_facts
except ImportError:
    from server.config import settings
    from server.db import get_async_db, to_object_id
    from server.services.fact_mapper import mongo_facts_to_rag_facts

from app.rag.qa import answer_question, AnswerResult
from app.rag.router import route_question

logger = logging.getLogger("insureai.rag")


class RagService:
    """
    Adapter around app.rag.qa.answer_question.
    Adheres strictly to the target architecture:
      - Validates non-empty question (HTTP 400)
      - Resolves scope (single policy_id, list of policy_ids, or "all")
      - Enforces strict cross-tenant access control (rejects unauthorized IDs with 403/404)
      - Handles MAX_POLICIES_PER_QUESTION cap behavior
      - Runs per-policy queries with isolation and individual timeouts
      - Assembles grouped per-policy answers or comparison tables with strict attribution
    """

    async def _query_single_policy(
        self,
        user_id: str,
        policy: dict,
        question: str,
        plain_language_requested: bool = False,
    ) -> Dict[str, Any]:
        """
        Execute RAG query against a single verified ready policy.
        """
        actual_policy_id = str(policy["_id"])
        mongo_facts = policy.get("facts", [])
        structured_facts = mongo_facts_to_rag_facts(mongo_facts)

        logger.info(
            "Running RAG query for user %s, policy %s: '%s'",
            user_id,
            actual_policy_id,
            question[:50],
        )

        # Call app.rag orchestrator in background thread
        answer_result: AnswerResult = await asyncio.to_thread(
            answer_question,
            policy_id=actual_policy_id,
            question=question,
            structured_facts=structured_facts,
        )

        query_type = answer_result.source_path

        if query_type == "structured":
            verification_passed = True
            verification_notes = (
                answer_result.confidence_reason
                or "Authoritative policy fact extracted from document schedule."
            )
        else:
            verif = answer_result.verification_result or {}
            verif_status = verif.get("verification_status")
            verification_passed = verif_status in ("fully_supported", "partially_supported")
            verification_notes = (
                verif.get("reasoning")
                or answer_result.confidence_reason
                or f"Self-verification status: {verif_status or 'unverified'}"
            )

        confidence_level = (answer_result.confidence or "low").lower()
        if confidence_level not in ("high", "medium", "low"):
            confidence_level = "low"

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
                "section_heading": getattr(cite, "section_heading", None) or "Policy Clause",
                "source_type": getattr(cite, "source_type", "policy_clause"),
                "excerpt": cite.excerpt,
            })

        plain_lang = answer_result.answer
        if plain_language_requested:
            clean_text = answer_result.answer.replace("**", "").replace("__", "").strip()
            plain_lang = f"In simple terms: {clean_text}"

        return {
            "policy_id": actual_policy_id,
            "policy_name": policy.get("insurer_name") or policy.get("file_name") or f"Policy {actual_policy_id[:6]}",
            "query_type": query_type,
            "answer": answer_result.answer,
            "plain_language": plain_lang,
            "confidence_level": confidence_level,
            "verification_passed": verification_passed,
            "verification_notes": verification_notes,
            "citations": citations,
            "checklist": getattr(answer_result, "checklist", None),
            "general_advice": getattr(answer_result, "general_advice", None),
            "heads_up": getattr(answer_result, "heads_up", None),
            "structured_field": getattr(answer_result, "structured_field", None),
        }

    async def answer_question(
        self,
        user_id: str,
        question: str,
        policy_id: Optional[str] = None,
        policy_ids: Optional[List[str]] = None,
        scope: Optional[Union[str, List[str]]] = None,
        plain_language_requested: bool = False,
    ) -> Dict[str, Any]:
        """
        Main entry point supporting explicit scope:
          - single policy_id
          - list of policy_ids
          - scope="all"
        """
        # 1. Validate non-empty question
        if not question or not question.strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Question cannot be empty.",
            )

        db = get_async_db()
        u_oid = to_object_id(user_id)
        user_filter = {"$in": [u_oid, str(user_id)]} if u_oid else str(user_id)

        # 2. Determine target scope
        resolved_policy_ids: List[str] = []
        is_all_scope = False

        if scope == "all":
            is_all_scope = True
        elif isinstance(scope, list) and len(scope) > 0:
            resolved_policy_ids = [str(p).strip() for p in scope if str(p).strip()]
        elif isinstance(scope, str) and scope.strip() and scope != "all":
            resolved_policy_ids = [scope.strip()]
        elif policy_ids and len(policy_ids) > 0:
            resolved_policy_ids = [str(p).strip() for p in policy_ids if str(p).strip()]
        elif policy_id and str(policy_id).strip():
            resolved_policy_ids = [str(policy_id).strip()]

        # 3. Resolve policies and enforce strict ownership verification
        target_policies: List[dict] = []

        if is_all_scope or (not resolved_policy_ids):
            # Resolve ready policies belonging to the user
            if is_all_scope:
                cursor = db.policies.find({"user_id": user_filter, "status": "ready"}).sort("uploaded_at", -1)
                if hasattr(cursor, "to_list"):
                    res = cursor.to_list(length=100)
                    target_policies = await res if inspect.isawaitable(res) else res
                else:
                    target_policies = [p for p in cursor]
            else:
                # Omitted policy_id in single-policy context: query latest ready policy directly via find_one
                single_ready = await db.policies.find_one({"user_id": user_filter, "status": "ready"}, sort=[("uploaded_at", -1)])
                if single_ready:
                    target_policies = [single_ready]

            if not target_policies:
                # Check if user has any policy in other statuses
                any_policy = await db.policies.find_one({"user_id": user_filter}, sort=[("uploaded_at", -1)])
                if any_policy:
                    curr_status = any_policy.get("status", "unknown")
                    err_msg = (
                        any_policy.get("processing_error")
                        or f"Policy is currently in '{curr_status}' status. Please wait for processing to complete."
                    )
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=err_msg,
                    )
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="No policy found. Please upload a policy PDF first.",
                )

            # If user has only 1 policy, treat as single-policy query
            if len(target_policies) == 1 and not is_all_scope:
                resolved_policy_ids = [str(target_policies[0]["_id"])]

        else:
            # Client passed explicit IDs: verify ownership of every single ID
            for pid_str in resolved_policy_ids:
                p_oid = to_object_id(pid_str)
                if not p_oid:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"Invalid policy ID format: {pid_str}",
                    )

                policy_doc = await db.policies.find_one({"_id": p_oid, "user_id": user_filter})
                if not policy_doc:
                    # Check if policy exists under another user
                    existing = await db.policies.find_one({"_id": p_oid})
                    if existing:
                        logger.warning(
                            "Access denied: user %s attempted to query policy %s belonging to another user",
                            user_id, pid_str
                        )
                        raise HTTPException(
                            status_code=status.HTTP_403_FORBIDDEN,
                            detail=f"Access denied: you do not have permission to access policy {pid_str}.",
                        )
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail=f"Policy {pid_str} not found.",
                    )

                if policy_doc.get("status") != "ready":
                    err_msg = (
                        policy_doc.get("processing_error")
                        or f"Policy '{policy_doc.get('insurer_name', pid_str)}' is in '{policy_doc.get('status')}' status and cannot be queried."
                    )
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=err_msg,
                    )

                target_policies.append(policy_doc)

        # 4. Single-Policy Flow (unchanged behavior)
        if len(target_policies) == 1 and not is_all_scope and len(resolved_policy_ids) <= 1:
            single_pol = target_policies[0]
            single_res = await self._query_single_policy(
                user_id=user_id,
                policy=single_pol,
                question=question,
                plain_language_requested=plain_language_requested,
            )
            pol_name = single_res["policy_name"]
            single_res["scope_label"] = pol_name
            single_res["scope_policy_ids"] = [str(single_pol["_id"])]
            return single_res

        # 5. Multi-Policy Flow
        max_cap = getattr(settings, "MAX_POLICIES_PER_QUESTION", 5)
        num_policies = len(target_policies)

        # Check routing to determine if question is structured vs. semantic
        routed_field = route_question(question)

        # Cap handling
        if num_policies > max_cap:
            if not routed_field:
                # Semantic question exceeding cap: ask user to narrow selection
                cap_msg = (
                    f"You have selected {num_policies} policies, which exceeds the limit of {max_cap} policies per question for detailed semantic search. "
                    f"Please narrow your policy selection to {max_cap} or fewer policies using the policy selector on the left."
                )
                return {
                    "query_type": "semantic",
                    "answer": cap_msg,
                    "plain_language": cap_msg,
                    "confidence_level": "medium",
                    "verification_passed": True,
                    "verification_notes": f"Prompted user to narrow policy scope (selected {num_policies}, cap {max_cap}).",
                    "citations": [],
                    "scope_label": f"All Policies ({num_policies} selected - exceeded limit)",
                    "scope_policy_ids": [str(p["_id"]) for p in target_policies],
                }
            # For structured questions: proceed to answer from facts table for all policies!

        # Check if question explicitly names a specific policy to order first
        q_lower = question.lower()
        def _policy_priority(pol: dict) -> int:
            name = (pol.get("insurer_name") or pol.get("file_name") or "").lower()
            return 0 if (name and name in q_lower) else 1

        target_policies.sort(key=_policy_priority)

        # 6. Execute per-policy queries with individual timeouts
        timeout_seconds = 15.0
        tasks = [
            asyncio.wait_for(
                self._query_single_policy(
                    user_id=user_id,
                    policy=p,
                    question=question,
                    plain_language_requested=plain_language_requested,
                ),
                timeout=timeout_seconds,
            )
            for p in target_policies
        ]

        results = await asyncio.gather(*tasks, return_exceptions=True)

        successful_results: List[Dict[str, Any]] = []
        failed_policy_names: List[str] = []

        for p_doc, outcome in zip(target_policies, results):
            p_name = p_doc.get("insurer_name") or p_doc.get("file_name") or str(p_doc["_id"])[:6]
            if isinstance(outcome, Exception):
                logger.warning("Query for policy %s failed or timed out: %s", p_name, outcome)
                failed_policy_names.append(p_name)
            else:
                successful_results.append(outcome)

        if not successful_results:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="All selected policies timed out or encountered an error while processing.",
            )

        # 7. Aggregate Citations and Attributions
        all_citations: List[Dict[str, Any]] = []
        for res in successful_results:
            all_citations.extend(res.get("citations", []))

        # Build Scope Label
        policy_names_in_scope = [res["policy_name"] for res in successful_results]
        scope_label = f"Answered from: {', '.join(policy_names_in_scope)}"
        scope_ids = [res["policy_id"] for res in successful_results]

        # 8. Check if this is a Fact Comparison question or general question
        is_structured_comp = all(res.get("query_type") == "structured" for res in successful_results)

        answer_parts: List[str] = []

        if is_structured_comp and routed_field:
            # Deterministic Comparison Table from structured facts reusing single-policy formatter
            from app.rag.qa import _format_structured_answer
            field_header = routed_field.replace("_", " ").title()
            table_lines = [
                f"### Comparison: {field_header}",
                "",
                f"| Policy | {field_header} | Source Pages |",
                "| :--- | :--- | :--- |",
            ]
            for res in successful_results:
                p_name = res["policy_name"]
                cites = res.get("citations", [])
                p_pages = sorted(list(set(c["page_number"] for c in cites if c.get("page_number"))))
                p_cite = f"Page {', '.join(str(p) for p in p_pages)}" if p_pages else "—"

                # Pull raw fact from target_policies and invoke existing single-policy formatter
                matching_p = next((p for p in target_policies if str(p["_id"]) == res["policy_id"]), None)
                if matching_p:
                    m_facts = matching_p.get("facts", [])
                    st_facts = mongo_facts_to_rag_facts(m_facts)
                    f_data = st_facts.get(routed_field)
                    single_ans, _, _ = _format_structured_answer(routed_field, f_data)
                else:
                    single_ans = res["answer"]

                # Extract cell text from single-policy answer to keep wording identical
                clean_ans = single_ans.strip()
                if "no " in clean_ans.lower() and ("found" in clean_ans.lower() or "applicable" in clean_ans.lower() or "mentioned" in clean_ans.lower()):
                    cell_val = "Not found in this policy"
                    p_cite = "—"
                elif routed_field in ("sum_insured", "room_rent_limit", "co_pay", "deductible"):
                    m_bold = re.search(r"\*\*([^*]+)\*\*", clean_ans)
                    cell_val = m_bold.group(1).strip() if m_bold else clean_ans
                elif routed_field in ("waiting_periods", "exclusions", "claim_conditions"):
                    lines = [l.strip() for l in clean_ans.splitlines() if l.strip().startswith("-")]
                    items = []
                    for l in lines:
                        clean_item = re.sub(r"^\s*-\s*", "", l)
                        clean_item = re.sub(r"\s*\(Page\s+\d+\)$", "", clean_item).strip()
                        clean_item = clean_item.replace("**", "").strip()
                        items.append(clean_item)
                    cell_val = "; ".join(items) if items else "Not found in this policy"
                else:
                    cell_val = clean_ans

                # Ensure no newlines or pipes inside markdown table cell
                clean_cell = cell_val.replace("\n", " ").replace("|", "/").strip()
                if not clean_cell or "not found" in clean_cell.lower():
                    clean_cell = "Not found in this policy"
                    p_cite = "—"

                table_lines.append(f"| **{p_name}** | {clean_cell} | {p_cite} |")

            answer_parts.append("\n".join(table_lines))
        else:
            # Non-comparative or semantic multi-policy answer: group per policy
            for res in successful_results:
                p_name = res["policy_name"]
                conf = res.get("confidence_level", "medium").upper()
                v_badge = "✓ Verified" if res.get("verification_passed") else "⚠️ Unverified"
                answer_parts.append(
                    f"### {p_name} ({conf} Confidence · {v_badge})\n\n{res['answer']}"
                )

        partial_notice: Optional[str] = None
        if failed_policy_names:
            partial_notice = f"Note: Queries for policy(ies) '{', '.join(failed_policy_names)}' timed out and are omitted from this response."
            answer_parts.append(f"\n\n> ⚠️ **Partial Response**: {partial_notice}")

        combined_answer = "\n\n---\n\n".join(answer_parts)
        combined_plain = combined_answer.replace("**", "").replace("__", "")

        # Lowest confidence among results
        all_confs = [res.get("confidence_level", "low") for res in successful_results]
        overall_conf = "high" if all(c == "high" for c in all_confs) else ("medium" if "medium" in all_confs or "high" in all_confs else "low")
        overall_verif = all(res.get("verification_passed", False) for res in successful_results)

        return {
            "query_type": "structured" if is_structured_comp else "semantic",
            "answer": combined_answer,
            "plain_language": combined_plain,
            "confidence_level": overall_conf,
            "verification_passed": overall_verif,
            "verification_notes": f"Multi-policy scope answered across {len(successful_results)} policies.",
            "citations": all_citations,
            "scope_label": scope_label,
            "scope_policy_ids": scope_ids,
            "partial_failure_notice": partial_notice,
        }


rag_service = RagService()
