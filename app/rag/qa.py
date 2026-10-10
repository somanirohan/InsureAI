"""
End-to-end Question Answering orchestrator for InsureAI.

Design rationale
----------------
`answer_question()` coordinates the entire dual-path RAG pipeline:

  1. Router Check:
     - Uses embedding-based `route_question_with_score()`.
     - If question matches a structured field (e.g. "what's my room rent limit?")
       AND that field exists in `structured_facts`, answers directly from facts.
       Zero generation, zero hallucination, instantaneous response, High confidence.

  2. Semantic Path:
     - If question requires semantic interpretation, retrieves top-k chunks
       from ChromaDB scoped to the given `policy_id`.
     - Drafts a grounded answer citing the specific physical PDF page numbers.
     - Runs a separate self-verification pass (`verify_answer()`) to ensure the
       draft claims are directly supported by the source passages.
     - Assigns a calibrated confidence label (`assign_confidence()`):
       High / Medium / Low.
     - If verification fails, safely flags the answer rather than presenting
       unsupported text as fact.
"""

from __future__ import annotations

import logging
import re
from dataclasses import asdict, dataclass
from typing import Any, Literal, Optional

from app.config import settings
from app.llm.factory import get_llm
from app.rag.checklist import build_claim_checklist
from app.rag.confidence import assign_confidence
from app.rag.router import route_question_with_score
from app.rag.vectorstore import RetrievedChunk, query_similar
from app.rag.verification import verify_answer

logger = logging.getLogger(__name__)


# ── Answer Result Model ───────────────────────────────────────────────────────

@dataclass
class Citation:
    """A citation referencing source evidence in the policy document."""
    page_number: int
    excerpt: str
    chunk_id: Optional[int] = None
    section_heading: Optional[str] = None


@dataclass
class AnswerResult:
    """
    Standardized, JSON-serializable response returned by answer_question().

    Attributes:
        question:            Original user question.
        answer:              Final, grounded answer text.
        source_path:         "structured" (zero hallucination) or "semantic" (RAG).
        confidence:          "High" | "Medium" | "Low".
        confidence_reason:   Human-readable rationale for the confidence label.
        pages:               List of 1-based page numbers cited in this answer.
        citations:           Structured list of Citation objects.
        structured_field:    Matched field name if routed to structured path, else None.
        verification_result: Raw verification output (semantic path only).
        checklist:           Grouped claim readiness checklist (if claim_checklist intent).
        general_advice:      Non-policy general tips.
        heads_up:            Coverage alert for explicit treatment scenarios.
    """
    question: str
    answer: str
    source_path: Literal["structured", "semantic"]
    confidence: Literal["High", "Medium", "Low"]
    confidence_reason: str
    pages: list[int]
    citations: list[Citation]
    structured_field: Optional[str] = None
    verification_result: Optional[dict[str, Any]] = None
    checklist: Optional[list[dict[str, Any]]] = None
    general_advice: Optional[list[str]] = None
    heads_up: Optional[str] = None

    def to_dict(self) -> dict[str, Any]:
        """Convert to a plain dictionary for JSON serialization in APIs."""
        data = asdict(self)
        return data


# ── Structured Path Formatter ─────────────────────────────────────────────────

def _format_structured_answer(
    field_name: str,
    field_data: Any,
) -> tuple[str, list[int], list[Citation]]:
    """
    Format a direct, zero-hallucination answer from extracted structured facts.
    """
    pages: list[int] = []
    citations: list[Citation] = []

    if field_name == "sum_insured":
        val = field_data.get("value", "Not stated")
        pg = field_data.get("page", 1)
        pages.append(pg)
        citations.append(Citation(page_number=pg, excerpt=f"Sum Insured: {val}"))
        answer = f"The Sum Insured under this policy is **{val}** (found on Page {pg})."

    elif field_name == "room_rent_limit":
        val = field_data.get("value", "Not stated")
        pg = field_data.get("page", 4)
        pages.append(pg)
        citations.append(Citation(page_number=pg, excerpt=f"Room Rent Limit: {val}"))
        answer = f"The room rent limit under this policy is **{val}** (found on Page {pg})."

    elif field_name == "co_pay":
        val = field_data.get("value", "Not stated")
        pg = field_data.get("page", 2)
        pages.append(pg)
        citations.append(Citation(page_number=pg, excerpt=f"Co-pay: {val}"))
        answer = f"The applicable co-pay is **{val}** (found on Page {pg})."

    elif field_name == "deductible":
        if field_data and field_data.get("value"):
            val = field_data.get("value")
            pg = field_data.get("page", 1)
            pages.append(pg)
            citations.append(Citation(page_number=pg, excerpt=f"Deductible: {val}"))
            answer = f"The deductible under this policy is **{val}** (found on Page {pg})."
        else:
            answer = "There is no deductible mentioned or applicable under this policy schedule."

    elif field_name == "waiting_periods":
        items = field_data if isinstance(field_data, list) else []
        if items:
            bullet_points = []
            for it in items:
                p = it.get("page", 1)
                pages.append(p)
                bullet_points.append(f"- **{it.get('condition')}**: {it.get('period')} (Page {p})")
                citations.append(Citation(page_number=p, excerpt=f"{it.get('condition')}: {it.get('period')}"))
            answer = "The waiting periods under this policy are:\n" + "\n".join(bullet_points)
        else:
            answer = "No specific waiting periods were found in the extracted policy facts."

    elif field_name == "exclusions":
        items = field_data if isinstance(field_data, list) else []
        if items:
            bullet_points = []
            for it in items:
                p = it.get("page", 5)
                pages.append(p)
                bullet_points.append(f"- {it.get('item')} (Page {p})")
                citations.append(Citation(page_number=p, excerpt=str(it.get("item"))))
            answer = "The permanent policy exclusions include:\n" + "\n".join(bullet_points)
        else:
            answer = "No specific exclusions were found in the extracted policy facts."

    elif field_name == "claim_conditions":
        items = field_data if isinstance(field_data, list) else []
        if items:
            bullet_points = []
            for it in items:
                p = it.get("page", 6)
                pages.append(p)
                bullet_points.append(f"- {it.get('condition')} (Page {p})")
                citations.append(Citation(page_number=p, excerpt=str(it.get("condition"))))
            answer = "The key claim conditions and procedural requirements are:\n" + "\n".join(bullet_points)
        else:
            answer = "No claim conditions were found in the extracted policy facts."

    else:
        answer = str(field_data)

    unique_pages = sorted(list(set(pages)))
    return answer, unique_pages, citations


# ── Semantic Answer Generator ─────────────────────────────────────────────────

_SEMANTIC_QA_SYSTEM = """\
You are an expert health insurance policy intelligence assistant.

Your task is to answer the user's question accurately and objectively, grounded
STRICTLY AND ONLY in the provided policy excerpts.

RULES:
1. Ground your answer ONLY in the provided text. Examine both benefit clauses and exclusion clauses in the excerpts to state whether an item or treatment is covered, excluded, or subject to conditions.
2. For every factual statement, cite the source page number explicitly in brackets, e.g. [Page 5].
3. If the provided excerpts do not contain sufficient evidence, state clearly: "The provided policy excerpts do not contain explicit information regarding this." Do not guess.
4. Keep the answer direct, concise, and professional.
"""


def _generate_semantic_draft(question: str, chunks: list[RetrievedChunk]) -> str:
    """Generate a draft answer grounded in the retrieved chunks."""
    passages = []
    for c in chunks:
        passages.append(f"--- [Page {c.page_number} | Chunk {c.chunk_id}] ---\n{c.text}")
    context_text = "\n\n".join(passages)

    user_msg = (
        f"POLICY EXCERPTS:\n{context_text}\n\n"
        f"USER QUESTION: {question}\n\n"
        "Provide a grounded, concise answer citing the exact page numbers [Page N]."
    )

    llm = get_llm()
    messages = [
        {"role": "system", "content": _SEMANTIC_QA_SYSTEM},
        {"role": "user", "content": user_msg},
    ]

    return llm.chat(messages, temperature=0.1)


# ── Scenario-Aware Treatment Detection ────────────────────────────────────────

TREATMENT_PATTERNS: list[tuple[str, list[str]]] = [
    ("Knee Surgery / Joint Replacement", ["knee surgery", "knee replacement", "knee", "joint replacement", "hip replacement"]),
    ("Cataract Surgery", ["cataract", "cataract surgery", "eye surgery", "lens replacement"]),
    ("Hernia Repair", ["hernia", "hernia surgery", "hydrocele"]),
    ("Maternity / Delivery", ["maternity", "delivery", "pregnancy", "c-section", "caesarean", "childbirth", "newborn"]),
    ("Critical Illness (Cardiac / Cancer)", ["cancer", "heart attack", "stroke", "kidney failure", "bypass", "angioplasty"]),
    ("Dental Treatment", ["dental", "tooth", "teeth", "orthodontic"]),
    ("Cosmetic Surgery", ["cosmetic", "rhinoplasty", "liposuction", "plastic surgery"]),
    ("Obesity / Bariatric Treatment", ["bariatric", "weight reduction", "weight loss surgery", "obesity"]),
    ("Sinusitis", ["sinus", "sinusitis"]),
    ("Ayush Treatment", ["ayush", "ayurveda", "homeopathy", "unani", "siddha"]),
    ("Fertility / IVF", ["ivf", "fertility", "infertility", "surrogacy", "iui", "art"]),
]


def _check_scenario_treatment(
    question: str,
    structured_facts: Optional[dict[str, Any]],
) -> tuple[Optional[str], list[Citation], list[int]]:
    """
    Check if the user's question explicitly mentions a specific treatment/procedure
    alongside a claim-process inquiry (e.g. 'I'm being admitted for knee surgery next week, what do I need?').
    Cross-references against waiting periods and exclusions.
    Returns (heads_up_text, citations, pages).
    """
    if not question or not structured_facts:
        return None, [], []

    q_lower = question.lower()
    matched_aliases: list[str] = []

    for label, aliases in TREATMENT_PATTERNS:
        for alias in aliases:
            if re.search(rf"\b{re.escape(alias)}\b", q_lower):
                matched_aliases.extend(aliases)
                break
        if matched_aliases:
            break

    if not matched_aliases:
        return None, [], []

    alerts: list[str] = []
    citations: list[Citation] = []
    pages: set[int] = set()

    # Check waiting periods
    for wp in structured_facts.get("waiting_periods", []):
        cond_text = str(wp.get("condition", "")).lower()
        period_text = str(wp.get("period", "")).lower()
        wp_full = f"{cond_text} {period_text}"
        pg = wp.get("page", 1)

        is_match = any(re.search(rf"\b{re.escape(a)}\b", wp_full) for a in matched_aliases)
        if not is_match and any(a in ("knee", "joint replacement", "hip", "cataract", "hernia", "sinus", "sinusitis") for a in matched_aliases):
            if "specific disease" in cond_text or "24 month" in period_text or "24 month" in cond_text:
                is_match = True

        if is_match:
            period_val = wp.get("period", "applicable period")
            cond_val = wp.get("condition", "Waiting Period")
            alerts.append(
                f"- **{cond_val}**: Subject to a **{period_val}** waiting period before coverage applies (Page {pg})."
            )
            citations.append(Citation(page_number=pg, excerpt=f"{cond_val}: {period_val}", section_heading="Waiting Period"))
            pages.add(pg)

    # Check exclusions
    for ex in structured_facts.get("exclusions", []):
        item_text = str(ex.get("item", "")).lower()
        pg = ex.get("page", 1)
        if any(re.search(rf"\b{re.escape(a)}\b", item_text) for a in matched_aliases):
            item_val = ex.get("item", "Excluded procedure")
            alerts.append(
                f"- **Policy Exclusion**: '{item_val}' is permanently excluded under this policy (Page {pg})."
            )
            citations.append(Citation(page_number=pg, excerpt=item_val, section_heading="Permanent Exclusion"))
            pages.add(pg)

    if not alerts:
        return None, [], []

    heads_up_str = "⚠️ **From your coverage check:**\n" + "\n".join(alerts)
    return heads_up_str, citations, sorted(list(pages))


# ── Public API ────────────────────────────────────────────────────────────────

def answer_question(
    policy_id: str,
    question: str,
    structured_facts: Optional[dict[str, Any]] = None,
) -> AnswerResult:
    """
    Main entry point for answering insurance policy questions.

    Orchestrates:
      1. Embedding router (structured vs semantic vs claim_checklist).
      2. Claim checklist path direct resolution if routed to claim_checklist.
      3. Structured path direct resolution if field available in facts.
      4. Semantic vector search across ChromaDB collection for policy_id.
      5. Grounded draft answer generation with page citations.
      6. Self-verification pass against cited passages.
      7. Confidence scoring (High / Medium / Low).

    Args:
        policy_id: Document ID identifying the indexed policy.
        question: User query string.
        structured_facts: Pre-extracted facts dictionary from extract_structured_facts().

    Returns:
        AnswerResult object containing answer, citations, page numbers, and confidence.
    """
    if not question or not question.strip():
        return AnswerResult(
            question=question,
            answer="Please provide a valid question.",
            source_path="semantic",
            confidence="Low",
            confidence_reason="Empty question provided.",
            pages=[],
            citations=[],
        )

    # ── Step 1: Routing Check ─────────────────────────────────────────────────
    matched_field, router_score, _ = route_question_with_score(question)

    # 1A. Claim Readiness Checklist Route (handled BEFORE structured field lookup)
    if matched_field == "claim_checklist":
        logger.info("Routing query to Claim Readiness Checklist builder (score=%.4f)", router_score)
        heads_up, heads_up_citations, heads_up_pages = _check_scenario_treatment(question, structured_facts)
        checklist_res = build_claim_checklist(structured_facts, heads_up=heads_up)

        combined_citations = list(heads_up_citations)
        for c in checklist_res.get("citations", []):
            combined_citations.append(
                Citation(
                    page_number=c["page_number"],
                    excerpt=c["excerpt"],
                    section_heading=c.get("section_heading"),
                )
            )
        combined_pages = sorted(list(set(heads_up_pages + checklist_res.get("pages", []))))

        return AnswerResult(
            question=question,
            answer=checklist_res["answer"],
            source_path="structured",
            confidence=checklist_res["confidence"],
            confidence_reason=checklist_res["confidence_reason"],
            pages=combined_pages,
            citations=combined_citations,
            structured_field="claim_checklist",
            checklist=checklist_res.get("checklist"),
            general_advice=checklist_res.get("general_advice"),
            heads_up=heads_up,
        )

    # 1B. Standard Structured Field Direct Resolution
    if matched_field and structured_facts:
        field_data = structured_facts.get(matched_field)
        # If the structured fact exists and is populated
        if field_data:
            logger.info("Routing query to structured path for field '%s' (score=%.4f)", matched_field, router_score)
            ans_text, pages, citations = _format_structured_answer(matched_field, field_data)
            conf = assign_confidence("structured")
            return AnswerResult(
                question=question,
                answer=ans_text,
                source_path="structured",
                confidence=conf.level,
                confidence_reason=conf.reason,
                pages=pages,
                citations=citations,
                structured_field=matched_field,
            )

    # ── Step 2: Semantic Path ─────────────────────────────────────────────────
    logger.info("Executing semantic retrieval path for question: '%s'", question)
    chunks = query_similar(policy_id, question, top_k=settings.top_k)

    if not chunks:
        conf = assign_confidence("semantic", has_source_chunks=False)
        return AnswerResult(
            question=question,
            answer="No relevant clauses or information were found in the uploaded policy document.",
            source_path="semantic",
            confidence=conf.level,
            confidence_reason=conf.reason,
            pages=[],
            citations=[],
        )

    # Top chunk data
    top_chunk = chunks[0]
    top_similarity = top_chunk.similarity

    # Generate draft answer
    draft_answer = _generate_semantic_draft(question, chunks)

    # Build citations and collect cited page numbers
    citations = [
        Citation(page_number=c.page_number, excerpt=c.text[:200] + "...", chunk_id=c.chunk_id)
        for c in chunks[:3]
    ]
    pages = sorted(list(set(c.page_number for c in chunks[:3])))

    # ── Step 3: Self-Verification Pass ────────────────────────────────────────
    # Verify the draft answer against all retrieved source passages with page anchors
    passage_for_verification = "\n\n".join(f"[Page {c.page_number}]: {c.text}" for c in chunks)
    verification = verify_answer(draft_answer, passage_for_verification)

    # ── Step 4: Calibrated Confidence Assessment ──────────────────────────────
    conf = assign_confidence(
        source_path="semantic",
        verification_result=verification,
        retrieval_similarity=top_similarity,
    )

    final_answer = draft_answer
    # If verification failed completely, prepend an honest advisory notice
    if conf.level == "Low" and not verification.get("supported", False):
        final_answer = (
            f"⚠️ **Note: The policy text does not conclusively verify this claim.**\n\n"
            f"{draft_answer}\n\n"
            f"*(Verification note: {verification.get('reasoning')})*"
        )

    return AnswerResult(
        question=question,
        answer=final_answer,
        source_path="semantic",
        confidence=conf.level,
        confidence_reason=conf.reason,
        pages=pages,
        citations=citations,
        verification_result=verification,
    )
