import uuid
from datetime import datetime, timedelta
from bson import ObjectId

try:
    from db import get_sync_db, get_vector_collection
    from services.auth_service import hash_password
except ImportError:
    from server.db import get_sync_db, get_vector_collection
    from server.services.auth_service import hash_password

def seed_data():
    print("[Python Seeder] Connecting to database...")
    db = get_sync_db()
    vector_coll = get_vector_collection()

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
            "fact_key": "base_sum_insured",
            "fact_value": "INR 10,00,000",
            "fact_value_numeric": 1000000.0,
            "unit": "INR",
            "source_page": 2,
            "source_section": "Section 1 - Schedule of Benefits",
            "extraction_confidence": "high"
        },
        {
            "fact_id": str(uuid.uuid4()),
            "category": "room_rent_limit",
            "fact_key": "room_rent_cap_per_day",
            "fact_value": "Single Private A/C Room or max 1% of Sum Insured per day (INR 10,000/day)",
            "fact_value_numeric": 10000.0,
            "unit": "INR/day",
            "source_page": 4,
            "source_section": "Section 3.1 - Inpatient Hospitalization Room Limits",
            "extraction_confidence": "high"
        },
        {
            "fact_id": str(uuid.uuid4()),
            "category": "sub_limit",
            "fact_key": "icu_charges_limit",
            "fact_value": "Up to 2% of Sum Insured per day (INR 20,000/day)",
            "fact_value_numeric": 20000.0,
            "unit": "INR/day",
            "source_page": 4,
            "source_section": "Section 3.2 - Intensive Care Unit Charges",
            "extraction_confidence": "high"
        },
        {
            "fact_id": str(uuid.uuid4()),
            "category": "co_payment",
            "fact_key": "co_payment_clause",
            "fact_value": "10% co-payment for non-network metro hospitals; 0% in network facilities",
            "fact_value_numeric": 10.0,
            "unit": "%",
            "source_page": 7,
            "source_section": "Section 5.4 - Co-Payment Terms",
            "extraction_confidence": "high"
        },
        {
            "fact_id": str(uuid.uuid4()),
            "category": "waiting_period",
            "fact_key": "pre_existing_disease_waiting_period",
            "fact_value": "36 months from policy inception date",
            "fact_value_numeric": 36.0,
            "unit": "months",
            "source_page": 8,
            "source_section": "Section 6.1 - Pre-Existing Diseases",
            "extraction_confidence": "high"
        },
        {
            "fact_id": str(uuid.uuid4()),
            "category": "waiting_period",
            "fact_key": "initial_waiting_period",
            "fact_value": "30 days from policy inception (accidents exempted)",
            "fact_value_numeric": 30.0,
            "unit": "days",
            "source_page": 8,
            "source_section": "Section 6.2 - Initial Waiting Period",
            "extraction_confidence": "high"
        },
        {
            "fact_id": str(uuid.uuid4()),
            "category": "exclusion",
            "fact_key": "cosmetic_and_obesity_treatments",
            "fact_value": "Aesthetic, cosmetic, obesity, and experimental procedures are permanently excluded",
            "fact_value_numeric": None,
            "unit": None,
            "source_page": 11,
            "source_section": "Section 7.1 - Permanent Exclusions",
            "extraction_confidence": "high"
        }
    ]

    star_policy = {
        "_id": star_policy_id,
        "user_id": str(user_id),
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
                "24 months specific ailment waiting period (Cataract, Hernia, Joint replacement)",
                "30 days initial waiting period"
            ],
            "major_exclusions": [
                "Cosmetic & plastic surgery",
                "Weight management & bariatric surgeries",
                "External congenital diseases & genetic disorders",
                "Non-medical hospital consumables (PPE kits, gloves, sanitizers)"
            ],
            "room_rent_cap": "1% of Sum Insured (INR 10,000/day). Proportionate deduction applies if breached.",
            "copay_percentage": "10% co-payment applicable in non-network metro hospitals.",
            "notes": ["Automatic restoration of 100% sum insured upon full exhaustion."]
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
            "fact_key": "base_sum_insured",
            "fact_value": "INR 15,00,000 + 100% Secure Benefit",
            "fact_value_numeric": 1500000.0,
            "unit": "INR",
            "source_page": 1,
            "source_section": "Benefits Overview",
            "extraction_confidence": "high"
        },
        {
            "fact_id": str(uuid.uuid4()),
            "category": "room_rent_limit",
            "fact_key": "room_rent_cap_per_day",
            "fact_value": "No Room Rent Capping (Any room up to Suite allowed)",
            "fact_value_numeric": None,
            "unit": None,
            "source_page": 3,
            "source_section": "Room Rent Clause",
            "extraction_confidence": "high"
        },
        {
            "fact_id": str(uuid.uuid4()),
            "category": "co_payment",
            "fact_key": "co_payment_clause",
            "fact_value": "Zero Co-payment across all tiers and hospital networks",
            "fact_value_numeric": 0.0,
            "unit": "%",
            "source_page": 5,
            "source_section": "Co-Payment Terms",
            "extraction_confidence": "high"
        },
        {
            "fact_id": str(uuid.uuid4()),
            "category": "waiting_period",
            "fact_key": "pre_existing_disease_waiting_period",
            "fact_value": "24 months waiting period for Pre-Existing Diseases",
            "fact_value_numeric": 24.0,
            "unit": "months",
            "source_page": 7,
            "source_section": "Waiting Period Clauses",
            "extraction_confidence": "high"
        }
    ]

    hdfc_policy = {
        "_id": hdfc_policy_id,
        "user_id": str(user_id),
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
                "24 months waiting period for Pre-Existing Diseases (PED)",
                "24 months for named specific procedures",
                "30 days initial waiting period"
            ],
            "major_exclusions": [
                "Dental care unless required due to traumatic accidental injury",
                "Rest cures, convalescence, rehabilitation and general debility",
                "Vitamins and tonics without direct therapeutic medical necessity"
            ],
            "room_rent_cap": "No Room Rent Capping. Zero proportionate deduction risk.",
            "copay_percentage": "0% co-payment (Cashless everywhere).",
            "notes": ["2X protection doubles sum insured from Day 1."]
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
            "policy_id": str(star_policy_id),
            "user_id": str(user_id),
            "chunk_index": 0,
            "chunk_text": "Section 1: The insured is entitled to hospital room boarding, nursing, doctor consultation fees up to Sum Insured INR 10,00,000 for all medically necessary inpatient treatments.",
            "page_number": 2,
            "section_heading": "Section 1 - Schedule of Benefits",
            "token_count": 35,
            "vector_id": str(uuid.uuid4()),
            "insurer_name": star_policy["insurer_name"],
            "policy_type": star_policy["policy_type"]
        },
        {
            "policy_id": str(star_policy_id),
            "user_id": str(user_id),
            "chunk_index": 1,
            "chunk_text": "Section 3: Room rent cap is strictly set at Single Private AC Room or 1% of Sum Insured per day. ICU charges are capped at 2% of Sum Insured per day. Proportionate deductions apply if a higher room category is occupied.",
            "page_number": 4,
            "section_heading": "Section 3 - Room Rent & ICU Caps",
            "token_count": 42,
            "vector_id": str(uuid.uuid4()),
            "insurer_name": star_policy["insurer_name"],
            "policy_type": star_policy["policy_type"]
        },
        {
            "policy_id": str(star_policy_id),
            "user_id": str(user_id),
            "chunk_index": 2,
            "chunk_text": "Section 5: A 10% co-payment is mandatory for claims processed at Tier 1 non-network hospitals. In network hospitals, no co-payment applies. Cashless claims must be intimating 48 hours prior to planned admission.",
            "page_number": 7,
            "section_heading": "Section 5 - Co-Payment Terms",
            "token_count": 38,
            "vector_id": str(uuid.uuid4()),
            "insurer_name": star_policy["insurer_name"],
            "policy_type": star_policy["policy_type"]
        }
    ]

    db.policy_chunks.insert_many(raw_chunks)
    vector_coll.add(
        ids=[c["vector_id"] for c in raw_chunks],
        documents=[c["chunk_text"] for c in raw_chunks],
        metadatas=[{
            "user_id": c["user_id"],
            "policy_id": c["policy_id"],
            "chunk_index": c["chunk_index"],
            "page_number": c["page_number"],
            "section_heading": c["section_heading"],
            "insurer_name": c["insurer_name"],
            "policy_type": c["policy_type"]
        } for c in raw_chunks]
    )
    print(f"[Python Seeder] Created {len(raw_chunks)} policy chunks in MongoDB and Vector Store")

    conv_id = ObjectId()
    conv_doc = {
        "_id": conv_id,
        "user_id": str(user_id),
        "policy_id": str(star_policy_id),
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
                "content": "Your Room Rent Limit is: Single Private A/C Room or max 1% of Sum Insured per day (INR 10,00,000 policy = INR 10,000/day).\nCo-payment: 10% co-payment applies in non-network metro hospitals.",
                "query_type": "structured",
                "plain_language": "You are allowed a standard private A/C room up to ₹10,000 per day. If you choose a more expensive room, you will pay extra out of your own pocket. Also, you pay 10% of the bill at non-network hospitals.",
                "confidence_level": "high",
                "verification_passed": True,
                "verification_notes": "Verified against authoritative extracted policy facts table.",
                "citations": [
                    {
                        "policy_id": str(star_policy_id),
                        "chunk_vector_id": raw_chunks[1]["vector_id"],
                        "page_number": 4,
                        "section_heading": "Section 3.1 - Room Rent Limits"
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
        "user_id": str(user_id),
        "policy_id": str(star_policy_id),
        "treatment_name": "Knee Replacement",
        "hospital_tier": "tier_1",
        "estimated_total_cost": 350000.0,
        "covered_amount": 284000.0,
        "out_of_pocket_amount": 66000.0,
        "cost_breakdown": {
            "base_hospital_charges": 350000.0,
            "room_rent_applied": 48000.0,
            "room_rent_cap_per_day": 10000.0,
            "room_rent_copay_penalty": 14000.0,
            "deductible_deducted": 0.0,
            "copay_percentage": 10.0,
            "copay_amount": 27500.0,
            "sub_limit_caps_applied": [],
            "excluded_items_cost": 24500.0,
            "final_payable_by_insurer": 284000.0,
            "final_payable_by_user": 66000.0
        },
        "what_if_variants": [
            {
                "variant_id": str(uuid.uuid4()),
                "changed_variable": "hospital_tier",
                "original_value": "tier_1",
                "new_value": "tier_2",
                "recalculated_total_cost": 250000.0,
                "recalculated_covered_amount": 232500.0,
                "recalculated_out_of_pocket": 17500.0,
                "cost_breakdown": {
                    "base_hospital_charges": 250000.0,
                    "room_rent_applied": 32000.0,
                    "room_rent_cap_per_day": 10000.0,
                    "room_rent_copay_penalty": 0.0,
                    "deductible_deducted": 0.0,
                    "copay_percentage": 0.0,
                    "copay_amount": 0.0,
                    "sub_limit_caps_applied": [],
                    "excluded_items_cost": 17500.0,
                    "final_payable_by_insurer": 232500.0,
                    "final_payable_by_user": 17500.0
                },
                "created_at": datetime.utcnow()
            }
        ],
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
