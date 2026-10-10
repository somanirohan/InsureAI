#!/usr/bin/env python3
"""
Migration script to upgrade existing claim checklists to the new split schema
(Requirements and Documents).
Supports --dry-run to preview changes without modifying MongoDB.
Never deletes any uploaded files or documents.
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import os
import sys
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple

# Ensure project root is in sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from app.claims.builder import build_claim_workflow_checklist
from app.claims.checklist_vocabulary import DOCUMENT_TYPES
from server.db import get_async_db, to_object_id
from server.services.fact_mapper import mongo_facts_to_rag_facts

logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
logger = logging.getLogger("insureai.migrate_checklists")

OLD_TO_NEW_SLOT_MAP = {
    "final_bill": "itemised_bills",
    "itemized_bills": "itemised_bills",
    "preauth_form": "preauth_approval_letter",
    "identity_proof": "id_proof",
    "investigation_reports": "diagnostic_reports",
    "reimbursement_claim_form": "claim_form",
    "emergency_intimation": "admission_intimation",
}


def migrate_single_claim_data(claim: Dict[str, Any], policy: Optional[Dict[str, Any]]) -> Tuple[List[Dict[str, Any]], List[Dict[str, Any]], List[str]]:
    """
    Deterministically rebuilds the checklist and maps existing uploaded documents.
    Returns: (new_checklist, updated_documents, audit_log)
    """
    audit_log: List[str] = []
    rag_facts = mongo_facts_to_rag_facts(policy.get("facts", [])) if policy else {}

    treatment = claim.get("treatment") or {}
    adm_date = treatment.get("admission_date")
    dis_date = treatment.get("discharge_date")

    workflow_items = build_claim_workflow_checklist(
        rag_facts,
        admission_date=adm_date,
        discharge_date=dis_date,
    )
    new_checklist = [it.model_dump() for it in workflow_items]
    new_doc_slots = {it["item_id"]: it for it in new_checklist if it["kind"] == "document"}
    new_req_slots = {it["item_id"]: it for it in new_checklist if it["kind"] == "requirement"}

    existing_docs = claim.get("documents", [])
    updated_docs: List[Dict[str, Any]] = []

    for doc in existing_docs:
        doc_copy = dict(doc)
        old_item_id = doc_copy.get("item_id")
        target_slot_id = old_item_id

        # 1. Direct match in new document slots
        if target_slot_id in new_doc_slots:
            slot = new_doc_slots[target_slot_id]
            slot["document_id"] = doc_copy["document_id"]
            slot["status"] = "needs_confirmation" if doc_copy.get("needs_confirmation") else "validated"
            audit_log.append(f"Document '{doc_copy.get('filename')}' kept at '{target_slot_id}'")
        # 2. Known mapping to new vocabulary slot
        elif target_slot_id in OLD_TO_NEW_SLOT_MAP and OLD_TO_NEW_SLOT_MAP[target_slot_id] in new_doc_slots:
            new_id = OLD_TO_NEW_SLOT_MAP[target_slot_id]
            doc_copy["item_id"] = new_id
            slot = new_doc_slots[new_id]
            slot["document_id"] = doc_copy["document_id"]
            slot["status"] = "needs_confirmation" if doc_copy.get("needs_confirmation") else "validated"
            audit_log.append(f"Document '{doc_copy.get('filename')}' remapped from '{old_item_id}' to '{new_id}'")
        # 3. Was attached to a requirement slot (e.g. preauthorisation)
        elif target_slot_id in new_req_slots:
            req_slot = new_req_slots[target_slot_id]
            req_slot["document_id"] = doc_copy["document_id"]
            req_slot["status"] = "done"
            audit_log.append(f"Document '{doc_copy.get('filename')}' attached as proof to requirement '{target_slot_id}'")
        # 4. Unmatched: mark needs_confirmation with note
        else:
            doc_copy["needs_confirmation"] = True
            issues = doc_copy.setdefault("validation_issues", [])
            note = "reassign this file to a document slot"
            if note not in issues:
                issues.append(note)
            audit_log.append(f"Document '{doc_copy.get('filename')}' unmatched (old slot: '{old_item_id}'); marked needs_confirmation: '{note}'")

        updated_docs.append(doc_copy)

    # Preserve any user-marked done requirements from old checklist
    old_checklist = {it.get("item_id"): it for it in claim.get("checklist", [])}
    for req_id, req_item in new_req_slots.items():
        if req_id in old_checklist and old_checklist[req_id].get("status") == "done":
            req_item["status"] = "done"

    return new_checklist, updated_docs, audit_log


async def run_migration(dry_run: bool = False) -> None:
    db = get_async_db()
    cursor = db.claims.find({"status": {"$in": ["draft", "docs_pending"]}})
    claims_to_migrate = await cursor.to_list(length=1000)

    logger.info("Found %d claim(s) in 'draft' or 'docs_pending' eligible for checklist migration.", len(claims_to_migrate))

    migrated_count = 0
    for claim in claims_to_migrate:
        claim_id = claim.get("claim_id")
        policy_id = claim.get("policy_id")

        policy = None
        if policy_id:
            p_oid = to_object_id(policy_id)
            if p_oid:
                policy = await db.policies.find_one({"_id": p_oid})

        new_checklist, updated_docs, audit = migrate_single_claim_data(claim, policy)

        logger.info("--- Claim %s (%s) ---", claim_id, claim.get("status"))
        for log_entry in audit:
            logger.info("  * %s", log_entry)

        req_count = sum(1 for it in new_checklist if it.get("kind") == "requirement")
        doc_count = sum(1 for it in new_checklist if it.get("kind") == "document")
        logger.info("  Resulting checklist: %d requirement(s), %d document slot(s)", req_count, doc_count)

        if not dry_run:
            now_iso = datetime.utcnow().isoformat()
            timeline = claim.get("timeline", [])
            timeline.append({
                "timestamp": now_iso,
                "event": "Checklist migrated to requirements/documents schema",
                "note": f"Migrated {len(new_checklist)} checklist items ({req_count} requirements, {doc_count} documents)",
            })

            await db.claims.update_one(
                {"claim_id": claim_id},
                {"$set": {
                    "checklist": new_checklist,
                    "documents": updated_docs,
                    "timeline": timeline,
                    "updated_at": now_iso,
                }}
            )
            migrated_count += 1
        else:
            logger.info("  [DRY RUN] No changes written to database.")

    mode_str = "DRY RUN COMPLETE" if dry_run else "MIGRATION COMPLETE"
    logger.info("%s: Processed %d claim(s).", mode_str, len(claims_to_migrate))


def main() -> None:
    parser = argparse.ArgumentParser(description="Migrate claim checklists to requirements & documents split.")
    parser.add_argument("--dry-run", action="store_true", help="Preview migration without modifying MongoDB.")
    args = parser.parse_args()

    asyncio.run(run_migration(dry_run=args.dry_run))


if __name__ == "__main__":
    main()
