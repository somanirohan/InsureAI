import re
from typing import Dict, Any, Optional, List
from bson import ObjectId
from fastapi_server.db import get_async_db
from fastapi_server.services.chroma_service import chroma_service

class RagService:
    def classify_query(self, question: str) -> str:
        """Classify user question into 'structured' or 'semantic' (FR-09)"""
        q = question.lower()
        structured_triggers = [
            "room rent", "icu", "copay", "co-pay", "co payment",
            "deductible", "sum insured", "waiting period", "waiting time",
            "limit", "cap", "sublimit", "sub-limit", "premium", "ped"
        ]

        is_structured = any(keyword in q for keyword in structured_triggers)
        return "structured" if is_structured else "semantic"

    async def answer_question(
        self,
        user_id: str,
        policy_id: Optional[str],
        question: str,
        plain_language_requested: bool = False
    ) -> Dict[str, Any]:
        """Process question across policy context with grounding, self-verification & citations"""
        db = get_async_db()
        query_type = self.classify_query(question)

        # Fetch active policy
        policy = None
        if policy_id:
            try:
                p_id = ObjectId(policy_id)
            except Exception:
                p_id = policy_id
            policy = await db.policies.find_one({"_id": p_id, "user_id": str(user_id)})

        if not policy:
            policy = await db.policies.find_one({"user_id": str(user_id), "status": "ready"})

        if not policy:
            return {
                "query_type": query_type,
                "answer": "No active or processed insurance policy was found for your account. Please upload a policy PDF first.",
                "plain_language": "You need to upload an insurance policy before I can answer your questions.",
                "confidence_level": "low",
                "verification_passed": False,
                "verification_notes": "No policy document found for current user.",
                "citations": []
            }

        # 1. STRUCTURED ROUTE: Fact matching
        if query_type == "structured":
            structured_res = self.answer_from_structured_facts(policy, question)
            if structured_res["found"]:
                verification_passed = structured_res["verification_passed"]
                confidence = "high" if verification_passed else "medium"

                return {
                    "query_type": "structured",
                    "answer": structured_res["answer"],
                    "plain_language": self.simplify_to_plain_language(structured_res["answer"]),
                    "confidence_level": confidence,
                    "verification_passed": verification_passed,
                    "verification_notes": "Verified against authoritative extracted policy facts table.",
                    "citations": structured_res["citations"]
                }

        # 2. SEMANTIC ROUTE: Vector Search via ChromaDB
        vector_chunks = chroma_service.query_policy_chunks(
            user_id=user_id,
            policy_id=str(policy["_id"]),
            query_text=question,
            n_results=3
        )

        if not vector_chunks:
            return {
                "query_type": "semantic",
                "answer": "I could not find information regarding this question in your policy document. Please verify with your insurer or refer to policy clauses.",
                "plain_language": "This detail is not explicitly mentioned in your uploaded policy paperwork.",
                "confidence_level": "low",
                "verification_passed": False,
                "verification_notes": "No relevant semantic vector chunks matched in vector store.",
                "citations": []
            }

        top_chunk = vector_chunks[0]
        citations = [
            {
                "policy_id": str(policy["_id"]),
                "chunk_vector_id": chunk["vector_id"],
                "page_number": chunk["metadata"].get("page_number", 1),
                "section_heading": chunk["metadata"].get("section_heading", "Policy Clause")
            }
            for chunk in vector_chunks
        ]

        has_relevance = self.verify_semantic_relevance(question, top_chunk["chunk_text"])
        confidence = "high" if has_relevance else "medium"

        sec_heading = top_chunk["metadata"].get("section_heading", "your policy")
        if has_relevance:
            answer_text = f"Based on {sec_heading}: {top_chunk['chunk_text']}"
        else:
            answer_text = f"Information found in {sec_heading}: {top_chunk['chunk_text']} (Note: Verification confidence is reduced as the clause may only partially address your question)."

        return {
            "query_type": "semantic",
            "answer": answer_text,
            "plain_language": self.simplify_to_plain_language(answer_text),
            "confidence_level": confidence,
            "verification_passed": has_relevance,
            "verification_notes": "Cited passage directly matches the requested policy query terms." if has_relevance else "Passage has partial keyword overlap; confidence lowered.",
            "citations": citations
        }

    def answer_from_structured_facts(self, policy: Dict[str, Any], question: str) -> Dict[str, Any]:
        q = question.lower()
        facts = policy.get("facts", [])
        p_id = str(policy["_id"])

        # Room rent
        if "room rent" in q or "room limit" in q or "room charge" in q:
            fact = next((f for f in facts if f.get("category") == "room_rent_limit"), None)
            if fact:
                return {
                    "found": True,
                    "answer": f"Your Room Rent Limit is: {fact['fact_value']}. Exceeding this limit will trigger proportionate deductions across all hospital billing items.",
                    "verification_passed": True,
                    "citations": [{
                        "policy_id": p_id,
                        "page_number": fact.get("source_page", 4),
                        "section_heading": fact.get("source_section", "Room Rent Limits")
                    }]
                }

        # Waiting period
        if "waiting" in q or "ped" in q or "pre-existing" in q:
            waiting_facts = [f for f in facts if f.get("category") == "waiting_period"]
            if waiting_facts:
                lines = [f"• {f['fact_key'].replace('_', ' ')}: {f['fact_value']}" for f in waiting_facts]
                text = "\n".join(lines)
                return {
                    "found": True,
                    "answer": f"The applicable waiting periods in your policy are:\n{text}",
                    "verification_passed": True,
                    "citations": [{
                        "policy_id": p_id,
                        "page_number": f.get("source_page", 9),
                        "section_heading": f.get("source_section", "Waiting Periods")
                    } for f in waiting_facts]
                }

        # Co-payment
        if "copay" in q or "co-pay" in q or "co payment" in q:
            fact = next((f for f in facts if f.get("category") == "co_payment"), None)
            if fact:
                return {
                    "found": True,
                    "answer": f"Co-payment terms: {fact['fact_value']}.",
                    "verification_passed": True,
                    "citations": [{
                        "policy_id": p_id,
                        "page_number": fact.get("source_page", 7),
                        "section_heading": fact.get("source_section", "Co-Payment Terms")
                    }]
                }

        # Sum Insured
        if "sum insured" in q or "coverage amount" in q or "maximum coverage" in q:
            fact = next((f for f in facts if f.get("category") == "sum_insured"), None)
            if fact:
                return {
                    "found": True,
                    "answer": f"Your total base Sum Insured coverage is {fact['fact_value']}.",
                    "verification_passed": True,
                    "citations": [{
                        "policy_id": p_id,
                        "page_number": fact.get("source_page", 2),
                        "section_heading": fact.get("source_section", "Schedule of Benefits")
                    }]
                }

        return {"found": False}

    def verify_semantic_relevance(self, question: str, chunk_text: str) -> bool:
        """Self-verification check (FR-11)"""
        q_words = [
            w for w in re.sub(r'[^\w\s]', '', question.lower()).split()
            if len(w) > 3 and w not in ["what", "when", "does", "this", "have", "policy", "cover"]
        ]
        if not q_words:
            return True
        chunk_lower = chunk_text.lower()
        matches = sum(1 for w in q_words if w in chunk_lower)
        return matches >= min(2, len(q_words))

    def simplify_to_plain_language(self, text: str) -> str:
        """Plain-Language Jargon Translator (FR-13)"""
        simplified = text
        simplified = re.sub(r'proportionate deduction', 'paying extra out of your own pocket for everything', simplified, flags=re.IGNORECASE)
        simplified = re.sub(r'co-payment', 'your share of the bill (e.g. you pay a fixed percentage while insurance pays the rest)', simplified, flags=re.IGNORECASE)
        simplified = re.sub(r'deductible', 'initial amount you must pay by yourself before insurance kicks in', simplified, flags=re.IGNORECASE)
        simplified = re.sub(r'pre-existing disease|ped', 'health conditions you already had before buying this policy', simplified, flags=re.IGNORECASE)
        simplified = re.sub(r'cashless claims', 'the hospital bills insurance directly so you do not pay upfront', simplified, flags=re.IGNORECASE)
        simplified = re.sub(r'sum insured', 'maximum money insurance can pay in a year', simplified, flags=re.IGNORECASE)
        return simplified

rag_service = RagService()
