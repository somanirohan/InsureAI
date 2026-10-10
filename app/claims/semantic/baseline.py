"""
BM25 Keyword Baseline for policy clause retrieval.

Used as:
1. Baseline benchmark against which semantic matching is evaluated.
2. Fast deterministic fallback when embedding or LLM services time out or fail.
"""

from __future__ import annotations

import math
import re
from typing import Any, Dict, List, Optional, Tuple


def tokenize(text: str) -> List[str]:
    """Tokenize and lower alphanumeric tokens (length >= 2)."""
    return [w.lower() for w in re.findall(r"\b[a-zA-Z0-9_-]+\b", text) if len(w) >= 2]


class BM25ClauseIndex:
    """In-memory BM25 index over policy clauses for baseline and fallback retrieval."""

    def __init__(self, clauses: List[Dict[str, Any]], k1: float = 1.5, b: float = 0.75):
        self.k1 = k1
        self.b = b
        self.clauses = clauses
        self.corpus_size = len(clauses)
        self.doc_lengths: List[int] = []
        self.doc_freqs: Dict[str, int] = {}
        self.doc_tokens: List[List[str]] = []

        total_length = 0
        for clause in clauses:
            text = f"{clause.get('title', '')} {clause.get('text', '')}"
            tokens = tokenize(text)
            self.doc_tokens.append(tokens)
            doc_len = len(tokens)
            self.doc_lengths.append(doc_len)
            total_length += doc_len

            seen_in_doc = set(tokens)
            for t in seen_in_doc:
                self.doc_freqs[t] = self.doc_freqs.get(t, 0) + 1

        self.avg_doc_len = (total_length / self.corpus_size) if self.corpus_size > 0 else 1.0

    def score(self, query: str, top_k: int = 5) -> List[Tuple[Dict[str, Any], float]]:
        """Score all clauses against query tokens and return top_k matches."""
        if not query or self.corpus_size == 0:
            return []

        query_tokens = tokenize(query)
        if not query_tokens:
            return []

        scores: List[float] = [0.0] * self.corpus_size

        for q_token in query_tokens:
            df = self.doc_freqs.get(q_token, 0)
            if df == 0:
                continue

            # Standard Robertson-Spärck Jones IDF
            idf = math.log((self.corpus_size - df + 0.5) / (df + 0.5) + 1.0)

            for doc_idx, tokens in enumerate(self.doc_tokens):
                tf = tokens.count(q_token)
                if tf == 0:
                    continue
                doc_len = self.doc_lengths[doc_idx]
                numerator = tf * (self.k1 + 1.0)
                denominator = tf + self.k1 * (1.0 - self.b + self.b * (doc_len / self.avg_doc_len))
                scores[doc_idx] += idf * (numerator / denominator)

        # Rank documents
        ranked_indices = sorted(range(self.corpus_size), key=lambda i: scores[i], reverse=True)
        results: List[Tuple[Dict[str, Any], float]] = []

        for idx in ranked_indices[:top_k]:
            if scores[idx] > 0.05:  # Relevance threshold
                results.append((self.clauses[idx], scores[idx]))

        return results
