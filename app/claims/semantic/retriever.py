"""
Semantic Retriever for policy clauses.

Expands query abbreviations, queries the scoped clauses collection ('clauses_{policy_id}'),
and returns validated candidate policy clauses.
Falls back safely to BM25 baseline if vectorstore or embeddings encounter issues.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional

from app.claims.semantic.abbreviations import expand_abbreviations
from app.claims.semantic.baseline import BM25ClauseIndex
from app.embeddings.factory import get_embedder
from app.vectorstore.registry import get_clause_index, validate_retrieved_records

logger = logging.getLogger("insureai.claims.semantic.retriever")


class CandidateClause:
    """A retrieved policy clause candidate."""
    def __init__(
        self,
        clause_id: str,
        clause_type: str,
        title: str,
        text: str,
        page: int,
        score: float,
        metadata: Dict[str, Any],
        source: str = "semantic",
    ):
        self.clause_id = clause_id
        self.clause_type = clause_type
        self.title = title
        self.text = text
        self.page = page
        self.score = score
        self.metadata = metadata
        self.source = source


def retrieve_candidates(
    policy_id: str,
    query: str,
    top_k: int = 5,
    clauses_cache: Optional[List[Dict[str, Any]]] = None,
) -> List[CandidateClause]:
    """
    Retrieve candidate policy clauses for a given query (e.g. line item or procedure).

    Steps:
      1. Expand query abbreviations (e.g. 'phaco' -> 'phacoemulsification cataract surgery').
      2. Query 'clauses_{policy_id}' via Chroma vector similarity.
      3. Validate returned records (ensuring strict policy and clause type isolation).
      4. If vector retrieval fails, fall back to BM25 keyword matching with a warning.
    """
    if not query or not query.strip():
        return []

    expanded_query = expand_abbreviations(query.strip())
    candidates: List[CandidateClause] = []

    try:
        clause_coll = get_clause_index(policy_id)
        if clause_coll.count() == 0:
            logger.warning("Clause collection for policy '%s' is empty", policy_id)
            return []

        embedder = get_embedder()
        q_vec = embedder.embed_one(expanded_query)
        fetch_k = min(top_k * 2, max(1, clause_coll.count()))

        raw_res = clause_coll.query(
            query_embeddings=[q_vec],
            n_results=fetch_k,
            include=["documents", "metadatas", "distances"],
        )

        validated = validate_retrieved_records(
            raw_res,
            expected_source_type="policy_clause",
            expected_policy_id=policy_id,
        )

        docs = validated.get("documents", [])
        metas = validated.get("metadatas", [])
        distances = validated.get("distances", [])

        for doc, meta, dist in zip(docs, metas, distances):
            meta = meta or {}
            cid = str(meta.get("clause_id", ""))
            ctype = str(meta.get("clause_type", "unknown"))
            title = str(meta.get("title", f"Clause {cid}"))
            page = int(meta.get("page_number", 1))
            sim = max(0.0, 1.0 - float(dist))

            candidates.append(
                CandidateClause(
                    clause_id=cid,
                    clause_type=ctype,
                    title=title,
                    text=doc,
                    page=page,
                    score=sim,
                    metadata=meta,
                    source="semantic",
                )
            )

        # Sort and trim
        candidates = sorted(candidates, key=lambda c: c.score, reverse=True)[:top_k]

    except Exception as exc:
        logger.warning(
            "Semantic retrieval error for policy '%s': %s. Falling back to BM25 baseline.",
            policy_id,
            exc,
        )
        candidates = _bm25_fallback(policy_id, query, top_k, clauses_cache)

    return candidates


def _bm25_fallback(
    policy_id: str,
    query: str,
    top_k: int = 5,
    clauses_cache: Optional[List[Dict[str, Any]]] = None,
) -> List[CandidateClause]:
    """Fallback BM25 retrieval over policy clauses."""
    all_clauses = clauses_cache
    if not all_clauses:
        try:
            coll = get_clause_index(policy_id)
            records = coll.get()
            docs = records.get("documents") or []
            metas = records.get("metadatas") or []
            all_clauses = [
                {
                    "clause_id": m.get("clause_id", ""),
                    "clause_type": m.get("clause_type", "unknown"),
                    "title": m.get("title", ""),
                    "text": doc,
                    "page_number": m.get("page_number", 1),
                    **m,
                }
                for doc, m in zip(docs, metas) if m
            ]
        except Exception:
            all_clauses = []

    if not all_clauses:
        return []

    bm25 = BM25ClauseIndex(all_clauses)
    scored = bm25.score(query, top_k=top_k)

    results: List[CandidateClause] = []
    for cl, sc in scored:
        results.append(
            CandidateClause(
                clause_id=cl.get("clause_id", ""),
                clause_type=cl.get("clause_type", "unknown"),
                title=cl.get("title", ""),
                text=cl.get("text", ""),
                page=int(cl.get("page_number", 1)),
                score=sc,
                metadata=cl,
                source="bm25_fallback",
            )
        )
    return results
