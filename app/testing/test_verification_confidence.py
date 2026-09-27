#!/usr/bin/env python3
"""
Test verification.py and confidence.py.

Deliberately tests:
  1. A TRUE, fully grounded claim against a real policy excerpt -> Must pass verification with High/Medium confidence.
  2. A DELIBERATELY FALSE / FABRICATED claim against the same excerpt -> Must FAIL verification with Low confidence.

Usage:
    python3.11 test_verification_confidence.py
"""

import sys
import logging
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

logging.basicConfig(level=logging.INFO, format="%(levelname)s | %(name)s | %(message)s")

from app.rag.verification import verify_answer
from app.rag.confidence import assign_confidence

REAL_POLICY_PASSAGE = """
Clause 4. Exclusions
The Company shall not be liable to make any payment under this Policy in respect of any expense incurred in
connection with or in respect of the following:
- Cosmetic or plastic surgery, unless necessitated by an Accident or as part of medically necessary reconstruction
  following a covered Illness.
- Dental treatment or surgery, unless requiring Hospitalisation as a result of an Accident.
- Unproven or experimental treatment, including any treatment not recognised by modern (allopathic) medicine
  unless covered under the AYUSH benefit.
"""

TRUE_CLAIM = "Under Clause 4, unproven or experimental treatments are excluded from coverage unless covered under the AYUSH benefit [Page 5]."

FALSE_CLAIM = "Under Clause 4, all cosmetic surgery and dental treatments are fully covered without any restrictions or accidents required."


def main() -> None:
    print("\n" + "=" * 80)
    print("  TEST: SELF-VERIFICATION & CONFIDENCE SCORING")
    print("=" * 80)

    # ── Test 1: True Claim ────────────────────────────────────────────────────
    print("\n[Test 1] Testing TRUE grounded claim against policy excerpt...")
    print(f"Claim: '{TRUE_CLAIM}'")
    v_true = verify_answer(TRUE_CLAIM, REAL_POLICY_PASSAGE)
    conf_true = assign_confidence("semantic", v_true, retrieval_similarity=0.85)

    print(f"  Verification Supported : {v_true['supported']}")
    print(f"  Verification Status    : {v_true['verification_status']}")
    print(f"  Reasoning              : {v_true['reasoning']}")
    print(f"  Assigned Confidence    : {conf_true.level} ({conf_true.reason})")

    assert v_true["supported"] is True, "FAIL: True claim should be supported!"
    assert conf_true.level in ("High", "Medium"), "FAIL: True claim should have High or Medium confidence!"
    print("  ✅ PASS: True claim correctly verified as supported.")

    # ── Test 2: False / Hallucinated Claim ────────────────────────────────────
    print("\n[Test 2] Testing DELIBERATELY FALSE claim against same policy excerpt...")
    print(f"Claim: '{FALSE_CLAIM}'")
    v_false = verify_answer(FALSE_CLAIM, REAL_POLICY_PASSAGE)
    conf_false = assign_confidence("semantic", v_false, retrieval_similarity=0.85)

    print(f"  Verification Supported : {v_false['supported']}")
    print(f"  Verification Status    : {v_false['verification_status']}")
    print(f"  Reasoning              : {v_false['reasoning']}")
    print(f"  Assigned Confidence    : {conf_false.level} ({conf_false.reason})")

    assert v_false["supported"] is False, "FAIL: False claim should NOT be supported!"
    assert conf_false.level == "Low", "FAIL: False claim must receive LOW confidence!"
    print("  ✅ PASS: Fabricated claim correctly flagged as unsupported with LOW confidence.")

    print("\n" + "=" * 80)
    print("🎉 ALL VERIFICATION AND CONFIDENCE TESTS PASSED!\n")


if __name__ == "__main__":
    main()
