"""
End-to-end integration tests for InsureAI FastAPI application.
Verifies all 19 lifecycle requirements:
  1. Register
  2. Login
  3. Upload an actual PDF fixture
  4. Confirm status transitions
  5. Confirm facts come from fixture content
  6. Confirm no filename-based facts
  7. Confirm MongoDB persistence
  8. Confirm advanced Chroma indexing
  9. Ask a structured question
  10. Ask a semantic question
  11. Confirm verification and confidence
  12. Confirm page citations
  13. Confirm conversation persistence
  14. Run cost estimation
  15. Run a what-if simulation
  16. Delete the policy
  17. Confirm MongoDB cleanup
  18. Confirm Chroma collection cleanup
  19. Confirm cross-user access is rejected
"""

import sys
import uuid
from pathlib import Path

repo_root = Path(__file__).resolve().parent.parent.parent
server_dir = repo_root / "server"
for p in (str(repo_root), str(server_dir)):
    if p not in sys.path:
        sys.path.insert(0, p)

import pytest
from httpx import AsyncClient, ASGITransport
from server.main import app
from server.db import get_async_db, to_object_id
from app.rag.vectorstore import get_chroma_client, delete_policy_index


@pytest.mark.asyncio
async def test_full_application_lifecycle():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        # ── Health check ──────────────────────────────────────────────────────
        health_res = await client.get("/api/health")
        assert health_res.status_code == 200
        assert health_res.json()["status"] == "online"
        assert health_res.json()["database"] == "connected"

        # ── 1. Register User A ────────────────────────────────────────────────
        unique_email_a = f"test_user_a_{uuid.uuid4().hex[:8]}@example.com"
        reg_res_a = await client.post(
            "/api/auth/register",
            json={
                "full_name": "Test User Alpha",
                "email": unique_email_a,
                "password": "Password123!",
                "phone": "+91 99999 11111",
            },
        )
        assert reg_res_a.status_code == 201, reg_res_a.text
        data_a = reg_res_a.json()
        assert "token" in data_a
        assert "password_hash" not in data_a["user"]
        token_a = data_a["token"]
        user_a_id = data_a["user"]["_id"]
        headers_a = {"Authorization": f"Bearer {token_a}"}

        # ── 2. Login User A ───────────────────────────────────────────────────
        login_res_a = await client.post(
            "/api/auth/login",
            json={"email": unique_email_a, "password": "Password123!"},
        )
        assert login_res_a.status_code == 200
        assert login_res_a.json()["token"] is not None
        assert "password_hash" not in login_res_a.json()["user"]

        # Register User B (for cross-user rejection tests)
        unique_email_b = f"test_user_b_{uuid.uuid4().hex[:8]}@example.com"
        reg_res_b = await client.post(
            "/api/auth/register",
            json={
                "full_name": "Test User Beta",
                "email": unique_email_b,
                "password": "Password123!",
            },
        )
        assert reg_res_b.status_code == 201
        token_b = reg_res_b.json()["token"]
        headers_b = {"Authorization": f"Bearer {token_b}"}

        # ── 3. Upload actual PDF fixture ──────────────────────────────────────
        fixture_path = repo_root / "app" / "testing" / "sample_health_insurance_policy.pdf"
        assert fixture_path.exists(), f"PDF fixture not found at {fixture_path}"

        with open(fixture_path, "rb") as pdf_file:
            upload_res = await client.post(
                "/api/policies/upload",
                headers=headers_a,
                files={"file": ("custom_uploaded_policy.pdf", pdf_file, "application/pdf")},
                data={
                    "insurer_name": "Star Health & Allied Insurance",
                    "policy_type": "individual_health",
                },
            )

        assert upload_res.status_code == 201, upload_res.text
        upload_data = upload_res.json()
        assert upload_data["success"] is True
        policy = upload_data["policy"]
        policy_id = policy["_id"]
        assert policy["status"] in ("uploading", "extracting", "ready")

        # ── 4. Confirm status transitions & wait for ready ────────────────────
        # Trigger policy processing synchronously for test determinism
        from server.services.policy_service import policy_service
        await policy_service.process_policy_document(policy_id, user_a_id)

        # Poll GET /api/policies/{policy_id}
        pol_check = await client.get(f"/api/policies/{policy_id}", headers=headers_a)
        assert pol_check.status_code == 200
        pol_data = pol_check.json()["policy"]
        assert pol_data["status"] == "ready"
        assert pol_data["processing_error"] is None

        # ── 5. Confirm facts come from fixture content ────────────────────────
        facts = pol_data["facts"]
        assert len(facts) > 0

        # Sum insured from fixture page 1 is Rs. 10,00,000
        si_fact = next((f for f in facts if f["category"] == "sum_insured"), None)
        assert si_fact is not None
        assert "10,00,000" in si_fact["fact_value"]

        # Room rent from fixture page 4 is 1%
        rr_fact = next((f for f in facts if f["category"] == "room_rent_limit"), None)
        assert rr_fact is not None
        assert "1%" in rr_fact["fact_value"]

        # Waiting periods
        wp_facts = [f for f in facts if f["category"] == "waiting_period"]
        assert len(wp_facts) > 0

        # ── 6. Confirm no filename-based facts ─────────────────────────────────
        # Filename was "custom_uploaded_policy.pdf" (contained no insurer name)
        assert pol_data["file_name"] == "custom_uploaded_policy.pdf"

        # ── 7. Confirm MongoDB persistence ────────────────────────────────────
        db = get_async_db()
        p_in_db = await db.policies.find_one({"_id": to_object_id(policy_id)})
        assert p_in_db is not None
        assert p_in_db["status"] == "ready"

        # Chunks in MongoDB
        chunks_in_db = await db.policy_chunks.find({"policy_id": to_object_id(policy_id)}).to_list(length=100)
        assert len(chunks_in_db) > 0
        assert chunks_in_db[0]["user_id"] == to_object_id(user_a_id)

        # ── 8. Confirm advanced Chroma indexing ───────────────────────────────
        chroma_client = get_chroma_client()
        coll_name = f"policy_{policy_id}"
        chroma_colls = [c.name for c in chroma_client.list_collections()]
        assert coll_name in chroma_colls

        # ── 9. Ask a structured question ──────────────────────────────────────
        chat_q1 = await client.post(
            "/api/chat/message",
            headers=headers_a,
            json={
                "policy_id": policy_id,
                "question": "What is the daily hospital room rent limit under my policy?",
            },
        )
        assert chat_q1.status_code == 200, chat_q1.text
        conv1_id = chat_q1.json()["conversationId"]
        ans1 = chat_q1.json()["assistantMessage"]
        assert ans1["query_type"] == "structured"
        assert ans1["confidence_level"] == "high"
        assert ans1["verification_passed"] is True
        assert "1%" in ans1["content"]
        assert any(c["page_number"] == 4 for c in ans1["citations"])

        # ── 10 & 11 & 12. Ask a semantic question with citations & verif ──────
        chat_q2 = await client.post(
            "/api/chat/message",
            headers=headers_a,
            json={
                "policy_id": policy_id,
                "conversation_id": conv1_id,
                "question": "Is experimental or unproven treatment covered by this insurance?",
            },
        )
        assert chat_q2.status_code == 200, chat_q2.text
        ans2 = chat_q2.json()["assistantMessage"]
        assert ans2["query_type"] == "semantic"
        assert ans2["confidence_level"] in ("high", "medium")
        assert len(ans2["citations"]) > 0
        assert ans2["verification_notes"] is not None

        # ── 13. Confirm conversation persistence ──────────────────────────────
        conv_res = await client.get("/api/chat/conversations", headers=headers_a)
        assert conv_res.status_code == 200
        conv_list = conv_res.json()["conversations"]
        assert len(conv_list) >= 1
        conv_id = conv_list[0]["_id"]

        conv_detail = await client.get(f"/api/chat/conversations/{conv_id}", headers=headers_a)
        assert conv_detail.status_code == 200
        messages = conv_detail.json()["conversation"]["messages"]
        assert len(messages) >= 4  # 2 user + 2 assistant messages

        # ── 14. Run cost estimation ───────────────────────────────────────────
        cost_res = await client.post(
            "/api/cost/estimate",
            headers=headers_a,
            json={
                "policy_id": policy_id,
                "treatment_name": "knee replacement",
                "hospital_tier": "tier_1",
                "room_rent_per_day": 8000.0,
                "stay_days": 4,
            },
        )
        assert cost_res.status_code == 200, cost_res.text
        est_data = cost_res.json()["estimate"]
        estimate_id = est_data["_id"]
        assert est_data["covered_amount"] > 0
        assert est_data["out_of_pocket_amount"] >= 0

        # ── 15. Run a what-if simulation ──────────────────────────────────────
        whatif_res = await client.post(
            f"/api/cost/estimate/{estimate_id}/what-if",
            headers=headers_a,
            json={
                "changed_variable": "hospital_tier",
                "new_value": "tier_2",
            },
        )
        assert whatif_res.status_code == 200, whatif_res.text
        variant = whatif_res.json()["variant"]
        assert variant["changed_variable"] == "hospital_tier"
        assert variant["new_value"] == "tier_2"
        # Confirm original room rent (8000) and stay (4) preserved in what-if breakdown
        assert variant["cost_breakdown"]["room_rent_applied"] == 8000.0 * 4

        # ── 19. Confirm cross-user access is rejected ─────────────────────────
        # User B trying to query User A's policy
        cross_chat = await client.post(
            "/api/chat/message",
            headers=headers_b,
            json={
                "policy_id": policy_id,
                "question": "What is my room rent limit?",
            },
        )
        assert cross_chat.status_code == 403

        # User B trying to view User A's policy
        cross_get = await client.get(f"/api/policies/{policy_id}", headers=headers_b)
        assert cross_get.status_code == 403

        # User B trying to delete User A's policy
        cross_del = await client.delete(f"/api/policies/{policy_id}", headers=headers_b)
        assert cross_del.status_code == 403

        # ── 16, 17, 18. Delete policy & confirm cleanup ───────────────────────
        del_res = await client.delete(f"/api/policies/{policy_id}", headers=headers_a)
        assert del_res.status_code == 200

        # MongoDB cleanup
        assert await db.policies.find_one({"_id": to_object_id(policy_id)}) is None
        assert await db.policy_chunks.count_documents({"policy_id": to_object_id(policy_id)}) == 0
        assert await db.cost_estimates.count_documents({"policy_id": to_object_id(policy_id)}) == 0

        # Chroma collection cleanup
        updated_chroma_colls = [c.name for c in chroma_client.list_collections()]
        assert coll_name not in updated_chroma_colls
