"""
Integration tests for FastAPI Claims router (/api/claims).
Tests claim creation, treatment update, deterministic eligibility,
checklist generation, settlement calculation, review package, and state transitions
using an isolated in-memory mock database.
"""

from unittest.mock import MagicMock, patch
from bson import ObjectId
import pytest
from httpx import ASGITransport, AsyncClient

from server.main import app
from server.services.auth_service import get_current_user


# Mock user
MOCK_USER_ID = str(ObjectId())
MOCK_USER = {
    "_id": ObjectId(MOCK_USER_ID),
    "email": "claims_tester@example.com",
    "full_name": "Ramesh Sharma",
    "role": "user",
}


class FakeCollection:
    def __init__(self):
        self.docs = []

    async def insert_one(self, doc):
        d = dict(doc)
        if "_id" not in d:
            d["_id"] = ObjectId()
        self.docs.append(d)
        res = MagicMock()
        res.inserted_id = d["_id"]
        return res

    async def find_one(self, query):
        for d in self.docs:
            if all(d.get(k) == v for k, v in query.items()):
                return dict(d)
        return None

    def find(self, query=None):
        query = query or {}
        matches = [dict(d) for d in self.docs if all(d.get(k) == v for k, v in query.items())]

        class FakeCursor:
            def __init__(self, data):
                self.data = data

            def sort(self, *args, **kwargs):
                return self

            async def to_list(self, length=100):
                return self.data[:length]

        return FakeCursor(matches)

    async def update_one(self, query, update):
        target = None
        for d in self.docs:
            if all(d.get(k) == v for k, v in query.items()):
                target = d
                break
        if target and "$set" in update:
            target.update(update["$set"])
        return MagicMock()

    async def delete_many(self, query):
        self.docs = [d for d in self.docs if not all(d.get(k) == v for k, v in query.items())]
        return MagicMock()

    async def delete_one(self, query):
        for i, d in enumerate(self.docs):
            if all(d.get(k) == v for k, v in query.items()):
                self.docs.pop(i)
                break
        return MagicMock()


class FakeDatabase:
    def __init__(self):
        self.claims = FakeCollection()
        self.policies = FakeCollection()


@pytest.fixture
def fake_db():
    fdb = FakeDatabase()
    with patch("server.routers.claims.get_async_db", return_value=fdb):
        yield fdb


@pytest.fixture
def override_auth():
    """Override get_current_user dependency."""
    app.dependency_overrides[get_current_user] = lambda: MOCK_USER
    yield
    app.dependency_overrides.pop(get_current_user, None)


@pytest.fixture
def sample_policy(fake_db):
    """Seed sample policy into in-memory mock collection."""
    policy_doc = {
        "_id": ObjectId(),
        "user_id": ObjectId(MOCK_USER_ID),
        "file_name": "Bajaj_HealthGuard_Individual.pdf",
        "policy_number": "POL-TEST-12345",
        "insurer_name": "Bajaj Allianz General Insurance",
        "policy_type": "Health Insurance",
        "sum_insured": 500000.0,
        "status": "ready",
        "facts": [
            {
                "category": "sum_insured",
                "fact_key": "sum_insured_base",
                "fact_value": "₹ 5,00,000",
                "fact_value_numeric": 500000.0,
                "source_page": 1,
            },
            {
                "category": "room_rent_limit",
                "fact_key": "room_rent_ceiling",
                "fact_value": "1% of Sum Insured",
                "fact_value_numeric": 5000.0,
                "source_page": 2,
            },
            {
                "category": "co_payment",
                "fact_key": "copay_standard",
                "fact_value": "10%",
                "fact_value_numeric": 10.0,
                "source_page": 3,
            },
            {
                "category": "deductible",
                "fact_key": "deductible_val",
                "fact_value": "₹ 0",
                "fact_value_numeric": 0.0,
                "source_page": 3,
            },
            {
                "category": "waiting_period",
                "fact_key": "wp_ped",
                "fact_value": "Pre-existing Diseases: 36 months",
                "source_page": 4,
                "metadata": {"condition": "Pre-existing Diseases", "period": "36 months"},
            },
            {
                "category": "waiting_period",
                "fact_key": "wp_cataract",
                "fact_value": "Cataract Surgery: 24 months",
                "source_page": 4,
                "metadata": {"condition": "Cataract Surgery", "period": "24 months"},
            },
            {
                "category": "exclusion",
                "fact_key": "exc_cosmetic",
                "fact_value": "Cosmetic and plastic surgery",
                "source_page": 8,
                "metadata": {"item": "Cosmetic and plastic surgery"},
            },
            {
                "category": "claim_condition",
                "fact_key": "cond_discharge",
                "fact_value": "Submit original discharge summary within 15 days of discharge",
                "source_page": 12,
                "metadata": {
                    "condition": "Submit original discharge summary within 15 days of discharge",
                    "stage": "after_discharge",
                    "deadline": "15 days",
                    "verified": True,
                },
            },
            {
                "category": "claim_condition",
                "fact_key": "cond_bill",
                "fact_value": "Submit original hospital final bill and receipt within 30 days",
                "source_page": 12,
                "metadata": {
                    "condition": "Submit original hospital final bill and receipt within 30 days",
                    "stage": "after_discharge",
                    "deadline": "30 days",
                    "verified": True,
                },
            },
        ],
    }
    fake_db.policies.docs.append(policy_doc)
    return policy_doc


@pytest.mark.asyncio
async def test_claims_api_flow(override_auth, sample_policy):
    """Test full API journey: Create claim -> Update treatment -> Evaluate eligibility -> Review."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        # 1. Create claim
        policy_id = str(sample_policy["_id"])
        create_res = await client.post("/api/claims", json={"policy_id": policy_id})
        assert create_res.status_code == 201
        claim_data = create_res.json()["claim"]
        claim_id = claim_data["claim_id"]
        assert claim_data["status"] == "draft"
        assert len(claim_data["checklist"]) >= 2

        # 2. List claims
        list_res = await client.get("/api/claims")
        assert list_res.status_code == 200
        claims_list = list_res.json()["claims"]
        assert any(c["claim_id"] == claim_id for c in claims_list)

        # 3. Get single claim
        get_res = await client.get(f"/api/claims/{claim_id}")
        assert get_res.status_code == 200
        assert get_res.json()["claim"]["claim_id"] == claim_id

        # 4. Update treatment
        treatment_payload = {
            "name": "Appendectomy",
            "hospital": "Apollo Hospital",
            "admission_date": "2024-05-10",
            "discharge_date": "2024-05-13",
            "room_type": "Single Private AC",
            "estimated_cost": 95000.0,
        }
        treat_res = await client.put(f"/api/claims/{claim_id}/treatment", json=treatment_payload)
        assert treat_res.status_code == 200
        assert treat_res.json()["claim"]["treatment"]["name"] == "Appendectomy"

        # 5. Evaluate eligibility
        elig_res = await client.post(f"/api/claims/{claim_id}/eligibility")
        assert elig_res.status_code == 200
        elig_data = elig_res.json()["eligibility_result"]
        assert len(elig_data["checks"]) == 5
        assert elig_res.json()["claim"]["status"] == "eligibility_checked"

        # 6. Refresh checklist (transitions to docs_pending)
        check_res = await client.post(f"/api/claims/{claim_id}/checklist")
        assert check_res.status_code == 200
        assert check_res.json()["claim"]["status"] == "docs_pending"

        # 7. Settlement estimate calculation
        settle_res = await client.post(f"/api/claims/{claim_id}/settlement")
        assert settle_res.status_code == 200
        settle_est = settle_res.json()["settlement_estimate"]
        assert settle_est["basis"] == "pre_treatment_estimate"
        assert settle_est["total"] > 0

        # 8. Mark requirement done endpoint
        req_item = next(
            (it for it in check_res.json()["claim"]["checklist"] if it.get("kind") == "requirement"),
            None
        )
        if req_item:
            req_done_res = await client.put(
                f"/api/claims/{claim_id}/checklist/{req_item['item_id']}/done",
                json={"done": True, "note": "Attested completed"},
            )
            assert req_done_res.status_code == 200
            assert req_done_res.json()["item"]["status"] == "done"

        # 9. Verify upload to requirement item is rejected with 422
        bad_upload_res = await client.post(
            f"/api/claims/{claim_id}/documents",
            data={"item_id": "admission_intimation"},
            files={"file": ("test.pdf", b"%PDF-1.4 dummy", "application/pdf")},
        )
        assert bad_upload_res.status_code == 422
        assert "not an uploadable document slot" in bad_upload_res.json()["detail"]

        # 10. Get Review package
        rev_res = await client.get(f"/api/claims/{claim_id}/review")
        assert rev_res.status_code == 200
        rev_data = rev_res.json()
        assert "readiness" in rev_data
        assert "qualitative_label" in rev_data["readiness"]
        assert rev_data["can_submit"] is False  # Documents are still pending!

        # 11. Blocked transition to ready_to_submit
        bad_status_res = await client.post(
            f"/api/claims/{claim_id}/status",
            json={"status": "ready_to_submit", "note": "Trying to bypass docs"},
        )
        assert bad_status_res.status_code in (400, 409)

        # 12. Check timeline
        timeline_res = await client.get(f"/api/claims/{claim_id}/timeline")
        assert timeline_res.status_code == 200
        timeline = timeline_res.json()["timeline"]
        assert len(timeline) >= 4
