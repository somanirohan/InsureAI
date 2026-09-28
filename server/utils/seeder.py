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
    print("\n" + "="*50)
    print(" INSURAI DATABASE SEEDER (MONGODB ATLAS) ")
    print("="*50)

    print("\n[Seeder] Connecting to MongoDB Atlas...")
    db = get_sync_db()

    print("[Python Seeder] Clearing existing demo collections...")
    db.users.delete_many({})
    db.policies.delete_many({})
    db.policy_chunks.delete_many({})
    db.conversations.delete_many({})
    db.cost_estimates.delete_many({})
    db.policy_comparisons.delete_many({})

    # ── 1. Create Users ───────────────────────────────────────────────────────
    user_id = ObjectId()
    rohan_user_id = ObjectId()
    priya_user_id = ObjectId()
    pwd_hash = hash_password("password123")

    users_docs = [
        {
            "_id": user_id,
            "full_name": "Dr. Arjun Verma",
            "email": "demo@insurai.com",
            "password_hash": pwd_hash,
            "phone": "+91 98765 43210",
            "is_active": True,
            "created_at": datetime.utcnow() - timedelta(days=30),
            "last_login_at": datetime.utcnow()
        },
        {
            "_id": rohan_user_id,
            "full_name": "Rohan Somani",
            "email": "rohan@insurai.com",
            "password_hash": pwd_hash,
            "phone": "+91 98111 22334",
            "is_active": True,
            "created_at": datetime.utcnow() - timedelta(days=20),
            "last_login_at": datetime.utcnow()
        },
        {
            "_id": priya_user_id,
            "full_name": "Priya Sharma",
            "email": "priya.sharma@example.com",
            "password_hash": pwd_hash,
            "phone": "+91 98222 33445",
            "is_active": True,
            "created_at": datetime.utcnow() - timedelta(days=10),
            "last_login_at": datetime.utcnow()
        }
    ]
    db.users.insert_many(users_docs)
    print(f"[Seeder] Created {len(users_docs)} Users: demo@insurai.com, rohan@insurai.com, priya.sharma@example.com")

    # ── 2. Create Policies & Embedded Facts ───────────────────────────────────
    star_policy_id = ObjectId()
    hdfc_policy_id = ObjectId()
    care_policy_id = ObjectId()
    icici_policy_id = ObjectId()

    # Star Health Facts
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
        "uploaded_at": datetime.utcnow() - timedelta(days=7),
        "indexed_at": datetime.utcnow() - timedelta(days=7),
        "updated_at": datetime.utcnow()
    }

    # HDFC ERGO Facts
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
        "uploaded_at": datetime.utcnow() - timedelta(days=4),
        "indexed_at": datetime.utcnow() - timedelta(days=4),
        "updated_at": datetime.utcnow()
    }

    # Care Health Facts
    care_facts = [
        {
            "fact_id": str(uuid.uuid4()),
            "category": "sum_insured",
            "fact_key": "base_sum_insured",
            "fact_value": "INR 25,00,000",
            "fact_value_numeric": 2500000.0,
            "unit": "INR",
            "source_page": 1,
            "source_section": "Schedule of Benefits & Coverage",
            "extraction_confidence": "high"
        },
        {
            "fact_id": str(uuid.uuid4()),
            "category": "room_rent_limit",
            "fact_key": "room_rent_cap_per_day",
            "fact_value": "Single Private AC Room up to INR 15,000 per day",
            "fact_value_numeric": 15000.0,
            "unit": "INR/day",
            "source_page": 2,
            "source_section": "Section 1: Hospitalization & Room Eligibility",
            "extraction_confidence": "high"
        },
        {
            "fact_id": str(uuid.uuid4()),
            "category": "co_payment",
            "fact_key": "co_payment_clause",
            "fact_value": "0% co-payment for ages under 61; 20% co-payment for ages 61 and above",
            "fact_value_numeric": 0.0,
            "unit": "%",
            "source_page": 3,
            "source_section": "Section 2: Co-payment & Age Limits",
            "extraction_confidence": "high"
        },
        {
            "fact_id": str(uuid.uuid4()),
            "category": "waiting_period",
            "fact_key": "pre_existing_disease_waiting_period",
            "fact_value": "36 months waiting period for Pre-Existing Diseases",
            "fact_value_numeric": 36.0,
            "unit": "months",
            "source_page": 4,
            "source_section": "Section 3: Waiting Periods & Exclusions",
            "extraction_confidence": "high"
        },
        {
            "fact_id": str(uuid.uuid4()),
            "category": "claim_condition",
            "fact_key": "unlimited_recharge",
            "fact_value": "Unlimited automatic recharge of Sum Insured upon total exhaustion",
            "fact_value_numeric": 2500000.0,
            "unit": "INR",
            "source_page": 2,
            "source_section": "Section 1.3: Unlimited Automatic Recharge",
            "extraction_confidence": "high"
        }
    ]

    care_policy = {
        "_id": care_policy_id,
        "user_id": str(user_id),
        "file_name": "Care_Health_Advantage.pdf",
        "file_path": "uploads/policies/demo_care_health.pdf",
        "file_size_bytes": 2890000,
        "insurer_name": "Care Health Insurance",
        "policy_type": "individual_health",
        "policy_number": "CARE-ADV-2024-31908",
        "sum_insured": 2500000.0,
        "premium_amount": 31200.0,
        "status": "ready",
        "ocr_used": False,
        "red_flag_summary": {
            "waiting_periods": [
                "36 months PED waiting period",
                "24 months specific illnesses (cataract, joint replacement, kidney stones)",
                "30 days initial waiting period"
            ],
            "major_exclusions": [
                "Fertility and infertility treatments",
                "Psychiatric conditions without physical manifestation",
                "Experimental stem cell and hormone therapies"
            ],
            "room_rent_cap": "Single Private AC Room up to INR 15,000/day.",
            "copay_percentage": "0% for age < 61; 20% for age 61+.",
            "notes": ["Unlimited automatic recharge of INR 25 Lakhs sum insured."]
        },
        "facts": care_facts,
        "uploaded_at": datetime.utcnow() - timedelta(days=2),
        "indexed_at": datetime.utcnow() - timedelta(days=2),
        "updated_at": datetime.utcnow()
    }

    # ICICI Lombard Facts
    icici_facts = [
        {
            "fact_id": str(uuid.uuid4()),
            "category": "sum_insured",
            "fact_key": "base_sum_insured",
            "fact_value": "INR 5,00,000",
            "fact_value_numeric": 500000.0,
            "unit": "INR",
            "source_page": 1,
            "source_section": "Schedule of Insurance Policy",
            "extraction_confidence": "high"
        },
        {
            "fact_id": str(uuid.uuid4()),
            "category": "room_rent_limit",
            "fact_key": "room_rent_cap_per_day",
            "fact_value": "Twin Sharing AC Room or 1% of Sum Insured per day (INR 5,000/day)",
            "fact_value_numeric": 5000.0,
            "unit": "INR/day",
            "source_page": 2,
            "source_section": "Section 1: Room Rent & ICU Terms",
            "extraction_confidence": "high"
        },
        {
            "fact_id": str(uuid.uuid4()),
            "category": "sub_limit",
            "fact_key": "cataract_procedure_cap",
            "fact_value": "INR 40,000 per eye procedure cap",
            "fact_value_numeric": 40000.0,
            "unit": "INR",
            "source_page": 3,
            "source_section": "Section 3.1: Sub-Limits & Exclusions",
            "extraction_confidence": "high"
        },
        {
            "fact_id": str(uuid.uuid4()),
            "category": "co_payment",
            "fact_key": "co_payment_clause",
            "fact_value": "20% co-payment for treatment in non-preferred Zone 1 network hospitals",
            "fact_value_numeric": 20.0,
            "unit": "%",
            "source_page": 3,
            "source_section": "Section 2.1: Co-Payment Clause",
            "extraction_confidence": "high"
        },
        {
            "fact_id": str(uuid.uuid4()),
            "category": "waiting_period",
            "fact_key": "pre_existing_disease_waiting_period",
            "fact_value": "48 months waiting period for Pre-Existing Conditions",
            "fact_value_numeric": 48.0,
            "unit": "months",
            "source_page": 3,
            "source_section": "Section 2.2: Waiting Periods",
            "extraction_confidence": "high"
        }
    ]

    icici_policy = {
        "_id": icici_policy_id,
        "user_id": str(user_id),
        "file_name": "ICICI_Lombard_Complete_Health.pdf",
        "file_path": "uploads/policies/demo_icici_lombard.pdf",
        "file_size_bytes": 1950000,
        "insurer_name": "ICICI Lombard General Insurance",
        "policy_type": "family_floater",
        "policy_number": "IL-CHI-2024-77412",
        "sum_insured": 500000.0,
        "premium_amount": 9800.0,
        "status": "ready",
        "ocr_used": False,
        "red_flag_summary": {
            "waiting_periods": [
                "48 months PED waiting period",
                "24 months specific elective procedures",
                "30 days initial waiting period"
            ],
            "major_exclusions": [
                "Dental outpatient procedures",
                "Aesthetic and cosmetic surgery",
                "Experimental therapies"
            ],
            "room_rent_cap": "Twin Sharing AC Room or 1% of Sum Insured (INR 5,000/day). Proportionate deduction applies if exceeded.",
            "copay_percentage": "20% co-payment for non-preferred Zone 1 hospitals.",
            "notes": ["Cumulative bonus 10% per claim-free year up to max 50%."]
        },
        "facts": icici_facts,
        "uploaded_at": datetime.utcnow() - timedelta(days=1),
        "indexed_at": datetime.utcnow() - timedelta(days=1),
        "updated_at": datetime.utcnow()
    }

    # Clone two policies for secondary user Rohan Somani
    rohan_star_id = ObjectId()
    rohan_hdfc_id = ObjectId()
    rohan_star = dict(star_policy, _id=rohan_star_id, user_id=str(rohan_user_id))
    rohan_hdfc = dict(hdfc_policy, _id=rohan_hdfc_id, user_id=str(rohan_user_id))

    all_policies = [star_policy, hdfc_policy, care_policy, icici_policy, rohan_star, rohan_hdfc]
    db.policies.insert_many(all_policies)
    print(f"[Seeder] Created {len(all_policies)} Policies across users (Star, HDFC ERGO, Care Health, ICICI Lombard)")

    # ── 3. Create Policy Chunks & Vectors ─────────────────────────────────────
    raw_chunks = [
        # Star Health Chunks
        {
            "policy_id": star_policy_id,
            "user_id": user_id,
            "chunk_index": 0,
            "chunk_text": "Schedule of Benefits: Insured person Dr. Arjun Verma, Policy No SH-IND-2024-89214. Base Sum Insured is INR 10,00,000. Annual premium is INR 14,500. Cashless treatment is valid across 14,000+ approved partner hospitals.",
            "page_number": 1,
            "section_heading": "Schedule of Benefits & Coverage",
            "token_count": 45,
            "vector_id": str(uuid.uuid4()),
        },
        {
            "policy_id": star_policy_id,
            "user_id": user_id,
            "chunk_index": 1,
            "chunk_text": "Section 1: Inpatient Hospitalization Room Rent Cap is strictly set at Single Private AC Room or 1% of Sum Insured per day (INR 10,000/day). ICU charges are capped at 2% of Sum Insured per day (INR 20,000/day). Proportionate deduction applies to all associate doctor and procedure charges if a higher room category is chosen.",
            "page_number": 2,
            "section_heading": "Section 1: Inpatient Hospitalization & Room Rent Limits",
            "token_count": 58,
            "vector_id": str(uuid.uuid4()),
        },
        {
            "policy_id": star_policy_id,
            "user_id": user_id,
            "chunk_index": 2,
            "chunk_text": "Section 2: Co-payment terms. In network hospitals, 0% co-payment applies. For non-network metro hospitals, a mandatory 10% co-payment is deducted from the final admitted claim amount. Cashless pre-authorization must be submitted at least 48 hours prior to planned hospital admission.",
            "page_number": 3,
            "section_heading": "Section 2: Co-Payment Terms & Network Tiers",
            "token_count": 48,
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
    print(" Email:    demo@insurai.com")
    print(" Password: password123")
    print("=============================================\n")


if __name__ == "__main__":
    seed_data()
