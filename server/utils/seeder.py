"""
Database seeder for demo data in InsureAI backend.
Uses bcrypt password hashing, standard ObjectId relationships, and advanced ChromaDB indexing.
"""

import sys
from pathlib import Path

# Add project root and server directory to python path
repo_root = Path(__file__).resolve().parent.parent.parent
server_dir = repo_root / "server"
for p in (str(repo_root), str(server_dir)):
    if p not in sys.path:
        sys.path.insert(0, p)

import uuid
from datetime import datetime, timedelta
from bson import ObjectId

from server.db import get_sync_db
from server.services.auth_service import hash_password

from app.ingestion.chunking import Chunk
from app.rag.vectorstore import index_chunks, delete_policy_index


def seed_data():
    print("[Python Seeder] Connecting to database...")
    db = get_sync_db()

    print("[Python Seeder] Clearing existing demo collections...")
    db.users.delete_many({})
    db.policies.delete_many({})
    db.policy_chunks.delete_many({})
    db.conversations.delete_many({})
    db.cost_estimates.delete_many({})
    db.policy_comparisons.delete_many({})

    user_id = ObjectId()
    pwd_hash = hash_password("password123")
    user_doc = {
        "_id": user_id,
        "full_name": "Dr. Arjun Verma",
        "email": "demo@medshield.ai",
        "password_hash": pwd_hash,
        "phone": "+91 98765 43210",
        "is_active": True,
        "created_at": datetime.utcnow(),
        "last_login_at": datetime.utcnow()
    }
    db.users.insert_one(user_doc)
    print(f"[Python Seeder] Created User: {user_doc['email']} (ID: {user_id})")

    star_policy_id = ObjectId()
    hdfc_policy_id = ObjectId()

    star_facts = [
        {
            "fact_id": str(uuid.uuid4()),
            "category": "sum_insured",
            "fact_key": "sum_insured",
            "fact_value": "INR 10,00,000",
            "fact_value_numeric": 1000000.0,
            "unit": "INR",
            "source_page": 2,
            "source_section": "Section 1 - Schedule of Benefits",
            "extraction_confidence": "high",
            "metadata": None,
        },
        {
            "fact_id": str(uuid.uuid4()),
            "category": "room_rent_limit",
            "fact_key": "room_rent_limit",
            "fact_value": "Single Private A/C Room or max 1% of Sum Insured per day (INR 10,000/day)",
            "fact_value_numeric": 10000.0,
            "unit": "INR/day",
            "source_page": 4,
            "source_section": "Section 3.1 - Inpatient Hospitalization Room Limits",
            "extraction_confidence": "high",
            "metadata": None,
        },
        {
            "fact_id": str(uuid.uuid4()),
            "category": "co_payment",
            "fact_key": "co_payment",
            "fact_value": "10% co-payment for non-network metro hospitals; 0% in network facilities",
            "fact_value_numeric": 10.0,
            "unit": "%",
            "source_page": 7,
            "source_section": "Section 5.4 - Co-Payment Terms",
            "extraction_confidence": "high",
            "metadata": None,
        },
        {
            "fact_id": str(uuid.uuid4()),
            "category": "waiting_period",
            "fact_key": "waiting_period_1",
            "fact_value": "Pre-Existing Diseases (PED): 36 months from policy inception date",
            "fact_value_numeric": 36.0,
            "unit": "months",
            "source_page": 8,
            "source_section": "Section 6.1 - Pre-Existing Diseases",
            "extraction_confidence": "high",
            "metadata": {
                "condition": "Pre-Existing Diseases (PED)",
                "period": "36 months from policy inception date"
            },
        },
        {
            "fact_id": str(uuid.uuid4()),
            "category": "waiting_period",
            "fact_key": "waiting_period_2",
            "fact_value": "Initial Waiting Period: 30 days from policy inception (accidents exempted)",
            "fact_value_numeric": 30.0,
            "unit": "days",
            "source_page": 8,
            "source_section": "Section 6.2 - Initial Waiting Period",
            "extraction_confidence": "high",
            "metadata": {
                "condition": "Initial Waiting Period",
                "period": "30 days from policy inception (accidents exempted)"
            },
        },
        {
            "fact_id": str(uuid.uuid4()),
            "category": "exclusion",
            "fact_key": "exclusion_1",
            "fact_value": "Aesthetic, cosmetic, obesity, and experimental procedures are permanently excluded",
            "fact_value_numeric": None,
            "unit": None,
            "source_page": 11,
            "source_section": "Section 7.1 - Permanent Exclusions",
            "extraction_confidence": "high",
            "metadata": {
                "item": "Aesthetic, cosmetic, obesity, and experimental procedures are permanently excluded"
            },
        }
    ]

    star_policy = {
        "_id": star_policy_id,
        "user_id": user_id,
        "file_name": "Star_Health_Premier_Policy.pdf",
        "file_path": "uploads/policies/demo_star_health.pdf",
        "file_size_bytes": 3420100,
        "insurer_name": "Star Health & Allied Insurance",
        "policy_type": "individual_health",
        "policy_number": "SH-IND-2024-89214",
        "sum_insured": 1000000.0,
        "premium_amount": 14500.0,
        "status": "ready",
        "ocr_used": False,
        "red_flag_summary": {
            "waiting_periods": [
                "36 months waiting period for Pre-Existing Diseases (PED)",
                "30 days initial waiting period"
            ],
            "major_exclusions": [
                "Aesthetic, cosmetic, obesity, and experimental procedures are permanently excluded"
            ],
            "room_rent_cap": "Single Private A/C Room or max 1% of Sum Insured per day (INR 10,000/day)",
            "copay_percentage": "10% co-payment for non-network metro hospitals; 0% in network facilities",
            "claim_conditions": ["Pre-authorization required within 48 hours for planned hospitalization"]
        },
        "facts": star_facts,
        "uploaded_at": datetime.utcnow() - timedelta(days=5),
        "indexed_at": datetime.utcnow() - timedelta(days=5),
        "updated_at": datetime.utcnow()
    }

    hdfc_facts = [
        {
            "fact_id": str(uuid.uuid4()),
            "category": "sum_insured",
            "fact_key": "sum_insured",
            "fact_value": "INR 15,00,000 + 100% Secure Benefit",
            "fact_value_numeric": 1500000.0,
            "unit": "INR",
            "source_page": 1,
            "source_section": "Benefits Overview",
            "extraction_confidence": "high",
            "metadata": None,
        },
        {
            "fact_id": str(uuid.uuid4()),
            "category": "room_rent_limit",
            "fact_key": "room_rent_limit",
            "fact_value": "No Room Rent Capping (Any room up to Suite allowed)",
            "fact_value_numeric": None,
            "unit": None,
            "source_page": 3,
            "source_section": "Room Rent Clause",
            "extraction_confidence": "high",
            "metadata": None,
        },
        {
            "fact_id": str(uuid.uuid4()),
            "category": "co_payment",
            "fact_key": "co_payment",
            "fact_value": "0% co-payment across all tiers and network hospitals",
            "fact_value_numeric": 0.0,
            "unit": "%",
            "source_page": 5,
            "source_section": "Co-Payment Terms",
            "extraction_confidence": "high",
            "metadata": None,
        },
        {
            "fact_id": str(uuid.uuid4()),
            "category": "waiting_period",
            "fact_key": "waiting_period_1",
            "fact_value": "Pre-Existing Diseases: 24 months waiting period",
            "fact_value_numeric": 24.0,
            "unit": "months",
            "source_page": 7,
            "source_section": "Waiting Period Clauses",
            "extraction_confidence": "high",
            "metadata": {
                "condition": "Pre-Existing Diseases",
                "period": "24 months waiting period"
            },
        }
    ]

    hdfc_policy = {
        "_id": hdfc_policy_id,
        "user_id": user_id,
        "file_name": "HDFC_ERGO_Optima_Secure.pdf",
        "file_path": "uploads/policies/demo_hdfc_ergo.pdf",
        "file_size_bytes": 4120000,
        "insurer_name": "HDFC ERGO General Insurance",
        "policy_type": "family_floater",
        "policy_number": "HE-OPT-2024-55092",
        "sum_insured": 1500000.0,
        "premium_amount": 22800.0,
        "status": "ready",
        "ocr_used": False,
        "red_flag_summary": {
            "waiting_periods": [
                "24 months waiting period for Pre-Existing Diseases"
            ],
            "major_exclusions": [
                "Dental care unless required due to traumatic accidental injury"
            ],
            "room_rent_cap": "No Room Rent Capping (Any room up to Suite allowed)",
            "copay_percentage": "0% co-payment across all tiers and network hospitals",
            "claim_conditions": ["Notify company within 24 hours of emergency hospitalization"]
        },
        "facts": hdfc_facts,
        "uploaded_at": datetime.utcnow() - timedelta(days=2),
        "indexed_at": datetime.utcnow() - timedelta(days=2),
        "updated_at": datetime.utcnow()
    }

    db.policies.insert_many([star_policy, hdfc_policy])
    print(f"[Python Seeder] Created 2 Policies: {star_policy['insurer_name']} and {hdfc_policy['insurer_name']}")

    raw_chunks = [
        {
            "policy_id": star_policy_id,
            "user_id": user_id,
            "chunk_index": 0,
            "chunk_text": "Section 1: The insured is entitled to hospital room boarding, nursing, doctor consultation fees up to Sum Insured INR 10,00,000 for all medically necessary inpatient treatments.",
            "page_number": 2,
            "section_heading": "Section 1 - Schedule of Benefits",
            "token_count": 35,
            "vector_id": str(uuid.uuid4()),
        },
        {
            "policy_id": star_policy_id,
            "user_id": user_id,
            "chunk_index": 1,
            "chunk_text": "Section 3: Room rent cap is strictly set at Single Private AC Room or 1% of Sum Insured per day. ICU charges are capped at 2% of Sum Insured per day. Proportionate deductions apply if a higher room category is occupied.",
            "page_number": 4,
            "section_heading": "Section 3 - Room Rent & ICU Caps",
            "token_count": 42,
            "vector_id": str(uuid.uuid4()),
        },
        {
            "policy_id": star_policy_id,
            "user_id": user_id,
            "chunk_index": 2,
            "chunk_text": "Section 5: A 10% co-payment is mandatory for claims processed at Tier 1 non-network hospitals. In network hospitals, no co-payment applies. Cashless claims must be intimating 48 hours prior to planned admission.",
            "page_number": 7,
            "section_heading": "Section 5 - Co-Payment Terms",
            "token_count": 38,
            "vector_id": str(uuid.uuid4()),
        }
    ]

    db.policy_chunks.insert_many(raw_chunks)

    # Index into isolated Chroma collection via app.rag.vectorstore
    try:
        delete_policy_index(str(star_policy_id))
        app_chunks = [
            Chunk(
                chunk_id=c["chunk_index"],
                page_number=c["page_number"],
                text=c["chunk_text"],
            )
            for c in raw_chunks
        ]
        index_chunks(str(star_policy_id), app_chunks)
        print(f"[Python Seeder] Indexed {len(app_chunks)} chunks into Chroma collection for policy {star_policy_id}")
    except Exception as exc:
        print(f"[Python Seeder] Warning: could not index to Chroma during seed: {exc}")

    conv_id = ObjectId()
    conv_doc = {
        "_id": conv_id,
        "user_id": user_id,
        "policy_id": star_policy_id,
        "title": "What is my room rent limit and co-payment?",
        "messages": [
            {
                "message_id": str(uuid.uuid4()),
                "role": "user",
                "content": "What is my room rent limit and is there any co-payment?",
                "query_type": None,
                "plain_language": None,
                "confidence_level": None,
                "verification_passed": None,
                "verification_notes": None,
                "citations": [],
                "created_at": datetime.utcnow() - timedelta(hours=1)
            },
            {
                "message_id": str(uuid.uuid4()),
                "role": "assistant",
                "content": "The room rent limit under this policy is Single Private A/C Room or max 1% of Sum Insured per day (found on Page 4).",
                "query_type": "structured",
                "plain_language": "You are covered for a single private AC room up to 1% of your sum insured per day.",
                "confidence_level": "high",
                "verification_passed": True,
                "verification_notes": "Grounded directly in extracted policy contract facts with zero generation risk.",
                "citations": [
                    {
                        "policy_id": str(star_policy_id),
                        "chunk_vector_id": f"{star_policy_id}_1",
                        "page_number": 4,
                        "section_heading": "Section 3.1 - Room Rent Limits",
                        "excerpt": "Room Rent Limit: Single Private A/C Room or max 1% of Sum Insured per day"
                    }
                ],
                "created_at": datetime.utcnow() - timedelta(minutes=59)
            }
        ],
        "created_at": datetime.utcnow() - timedelta(hours=1),
        "updated_at": datetime.utcnow()
    }
    db.conversations.insert_one(conv_doc)

    est_id = ObjectId()
    est_doc = {
        "_id": est_id,
        "user_id": user_id,
        "policy_id": star_policy_id,
        "treatment_name": "Knee Replacement",
        "hospital_tier": "tier_1",
        "room_rent_per_day": 8000.0,
        "stay_days": 4,
        "estimated_total_cost": 350000.0,
        "covered_amount": 284000.0,
        "out_of_pocket_amount": 66000.0,
        "cost_breakdown": {
            "base_hospital_charges": 350000.0,
            "room_rent_applied": 32000.0,
            "room_rent_cap_per_day": 10000.0,
            "room_rent_copay_penalty": 0.0,
            "deductible_deducted": 0.0,
            "copay_percentage": 10.0,
            "copay_amount": 27500.0,
            "sub_limit_caps_applied": [],
            "excluded_items_cost": 24500.0,
            "final_payable_by_insurer": 284000.0,
            "final_payable_by_user": 66000.0
        },
        "what_if_variants": [],
        "created_at": datetime.utcnow() - timedelta(hours=2)
    }
    db.cost_estimates.insert_one(est_doc)

    print("\n=============================================")
    print(" PYTHON SEEDING COMPLETED SUCCESSFULLY! ")
    print(" Credentials:")
    print(" Email:    demo@medshield.ai")
    print(" Password: password123")
    print("=============================================\n")


if __name__ == "__main__":
    seed_data()
