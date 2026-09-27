import os
import uuid
from datetime import datetime, timedelta
from bson import ObjectId

try:
    from db import get_sync_db, get_vector_collection, ensure_sync_indexes
    from services.auth_service import hash_password
    from config import settings
except ImportError:
    from server.db import get_sync_db, get_vector_collection, ensure_sync_indexes
    from server.services.auth_service import hash_password
    from server.config import settings

def generate_sample_pdfs():
    """Generates authentic sample PDF files on disk for demo policies."""
    upload_dir = getattr(settings, "UPLOAD_DIR", "uploads/policies")
    os.makedirs(upload_dir, exist_ok=True)

    try:
        import fitz  # pymupdf
    except ImportError:
        try:
            import pymupdf as fitz
        except ImportError:
            print("[PDF Generator] PyMuPDF not installed, skipping PDF generation")
            return

    policies_info = [
        {
            "filename": "demo_star_health.pdf",
            "title": "Star Health & Allied Insurance — Premier Health Gain Policy",
            "sections": [
                ("Schedule of Benefits & Coverage", [
                    "Insured Person: Dr. Arjun Verma",
                    "Policy Number: SH-IND-2024-89214 | Policy Period: 01-Jan-2025 to 31-Dec-2025",
                    "Base Sum Insured: INR 10,00,000 (Ten Lakhs)",
                    "Annual Premium: INR 14,500 | Plan Type: Individual Comprehensive Health",
                    "Network Hospitals: 14,000+ Cashless Facilities Across India"
                ]),
                ("Section 1: Inpatient Hospitalization & Room Rent Limits", [
                    "1.1 Room Rent Cap: Single Private A/C Room or maximum 1% of Sum Insured per day (INR 10,000/day).",
                    "1.2 Intensive Care Unit (ICU): Capped at 2% of Sum Insured per day (INR 20,000/day).",
                    "1.3 Proportionate Deduction Clause: If the insured occupies a room category higher than Single Private AC,",
                    "    all associated medical expenses (surgeon fees, nursing, investigation charges) will be proportionately deducted."
                ]),
                ("Section 2: Co-Payment Terms & Network Tiers", [
                    "2.1 Network Hospitals: 0% co-payment for all treatments in approved cashless network.",
                    "2.2 Non-Network Metro Hospitals: Mandatory 10% co-payment applies on final admitted claim amount.",
                    "2.3 Cashless Intimation: Must be intimated at least 48 hours prior to planned admission."
                ]),
                ("Section 3: Waiting Periods & Specific Conditions", [
                    "3.1 Initial Waiting Period: 30 days from inception date (emergency accidental injuries covered from Day 1).",
                    "3.2 Pre-Existing Diseases (PED): 36 months of continuous coverage required before PED claims are payable.",
                    "3.3 Specific Illness Waiting Period: 24 months for Cataract, Hernia, Hysterectomy, and Joint Replacements."
                ]),
                ("Section 4: Permanent Exclusions", [
                    "4.1 Aesthetic, plastic, and cosmetic surgery unless medically indicated due to accidental injury.",
                    "4.2 Obesity management, bariatric treatments, and dietary weight-reduction regimens.",
                    "4.3 Non-medical consumables including PPE kits, sanitizers, gloves, and administrative documentation charges."
                ])
            ]
        },
        {
            "filename": "demo_hdfc_ergo.pdf",
            "title": "HDFC ERGO General Insurance — Optima Secure Health Policy",
            "sections": [
                ("Schedule of Insurance & 2X Secure Benefit", [
                    "Policyholder: Dr. Arjun Verma | Family Floater Policy (2 Adults + 1 Child)",
                    "Policy Number: HE-OPT-2024-55092 | Plan: Optima Secure Gold",
                    "Base Sum Insured: INR 15,00,000 (Fifteen Lakhs)",
                    "Secure Benefit: 100% additional sum insured available from Day 1 (Effective INR 30,00,000)",
                    "Annual Premium: INR 22,800 | Cashless Network: 12,000+ accredited hospitals"
                ]),
                ("Section 1: Room Rent & Boarding Privileges", [
                    "1.1 Room Rent Capping: NO ROOM RENT CAP. The insured may select any room category up to a Suite.",
                    "1.2 Zero Proportionate Deduction: Because there is no room rent capping, no proportionate deduction applies.",
                    "1.3 ICU Charges: Actual expenses covered up to the full effective Sum Insured."
                ]),
                ("Section 2: Co-Payment Clause", [
                    "2.1 Zero Co-Payment: 0% co-payment applies across all hospital tiers, network, and non-network providers.",
                    "2.2 No Zone-based co-pay or age-based co-payment restrictions."
                ]),
                ("Section 3: Waiting Periods", [
                    "3.1 Initial Waiting Period: 30 days from policy inception (accidents exempted).",
                    "3.2 Pre-Existing Diseases (PED): 24 months continuous coverage waiting period.",
                    "3.3 Listed Specific Ailments: 24 months waiting period for specified elective surgical procedures."
                ]),
                ("Section 4: Additional Coverage & Exclusions", [
                    "4.1 Day Care Procedures: 586+ listed medical daycare treatments covered up to full Sum Insured.",
                    "4.2 Pre-Hospitalization: 60 days | Post-Hospitalization: 180 days.",
                    "4.3 Permanent Exclusions: Traumatic dental surgery unless hospitalized; experimental stem cell treatments."
                ])
            ]
        },
        {
            "filename": "demo_care_health.pdf",
            "title": "Care Health Insurance — Care Advantage High Sum Insured",
            "sections": [
                ("Schedule of Benefits & Coverage", [
                    "Insured Person: Dr. Arjun Verma",
                    "Policy Number: CARE-ADV-2024-31908 | High Sum Insured Advantage",
                    "Base Sum Insured: INR 25,00,000 (Twenty-Five Lakhs)",
                    "Annual Premium: INR 31,200 | Cashless Network: 19,000+ Healthcare Providers"
                ]),
                ("Section 1: Hospitalization & Room Eligibility", [
                    "1.1 Single Private AC Room: Allowed up to INR 15,000 per day.",
                    "1.2 Intensive Care Unit: Covered up to total Sum Insured with no daily room cap.",
                    "1.3 Unlimited Automatic Recharge: Sum insured restores automatically upon complete exhaustion."
                ]),
                ("Section 2: Co-payment & Age Limits", [
                    "2.1 For Insured aged up to 60 years: 0% co-payment.",
                    "2.2 For Insured aged 61 years and above: 20% co-payment applies to all eligible claims."
                ]),
                ("Section 3: Waiting Periods & Exclusions", [
                    "3.1 Pre-Existing Disease (PED) Waiting Period: 36 months from inception.",
                    "3.2 Specific Illnesses: 24 months waiting period for cataract, joint replacement, and kidney stones.",
                    "3.3 Major Exclusions: Fertility treatments, psychiatric conditions, and self-inflicted injuries."
                ])
            ]
        },
        {
            "filename": "demo_icici_lombard.pdf",
            "title": "ICICI Lombard General Insurance — Complete Health Insurance Shield",
            "sections": [
                ("Schedule of Insurance Policy", [
                    "Policyholder: Dr. Arjun Verma | Complete Health Shield Plan",
                    "Policy Number: IL-CHI-2024-77412 | Sum Insured: INR 5,00,000",
                    "Annual Premium: INR 9,800 | Cashless Network: 8,500+ Partner Hospitals"
                ]),
                ("Section 1: Room Rent & ICU Terms", [
                    "1.1 Room Rent Cap: Twin Sharing AC Room or 1% of Sum Insured per day (INR 5,000/day).",
                    "1.2 ICU Limit: 2% of Sum Insured per day (INR 10,000/day).",
                    "1.3 Proportionate deduction applies if upgraded to Single AC or higher room categories."
                ]),
                ("Section 2: Co-payment & Waiting Periods", [
                    "2.1 Co-Payment: 20% mandatory co-payment for treatments in non-preferred Zone 1 network hospitals.",
                    "2.2 Pre-Existing Diseases (PED): 48 months waiting period.",
                    "2.3 Initial Waiting Period: 30 days."
                ]),
                ("Section 3: Sub-Limits & Exclusions", [
                    "3.1 Cataract Procedure Sub-limit: Maximum INR 40,000 per eye.",
                    "3.2 Cumulative Bonus: 10% increase in sum insured for every claim-free year up to 50%.",
                    "3.3 Exclusions: Dental outpatient procedures, aesthetic surgery, cosmetic implants."
                ])
            ]
        }
    ]

    for p in policies_info:
        file_path = os.path.join(upload_dir, p["filename"])
        doc = fitz.open()
        for sec_title, lines in p["sections"]:
            page = doc.new_page()
            # Title
            page.insert_text((50, 45), p["title"], fontsize=14, fontname="helv")
            # Section Header
            page.insert_text((50, 75), sec_title, fontsize=12, fontname="helv")
            # Body Lines
            y = 105
            for line in lines:
                page.insert_text((50, y), line, fontsize=9.5, fontname="helv")
                y += 18
        doc.save(file_path)
        print(f"[PDF Generator] Generated realistic policy document: {file_path}")

def seed_data():
    print("\n" + "="*50)
    print(" INSURAI / MEDSHIELD DATABASE SEEDER (MONGODB ATLAS) ")
    print("="*50)

    print("\n[Seeder] Connecting to MongoDB Atlas...")
    db = get_sync_db()
    vector_coll = get_vector_collection()

    print("[Seeder] Ensuring database indexes on all collections...")
    ensure_sync_indexes(db)

    print("[Seeder] Generating sample policy PDF documents on disk...")
    generate_sample_pdfs()

    print("[Seeder] Clearing previous demo data from MongoDB collections...")
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
            "email": "demo@medshield.ai",
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
    print(f"[Seeder] Created {len(users_docs)} Users: demo@medshield.ai, rohan@insurai.com, priya.sharma@example.com")

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
            "fact_key": "base_sum_insured",
            "fact_value": "INR 10,00,000",
            "fact_value_numeric": 1000000.0,
            "unit": "INR",
            "source_page": 1,
            "source_section": "Schedule of Benefits & Coverage",
            "extraction_confidence": "high"
        },
        {
            "fact_id": str(uuid.uuid4()),
            "category": "room_rent_limit",
            "fact_key": "room_rent_cap_per_day",
            "fact_value": "Single Private A/C Room or max 1% of Sum Insured per day (INR 10,000/day)",
            "fact_value_numeric": 10000.0,
            "unit": "INR/day",
            "source_page": 2,
            "source_section": "Section 1: Inpatient Hospitalization & Room Rent Limits",
            "extraction_confidence": "high"
        },
        {
            "fact_id": str(uuid.uuid4()),
            "category": "sub_limit",
            "fact_key": "icu_charges_limit",
            "fact_value": "Up to 2% of Sum Insured per day (INR 20,000/day)",
            "fact_value_numeric": 20000.0,
            "unit": "INR/day",
            "source_page": 2,
            "source_section": "Section 1.2: Intensive Care Unit",
            "extraction_confidence": "high"
        },
        {
            "fact_id": str(uuid.uuid4()),
            "category": "co_payment",
            "fact_key": "co_payment_clause",
            "fact_value": "10% co-payment for non-network metro hospitals; 0% in network facilities",
            "fact_value_numeric": 10.0,
            "unit": "%",
            "source_page": 3,
            "source_section": "Section 2: Co-Payment Terms & Network Tiers",
            "extraction_confidence": "high"
        },
        {
            "fact_id": str(uuid.uuid4()),
            "category": "waiting_period",
            "fact_key": "pre_existing_disease_waiting_period",
            "fact_value": "36 months from policy inception date",
            "fact_value_numeric": 36.0,
            "unit": "months",
            "source_page": 4,
            "source_section": "Section 3.2: Pre-Existing Diseases",
            "extraction_confidence": "high"
        },
        {
            "fact_id": str(uuid.uuid4()),
            "category": "waiting_period",
            "fact_key": "initial_waiting_period",
            "fact_value": "30 days from policy inception (accidents exempted)",
            "fact_value_numeric": 30.0,
            "unit": "days",
            "source_page": 4,
            "source_section": "Section 3.1: Initial Waiting Period",
            "extraction_confidence": "high"
        },
        {
            "fact_id": str(uuid.uuid4()),
            "category": "waiting_period",
            "fact_key": "specific_ailment_waiting_period",
            "fact_value": "24 months for named conditions: Cataract, Hernia, Joint Replacements",
            "fact_value_numeric": 24.0,
            "unit": "months",
            "source_page": 4,
            "source_section": "Section 3.3: Specific Illness Waiting Period",
            "extraction_confidence": "high"
        },
        {
            "fact_id": str(uuid.uuid4()),
            "category": "exclusion",
            "fact_key": "cosmetic_and_obesity_treatments",
            "fact_value": "Aesthetic, cosmetic, obesity, and experimental procedures are permanently excluded",
            "fact_value_numeric": None,
            "unit": None,
            "source_page": 5,
            "source_section": "Section 4: Permanent Exclusions",
            "extraction_confidence": "high"
        },
        {
            "fact_id": str(uuid.uuid4()),
            "category": "claim_condition",
            "fact_key": "restoration_benefit",
            "fact_value": "100% automatic restoration of base Sum Insured upon complete exhaustion",
            "fact_value_numeric": 1000000.0,
            "unit": "INR",
            "source_page": 1,
            "source_section": "Schedule of Benefits & Coverage",
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
                "30 days initial waiting period (accidents exempted from Day 1)"
            ],
            "major_exclusions": [
                "Cosmetic & plastic surgery unless medically indicated by accident",
                "Weight management & bariatric surgeries",
                "Non-medical hospital consumables (PPE kits, gloves, sanitizers, administrative files)"
            ],
            "room_rent_cap": "Single Private AC Room or 1% of Sum Insured (INR 10,000/day). Proportionate deduction applies if breached.",
            "copay_percentage": "10% co-payment applicable in non-network metro hospitals.",
            "notes": ["Automatic restoration of 100% sum insured upon full exhaustion."]
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
            "fact_key": "base_sum_insured",
            "fact_value": "INR 15,00,000 + 100% Secure Benefit (Total INR 30,00,000)",
            "fact_value_numeric": 1500000.0,
            "unit": "INR",
            "source_page": 1,
            "source_section": "Schedule of Insurance & 2X Secure Benefit",
            "extraction_confidence": "high"
        },
        {
            "fact_id": str(uuid.uuid4()),
            "category": "room_rent_limit",
            "fact_key": "room_rent_cap_per_day",
            "fact_value": "No Room Rent Capping (Any room up to Suite allowed, Zero proportionate deduction)",
            "fact_value_numeric": None,
            "unit": None,
            "source_page": 2,
            "source_section": "Section 1: Room Rent & Boarding Privileges",
            "extraction_confidence": "high"
        },
        {
            "fact_id": str(uuid.uuid4()),
            "category": "co_payment",
            "fact_key": "co_payment_clause",
            "fact_value": "Zero Co-payment across all tiers and network/non-network hospitals",
            "fact_value_numeric": 0.0,
            "unit": "%",
            "source_page": 3,
            "source_section": "Section 2: Co-Payment Clause",
            "extraction_confidence": "high"
        },
        {
            "fact_id": str(uuid.uuid4()),
            "category": "waiting_period",
            "fact_key": "pre_existing_disease_waiting_period",
            "fact_value": "24 months waiting period for Pre-Existing Diseases",
            "fact_value_numeric": 24.0,
            "unit": "months",
            "source_page": 4,
            "source_section": "Section 3: Waiting Periods",
            "extraction_confidence": "high"
        },
        {
            "fact_id": str(uuid.uuid4()),
            "category": "waiting_period",
            "fact_key": "initial_waiting_period",
            "fact_value": "30 days initial waiting period",
            "fact_value_numeric": 30.0,
            "unit": "days",
            "source_page": 4,
            "source_section": "Section 3.1: Initial Waiting Period",
            "extraction_confidence": "high"
        },
        {
            "fact_id": str(uuid.uuid4()),
            "category": "sub_limit",
            "fact_key": "day_care_procedures",
            "fact_value": "586+ listed daycare procedures covered up to full Sum Insured",
            "fact_value_numeric": None,
            "unit": None,
            "source_page": 5,
            "source_section": "Section 4: Additional Coverage & Exclusions",
            "extraction_confidence": "high"
        },
        {
            "fact_id": str(uuid.uuid4()),
            "category": "coverage_category",
            "fact_key": "pre_post_hospitalization",
            "fact_value": "60 days Pre-Hospitalization and 180 days Post-Hospitalization covered",
            "fact_value_numeric": 180.0,
            "unit": "days",
            "source_page": 5,
            "source_section": "Section 4.2: Pre and Post Hospitalization",
            "extraction_confidence": "high"
        },
        {
            "fact_id": str(uuid.uuid4()),
            "category": "exclusion",
            "fact_key": "general_exclusions",
            "fact_value": "Dental care unless accidental trauma; experimental treatments and rest cures",
            "fact_value_numeric": None,
            "unit": None,
            "source_page": 5,
            "source_section": "Section 4.3: Permanent Exclusions",
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
            "copay_percentage": "0% co-payment (Cashless everywhere across all hospital networks).",
            "notes": ["2X Secure Protection doubles effective sum insured to INR 30 Lakhs from Day 1."]
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
            "policy_id": str(star_policy_id),
            "user_id": str(user_id),
            "chunk_index": 0,
            "chunk_text": "Schedule of Benefits: Insured person Dr. Arjun Verma, Policy No SH-IND-2024-89214. Base Sum Insured is INR 10,00,000. Annual premium is INR 14,500. Cashless treatment is valid across 14,000+ approved partner hospitals.",
            "page_number": 1,
            "section_heading": "Schedule of Benefits & Coverage",
            "token_count": 45,
            "vector_id": str(uuid.uuid4()),
            "insurer_name": star_policy["insurer_name"],
            "policy_type": star_policy["policy_type"]
        },
        {
            "policy_id": str(star_policy_id),
            "user_id": str(user_id),
            "chunk_index": 1,
            "chunk_text": "Section 1: Inpatient Hospitalization Room Rent Cap is strictly set at Single Private AC Room or 1% of Sum Insured per day (INR 10,000/day). ICU charges are capped at 2% of Sum Insured per day (INR 20,000/day). Proportionate deduction applies to all associate doctor and procedure charges if a higher room category is chosen.",
            "page_number": 2,
            "section_heading": "Section 1: Inpatient Hospitalization & Room Rent Limits",
            "token_count": 58,
            "vector_id": str(uuid.uuid4()),
            "insurer_name": star_policy["insurer_name"],
            "policy_type": star_policy["policy_type"]
        },
        {
            "policy_id": str(star_policy_id),
            "user_id": str(user_id),
            "chunk_index": 2,
            "chunk_text": "Section 2: Co-payment terms. In network hospitals, 0% co-payment applies. For non-network metro hospitals, a mandatory 10% co-payment is deducted from the final admitted claim amount. Cashless pre-authorization must be submitted at least 48 hours prior to planned hospital admission.",
            "page_number": 3,
            "section_heading": "Section 2: Co-Payment Terms & Network Tiers",
            "token_count": 48,
            "vector_id": str(uuid.uuid4()),
            "insurer_name": star_policy["insurer_name"],
            "policy_type": star_policy["policy_type"]
        },
        {
            "policy_id": str(star_policy_id),
            "user_id": str(user_id),
            "chunk_index": 3,
            "chunk_text": "Section 3: Waiting Periods. Initial waiting period of 30 days from inception (emergency accidental injuries covered from Day 1). Pre-Existing Diseases (PED) require 36 months of continuous coverage before claims are admissible. Named specific ailments like Cataract, Hernia, and Joint Replacements carry a 24-month waiting period.",
            "page_number": 4,
            "section_heading": "Section 3: Waiting Periods & Specific Conditions",
            "token_count": 55,
            "vector_id": str(uuid.uuid4()),
            "insurer_name": star_policy["insurer_name"],
            "policy_type": star_policy["policy_type"]
        },
        # HDFC ERGO Chunks
        {
            "policy_id": str(hdfc_policy_id),
            "user_id": str(user_id),
            "chunk_index": 0,
            "chunk_text": "Schedule of Insurance: Optima Secure Gold Plan, Policy Number HE-OPT-2024-55092. Base Sum Insured INR 15,00,000. Under the 2X Secure Benefit, an additional 100% sum insured is automatically provided from Day 1 without extra premium, creating total effective coverage of INR 30,00,000.",
            "page_number": 1,
            "section_heading": "Schedule of Insurance & 2X Secure Benefit",
            "token_count": 52,
            "vector_id": str(uuid.uuid4()),
            "insurer_name": hdfc_policy["insurer_name"],
            "policy_type": hdfc_policy["policy_type"]
        },
        {
            "policy_id": str(hdfc_policy_id),
            "user_id": str(user_id),
            "chunk_index": 1,
            "chunk_text": "Section 1: Room Rent Privileges. There is NO ROOM RENT CAPPING under Optima Secure. The insured is free to occupy any room category up to a Suite room. As a consequence, proportionate deduction does not apply to any associated hospitalization or nursing fees.",
            "page_number": 2,
            "section_heading": "Section 1: Room Rent & Boarding Privileges",
            "token_count": 47,
            "vector_id": str(uuid.uuid4()),
            "insurer_name": hdfc_policy["insurer_name"],
            "policy_type": hdfc_policy["policy_type"]
        },
        {
            "policy_id": str(hdfc_policy_id),
            "user_id": str(user_id),
            "chunk_index": 2,
            "chunk_text": "Section 2: Co-payment terms. 0% co-payment across all tiers and hospital networks throughout India. No co-pay penalty for tier-1 non-network hospitals.",
            "page_number": 3,
            "section_heading": "Section 2: Co-Payment Clause",
            "token_count": 32,
            "vector_id": str(uuid.uuid4()),
            "insurer_name": hdfc_policy["insurer_name"],
            "policy_type": hdfc_policy["policy_type"]
        },
        {
            "policy_id": str(hdfc_policy_id),
            "user_id": str(user_id),
            "chunk_index": 3,
            "chunk_text": "Section 3: Waiting periods. Pre-existing disease waiting period is 24 months. Named specific conditions require 24 months. Initial waiting period is 30 days except for emergency accidental admissions.",
            "page_number": 4,
            "section_heading": "Section 3: Waiting Periods",
            "token_count": 36,
            "vector_id": str(uuid.uuid4()),
            "insurer_name": hdfc_policy["insurer_name"],
            "policy_type": hdfc_policy["policy_type"]
        },
        # Care Health Chunks
        {
            "policy_id": str(care_policy_id),
            "user_id": str(user_id),
            "chunk_index": 0,
            "chunk_text": "Care Advantage High Sum Insured: Policy Number CARE-ADV-2024-31908. Base Sum Insured INR 25,00,000. Inpatient hospitalization covers room charges up to Single Private AC Room (max INR 15,000/day). ICU charges covered up to full Sum Insured.",
            "page_number": 1,
            "section_heading": "Schedule of Benefits & Coverage",
            "token_count": 44,
            "vector_id": str(uuid.uuid4()),
            "insurer_name": care_policy["insurer_name"],
            "policy_type": care_policy["policy_type"]
        },
        {
            "policy_id": str(care_policy_id),
            "user_id": str(user_id),
            "chunk_index": 1,
            "chunk_text": "Section 2: Co-payment and Age Conditions. Insured individuals aged up to 60 years enjoy 0% co-payment. For insured persons aged 61 and above, a 20% co-payment applies on all eligible claim amounts. Unlimited automatic recharge restores the full sum insured once exhausted.",
            "page_number": 3,
            "section_heading": "Section 2: Co-payment & Age Limits",
            "token_count": 48,
            "vector_id": str(uuid.uuid4()),
            "insurer_name": care_policy["insurer_name"],
            "policy_type": care_policy["policy_type"]
        },
        # ICICI Lombard Chunks
        {
            "policy_id": str(icici_policy_id),
            "user_id": str(user_id),
            "chunk_index": 0,
            "chunk_text": "Complete Health Insurance Shield: Policy Number IL-CHI-2024-77412. Base Sum Insured INR 5,00,000. Room rent limit is Twin Sharing AC room or 1% of Sum Insured per day (INR 5,000/day). Cataract surgery is sub-limited to INR 40,000 per eye.",
            "page_number": 1,
            "section_heading": "Schedule of Insurance Policy",
            "token_count": 48,
            "vector_id": str(uuid.uuid4()),
            "insurer_name": icici_policy["insurer_name"],
            "policy_type": icici_policy["policy_type"]
        },
        {
            "policy_id": str(icici_policy_id),
            "user_id": str(user_id),
            "chunk_index": 1,
            "chunk_text": "Section 2: Co-payment and Waiting Periods. 20% co-payment applies for treatment received at non-preferred Zone 1 hospital providers. Pre-existing disease waiting period is 48 months from inception.",
            "page_number": 3,
            "section_heading": "Section 2.1: Co-Payment Clause",
            "token_count": 35,
            "vector_id": str(uuid.uuid4()),
            "insurer_name": icici_policy["insurer_name"],
            "policy_type": icici_policy["policy_type"]
        }
    ]

    db.policy_chunks.insert_many(raw_chunks)
    try:
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
        print(f"[Seeder] Created {len(raw_chunks)} policy chunks in MongoDB and ChromaDB Vector Store")
    except Exception as e:
        print(f"[Seeder] Note on vector store addition: {e}")

    # ── 4. Create Conversations & Messages with Citations ─────────────────────
    conv1_id = ObjectId()
    conv2_id = ObjectId()
    conv3_id = ObjectId()
    conv4_id = ObjectId()

    conversations = [
        {
            "_id": conv1_id,
            "user_id": str(user_id),
            "policy_id": str(star_policy_id),
            "title": "What is my room rent limit and co-payment?",
            "messages": [
                {
                    "message_id": str(uuid.uuid4()),
                    "role": "user",
                    "content": "What is my room rent limit and is there any co-payment under my Star Health policy?",
                    "query_type": None,
                    "plain_language": None,
                    "confidence_level": None,
                    "verification_passed": None,
                    "verification_notes": None,
                    "citations": [],
                    "created_at": datetime.utcnow() - timedelta(hours=5)
                },
                {
                    "message_id": str(uuid.uuid4()),
                    "role": "assistant",
                    "content": "Under your Star Health Premier Policy:\n\n1. **Room Rent Limit:** Capped at Single Private A/C Room or a maximum of 1% of Sum Insured per day (INR 10,000/day for your INR 10,00,000 policy). If you stay in a Deluxe or Suite room, proportionate deductions will apply to doctor and nursing charges.\n2. **Co-Payment:** 0% in network hospitals, but a mandatory 10% co-payment applies if you choose a non-network metro hospital.",
                    "query_type": "structured",
                    "plain_language": "You get a private AC room up to ₹10,000 per day. Going above this means you pay extra out of pocket for both room and doctor fees. Network hospital visits have zero co-pay, but non-network hospitals require you to pay 10% of the bill.",
                    "confidence_level": "high",
                    "verification_passed": True,
                    "verification_notes": "Cross-verified against authoritative extracted policy facts table and Section 1-2 clauses.",
                    "citations": [
                        {
                            "policy_id": str(star_policy_id),
                            "chunk_vector_id": raw_chunks[1]["vector_id"],
                            "page_number": 2,
                            "section_heading": "Section 1: Inpatient Hospitalization & Room Rent Limits"
                        },
                        {
                            "policy_id": str(star_policy_id),
                            "chunk_vector_id": raw_chunks[2]["vector_id"],
                            "page_number": 3,
                            "section_heading": "Section 2: Co-Payment Terms & Network Tiers"
                        }
                    ],
                    "created_at": datetime.utcnow() - timedelta(hours=4, minutes=58)
                }
            ],
            "created_at": datetime.utcnow() - timedelta(hours=5),
            "updated_at": datetime.utcnow() - timedelta(hours=4, minutes=58)
        },
        {
            "_id": conv2_id,
            "user_id": str(user_id),
            "policy_id": str(hdfc_policy_id),
            "title": "Is diabetes covered immediately under HDFC ERGO?",
            "messages": [
                {
                    "message_id": str(uuid.uuid4()),
                    "role": "user",
                    "content": "I have type 2 diabetes. Will my treatment be covered immediately under HDFC ERGO Optima Secure?",
                    "query_type": None,
                    "plain_language": None,
                    "confidence_level": None,
                    "verification_passed": None,
                    "verification_notes": None,
                    "citations": [],
                    "created_at": datetime.utcnow() - timedelta(hours=3)
                },
                {
                    "message_id": str(uuid.uuid4()),
                    "role": "assistant",
                    "content": "No, pre-existing conditions like diabetes are **not covered immediately**.\n\nAccording to Section 3 of your HDFC ERGO Optima Secure policy:\n- **Pre-Existing Disease (PED) Waiting Period:** 24 months (2 years) of continuous coverage must elapse before complications arising directly from pre-existing diabetes become eligible for claim settlement.\n- **Initial Waiting Period:** General illnesses also have a 30-day initial waiting period from policy inception (only emergency accidents are covered from Day 1).",
                    "query_type": "semantic",
                    "plain_language": "Diabetes is considered a pre-existing condition, so there is a 2-year waiting period before any diabetes-related claims will be approved. After 24 months of active policy tenure, all treatments are 100% covered.",
                    "confidence_level": "high",
                    "verification_passed": True,
                    "verification_notes": "Verified against PED clause (24 months) and Section 3 of policy terms.",
                    "citations": [
                        {
                            "policy_id": str(hdfc_policy_id),
                            "chunk_vector_id": raw_chunks[7]["vector_id"],
                            "page_number": 4,
                            "section_heading": "Section 3: Waiting Periods"
                        }
                    ],
                    "created_at": datetime.utcnow() - timedelta(hours=2, minutes=57)
                }
            ],
            "created_at": datetime.utcnow() - timedelta(hours=3),
            "updated_at": datetime.utcnow() - timedelta(hours=2, minutes=57)
        },
        {
            "_id": conv3_id,
            "user_id": str(user_id),
            "policy_id": str(star_policy_id),
            "title": "Coverage for planned knee replacement",
            "messages": [
                {
                    "message_id": str(uuid.uuid4()),
                    "role": "user",
                    "content": "How much will my Star Health policy cover for a planned knee replacement surgery costing around ₹3.5 Lakhs?",
                    "query_type": None,
                    "plain_language": None,
                    "confidence_level": None,
                    "verification_passed": None,
                    "verification_notes": None,
                    "citations": [],
                    "created_at": datetime.utcnow() - timedelta(hours=2)
                },
                {
                    "message_id": str(uuid.uuid4()),
                    "role": "assistant",
                    "content": "For a planned Knee Replacement (estimated at INR 3,50,000):\n\n1. **Ailment Waiting Period:** Joint replacements carry a **24-month waiting period**. If your policy has been active for over 2 years, the claim is eligible.\n2. **Room Rent:** Ensure your chosen room does not exceed INR 10,000/day (Single Private AC Room) to prevent proportionate deduction penalties on surgeon and implant costs.\n3. **Network Hospital:** At an in-network hospital, co-payment is 0%. If done at a non-network metro facility, a 10% co-pay (approx INR 35,000) plus non-medical consumables (approx INR 24,500) will be your out-of-pocket share.",
                    "query_type": "hybrid",
                    "plain_language": "If your policy is older than 2 years, knee surgery is covered. Stick to a Single Private AC room (under ₹10,000/day) at a network hospital to minimize your expenses to just basic non-medical items (~₹25,000).",
                    "confidence_level": "high",
                    "verification_passed": True,
                    "verification_notes": "Calculation verified using Cost Engine and Section 1, 2, 3 terms.",
                    "citations": [
                        {
                            "policy_id": str(star_policy_id),
                            "chunk_vector_id": raw_chunks[1]["vector_id"],
                            "page_number": 2,
                            "section_heading": "Section 1: Inpatient Hospitalization & Room Rent Limits"
                        },
                        {
                            "policy_id": str(star_policy_id),
                            "chunk_vector_id": raw_chunks[3]["vector_id"],
                            "page_number": 4,
                            "section_heading": "Section 3: Waiting Periods & Specific Conditions"
                        }
                    ],
                    "created_at": datetime.utcnow() - timedelta(hours=1, minutes=55)
                }
            ],
            "created_at": datetime.utcnow() - timedelta(hours=2),
            "updated_at": datetime.utcnow() - timedelta(hours=1, minutes=55)
        },
        {
            "_id": conv4_id,
            "user_id": str(user_id),
            "policy_id": str(care_policy_id),
            "title": "Are day care cataract surgeries covered?",
            "messages": [
                {
                    "message_id": str(uuid.uuid4()),
                    "role": "user",
                    "content": "Can I claim for cataract surgery done in a daycare setting without 24 hours hospitalization under Care Advantage?",
                    "query_type": None,
                    "plain_language": None,
                    "confidence_level": None,
                    "verification_passed": None,
                    "verification_notes": None,
                    "citations": [],
                    "created_at": datetime.utcnow() - timedelta(minutes=45)
                },
                {
                    "message_id": str(uuid.uuid4()),
                    "role": "assistant",
                    "content": "Yes! Under Care Advantage:\n\n- **Day Care Procedures:** Advanced ophthalmic procedures like Cataract / Phacoemulsification requiring less than 24 hours of hospitalization due to modern technology are **fully covered** up to Sum Insured.\n- **Waiting Period:** A standard 24-month waiting period applies for cataract surgery.\n- **Co-payment:** 0% co-payment if you are below 61 years of age.",
                    "query_type": "structured",
                    "plain_language": "Yes, daycare cataract surgery is fully covered without needing an overnight hospital stay, provided your policy has passed the 2-year waiting period.",
                    "confidence_level": "high",
                    "verification_passed": True,
                    "verification_notes": "Verified against daycare coverage definitions in Care Health schedule.",
                    "citations": [
                        {
                            "policy_id": str(care_policy_id),
                            "chunk_vector_id": raw_chunks[8]["vector_id"],
                            "page_number": 1,
                            "section_heading": "Schedule of Benefits & Coverage"
                        }
                    ],
                    "created_at": datetime.utcnow() - timedelta(minutes=43)
                }
            ],
            "created_at": datetime.utcnow() - timedelta(minutes=45),
            "updated_at": datetime.utcnow() - timedelta(minutes=43)
        }
    ]

    db.conversations.insert_many(conversations)
    print(f"[Seeder] Created {len(conversations)} Chat Conversations with Citations & Plain-Language outputs")

    # ── 5. Create Cost Estimates & What-If Variants ───────────────────────────
    est1_id = ObjectId()
    est2_id = ObjectId()
    est3_id = ObjectId()

    estimates = [
        {
            "_id": est1_id,
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
            "created_at": datetime.utcnow() - timedelta(hours=6)
        },
        {
            "_id": est2_id,
            "user_id": str(user_id),
            "policy_id": str(hdfc_policy_id),
            "treatment_name": "Angioplasty",
            "hospital_tier": "tier_1",
            "estimated_total_cost": 420000.0,
            "covered_amount": 390600.0,
            "out_of_pocket_amount": 29400.0,
            "cost_breakdown": {
                "base_hospital_charges": 420000.0,
                "room_rent_applied": 60000.0,
                "room_rent_cap_per_day": 0.0,
                "room_rent_copay_penalty": 0.0,
                "deductible_deducted": 0.0,
                "copay_percentage": 0.0,
                "copay_amount": 0.0,
                "sub_limit_caps_applied": [],
                "excluded_items_cost": 29400.0,
                "final_payable_by_insurer": 390600.0,
                "final_payable_by_user": 29400.0
            },
            "what_if_variants": [
                {
                    "variant_id": str(uuid.uuid4()),
                    "changed_variable": "room_rent_per_day",
                    "original_value": "15000",
                    "new_value": "25000 (Suite Room)",
                    "recalculated_total_cost": 460000.0,
                    "recalculated_covered_amount": 427800.0,
                    "recalculated_out_of_pocket": 32200.0,
                    "cost_breakdown": {
                        "base_hospital_charges": 460000.0,
                        "room_rent_applied": 100000.0,
                        "room_rent_cap_per_day": 0.0,
                        "room_rent_copay_penalty": 0.0,
                        "deductible_deducted": 0.0,
                        "copay_percentage": 0.0,
                        "copay_amount": 0.0,
                        "sub_limit_caps_applied": [],
                        "excluded_items_cost": 32200.0,
                        "final_payable_by_insurer": 427800.0,
                        "final_payable_by_user": 32200.0
                    },
                    "created_at": datetime.utcnow()
                }
            ],
            "created_at": datetime.utcnow() - timedelta(hours=3)
        },
        {
            "_id": est3_id,
            "user_id": str(user_id),
            "policy_id": str(icici_policy_id),
            "treatment_name": "Cataract Surgery",
            "hospital_tier": "tier_2",
            "estimated_total_cost": 65000.0,
            "covered_amount": 40000.0,
            "out_of_pocket_amount": 25000.0,
            "cost_breakdown": {
                "base_hospital_charges": 65000.0,
                "room_rent_applied": 6000.0,
                "room_rent_cap_per_day": 5000.0,
                "room_rent_copay_penalty": 0.0,
                "deductible_deducted": 0.0,
                "copay_percentage": 0.0,
                "copay_amount": 0.0,
                "sub_limit_caps_applied": [
                    {"item": "Cataract Procedure Cap", "cap": 40000.0, "deduction": 25000.0}
                ],
                "excluded_items_cost": 4550.0,
                "final_payable_by_insurer": 40000.0,
                "final_payable_by_user": 25000.0
            },
            "what_if_variants": [],
            "created_at": datetime.utcnow() - timedelta(hours=1)
        }
    ]

    db.cost_estimates.insert_many(estimates)
    print(f"[Seeder] Created {len(estimates)} Treatment Cost Estimates with What-If Simulation Scenarios")

    # ── 6. Create Policy Comparisons ──────────────────────────────────────────
    comp1_id = ObjectId()
    comp2_id = ObjectId()

    comparisons = [
        {
            "_id": comp1_id,
            "user_id": str(user_id),
            "policy_ids": [str(star_policy_id), str(hdfc_policy_id)],
            "comparison_result": {
                "policies_metadata": [
                    {
                        "policy_id": str(star_policy_id),
                        "insurer_name": star_policy["insurer_name"],
                        "policy_type": star_policy["policy_type"],
                        "policy_number": star_policy["policy_number"],
                        "sum_insured": star_policy["sum_insured"],
                        "premium_amount": star_policy["premium_amount"]
                    },
                    {
                        "policy_id": str(hdfc_policy_id),
                        "insurer_name": hdfc_policy["insurer_name"],
                        "policy_type": hdfc_policy["policy_type"],
                        "policy_number": hdfc_policy["policy_number"],
                        "sum_insured": hdfc_policy["sum_insured"],
                        "premium_amount": hdfc_policy["premium_amount"]
                    }
                ],
                "coverage_comparison": {
                    str(star_policy_id): "INR 10,00,000",
                    str(hdfc_policy_id): "INR 15,00,000 (+100% Secure Benefit = INR 30,00,000)"
                },
                "premium_comparison": {
                    str(star_policy_id): "INR 14,500/yr",
                    str(hdfc_policy_id): "INR 22,800/yr"
                },
                "room_rent_comparison": {
                    str(star_policy_id): "Single Private A/C Room or max 1% of Sum Insured per day (INR 10,000/day)",
                    str(hdfc_policy_id): "No Room Rent Capping (Any room up to Suite allowed, Zero proportionate deduction)"
                },
                "waiting_periods_comparison": {
                    str(star_policy_id): [
                        "36 months for Pre-Existing Diseases (PED)",
                        "24 months specific illness waiting period",
                        "30 days initial waiting period"
                    ],
                    str(hdfc_policy_id): [
                        "24 months for Pre-Existing Diseases (PED)",
                        "24 months for named specific procedures",
                        "30 days initial waiting period"
                    ]
                },
                "copay_comparison": {
                    str(star_policy_id): "10% co-payment for non-network metro hospitals; 0% in network facilities",
                    str(hdfc_policy_id): "Zero Co-payment across all tiers and network/non-network hospitals"
                },
                "exclusions_diff": {
                    str(star_policy_id): star_policy["red_flag_summary"]["major_exclusions"],
                    str(hdfc_policy_id): hdfc_policy["red_flag_summary"]["major_exclusions"]
                }
            },
            "created_at": datetime.utcnow() - timedelta(hours=4)
        },
        {
            "_id": comp2_id,
            "user_id": str(user_id),
            "policy_ids": [str(hdfc_policy_id), str(care_policy_id)],
            "comparison_result": {
                "policies_metadata": [
                    {
                        "policy_id": str(hdfc_policy_id),
                        "insurer_name": hdfc_policy["insurer_name"],
                        "policy_type": hdfc_policy["policy_type"],
                        "policy_number": hdfc_policy["policy_number"],
                        "sum_insured": hdfc_policy["sum_insured"],
                        "premium_amount": hdfc_policy["premium_amount"]
                    },
                    {
                        "policy_id": str(care_policy_id),
                        "insurer_name": care_policy["insurer_name"],
                        "policy_type": care_policy["policy_type"],
                        "policy_number": care_policy["policy_number"],
                        "sum_insured": care_policy["sum_insured"],
                        "premium_amount": care_policy["premium_amount"]
                    }
                ],
                "coverage_comparison": {
                    str(hdfc_policy_id): "INR 15,00,000 (Doubles to 30L)",
                    str(care_policy_id): "INR 25,00,000"
                },
                "premium_comparison": {
                    str(hdfc_policy_id): "INR 22,800/yr",
                    str(care_policy_id): "INR 31,200/yr"
                },
                "room_rent_comparison": {
                    str(hdfc_policy_id): "No Room Rent Capping (Any room up to Suite allowed)",
                    str(care_policy_id): "Single Private AC Room up to INR 15,000 per day"
                },
                "waiting_periods_comparison": {
                    str(hdfc_policy_id): [
                        "24 months for Pre-Existing Diseases (PED)",
                        "30 days initial waiting period"
                    ],
                    str(care_policy_id): [
                        "36 months for Pre-Existing Diseases (PED)",
                        "24 months specific illnesses",
                        "30 days initial waiting period"
                    ]
                },
                "copay_comparison": {
                    str(hdfc_policy_id): "Zero Co-payment across all tiers and networks",
                    str(care_policy_id): "0% for age < 61; 20% for age 61+"
                },
                "exclusions_diff": {
                    str(hdfc_policy_id): hdfc_policy["red_flag_summary"]["major_exclusions"],
                    str(care_policy_id): care_policy["red_flag_summary"]["major_exclusions"]
                }
            },
            "created_at": datetime.utcnow() - timedelta(hours=1)
        }
    ]

    db.policy_comparisons.insert_many(comparisons)
    print(f"[Seeder] Created {len(comparisons)} Multi-Policy Comparisons")

    print("\n" + "="*50)
    print(" ALL TEST DATA SUCCESSFULLY SEEDED TO MONGODB ATLAS ")
    print("="*50)
    print(" Active Demo Accounts:")
    print(" 1. Email:    demo@medshield.ai")
    print("    Password: password123")
    print("    Role:     Primary User (4 policies, 4 chats, 3 cost estimates, 2 comparisons)")
    print("")
    print(" 2. Email:    rohan@insurai.com")
    print("    Password: password123")
    print("    Role:     Lead Admin (2 policies)")
    print("")
    print(" 3. Email:    priya.sharma@example.com")
    print("    Password: password123")
    print("    Role:     New Member")
    print("="*50 + "\n")

if __name__ == "__main__":
    seed_data()
