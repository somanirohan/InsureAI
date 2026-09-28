"""
Policy ingestion and lifecycle management service for InsureAI.
Directly coordinates PDF extraction (app/ingestion/pdf_extract.py),
hierarchical chunking (app/ingestion/chunking.py),
structured fact extraction (app/rag/extraction.py),
and per-policy vector indexing (app/rag/vectorstore.py).
"""

from __future__ import annotations

import asyncio
import logging
import math
import os
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional
from bson import ObjectId

try:
    from db import get_async_db, to_object_id
    from services.fact_mapper import rag_facts_to_mongo_facts
except ImportError:
    from server.db import get_async_db, to_object_id
    from server.services.fact_mapper import rag_facts_to_mongo_facts

from app.ingestion.pdf_extract import extract_pages, PageText
from app.ingestion.chunking import chunk_pages, Chunk
from app.rag.extraction import extract_structured_facts
from app.rag.vectorstore import index_chunks, delete_policy_index

logger = logging.getLogger("insureai.policy")


def _blocking_extraction_pipeline(file_path: str) -> tuple[list[PageText], list[Chunk], dict[str, Any]]:
    """
    Synchronous blocking extraction, chunking, and LLM structured extraction pipeline.
    Must be executed via asyncio.to_thread to avoid blocking the event loop.
    """
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"Policy file not found at path: {file_path}")

    # Validate PDF header bytes
    with open(file_path, "rb") as f:
        header = f.read(5)
        if not header.startswith(b"%PDF-"):
            raise ValueError(f"Invalid PDF file format for file: {file_path}")

    # 1. Page extraction (with native PyMuPDF and OCR fallback)
    pages = extract_pages(file_path)
    if not pages:
        raise ValueError("Failed to extract any text or pages from the uploaded PDF.")

    # 2. Page-bound hierarchical chunking
    chunks = chunk_pages(pages)

    # 3. Targeted LLM structured facts extraction
    rag_facts = extract_structured_facts(pages)

    return pages, chunks, rag_facts


class PolicyService:
    """
    Service managing policy document lifecycle, end-to-end background extraction,
    and cascaded policy deletion.
    """

    async def process_policy_document(self, policy_id: str, user_id: str) -> None:
        """
        Background document processing pipeline:
          1. Validate PDF file exists.
          2. Set status to 'extracting'.
          3. Run extract_pages(), chunk_pages(), extract_structured_facts() in a worker thread.
          4. Map facts using rag_facts_to_mongo_facts().
          5. Index chunks into isolated ChromaDB collection using app.rag.vectorstore.index_chunks().
          6. Persist policy facts, chunk metadata, and update status to 'ready'.
          7. On failure, cleanly rollback vector index, set status to 'failed', and store error.
        """
        db = get_async_db()
        p_oid = to_object_id(policy_id)
        u_oid = to_object_id(user_id)
        if not p_oid or not u_oid:
            logger.error("Invalid policy_id (%s) or user_id (%s) provided for processing.", policy_id, user_id)
            return

        policy = await db.policies.find_one({"_id": p_oid, "user_id": u_oid})
        if not policy:
            logger.error("Policy %s for user %s not found in MongoDB.", policy_id, user_id)
            return

        file_path = policy.get("file_path", "")

        try:
            # Step 1: Update status to 'extracting'
            await db.policies.update_one(
                {"_id": p_oid},
                {"$set": {
                    "status": "extracting",
                    "processing_error": None,
                    "updated_at": datetime.utcnow(),
                }}
            )
            logger.info("Starting extraction pipeline for policy %s (file: %s)", policy_id, file_path)

            # Step 2: Run heavy CPU/GPU/LLM pipeline in a background thread pool
            pages, chunks, rag_facts = await asyncio.to_thread(_blocking_extraction_pipeline, file_path)

            # Step 3: Convert RAG structured facts to MongoDB facts schema
            mongo_facts = rag_facts_to_mongo_facts(rag_facts)

            # Step 4: Derive top-level policy fields strictly from extracted facts (never fake or guess!)
            ocr_used = any(p.source == "ocr" for p in pages)

            # Extract numeric sum insured from facts if available
            sum_insured_num = None
            sum_fact = next((f for f in mongo_facts if f.get("category") == "sum_insured"), None)
            if sum_fact and sum_fact.get("fact_value_numeric") is not None:
                sum_insured_num = float(sum_fact["fact_value_numeric"])

            # Extract numeric premium amount from facts if available
            premium_num = None
            prem_fact = next((f for f in mongo_facts if f.get("category") == "premium"), None)
            if prem_fact and prem_fact.get("fact_value_numeric") is not None:
                premium_num = float(prem_fact["fact_value_numeric"])

            # Extract auto-detected insurer name, policy type, policy number
            detected_insurer = None
            if rag_facts.get("insurer_name") and isinstance(rag_facts["insurer_name"], dict):
                detected_insurer = rag_facts["insurer_name"].get("value")

            detected_policy_type = None
            if rag_facts.get("policy_type") and isinstance(rag_facts["policy_type"], dict):
                detected_policy_type = rag_facts["policy_type"].get("value")

            detected_policy_number = None
            if rag_facts.get("policy_number") and isinstance(rag_facts["policy_number"], dict):
                detected_policy_number = rag_facts["policy_number"].get("value")

            # Derive red flags strictly from extracted facts
            waiting_list = [
                f"{wp.get('condition')}: {wp.get('period')}"
                for wp in rag_facts.get("waiting_periods", [])
                if isinstance(wp, dict) and (wp.get("condition") or wp.get("period"))
            ]
            exclusions_list = [
                str(ex.get("item"))
                for ex in rag_facts.get("exclusions", [])
                if isinstance(ex, dict) and ex.get("item")
            ]
            claims_list = [
                str(cc.get("condition"))
                for cc in rag_facts.get("claim_conditions", [])
                if isinstance(cc, dict) and cc.get("condition")
            ]
            room_cap_val = rag_facts.get("room_rent_limit", {}).get("value") if isinstance(rag_facts.get("room_rent_limit"), dict) else None
            copay_val = rag_facts.get("co_pay", {}).get("value") if isinstance(rag_facts.get("co_pay"), dict) else None

            red_flag_summary = {
                "waiting_periods": waiting_list,
                "major_exclusions": exclusions_list,
                "room_rent_cap": room_cap_val,
                "copay_percentage": copay_val,
                "claim_conditions": claims_list,
            }

            # Step 5: Index real chunks into isolated ChromaDB collection
            # Run in worker thread to prevent blocking
            logger.info("Indexing %d chunks into Chroma for policy %s...", len(chunks), policy_id)
            await asyncio.to_thread(index_chunks, str(policy_id), chunks)

            # Step 6: Store chunk metadata in MongoDB (policy_chunks)
            if chunks:
                chunks_to_insert = [
                    {
                        "policy_id": p_oid,
                        "user_id": u_oid,
                        "chunk_index": c.chunk_id,
                        "chunk_text": c.text,
                        "page_number": c.page_number,
                        "section_heading": f"Page {c.page_number} Clause",
                        "token_count": math.ceil(len(c.text.split()) * 1.3),
                        "vector_id": f"{policy_id}_{c.chunk_id}",
                    }
                    for c in chunks
                ]
                # Clean existing chunks on re-process
                await db.policy_chunks.delete_many({"policy_id": p_oid})
                await db.policy_chunks.insert_many(chunks_to_insert)

            # Step 7: Update policy in MongoDB to 'ready'
            now = datetime.utcnow()
            update_fields: dict[str, Any] = {
                "status": "ready",
                "ocr_used": ocr_used,
                "red_flag_summary": red_flag_summary,
                "facts": mongo_facts,
                "processing_error": None,
                "indexed_at": now,
                "updated_at": now,
            }
            if detected_insurer:
                update_fields["insurer_name"] = detected_insurer
            if detected_policy_type:
                update_fields["policy_type"] = detected_policy_type
            if detected_policy_number:
                update_fields["policy_number"] = detected_policy_number
            if sum_insured_num is not None:
                update_fields["sum_insured"] = sum_insured_num
            if premium_num is not None:
                update_fields["premium_amount"] = premium_num

            await db.policies.update_one({"_id": p_oid}, {"$set": update_fields})
            logger.info("Policy %s successfully processed and marked ready.", policy_id)

        except Exception as exc:
            logger.exception("Extraction failed for policy %s: %s", policy_id, exc)
            # Cleanup any partially created vector index
            try:
                await asyncio.to_thread(delete_policy_index, str(policy_id))
            except Exception as clean_err:
                logger.warning("Error cleaning up partial Chroma collection for %s: %s", policy_id, clean_err)

            # Mark policy as failed with safe error description
            safe_error = f"Extraction failed: {type(exc).__name__} - {str(exc)[:200]}"
            await db.policies.update_one(
                {"_id": p_oid},
                {"$set": {
                    "status": "failed",
                    "processing_error": safe_error,
                    "updated_at": datetime.utcnow(),
                }}
            )

    async def delete_policy_cascade(self, user_id: str, policy_id: str) -> Dict[str, Any]:
        """
        Cascade delete policy and clean vector store, chunk records, and references.
        Verifies ownership before deleting.
        """
        db = get_async_db()
        p_oid = to_object_id(policy_id)
        u_oid = to_object_id(user_id)
        if not p_oid or not u_oid:
            raise ValueError("Invalid user or policy identifier.")

        policy = await db.policies.find_one({"_id": p_oid, "user_id": u_oid})
        if not policy:
            raise PermissionError("Policy not found or access denied.")

        # 1. Clean ChromaDB isolated vector collection
        try:
            await asyncio.to_thread(delete_policy_index, str(policy_id))
        except Exception as exc:
            logger.warning("Failed to delete Chroma collection for policy %s: %s", policy_id, exc)

        # 2. Delete MongoDB policy chunks
        await db.policy_chunks.delete_many({"policy_id": p_oid, "user_id": u_oid})

        # 3. Clear policy references in conversations
        await db.conversations.update_many(
            {"policy_id": p_oid, "user_id": u_oid},
            {"$set": {"policy_id": None}}
        )

        # 4. Delete cost estimates associated with policy
        await db.cost_estimates.delete_many({"policy_id": p_oid, "user_id": u_oid})

        # 5. Remove policy document
        await db.policies.delete_one({"_id": p_oid, "user_id": u_oid})

        # 6. Delete file from disk if present
        file_path = policy.get("file_path")
        if file_path and os.path.exists(file_path):
            try:
                os.remove(file_path)
            except OSError as err:
                logger.warning("Could not delete policy file %s from disk: %s", file_path, err)

        return {"success": True, "message": "Policy and associated records deleted successfully."}


policy_service = PolicyService()
