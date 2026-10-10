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
from dataclasses import asdict, dataclass
from typing import Any, Literal, Optional

from app.config import settings
from app.llm.factory import get_llm
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

    def to_dict(self) -> dict[str, Any]:
        """Convert to a plain dictionary for JSON serialization in APIs."""
        data = asdict(self)
        return data


# ── Language Mapping ─────────────────────────────────────────────────────────

LANGUAGE_NAMES = {
    "en": "English",
    "hi": "Hindi (हिन्दी)",
    "mr": "Marathi (मराठी)",
    "gu": "Gujarati (ગુજરાતી)",
    "ta": "Tamil (தமிழ்)",
    "te": "Telugu (తెలుగు)",
    "bn": "Bengali (বাংলা)",
    "kn": "Kannada (ಕನ್ನಡ)",
    "ml": "Malayalam (മലയാളം)",
    "pa": "Punjabi (ਪੰਜਾਬੀ)",
}


# ── Structured Path Formatter ─────────────────────────────────────────────────

def _format_structured_answer(
    field_name: str,
    field_data: Any,
    language: str = "en",
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
        if language == "hi":
            answer = f"इस पॉलिसी के तहत बीमा राशि (Sum Insured) **{val}** है (पेज {pg} पर उल्लेखित)।"
        elif language == "mr":
            answer = f"या पॉलिसीअंतर्गत विमा रक्कम (Sum Insured) **{val}** आहे (पृष्ठ {pg} वर नमूद)."
        elif language == "gu":
            answer = f"આ પોલિસી હેઠળ વીમા રકમ (Sum Insured) **{val}** છે (પેજ {pg} પર દર્શાવેલ)."
        elif language == "ta":
            answer = f"இந்த பாலிசியின் கீழ் காப்பீட்டு தொகை (Sum Insured) **{val}** ஆகும் (பக்கம் {pg}-ல் உள்ளது)."
        elif language == "te":
            answer = f"ఈ పాలసీ కింద బీమా మొత్తం (Sum Insured) **{val}** (పేజీ {pg} లో పేర్కొనబడింది)."
        elif language == "bn":
            answer = f"এই পলিসির অধীনে বীমা রাশি (Sum Insured) হল **{val}** (পৃষ্ঠা {pg}-তে উল্লেখিত)।"
        elif language == "kn":
            answer = f"ಈ ಪಾಲಿಸಿಯ ಅಡಿಯಲ್ಲಿ ವಿಮಾ ಮೊತ್ತ (Sum Insured) **{val}** ಆಗಿದೆ (ಪುಟ {pg} ರಲ್ಲಿ ಉಲ್ಲೇಖಿಸಲಾಗಿದೆ)."
        elif language == "ml":
            answer = f"ഈ പോളിസി പ്രകാരം ഇൻഷുറൻസ് തുക (Sum Insured) **{val}** ആണ് (പേജ് {pg}-ൽ നൽകിയിരിക്കുന്നു)."
        elif language == "pa":
            answer = f"ਇਸ ਪਾਲਿਸੀ ਅਧੀਨ ਬੀਮਾ ਰਕਮ (Sum Insured) **{val}** ਹੈ (ਪੰਨਾ {pg} ਤੇ ਦਰਜ)।"
        else:
            answer = f"The Sum Insured under this policy is **{val}** (found on Page {pg})."

    elif field_name == "room_rent_limit":
        val = field_data.get("value", "Not stated")
        pg = field_data.get("page", 4)
        pages.append(pg)
        citations.append(Citation(page_number=pg, excerpt=f"Room Rent Limit: {val}"))
        if language == "hi":
            answer = f"इस पॉलिसी के तहत कमरे के किराए की सीमा (Room Rent Cap) **{val}** है (पेज {pg} पर उल्लेखित)।"
        elif language == "mr":
            answer = f"या पॉलिसीअंतर्गत खोली भाडे मर्यादा **{val}** आहे (पृष्ठ {pg} वर नमूद)."
        elif language == "gu":
            answer = f"આ પોલિસી હેઠળ રૂમ ભાડાની મર્યાદા **{val}** છે (પેજ {pg} પર દર્શાવેલ)."
        elif language == "ta":
            answer = f"இந்த பாலிசியின் கீழ் அறை வாடகை வரம்பு **{val}** ஆகும் (பக்கம் {pg}-ல் உள்ளது)."
        elif language == "te":
            answer = f"ఈ పాలసీ కింద గది అద్దె పరిమితి **{val}** (పేజీ {pg} లో పేర్కొనబడింది)."
        elif language == "bn":
            answer = f"এই পলিসির অধীনে রুম ভাড়ার সীমা হল **{val}** (পৃষ্ঠা {pg}-তে উল্লেখিত)।"
        elif language == "kn":
            answer = f"ಈ ಪಾಲಿಸಿಯ ಅಡಿಯಲ್ಲಿ ರೂಮ್ ಬಾಡಿಗೆ ಮಿತಿ **{val}** ಆಗಿದೆ (ಪುಟ {pg} ರಲ್ಲಿ ಉಲ್ಲೇಖಿಸಲಾಗಿದೆ)."
        elif language == "ml":
            answer = f"ഈ പോളിസി പ്രകാരം മുറി വാടക പരിധി **{val}** ആണ് (പേജ് {pg}-ൽ നൽകിയിരിക്കുന്നു)."
        elif language == "pa":
            answer = f"ਇਸ ਪਾਲਿਸੀ ਅਧੀਨ ਕਮਰੇ ਦੇ ਕਿਰਾਏ ਦੀ ਸੀਮਾ **{val}** ਹੈ (ਪੰਨਾ {pg} ਤੇ ਦਰਜ)।"
        else:
            answer = f"The room rent limit under this policy is **{val}** (found on Page {pg})."

    elif field_name == "co_pay":
        val = field_data.get("value", "Not stated")
        pg = field_data.get("page", 2)
        pages.append(pg)
        citations.append(Citation(page_number=pg, excerpt=f"Co-pay: {val}"))
        if language == "hi":
            answer = f"इस पॉलिसी में लागू सह-भुगतान (Co-Payment) **{val}** है (पेज {pg} पर उल्लेखित)।"
        elif language == "mr":
            answer = f"या पॉलिसीत लागू सह-पेमेंट (Co-Pay) **{val}** आहे (पृष्ठ {pg} वर नमूद)."
        elif language == "gu":
            answer = f"આ પોલિસીમાં લાગુ કો-પેમેન્ટ (Co-Pay) **{val}** છે (પેજ {pg} પર દર્શાવેલ)."
        elif language == "ta":
            answer = f"இந்த பாலிசியில் பொருந்தக்கூடிய இணை கட்டணம் (Co-Pay) **{val}** ஆகும் (பக்கம் {pg}-ல் உள்ளது)."
        elif language == "te":
            answer = f"ఈ పాలసీలో వర్తించే కో-పేమెంట్ **{val}** (పేజీ {pg} లో పేర్కొనబడింది)."
        elif language == "bn":
            answer = f"এই পলিসিতে প্রযোজ্য কো-পেমেন্ট (Co-Pay) হল **{val}** (পৃষ্ঠা {pg}-তে উল্লেখিত)।"
        elif language == "kn":
            answer = f"ಈ ಪಾಲಿಸಿಯಲ್ಲಿ ಅನ್ವಯವಾಗುವ ಕೋ-ಪೇಮೆಂಟ್ **{val}** ಆಗಿದೆ (ಪುಟ {pg} ರಲ್ಲಿ ಉಲ್ಲೇಖಿಸಲಾಗಿದೆ)."
        elif language == "ml":
            answer = f"ഈ പോളിസിയിൽ ബാധകമായ കോ-പേയ്‌മെന്റ് **{val}** ആണ് (പേജ് {pg}-ൽ നൽകിയിരിക്കുന്നു)."
        elif language == "pa":
            answer = f"ਇਸ ਪਾਲਿਸੀ ਵਿੱਚ ਲਾਗੂ ਕੋ-ਪੇਮੈਂਟ (Co-Pay) **{val}** ਹੈ (ਪੰਨਾ {pg} ਤੇ ਦਰਜ)।"
        else:
            answer = f"The applicable co-pay is **{val}** (found on Page {pg})."

    elif field_name == "deductible":
        if field_data and field_data.get("value"):
            val = field_data.get("value")
            pg = field_data.get("page", 1)
            pages.append(pg)
            citations.append(Citation(page_number=pg, excerpt=f"Deductible: {val}"))
            answer = f"The deductible under this policy is **{val}** (Page {pg})."
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
            if language == "hi":
                answer = "इस पॉलिसी के तहत प्रतीक्षा अवधि (Waiting Periods) निम्नलिखित हैं:\n" + "\n".join(bullet_points)
            elif language == "mr":
                answer = "या पॉलिसीअंतर्गत प्रतीक्षा कालावधी खालीलप्रमाणे आहेत:\n" + "\n".join(bullet_points)
            elif language == "ta":
                answer = "இந்த பாலிசியின் கீழ் காத்திருப்பு காலங்கள் பின்வருமாறு:\n" + "\n".join(bullet_points)
            else:
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
            if language == "hi":
                answer = "इस पॉलिसी के स्थायी बहिष्करण (Exclusions) निम्नलिखित हैं:\n" + "\n".join(bullet_points)
            elif language == "mr":
                answer = "या पॉलिसीचे कायमस्वरूपी अपवाद खालीलप्रमाणे आहेत:\n" + "\n".join(bullet_points)
            elif language == "ta":
                answer = "இந்த பாலிசியின் நிரந்தர விலக்குகள் பின்வருமாறு:\n" + "\n".join(bullet_points)
            else:
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
            if language == "hi":
                answer = "पॉलिसी के तहत दावा सूचना और मुख्य शर्तें निम्नलिखित हैं:\n" + "\n".join(bullet_points)
            else:
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


def _generate_semantic_draft(question: str, chunks: list[RetrievedChunk], language: str = "en") -> str:
    """Generate a draft answer grounded in the retrieved chunks."""
    passages = []
    for c in chunks:
        passages.append(f"--- [Page {c.page_number} | Chunk {c.chunk_id}] ---\n{c.text}")
    context_text = "\n\n".join(passages)

    lang_desc = LANGUAGE_NAMES.get(language, language)
    lang_instruction = ""
    if language and language != "en":
        lang_instruction = f"\n5. MANDATORY LANGUAGE REQUIREMENT: You MUST answer fluently and naturally in {lang_desc}. Keep essential insurance terms clear and maintain exact page citations like [Page N]."

    system_prompt = _SEMANTIC_QA_SYSTEM + lang_instruction

    user_msg = (
        f"POLICY EXCERPTS:\n{context_text}\n\n"
        f"USER QUESTION: {question}\n\n"
        f"Provide a grounded, concise answer citing the exact page numbers [Page N]. Response language: {lang_desc}."
    )

    try:
        llm = get_llm()
        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_msg},
        ]
        return llm.chat(messages, temperature=0.1)
    except Exception as exc:
        logger.warning("Semantic draft LLM call unavailable (%s), constructing grounded excerpt summary.", exc)
        # Construct grounded fallback answer from retrieved chunks
        top_excerpts = []
        for c in chunks[:3]:
            # Clean snippet
            snippet = c.text.strip().replace("\n", " ")
            if len(snippet) > 160:
                snippet = snippet[:157] + "..."
            top_excerpts.append(f"• {snippet} [Page {c.page_number}]")
        
        if language == "hi":
            return "पॉलिसी दस्तावेज़ के अनुसार प्रासंगिक शर्तें:\n" + "\n".join(top_excerpts)
        elif language == "mr":
            return "पॉलिसी दस्तऐवजानुसार संबंधित अटी:\n" + "\n".join(top_excerpts)
        elif language == "ta":
            return "பாலிசி ஆவணத்தின்படி தொடர்புடைய நிபந்தனைகள்:\n" + "\n".join(top_excerpts)
        elif language == "te":
            return "పాలసీ డాక్యుమెంట్ ప్రకారం సంబంధిత నిబంధనలు:\n" + "\n".join(top_excerpts)
        elif language == "gu":
            return "પોલિસી દસ્તાવેજ મુજબ સંબંધિત શરતો:\n" + "\n".join(top_excerpts)
        elif language == "bn":
            return "পলিসি নথি অনুযায়ী প্রাসঙ্গিক শর্তাবলী:\n" + "\n".join(top_excerpts)
        elif language == "kn":
            return "ಪಾಲಿಸಿ ದಾಖಲೆಯ ಪ್ರಕಾರ ಸಂಬಂಧಿತ ಷರತ್ತುಗಳು:\n" + "\n".join(top_excerpts)
        elif language == "ml":
            return "പോളിസി രേഖ പ്രകാരമുള്ള വ്യവസ്ഥകൾ:\n" + "\n".join(top_excerpts)
        elif language == "pa":
            return "ਪਾਲਿਸੀ ਦਸਤਾਵੇਜ਼ ਅਨੁਸਾਰ ਸੰਬੰਧਿਤ ਸ਼ਰਤਾਂ:\n" + "\n".join(top_excerpts)
        else:
            return "According to the relevant policy clauses:\n" + "\n".join(top_excerpts)



# ── Public API ────────────────────────────────────────────────────────────────

def answer_question(
    policy_id: str,
    question: str,
    structured_facts: Optional[dict[str, Any]] = None,
    language: str = "en",
) -> AnswerResult:
    """
    Main entry point for answering insurance policy questions.

    Orchestrates:
      1. Embedding router (structured vs semantic).
      2. Structured path direct resolution if field available in facts.
      3. Semantic vector search across ChromaDB collection for policy_id.
      4. Grounded draft answer generation with page citations in requested language.
      5. Self-verification pass against cited passages.
      6. Confidence scoring (High / Medium / Low).

    Args:
        policy_id: Document ID identifying the indexed policy.
        question: User query string.
        structured_facts: Pre-extracted facts dictionary from extract_structured_facts().
        language: ISO language code (e.g. 'en', 'hi', 'mr', 'gu', 'ta', 'te', 'bn', 'kn', 'ml', 'pa').

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

    if matched_field and structured_facts:
        field_data = structured_facts.get(matched_field)
        # If the structured fact exists and is populated
        if field_data:
            logger.info("Routing query to structured path for field '%s' (score=%.4f, lang=%s)", matched_field, router_score, language)
            ans_text, pages, citations = _format_structured_answer(matched_field, field_data, language=language)
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
    logger.info("Executing semantic retrieval path for question (lang=%s): '%s'", language, question)
    chunks = query_similar(policy_id, question, top_k=settings.top_k)

    if not chunks:
        conf = assign_confidence("semantic", has_source_chunks=False)
        empty_msg = "No relevant clauses or information were found in the uploaded policy document."
        if language == "hi":
            empty_msg = "अपलोड किए गए पॉलिसी दस्तावेज़ में कोई प्रासंगिक खंड या जानकारी नहीं मिली।"
        elif language == "mr":
            empty_msg = "अपलोड केलेल्या पॉलिसी दस्तऐवजात संबंधित माहिती आढळली नाही."
        elif language == "ta":
            empty_msg = "பதிவேற்றப்பட்ட பாலிசி ஆவணத்தில் தொடர்புடைய தகவல்கள் எதுவும் கிடைக்கவில்லை."
        return AnswerResult(
            question=question,
            answer=empty_msg,
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
    draft_answer = _generate_semantic_draft(question, chunks, language=language)

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
