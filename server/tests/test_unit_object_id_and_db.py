"""
Unit tests for db.py ObjectId helpers and document serialization.
"""

import sys
from pathlib import Path

repo_root = Path(__file__).resolve().parent.parent.parent
server_dir = repo_root / "server"
for p in (str(repo_root), str(server_dir)):
    if p not in sys.path:
        sys.path.insert(0, p)

import pytest
from bson import ObjectId
from server.db import to_object_id, serialize_doc, check_db_health


def test_to_object_id():
    # Valid 24-hex string
    valid_hex = "65f1a2b3c4d5e6f7a8b9c0d1"
    oid = to_object_id(valid_hex)
    assert isinstance(oid, ObjectId)
    assert str(oid) == valid_hex

    # Already an ObjectId
    orig_oid = ObjectId()
    assert to_object_id(orig_oid) == orig_oid

    # Invalid strings and None
    assert to_object_id(None) is None
    assert to_object_id("not-an-oid") is None
    assert to_object_id(12345) is None
    assert to_object_id("") is None


def test_serialize_doc():
    u_oid = ObjectId()
    p_oid = ObjectId()
    doc = {
        "_id": u_oid,
        "name": "Test User",
        "policy_id": p_oid,
        "policy_ids": [p_oid, "simple_str"],
        "nested": {
            "sub_id": u_oid,
            "value": 100,
        },
        "count": 42,
    }

    serialized = serialize_doc(doc)

    assert serialized["_id"] == str(u_oid)
    assert serialized["policy_id"] == str(p_oid)
    assert serialized["policy_ids"] == [str(p_oid), "simple_str"]
    assert serialized["nested"]["sub_id"] == str(u_oid)
    assert serialized["nested"]["value"] == 100
    assert serialized["count"] == 42


@pytest.mark.asyncio
async def test_db_health():
    is_healthy = await check_db_health()
    assert is_healthy is True
