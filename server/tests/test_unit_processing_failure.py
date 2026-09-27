"""
Unit test for policy processing failure behavior.
Verifies:
  - If extraction fails (e.g. invalid file, corrupted PDF), policy status becomes 'failed'
  - processing_error is populated
  - Policy is NOT marked 'ready'
  - No fake facts or chunks are saved
  - Partially created Chroma index is cleaned up
"""

import sys
import tempfile
from pathlib import Path
from datetime import datetime
from bson import ObjectId

repo_root = Path(__file__).resolve().parent.parent.parent
server_dir = repo_root / "server"
for p in (str(repo_root), str(server_dir)):
    if p not in sys.path:
        sys.path.insert(0, p)

import pytest
from server.db import get_async_db
from server.services.policy_service import policy_service
from app.rag.vectorstore import get_chroma_client


@pytest.mark.asyncio
async def test_policy_processing_failure():
    db = get_async_db()
    u_oid = ObjectId()
    p_oid = ObjectId()

    # Create temporary invalid / non-PDF file
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        tmp.write(b"NOT_A_VALID_PDF_HEADER_DATA")
        invalid_path = tmp.name

    policy_doc = {
        "_id": p_oid,
        "user_id": u_oid,
        "file_name": "corrupted.pdf",
        "file_path": invalid_path,
        "status": "uploading",
        "facts": [],
        "processing_error": None,
        "uploaded_at": datetime.utcnow(),
        "updated_at": datetime.utcnow(),
    }
    await db.policies.insert_one(policy_doc)

    # Process the invalid policy
    await policy_service.process_policy_document(str(p_oid), str(u_oid))

    # Inspect MongoDB policy record
    updated = await db.policies.find_one({"_id": p_oid})
    assert updated is not None
    assert updated["status"] == "failed"
    assert updated["status"] != "ready"
    assert updated["processing_error"] is not None
    assert "Invalid PDF" in updated["processing_error"] or "ValueError" in updated["processing_error"]

    # Verify no fake facts or chunks were stored
    assert len(updated.get("facts", [])) == 0
    chunk_count = await db.policy_chunks.count_documents({"policy_id": p_oid})
    assert chunk_count == 0

    # Verify Chroma collection does not exist
    chroma_client = get_chroma_client()
    colls = [c.name for c in chroma_client.list_collections()]
    assert f"policy_{p_oid}" not in colls

    # Cleanup test document
    await db.policies.delete_one({"_id": p_oid})
    Path(invalid_path).unlink(missing_ok=True)
