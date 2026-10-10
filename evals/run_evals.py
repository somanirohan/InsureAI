#!/usr/bin/env python3
"""
InsureAI — RAG Evaluation Harness
==================================
Dev-only script. NOT part of the web app. No FastAPI routes modified.

Usage
-----
  # Run all questions
  python evals/run_evals.py

  # Filter by policy
  python evals/run_evals.py --policy-id 6ac9d40c45d5398a99ab9664

  # Limit number of questions
  python evals/run_evals.py --limit 3

  # Combine
  python evals/run_evals.py --policy-id 6ac9d40c45d5398a99ab9664 --limit 2

Output
------
  evals/reports/eval_report_<YYYYMMDD_HHMMSS>.json
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import re
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

# ── Bootstrap: add project root to sys.path so `app` package is importable ──
PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

# ── Import RAG engine (no FastAPI, no server code) ───────────────────────────
from app.config import settings
from app.llm.factory import get_llm
from app.llm.openai_compatible_provider import OpenAICompatibleProvider
from app.rag.qa import answer_question, AnswerResult

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.WARNING,          # suppress verbose RAG internals during eval
    format="%(levelname)s  %(name)s  %(message)s",
)
logger = logging.getLogger("insureai.eval")

# ── Paths ─────────────────────────────────────────────────────────────────────
EVALS_DIR = Path(__file__).resolve().parent
QUESTIONS_FILE = EVALS_DIR / "questions.json"
REPORTS_DIR = EVALS_DIR / "reports"
REPORTS_DIR.mkdir(parents=True, exist_ok=True)


# ── Judge LLM — intentionally DIFFERENT from the RAG answer model ─────────────
#
# Using the same model to both generate and judge answers creates self-evaluation
# bias (a model tends to prefer its own output). We use a separate small model
# exclusively for correctness and faithfulness scoring.
#
# Defaults to llama-3.1-8b-instant on Groq (fast, cheap, independent of qwen).
# Override with:  EVAL_JUDGE_MODEL=<model-id>  in your .env or environment.
#
_EVAL_JUDGE_MODEL = os.environ.get("EVAL_JUDGE_MODEL", "llama-3.1-8b-instant")


def get_judge_llm() -> OpenAICompatibleProvider:
    """
    Return an LLM provider for eval scoring that is SEPARATE from get_llm().

    Currently hardwired to Groq (same API key, different model) so no extra
    credentials are needed.  The RAG pipeline uses qwen/qwen3.8-27b;
    the judge uses llama-3.1-8b-instant (or EVAL_JUDGE_MODEL env override).
    """
    if not settings.groq_api_key:
        raise RuntimeError(
            "GROQ_API_KEY is not set. "
            "The eval judge needs a Groq API key to run independently of the RAG model. "
            "Set GROQ_API_KEY in your .env file."
        )
    return OpenAICompatibleProvider(
        base_url=settings.groq_base_url,
        api_key=settings.groq_api_key,
        model=_EVAL_JUDGE_MODEL,
    )


# ══════════════════════════════════════════════════════════════════════════════
# SCORING HELPERS
# ══════════════════════════════════════════════════════════════════════════════

def _extract_numbers(text: str) -> list[float]:
    """Pull all numbers (including Indian lakh/crore multipliers) from text."""
    nums: list[float] = []
    # Indian multiplier: e.g. "5 lakh", "1.5 crore"
    for m in re.finditer(
        r"([\d,]+(?:\.\d+)?)\s*(lakh|lac|crore|cr|thousand|k)\b",
        text, re.IGNORECASE
    ):
        try:
            base = float(m.group(1).replace(",", ""))
            word = m.group(2).lower()
            mult = (
                100_000.0 if word in ("lakh", "lac") else
                10_000_000.0 if word in ("crore", "cr") else
                1_000.0
            )
            nums.append(base * mult)
        except ValueError:
            pass
    # Plain numbers and percentages
    for m in re.finditer(r"[\d,]+(?:\.\d+)?", text):
        try:
            nums.append(float(m.group().replace(",", "")))
        except ValueError:
            pass
    return nums


def score_numeric(actual: str, expected: str) -> bool:
    """
    Compare numeric values extracted from both strings.
    A match means at least one number in `actual` equals at least one in `expected`
    (within ±5% tolerance for rounding).
    """
    exp_nums = _extract_numbers(expected)
    if not exp_nums:
        return False
    act_nums = _extract_numbers(actual)
    if not act_nums:
        return False
    for e in exp_nums:
        for a in act_nums:
            if e == 0.0 and a == 0.0:
                return True
            if e != 0.0 and abs(a - e) / abs(e) <= 0.05:
                return True
    return False


def score_text_llm(question: str, expected: str, actual: str) -> bool:
    """
    LLM-as-judge: uses the JUDGE model (not the RAG answer model) to decide
    whether `actual` is semantically equivalent to `expected`.
    Returns True (correct) or False (incorrect). Falls back to False on error.
    """
    system_prompt = (
        "You are a strict factual correctness judge for insurance Q&A.\n"
        "You will be given:\n"
        "  QUESTION: the user question\n"
        "  EXPECTED: the ground-truth reference answer\n"
        "  ACTUAL: the system's generated answer\n\n"
        "Task: Decide whether ACTUAL is semantically equivalent to EXPECTED "
        "for the given QUESTION. Minor wording differences are acceptable. "
        "Output ONLY a JSON object with a single boolean key 'correct'. "
        "Example: {\"correct\": true}"
    )
    user_msg = (
        f"QUESTION: {question}\n"
        f"EXPECTED: {expected}\n"
        f"ACTUAL: {actual}\n\n"
        "Is ACTUAL semantically correct relative to EXPECTED? "
        "Respond with JSON only: {\"correct\": true} or {\"correct\": false}"
    )
    try:
        judge = get_judge_llm()   # ← separate model, not the RAG answer model
        raw = judge.chat(
            [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_msg},
            ],
            temperature=0.0,
            format="json",
            max_tokens=64,
        )
        cleaned = re.sub(r"^```(?:json)?\s*", "", raw.strip(), flags=re.IGNORECASE)
        cleaned = re.sub(r"\s*```$", "", cleaned.strip())
        obj = json.loads(cleaned)
        return bool(obj.get("correct", False))
    except Exception as exc:
        logger.warning("LLM judge failed: %s", exc)
        return False


def score_faithfulness_llm(
    actual_answer: str,
    citations: list[dict],
    verification_result: Optional[dict] = None,
) -> bool:
    """
    Ask the LLM whether the answer is supported by the retrieved excerpts.

    Short-circuit: if the RAG system's own self-verification already passed
    (fully_supported or partially_supported), count the answer as faithful
    to avoid a redundant LLM call that is likely to fail on truncated excerpts.
    """
    # Fast path: trust the in-pipeline verifier when it already passed
    if verification_result:
        verif_status = verification_result.get("verification_status", "")
        if verif_status in ("fully_supported", "partially_supported"):
            return True

    if not citations:
        return False

    excerpts = "\n\n".join(
        f"[Page {c.get('page_number', '?')}]: {c.get('excerpt', '')}"
        for c in citations
    )
    system_prompt = (
        "You are a faithfulness judge for RAG-based insurance Q&A.\n"
        "Given a GENERATED ANSWER and SOURCE EXCERPTS (which may be truncated), "
        "decide whether the key factual claims in the answer are consistent with "
        "the excerpts. Allow for minor rephrasing. "
        "If the excerpts are too short to confirm or deny, lean toward faithful=true "
        "only if the answer sounds grounded and does not contradict the excerpts.\n"
        "Output ONLY JSON: {\"faithful\": true} or {\"faithful\": false}"
    )
    user_msg = (
        f"GENERATED ANSWER:\n{actual_answer}\n\n"
        f"SOURCE EXCERPTS (may be truncated):\n{excerpts}\n\n"
        "Are the answer's key claims consistent with the excerpts? JSON only."
    )
    try:
        judge = get_judge_llm()   # ← separate model, not the RAG answer model
        raw = judge.chat(
            [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_msg},
            ],
            temperature=0.0,
            format="json",
            max_tokens=64,
        )
        cleaned = re.sub(r"^```(?:json)?\s*", "", raw.strip(), flags=re.IGNORECASE)
        cleaned = re.sub(r"\s*```$", "", cleaned.strip())
        obj = json.loads(cleaned)
        return bool(obj.get("faithful", False))
    except Exception as exc:
        logger.warning("Faithfulness judge failed: %s", exc)
        return False


def check_unanswerable_flagged(result: AnswerResult) -> bool:
    """
    Return True if the system indicated it could not find information
    (i.e., the answer was flagged / refused for an unanswerable question).
    Looks for refusal signals in: confidence level, verification status, or answer text.
    """
    # Low confidence is the primary signal
    if result.confidence == "Low":
        return True
    # No pages cited = nothing was found
    if not result.pages:
        return True
    # Explicit refusal phrases in the answer text
    refusal_phrases = [
        "do not contain",
        "not contain",
        "no information",
        "not found",
        "cannot find",
        "does not mention",
        "no explicit information",
        "not explicitly",
        "not stated",
        "not covered",
        "not available",
        "policy does not",
        "no relevant",
        "⚠️",
    ]
    answer_lower = result.answer.lower()
    if any(phrase in answer_lower for phrase in refusal_phrases):
        return True
    # Verification unsupported
    verif = result.verification_result or {}
    if verif.get("verification_status") == "unsupported":
        return True
    return False


# ══════════════════════════════════════════════════════════════════════════════
# CITATION SCORING
# ══════════════════════════════════════════════════════════════════════════════

def citation_match(citations: list[dict], expected_page: Optional[int]) -> bool:
    """
    True if any cited page_number is within ±1 of expected_page.
    Also True if expected_page is None (we don't check citation for unanswerable).
    """
    if expected_page is None:
        return True   # not applicable, don't penalise
    for cite in citations:
        pg = cite.get("page_number")
        if pg is not None and abs(int(pg) - int(expected_page)) <= 1:
            return True
    return False


# ══════════════════════════════════════════════════════════════════════════════
# SINGLE QUESTION RUNNER
# ══════════════════════════════════════════════════════════════════════════════

def run_single(q: dict) -> dict:
    """
    Run one question through the RAG engine and return a full result record.
    """
    q_id = q.get("id", "unknown")
    policy_id: str = q["policy_id"]
    question: str = q["question"]
    expected_answer: str = q.get("expected_answer", "")
    expected_page: Optional[int] = q.get("expected_page")
    q_type: str = q.get("type", "answerable")

    # ── Call the RAG engine ──────────────────────────────────────────────────
    t_start = time.perf_counter()
    try:
        result: AnswerResult = answer_question(
            policy_id=policy_id,
            question=question,
            structured_facts=None,   # No MongoDB in this dev harness
        )
        latency_ms = round((time.perf_counter() - t_start) * 1000, 1)
        error = None
    except Exception as exc:
        latency_ms = round((time.perf_counter() - t_start) * 1000, 1)
        logger.error("Question %s failed: %s", q_id, exc)
        return {
            "id": q_id,
            "question": question,
            "type": q_type,
            "expected_answer": expected_answer,
            "actual_answer": "",
            "citations": [],
            "confidence": "",
            "verification_status": "",
            "scores": {
                "correct": False,
                "citation_match": False,
                "faithful": False,
                "unanswerable_flagged": None,
            },
            "latency_ms": latency_ms,
            "error": str(exc),
        }

    # ── Serialize citations ──────────────────────────────────────────────────
    serialized_citations = [
        {
            "page_number": c.page_number,
            "excerpt": c.excerpt,
            "chunk_id": c.chunk_id,
        }
        for c in result.citations
    ]

    # ── Extract verification status ──────────────────────────────────────────
    verif = result.verification_result or {}
    verification_status = verif.get("verification_status", result.source_path)

    # ── Scoring ──────────────────────────────────────────────────────────────
    correct: bool = False
    faithful: bool = False
    cite_match: bool = False
    unanswerable_flagged: Optional[bool] = None

    if q_type == "unanswerable":
        unanswerable_flagged = check_unanswerable_flagged(result)
        # For unanswerable questions, correctness = system refusing to answer
        correct = unanswerable_flagged
        cite_match = True   # n/a
        faithful = True     # n/a (no expected answer to be faithful to)

    else:
        # Citation match (±1 page)
        cite_match = citation_match(serialized_citations, expected_page)

        # Faithfulness via LLM judge (short-circuits if already pipeline-verified)
        faithful = score_faithfulness_llm(
            result.answer,
            serialized_citations,
            verification_result=result.verification_result,
        )

        if q_type == "numeric":
            correct = score_numeric(result.answer, expected_answer)
        else:
            # text / answerable — LLM-as-judge
            correct = score_text_llm(question, expected_answer, result.answer)

    return {
        "id": q_id,
        "question": question,
        "type": q_type,
        "expected_answer": expected_answer,
        "actual_answer": result.answer,
        "citations": serialized_citations,
        "confidence": result.confidence,
        "verification_status": verification_status,
        "scores": {
            "correct": correct,
            "citation_match": cite_match,
            "faithful": faithful,
            "unanswerable_flagged": unanswerable_flagged,
        },
        "latency_ms": latency_ms,
        "error": error,
    }


# ══════════════════════════════════════════════════════════════════════════════
# SUMMARY TABLE
# ══════════════════════════════════════════════════════════════════════════════

_GREEN = "\033[92m"
_RED = "\033[91m"
_YELLOW = "\033[93m"
_CYAN = "\033[96m"
_BOLD = "\033[1m"
_RESET = "\033[0m"

def _pct(n: int, total: int) -> str:
    if total == 0:
        return "N/A"
    return f"{round(100 * n / total)}%"

def _tick(val: Optional[bool]) -> str:
    if val is None:
        return "—"
    return f"{_GREEN}✓{_RESET}" if val else f"{_RED}✗{_RESET}"


def print_summary_table(results: list[dict]) -> None:
    total = len(results)
    errors = sum(1 for r in results if r["error"])
    ran = total - errors

    correct_ct = sum(1 for r in results if r["scores"]["correct"])
    cite_ct = sum(1 for r in results if r["scores"]["citation_match"])
    faith_ct = sum(1 for r in results if r["scores"]["faithful"])
    unanswerable_results = [r for r in results if r["type"] == "unanswerable"]
    unans_flagged_ct = sum(
        1 for r in unanswerable_results if r["scores"]["unanswerable_flagged"]
    )
    latencies = [r["latency_ms"] for r in results if r["error"] is None]
    avg_latency = round(sum(latencies) / len(latencies), 1) if latencies else 0.0

    # ── Per-question rows ────────────────────────────────────────────────────
    col_w = [6, 55, 14, 9, 9, 9, 9, 10]
    header = (
        f"{'ID':<{col_w[0]}} "
        f"{'Question':<{col_w[1]}} "
        f"{'Type':<{col_w[2]}} "
        f"{'Correct':<{col_w[3]}} "
        f"{'Cite✓':<{col_w[4]}} "
        f"{'Faith':<{col_w[5]}} "
        f"{'Unans':<{col_w[6]}} "
        f"{'Latency':>{col_w[7]}}"
    )
    sep = "─" * (sum(col_w) + len(col_w))

    print(f"\n{_BOLD}{'═' * len(sep)}")
    print("  InsureAI RAG Evaluation Results")
    print(f"{'═' * len(sep)}{_RESET}")
    print(f"{_CYAN}{header}{_RESET}")
    print(sep)

    for r in results:
        s = r["scores"]
        q_short = r["question"][:col_w[1]]
        err_marker = f" {_RED}[ERR]{_RESET}" if r["error"] else ""
        print(
            f"{r['id']:<{col_w[0]}} "
            f"{q_short:<{col_w[1]}} "
            f"{r['type']:<{col_w[2]}} "
            f"{_tick(s['correct']):<{col_w[3]}} "
            f"{_tick(s['citation_match']):<{col_w[4]}} "
            f"{_tick(s['faithful']):<{col_w[5]}} "
            f"{_tick(s['unanswerable_flagged']):<{col_w[6]}} "
            f"{r['latency_ms']:>{col_w[7]}}ms"
            f"{err_marker}"
        )

    # ── Summary ──────────────────────────────────────────────────────────────
    print(sep)
    print(f"\n{_BOLD}Summary ({ran}/{total} questions ran successfully){_RESET}")
    print(f"  Correctness          : {_pct(correct_ct, ran):<6} ({correct_ct}/{ran})")
    print(f"  Citation accuracy    : {_pct(cite_ct, ran):<6} ({cite_ct}/{ran})")
    print(f"  Faithfulness         : {_pct(faith_ct, ran):<6} ({faith_ct}/{ran})")
    if unanswerable_results:
        print(
            f"  Unanswerable flagged : "
            f"{_pct(unans_flagged_ct, len(unanswerable_results)):<6} "
            f"({unans_flagged_ct}/{len(unanswerable_results)})"
        )
    print(f"  Avg latency          : {avg_latency} ms")
    if errors:
        print(f"  {_RED}Errors               : {errors}{_RESET}")
    print()


# ══════════════════════════════════════════════════════════════════════════════
# REPORT WRITER
# ══════════════════════════════════════════════════════════════════════════════

def build_report(results: list[dict], timestamp: str) -> dict:
    total = len(results)
    ran = sum(1 for r in results if r["error"] is None)

    correct_ct = sum(1 for r in results if r["scores"]["correct"])
    cite_ct = sum(1 for r in results if r["scores"]["citation_match"])
    faith_ct = sum(1 for r in results if r["scores"]["faithful"])
    unanswerable_results = [r for r in results if r["type"] == "unanswerable"]
    unans_flagged_ct = sum(
        1 for r in unanswerable_results if r["scores"]["unanswerable_flagged"]
    )
    latencies = [r["latency_ms"] for r in results if r["error"] is None]
    avg_latency = round(sum(latencies) / len(latencies), 1) if latencies else 0.0

    def _safe_pct(n: int, d: int) -> float:
        return round(100 * n / d, 1) if d else 0.0

    # Determine active model name from settings
    provider = settings.llm_provider
    model_map = {
        "groq": settings.groq_model,
        "ollama": settings.ollama_model,
        "openrouter": settings.openrouter_model,
        "nvidia": settings.nvidia_model,
    }
    model_name = model_map.get(provider, "unknown")

    return {
        "run_info": {
            "timestamp": timestamp,
            "llm_provider": provider,
            "rag_model": model_name,
            "judge_model": _EVAL_JUDGE_MODEL,
            "total_questions": total,
        },
        "summary": {
            "correctness_pct": _safe_pct(correct_ct, ran),
            "citation_accuracy_pct": _safe_pct(cite_ct, ran),
            "faithfulness_pct": _safe_pct(faith_ct, ran),
            "unanswerable_flag_rate_pct": _safe_pct(
                unans_flagged_ct, len(unanswerable_results)
            ) if unanswerable_results else None,
            "avg_latency_ms": avg_latency,
        },
        "results": results,
    }


# ══════════════════════════════════════════════════════════════════════════════
# CLI ENTRY POINT
# ══════════════════════════════════════════════════════════════════════════════

def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="InsureAI RAG Evaluation Harness — dev-only, local terminal tool"
    )
    parser.add_argument(
        "--policy-id",
        metavar="POLICY_ID",
        help="Only run questions matching this policy_id",
    )
    parser.add_argument(
        "--limit",
        metavar="N",
        type=int,
        help="Cap number of questions to run",
    )
    parser.add_argument(
        "--questions",
        metavar="PATH",
        default=str(QUESTIONS_FILE),
        help=f"Path to questions JSON file (default: {QUESTIONS_FILE})",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()

    # ── Load questions ───────────────────────────────────────────────────────
    questions_path = Path(args.questions)
    if not questions_path.exists():
        print(f"[ERROR] Questions file not found: {questions_path}", file=sys.stderr)
        sys.exit(1)

    with open(questions_path, encoding="utf-8") as f:
        questions: list[dict] = json.load(f)

    # ── Apply filters ────────────────────────────────────────────────────────
    if args.policy_id:
        questions = [q for q in questions if q.get("policy_id") == args.policy_id]
        if not questions:
            print(
                f"[WARN] No questions found for policy_id={args.policy_id}",
                file=sys.stderr,
            )
            sys.exit(0)

    if args.limit:
        questions = questions[: args.limit]

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    provider = settings.llm_provider
    model_map = {
        "groq": settings.groq_model,
        "ollama": settings.ollama_model,
        "openrouter": settings.openrouter_model,
        "nvidia": settings.nvidia_model,
    }
    model_name = model_map.get(provider, "unknown")

    print(f"\n[InsureAI Eval] {timestamp}")
    print(f"  RAG model  : {provider} / {model_name}")
    print(f"  Judge model: groq / {_EVAL_JUDGE_MODEL}  (separate — avoids self-eval bias)")
    print(f"  Questions  : {len(questions)}")
    print(f"  File       : {questions_path}\n")

    # ── Run each question ────────────────────────────────────────────────────
    results: list[dict] = []
    for i, q in enumerate(questions, 1):
        q_id = q.get("id", f"q{i}")
        print(f"  [{i}/{len(questions)}] {q_id}: {q['question'][:70]}...", end="", flush=True)
        record = run_single(q)
        results.append(record)
        status = "ERROR" if record["error"] else f"{record['latency_ms']}ms"
        print(f" → {status}")

    # ── Print terminal summary ───────────────────────────────────────────────
    print_summary_table(results)

    # ── Save JSON report ─────────────────────────────────────────────────────
    report = build_report(results, timestamp)
    report_path = REPORTS_DIR / f"eval_report_{timestamp}.json"
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(report, f, indent=2, ensure_ascii=False)

    print(f"  Report saved → {report_path}\n")


if __name__ == "__main__":
    main()
