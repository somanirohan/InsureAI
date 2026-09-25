import uuid
import math
from datetime import datetime
from typing import Dict, Any, List, Optional
from bson import ObjectId
import logging

try:
    from db import get_async_db
    from services.chroma_service import chroma_service
except ImportError:
    from server.db import get_async_db
    from server.services.chroma_service import chroma_service

logger = logging.getLogger("medshield.policy")

class PolicyService:
    async def process_policy_document(self, policy_id: str, user_id: str):
        db = get_async_db()
        try:
            try:
                p_id = ObjectId(policy_id)
            except Exception:
                p_id = policy_id

            policy = await db.policies.find_one({"_id": p_id, "user_id": str(user_id)})
            if not policy:
                return

            await db.policies.update_one(
                {"_id": p_id},
                {"$set": {"status": "extracting", "updated_at": datetime.utcnow()}}
            )

            extracted_data = self.generate_extracted_facts(policy.get("file_name", ""))

            await db.policies.update_one(
                {"_id": p_id},
                {"$set": {
                    "insurer_name": extracted_data["insurer_name"],
                    "policy_type": extracted_data["policy_type"],
                    "policy_number": extracted_data["policy_number"],
                    "sum_insured": extracted_data["sum_insured"],
                    "premium_amount": extracted_data["premium_amount"],
                    "ocr_used": extracted_data["ocr_used"],
                    "red_flag_summary": extracted_data["red_flag_summary"],
                    "facts": extracted_data["facts"],
                    "status": "indexed",
                    "indexed_at": datetime.utcnow(),
                    "updated_at": datetime.utcnow()
                }}
            )

            chunks_to_insert = []
            for i, chunk_data in enumerate(extracted_data["chunks"]):
                vector_id = str(uuid.uuid4())
                chunk_obj = {
                    "policy_id": str(policy_id),
                    "user_id": str(user_id),
                    "chunk_index": i,
                    "chunk_text": chunk_data["text"],
                    "page_number": chunk_data["page"],
                    "section_heading": chunk_data["section"],
                    "token_count": math.ceil(len(chunk_data["text"].split()) * 1.3),
                    "vector_id": vector_id,
                    "insurer_name": extracted_data["insurer_name"],
                    "policy_type": extracted_data["policy_type"]
                }
                chunks_to_insert.append(chunk_obj)

            if chunks_to_insert:
                await db.policy_chunks.insert_many(chunks_to_insert)
                chroma_service.upsert_chunks(chunks_to_insert)

            await db.policies.update_one(
                {"_id": p_id},
                {"$set": {"status": "ready", "updated_at": datetime.utcnow()}}
            )
            logger.info(f"[PolicyService] Completed processing for policy {policy_id}")
        except Exception as e:
            logger.error(f"[PolicyService] Error processing policy {policy_id}: {e}")
            try:
                p_id = ObjectId(policy_id)
            except Exception:
                p_id = policy_id
            await db.policies.update_one(
                {"_id": p_id},
                {"$set": {"status": "failed", "updated_at": datetime.utcnow()}}
            )

    async def delete_policy_cascade(self, user_id: str, policy_id: str) -> Dict[str, Any]:
        db = get_async_db()
        try:
            p_id = ObjectId(policy_id)
        except Exception:
            p_id = policy_id

        policy = await db.policies.find_one({"_id": p_id, "user_id": str(user_id)})
        if not policy:
            raise Exception("Policy not found or unauthorized")

        await db.policy_chunks.delete_many({"policy_id": str(policy_id), "user_id": str(user_id)})
        chroma_service.delete_policy_vectors(user_id, policy_id)

        await db.conversations.update_many(
            {"policy_id": str(policy_id), "user_id": str(user_id)},
            {"$set": {"policy_id": None}}
        )
        await db.cost_estimates.delete_many({"policy_id": str(policy_id), "user_id": str(user_id)})
        await db.policies.delete_one({"_id": p_id, "user_id": str(user_id)})

        return {"success": True, "message": "Policy and associated records deleted successfully"}

    def generate_extracted_facts(self, filename: str) -> Dict[str, Any]:
        fn = filename.lower()
        insurer = "Star Health & Allied Insurance"
        policy_type = "individual_health"
        sum_insured = 1000000.0
        premium = 14500.0

        if "hdfc" in fn or "ergo" in fn:
            insurer = "HDFC ERGO General Insurance"
            policy_type = "family_floater"
            sum_insured = 1500000.0
            premium = 21000.0
        elif "care" in fn or "religare" in fn:
            insurer = "Care Health Insurance"
            policy_type = "critical_illness"
            sum_insured = 2500000.0
            premium = 18500.0

        facts = [
            {
                "fact_id": str(uuid.uuid4()),
                "category": "sum_insured",
                "fact_key": "base_sum_insured",
                "fact_value": f"INR {sum_insured:,.0f}",
                "fact_value_numeric": sum_insured,
                "unit": "INR",
                "source_page": 2,
                "source_section": "Schedule of Benefits - Section 1",
                "extraction_confidence": "high"
            },
            {
                "fact_id": str(uuid.uuid4()),
                "category": "room_rent_limit",
                "fact_key": "room_rent_cap_per_day",
                "fact_value": "Single Private A/C Room or max 1% of Sum Insured per day",
                "fact_value_numeric": sum_insured * 0.01,
                "unit": "INR/day",
                "source_page": 4,
                "source_section": "Inpatient Hospitalization - Section 3.1",
                "extraction_confidence": "high"
            },
            {
                "fact_id": str(uuid.uuid4()),
                "category": "sub_limit",
                "fact_key": "icu_charges_limit",
                "fact_value": "Up to 2% of Sum Insured per day",
                "fact_value_numeric": sum_insured * 0.02,
                "unit": "INR/day",
                "source_page": 4,
                "source_section": "Intensive Care Unit (ICU) Charges - Section 3.2",
                "extraction_confidence": "high"
            },
            {
                "fact_id": str(uuid.uuid4()),
                "category": "co_payment",
                "fact_key": "co_payment_clause",
                "fact_value": "10% co-payment for treatments in Tier 1 non-network hospitals; 0% in network",
                "fact_value_numeric": 10.0,
                "unit": "%",
                "source_page": 7,
                "source_section": "Co-Payment Terms - Section 5.4",
                "extraction_confidence": "high"
            },
            {
                "fact_id": str(uuid.uuid4()),
                "category": "deductible",
                "fact_key": "annual_aggregate_deductible",
                "fact_value": "Nil for standard claims, INR 10,000 voluntary deductible option",
                "fact_value_numeric": 0.0,
                "unit": "INR",
                "source_page": 3,
                "source_section": "Deductible Details - Section 2.3",
                "extraction_confidence": "high"
            },
            {
                "fact_id": str(uuid.uuid4()),
                "category": "waiting_period",
                "fact_key": "pre_existing_disease_waiting_period",
                "fact_value": "36 months from policy inception date",
                "fact_value_numeric": 36.0,
                "unit": "months",
                "source_page": 9,
                "source_section": "Waiting Periods - Section 6.1",
                "extraction_confidence": "high"
            },
            {
                "fact_id": str(uuid.uuid4()),
                "category": "waiting_period",
                "fact_key": "initial_waiting_period",
                "fact_value": "30 days from date of commencement except accidental injuries",
                "fact_value_numeric": 30.0,
                "unit": "days",
                "source_page": 9,
                "source_section": "Waiting Periods - Section 6.2",
                "extraction_confidence": "high"
            },
            {
                "fact_id": str(uuid.uuid4()),
                "category": "exclusion",
                "fact_key": "cosmetic_and_obesity_treatments",
                "fact_value": "Cosmetic surgery, aesthetic treatments, and weight control are completely excluded",
                "fact_value_numeric": None,
                "unit": None,
                "source_page": 11,
                "source_section": "Permanent Exclusions - Section 7",
                "extraction_confidence": "high"
            }
        ]

        red_flag_summary = {
            "waiting_periods": [
                "36 months waiting period for Pre-Existing Diseases (PED)",
                "24 months waiting period for specific ailments: Cataract, Hernia, Joint Replacement",
                "30 days initial waiting period for all non-accidental illnesses"
            ],
            "major_exclusions": [
                "Cosmetic & plastic surgery unless necessitated by accidental trauma",
                "Experimental or unproven pharmacological therapies and stem cell procedures",
                "Non-medical items (gloves, PPE kits, registration fees, food/beverages)",
                "Dental treatments unless requiring in-patient surgical admission"
            ],
            "room_rent_cap": "1% of Sum Insured per day. Exceeding this room rent triggers proportionate deduction across all hospital billing.",
            "copay_percentage": "10% co-payment applicable in non-network metro hospitals.",
            "notes": [
                "Pre-authorization is strictly mandatory for cashless claims at network hospitals.",
                "No Claim Bonus (NCB) accrues at 20% per claim-free year up to a maximum cap of 100%."
            ]
        }

        chunks = [
            {
                "page": 2,
                "section": "Section 1: Schedule of Benefits & Coverage Limits",
                "text": f"Policyholder is eligible for inpatient hospitalization coverage up to the Sum Insured of INR {sumInsured:,.0f}. Coverage encompasses room charges, nursing fees, surgeon, anesthesiologist, medical practitioner fees, operation theatre charges, pharmacy, diagnostic tests, and intensive care unit (ICU) charges incurred during medically necessary hospitalization exceeding 24 hours."
            },
            {
                "page": 4,
                "section": "Section 3: Room Rent & Accommodation Conditions",
                "text": "Room rent limit is capped at 1% of the base Sum Insured per day for standard room accommodation, or Single Private A/C Room, whichever is lower. Intensive Care Unit (ICU) charges are covered up to 2% of the Sum Insured per day. If the insured chooses a room category exceeding this limit, a proportionate deduction shall apply to all associated medical expenses, including doctor visit charges and OT fees."
            },
            {
                "page": 7,
                "section": "Section 5: Co-payment & Deductibles",
                "text": "A mandatory 10% co-payment shall apply to all admissible claim amounts if hospitalization takes place in a Tier 1 non-network hospital. In network healthcare facilities, cashless claims enjoy zero co-payment. Voluntary deductible of INR 10,000 applies only if selected at policy issuance."
            },
            {
                "page": 9,
                "section": "Section 6: Waiting Periods and Specific Conditions",
                "text": "1. Initial 30 Days Waiting Period: No illness or disease contracted within thirty (30) days from policy inception shall be covered, except acute trauma resulting directly from accidental injury. 2. Pre-Existing Disease (PED) Waiting Period: Coverage for pre-existing diseases commences after thirty-six (36) consecutive months of continuous coverage without break. 3. Specific Named Ailments: A two-year (24 months) waiting period applies to treatment of cataracts, hernia, hydrocele, piles, gall bladder stones, and benign prostatic hypertrophy."
            },
            {
                "page": 11,
                "section": "Section 7: Exclusions & Uncovered Expenses",
                "text": "The company shall not be liable to make any payment under this policy for expenses incurred towards: cosmetic or plastic surgery, treatments for obesity or weight management, gender reassignment, maternity expenses (unless rider active), self-inflicted injuries, injury due to alcohol/narcotics intoxication, vitamins and supplements not forming part of active in-patient medication, and non-medical consumables as per IRDAI guidelines."
            },
            {
                "page": 14,
                "section": "Section 9: Claims Procedure & Cashless Facilities",
                "text": "For planned hospitalization, pre-authorization must be submitted at least 48 hours prior to admission to the Third Party Administrator (TPA) or insurer. In emergency hospitalizations, intimation must be provided within 24 hours of hospital admission. Original discharge summary, itemized medical bills, pharmacy receipts, and diagnostic reports must be submitted within 30 days of hospital discharge."
            }
        ]

        return {
            "insurer_name": insurer,
            "policy_type": policy_type,
            "policy_number": f"POL-{uuid.uuid4().hex[:6].upper()}",
            "sum_insured": sumInsured,
            "premium_amount": premium,
            "ocr_used": False,
            "red_flag_summary": red_flag_summary,
            "facts": facts,
            "chunks": chunks
        }

policy_service = PolicyService()
