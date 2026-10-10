"""
Policy clause indexer for semantic matching and evidence verification.

Extracts discrete policy clauses from structured policy facts (exclusions, waiting periods,
sub-limits, room rent limits, ICU, co-pay) and indexes them into the policy's dedicated
clause collection ('clauses_{policy_id}') via app.vectorstore.registry.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Dict, List, Optional, Sequence

from app.config import settings
from app.embeddings.factory import get_embedder
from app.vectorstore.registry import (
    format_clause_id,
    get_active_embedding_model_name,
    get_clause_index,
    rebuild_clause_index,
)

logger = logging.getLogger("insureai.claims.semantic.clause_index")


@dataclass
class PolicyClauseRecord:
    """A discrete policy clause ready for vector indexing."""
    clause_id: str
    clause_type: str  # exclusion | waiting_period | sub_limit | room_rent | copay | other
    title: str
    text: str
    page: int
    policy_id: str
    metadata: Dict[str, Any]


def extract_clauses_from_policy(
    policy_id: str,
    facts: Sequence[Dict[str, Any]],
    policy_chunks: Optional[Sequence[Any]] = None,
) -> List[PolicyClauseRecord]:
    """
    Deterministically extract discrete policy clauses from stored policy facts and chunks.
    Clause IDs are guaranteed unique and stable:
      - 'ex_{idx}' for exclusions
      - 'wp_{idx}' for waiting periods
      - 'sub_{idx}' for sub-limits
      - 'rr_{idx}' for room rent / ICU
      - 'copay_{idx}' for co-pay
    """
    records: List[PolicyClauseRecord] = []
    ex_idx = 0
    wp_idx = 0
    sub_idx = 0
    rr_idx = 0
    copay_idx = 0

    for fact in facts:
        cat = str(fact.get("category", "")).lower()
        val = str(fact.get("fact_value", "")).strip()
        page = int(fact.get("page_number") or 1)
        raw_text = str(fact.get("source_text") or val or "").strip()

        if not raw_text:
            continue

        if "exclusion" in cat:
            ex_idx += 1
            cid = f"ex_{ex_idx}"
            ctype = "exclusion"
            title = f"Policy Exclusion: {val[:60]}"
        elif "waiting" in cat:
            wp_idx += 1
            cid = f"wp_{wp_idx}"
            ctype = "waiting_period"
            title = f"Waiting Period Clause: {val[:60]}"
        elif "sub_limit" in cat or "sublimit" in cat:
            sub_idx += 1
            cid = f"sub_limit_{sub_idx}"
            ctype = "sub_limit"
            title = f"Sub-limit Clause: {val[:60]}"
        elif "room_rent" in cat or "icu" in cat:
            rr_idx += 1
            cid = f"room_rent_{rr_idx}"
            ctype = "room_rent"
            title = f"Room Rent / ICU Limit: {val[:60]}"
        elif "copay" in cat:
            copay_idx += 1
            cid = f"copay_{copay_idx}"
            ctype = "copay"
            title = f"Co-payment Clause: {val[:60]}"
        else:
            continue

        records.append(
            PolicyClauseRecord(
                clause_id=cid,
                clause_type=ctype,
                title=title,
                text=raw_text,
                page=page,
                policy_id=policy_id,
                metadata={
                    "fact_category": cat,
                    "fact_value": val,
                },
            )
        )

    # If chunks are supplied and contain explicit Section headings (e.g. EXCLUSIONS),
    # carve out discrete numbered lines if not already captured
    if policy_chunks and len(records) < 5:
        for chunk in policy_chunks:
            c_text = getattr(chunk, "text", "") or ""
            c_page = getattr(chunk, "page_number", 1) or 1
            if "EXCLUSION" in c_text.upper() or "WAITING PERIOD" in c_text.upper():
                lines = [line.strip() for line in c_text.splitlines() if line.strip()]
                for line in lines:
                    if len(line) > 30 and any(line.startswith(p) for p in ("1.", "2.", "3.", "4.", "5.", "-", "*", "a.", "b.", "c.")):
                        ex_idx += 1
                        cid = f"ex_chunk_{ex_idx}"
                        records.append(
                            PolicyClauseRecord(
                                clause_id=cid,
                                clause_type="exclusion" if "EXCLUSION" in c_text.upper() else "waiting_period",
                                title=f"Clause {cid}",
                                text=line,
                                page=c_page,
                                policy_id=policy_id,
                                metadata={"derived_from_chunk": True},
                            )
                        )

    return records


def index_policy_clauses(
    policy_id: str,
    clauses: Sequence[PolicyClauseRecord],
    user_id: Optional[str] = None,
    rebuild: bool = False,
) -> int:
    """
    Index policy clauses into the dedicated clauses collection ('clauses_{policy_id}').
    Embeds documents using the active embedding provider.
    """
    if not clauses:
        logger.info("No policy clauses provided to index for policy '%s'", policy_id)
        return 0

    collection = rebuild_clause_index(policy_id, user_id=user_id) if rebuild else get_clause_index(policy_id, user_id=user_id)
    embedder = get_embedder()
    active_model = get_active_embedding_model_name()
    now_iso = datetime.utcnow().isoformat()

    ids = [format_clause_id(policy_id, c.clause_id) for c in clauses]
    texts = [c.text for c in clauses]
    metadatas = [
        {
            "source_type": "policy_clause",
            "policy_id": policy_id,
            "user_id": user_id or "default",
            "clause_id": c.clause_id,
            "clause_type": c.clause_type,
            "title": c.title,
            "page_number": c.page,
            "embedding_model": active_model,
            "created_at": now_iso,
            **c.metadata,
        }
        for c in clauses
    ]

    try:
        embeddings = embedder.embed(texts)
        collection.upsert(
            ids=ids,
            embeddings=embeddings,  # type: ignore[arg-type]
            documents=texts,
            metadatas=metadatas,  # type: ignore[arg-type]
        )
    except Exception as exc:
        logger.warning(
            "Primary embedding provider (%s) failed for clause indexing: %s. Using default Chroma embeddings.",
            settings.embedding_provider,
            exc,
        )
        collection.upsert(
            ids=ids,
            documents=texts,
            metadatas=metadatas,  # type: ignore[arg-type]
        )

    logger.info("Indexed %d policy clauses into 'clauses_%s'", len(clauses), policy_id)
    return len(clauses)


def get_clause_count_by_type(policy_id: str) -> Dict[str, int]:
    """Retrieve breakdown of indexed clauses by clause_type."""
    coll = get_clause_index(policy_id)
    raw = coll.get()
    metas = raw.get("metadatas") or []
    counts: Dict[str, int] = {}
    for m in metas:
        if m:
            ctype = str(m.get("clause_type", "unknown"))
            counts[ctype] = counts.get(ctype, 0) + 1
    return counts
