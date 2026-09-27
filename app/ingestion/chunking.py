"""
Page-bound, structure-aware text chunker.

Design rationale
----------------
Chunks must never span page boundaries.  A chunk that straddles pages would
produce a citation like "pages 3–4" which is meaningless to an adjudicator
or a judge who needs to locate the exact clause.  By grouping within pages
first, every chunk carries a single, unambiguous page number.

Within each page, we split in three descending levels of granularity:

  1. Paragraph breaks (double newline / blank line) — preserves logical units
     like clauses, bullet lists, and table rows that belong together.
  2. Sentence boundaries — fallback when a paragraph overflows the target size.
     We use a simple regex rather than nltk so there are no extra dependencies.
  3. Hard character cutoff — last resort for pathological single sentences
     (e.g. a comma-less wall of text).  Rare in insurance policy PDFs.

Overlap is applied only between consecutive chunks on the SAME page so the
vector store can find clause boundaries that fall near a chunk edge.  No
overlap is added across page boundaries because page transitions are already
semantically hard breaks.

Token approximation
-------------------
We don't run a real tokenizer (that would add a heavy dependency and slow
down the ingestion pipeline).  ~4 chars ≈ 1 token is accurate enough for
chunking purposes: it errs slightly conservative, meaning chunks may be a
little shorter than the target rather than longer.

Downstream consumers that will need updating after this change
--------------------------------------------------------------
  • extraction.py  — currently takes List[PageText]; Update 2 will switch it
                     to accept List[Chunk] and operate per-chunk.
  • vectorstore.py — currently takes whatever shape chunk_pages() returned;
                     must be updated to index Chunk.text and store Chunk.page
                     and Chunk.chunk_id in metadata.
"""

from __future__ import annotations

import re
import textwrap
from dataclasses import dataclass, field
from typing import Sequence

from app.ingestion.pdf_extract import PageText
from app.config import settings


# ── Data model ────────────────────────────────────────────────────────────────

@dataclass
class Chunk:
    """
    A single text chunk produced by chunk_pages().

    Attributes:
        chunk_id:   Zero-based global index across all chunks for this policy.
                    Stable within a single ingestion run; not a persistent ID.
        page_number: 1-based page number this chunk came from.  Always a
                    single integer — chunks never span pages.
        text:       The chunk text, stripped of leading/trailing whitespace.
    """
    chunk_id: int
    page_number: int
    text: str
    char_count: int = field(init=False)

    def __post_init__(self) -> None:
        self.char_count = len(self.text)


# ── Internal helpers ──────────────────────────────────────────────────────────

# ~4 chars per token is a reasonable approximation for English policy text.
_CHARS_PER_TOKEN: int = 4

def _to_chars(tokens: int) -> int:
    """Convert a token count to an approximate character count."""
    return tokens * _CHARS_PER_TOKEN


def _split_sentences(text: str) -> list[str]:
    """
    Split text into sentences using a lightweight regex.

    Handles:
    - Period / exclamation / question followed by whitespace + capital letter
    - Does NOT split on abbreviations like "Rs." or "e.g." by requiring the
      next char after the space to be uppercase (policy text rarely starts a
      sentence with a lowercase letter after abbreviations).
    """
    # Split at '. ', '! ', '? ' followed by an uppercase letter or digit
    parts = re.split(r'(?<=[.!?])\s+(?=[A-Z0-9])', text)
    return [p.strip() for p in parts if p.strip()]


def _split_paragraphs(text: str) -> list[str]:
    """Split text on blank lines (paragraph breaks)."""
    paras = re.split(r'\n\s*\n', text)
    return [p.strip() for p in paras if p.strip()]


def _hard_split(text: str, max_chars: int) -> list[str]:
    """
    Hard character cutoff of last resort.

    Uses textwrap.wrap so we at least break on word boundaries rather than
    mid-word, which keeps chunks human-readable during debugging.
    """
    return textwrap.wrap(text, width=max_chars, break_long_words=False,
                         break_on_hyphens=False)


def _chunk_text_for_page(
    page_text: str,
    target_chars: int,
    overlap_chars: int,
) -> list[str]:
    """
    Chunk a single page's text into strings ≤ target_chars.

    Strategy (in order):
      1. Split on paragraph breaks.
      2. If a paragraph fits in the target, accumulate it greedily.
      3. If a paragraph overflows the target, split it further by sentence.
      4. If a sentence still overflows, hard-split it.

    Overlap is added by prepending the tail of the previous chunk to the
    next one, up to overlap_chars.

    Returns a list of chunk text strings (may be empty for blank pages).
    """
    paragraphs = _split_paragraphs(page_text)
    if not paragraphs:
        return []

    # Flatten paragraphs into a list of "atomic" segments that each fit
    # within the target size.  Sentences/hard-splits handle oversized paras.
    segments: list[str] = []
    for para in paragraphs:
        if len(para) <= target_chars:
            segments.append(para)
        else:
            # Para too long → try sentence splitting
            sentences = _split_sentences(para)
            for sent in sentences:
                if len(sent) <= target_chars:
                    segments.append(sent)
                else:
                    # Sentence still too long → hard character split
                    segments.extend(_hard_split(sent, target_chars))

    if not segments:
        return []

    # Greedy accumulator: pack segments into chunks up to target_chars.
    chunks: list[str] = []
    current_parts: list[str] = []
    current_len: int = 0

    for seg in segments:
        seg_len = len(seg)
        # +1 for the newline separator between segments
        join_len = current_len + (1 if current_parts else 0) + seg_len

        if current_parts and join_len > target_chars:
            # Flush current accumulator as a chunk
            chunks.append("\n".join(current_parts))
            # Start a new accumulator, seeded with overlap from the previous chunk
            overlap_text = chunks[-1][-overlap_chars:] if overlap_chars else ""
            current_parts = [overlap_text, seg] if overlap_text else [seg]
            current_len = len(overlap_text) + (1 if overlap_text else 0) + seg_len
        else:
            current_parts.append(seg)
            current_len = join_len

    if current_parts:
        chunks.append("\n".join(current_parts))

    return chunks


# ── Public API ────────────────────────────────────────────────────────────────

def chunk_pages(pages: Sequence[PageText]) -> list[Chunk]:
    """
    Chunk a list of extracted pages into a flat list of Chunk objects.

    Guarantees:
      - Each Chunk has exactly one page_number — chunks never span pages.
      - chunk_id is a stable zero-based global index within this call.
      - Overlap is only between consecutive chunks on the same page.
      - Empty pages (source='empty') produce zero chunks.

    Args:
        pages: Ordered list of PageText objects from extract_pages().
               Accepts any Sequence so callers can pass lists, tuples, etc.

    Returns:
        Flat list of Chunk objects, ordered by page then position within page.
    """
    target_chars  = _to_chars(settings.chunk_size)     # default: 500 tok → 2000 chars
    overlap_chars = _to_chars(settings.chunk_overlap)  # default: 80 tok  → 320 chars

    all_chunks: list[Chunk] = []
    chunk_id = 0

    for page in pages:
        if not page.text.strip():
            # Empty/OCR-failed pages produce no chunks.
            # Downstream code must not assume a chunk exists for every page.
            continue

        page_chunk_texts = _chunk_text_for_page(
            page_text=page.text,
            target_chars=target_chars,
            overlap_chars=overlap_chars,
        )

        for text in page_chunk_texts:
            if text.strip():  # skip any accidentally empty chunks
                all_chunks.append(Chunk(
                    chunk_id=chunk_id,
                    page_number=page.page_number,
                    text=text.strip(),
                ))
                chunk_id += 1

    return all_chunks


def pretty_print_chunks(chunks: list[Chunk], max_chars: int = 200) -> None:
    """
    Debug helper: print a summary of each chunk for visual inspection.

    Args:
        chunks:    Output of chunk_pages().
        max_chars: Preview length per chunk (truncated with ellipsis).
    """
    print(f"\n{'='*70}")
    print(f"  {len(chunks)} chunks produced")
    print(f"{'='*70}")

    prev_page = None
    for c in chunks:
        if c.page_number != prev_page:
            print(f"\n── Page {c.page_number} {'─'*50}")
            prev_page = c.page_number
        preview = c.text.replace("\n", " ")[:max_chars]
        ellipsis = "…" if c.char_count > max_chars else ""
        print(f"  [chunk {c.chunk_id:>3}] {c.char_count:>5} chars │ {preview}{ellipsis}")

    print(f"\n{'='*70}\n")
