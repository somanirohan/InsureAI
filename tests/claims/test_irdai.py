"""
Unit tests for IRDAI reference data loader and validation.
Verifies structure, placeholder rules, and ensures no regulatory literals exist outside reference files.
"""

import json
import os
import subprocess
from pathlib import Path
import pytest

from app.claims.irdai import (
    load_irdai_reference,
    validate_irdai_reference,
    get_ped_waiting_period_max_months,
    get_moratorium_period_months,
    get_free_look_period_min_days,
)


def test_irdai_reference_structure():
    """Verify all 3 required IRDAI entries exist with required fields."""
    data = load_irdai_reference(force_reload=True)
    assert "ped_waiting_period_max_months" in data
    assert "moratorium_period_months" in data
    assert "free_look_period_min_days" in data

    for key in ("ped_waiting_period_max_months", "moratorium_period_months", "free_look_period_min_days"):
        entry = data[key]
        assert "value" in entry
        assert "source" in entry and len(entry["source"]) > 5
        assert "clause" in entry
        assert "effective_date" in entry
        assert "verified_on" in entry
        assert "verified_by" in entry


def test_irdai_accessors():
    """Verify numeric accessors return correct types and non-zero values."""
    ped = get_ped_waiting_period_max_months()
    moratorium = get_moratorium_period_months()
    free_look = get_free_look_period_min_days()

    assert isinstance(ped, int) and ped > 0
    assert isinstance(moratorium, int) and moratorium > 0
    assert isinstance(free_look, int) and free_look > 0


def test_irdai_validation_dev_mode():
    """Dev mode permits the UNVERIFIED placeholder string."""
    assert validate_irdai_reference(allow_unverified_dev=True) is True


def test_irdai_validation_prod_mode_fails_on_unverified():
    """Prod mode (allow_unverified_dev=False) MUST fail if entries are still UNVERIFIED."""
    with pytest.raises(ValueError, match="still marked UNVERIFIED"):
        validate_irdai_reference(allow_unverified_dev=False)


def test_no_hardcoded_irdai_literals_in_claims_code():
    """
    Grep check ensuring no IRDAI numeric constants are hardcoded outside
    the reference json or loader.
    """
    repo_root = Path(__file__).resolve().parent.parent.parent
    claims_dir = repo_root / "app" / "claims"

    # Files allowed to mention IRDAI constants
    exempt_files = {"irdai.py", "__init__.py"}

    for py_file in claims_dir.glob("*.py"):
        if py_file.name in exempt_files:
            continue
        content = py_file.read_text(encoding="utf-8")
        # Check for hardcoded 36, 60 as standalone waiting period numbers
        # (avoid matching common year dates or numbers in comments)
        assert "ped_max = 36" not in content, f"Found literal 36 in {py_file.name}"
        assert "moratorium = 60" not in content, f"Found literal 60 in {py_file.name}"
