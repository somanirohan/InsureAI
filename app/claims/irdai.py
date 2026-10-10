"""
IRDAI regulatory reference loader module.
Ensures no regulatory baseline constants are hardcoded as raw numbers anywhere in code.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict

_DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "irdai_reference.json"

_CACHED_REFERENCE: Dict[str, Any] | None = None


def load_irdai_reference(force_reload: bool = False) -> Dict[str, Any]:
    """Load and cache IRDAI reference data from JSON."""
    global _CACHED_REFERENCE
    if _CACHED_REFERENCE is not None and not force_reload:
        return _CACHED_REFERENCE

    if not _DATA_PATH.exists():
        raise FileNotFoundError(f"IRDAI reference data not found at {_DATA_PATH}")

    with open(_DATA_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)

    # Basic structural check
    required_keys = [
        "ped_waiting_period_max_months",
        "moratorium_period_months",
        "free_look_period_min_days",
    ]
    for k in required_keys:
        if k not in data:
            raise ValueError(f"Missing required key in IRDAI reference data: {k}")
        entry = data[k]
        for field in ("value", "source", "clause", "effective_date", "verified_on", "verified_by"):
            if field not in entry:
                raise ValueError(f"Missing required field '{field}' in IRDAI entry '{k}'")

    _CACHED_REFERENCE = data
    return _CACHED_REFERENCE


def validate_irdai_reference(allow_unverified_dev: bool = True) -> bool:
    """
    Validate that all entries have source, clause, and verified_on.
    If allow_unverified_dev is False (production check), entries with 'UNVERIFIED' placeholder fail.
    """
    data = load_irdai_reference()
    for key, entry in data.items():
        if not entry.get("source"):
            raise ValueError(f"IRDAI entry '{key}' lacks a valid source")
        if not entry.get("clause"):
            raise ValueError(f"IRDAI entry '{key}' lacks clause metadata")
        if not entry.get("verified_on"):
            raise ValueError(f"IRDAI entry '{key}' lacks verified_on metadata")

        if not allow_unverified_dev:
            for field in ("clause", "verified_on", "verified_by"):
                val = str(entry.get(field, ""))
                if "UNVERIFIED" in val:
                    raise ValueError(
                        f"Production validation failed: entry '{key}' field '{field}' is still marked UNVERIFIED"
                    )

    return True


def get_ped_waiting_period_max_months() -> int:
    return int(load_irdai_reference()["ped_waiting_period_max_months"]["value"])


def get_moratorium_period_months() -> int:
    return int(load_irdai_reference()["moratorium_period_months"]["value"])


def get_free_look_period_min_days() -> int:
    return int(load_irdai_reference()["free_look_period_min_days"]["value"])
