"""
Deterministic, explainable recommendation engine for InsureAI.
Evaluates user profile against verified Indian health insurance policies, applies hard filters,
calculates normalized scores across 5 weighted categories, and generates human-readable rationales.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional, Tuple

try:
    from models.recommendation import (
        MatchBreakdown,
        PolicyRecommendationItem,
        RecommendationRequest,
        RecommendationResponse,
        ScoringWeights,
        UserProfile,
    )
    from services.policy_crawler import CURATED_INDIAN_POLICIES, policy_crawler_service
except ImportError:
    from server.models.recommendation import (
        MatchBreakdown,
        PolicyRecommendationItem,
        RecommendationRequest,
        RecommendationResponse,
        ScoringWeights,
        UserProfile,
    )
    from server.services.policy_crawler import CURATED_INDIAN_POLICIES, policy_crawler_service

logger = logging.getLogger("insureai.recommendation_engine")

# Default heuristic scoring weights (total = 1.00)
DEFAULT_WEIGHTS = {
    "affordability": 0.30,
    "coverage": 0.25,
    "waiting_periods": 0.20,
    "hospital_network": 0.15,
    "terms": 0.10,
}

SUM_INSURED_SCALE_FACTORS = {
    300000: 0.60,
    500000: 0.75,
    700000: 0.88,
    750000: 0.90,
    1000000: 1.00,
    1500000: 1.22,
    2000000: 1.38,
    2500000: 1.50,
    3000000: 1.62,
    5000000: 1.95,
    10000000: 2.35,
    20000000: 3.10,
}


class RecommendationEngine:
    """
    Deterministic rule-based recommendation service.
    Follows transparent IRDAI-aligned guidelines for age, sum insured,
    waiting periods, room rent, and co-payment terms.
    """

    def calculate_estimated_premium(
        self,
        policy: Dict[str, Any],
        profile: UserProfile,
        target_sum_insured: float,
    ) -> float:
        """
        Calculate an indicative annual premium based on standard filed rate brackets.
        Deterministic and realistic for Indian health insurance market.
        """
        # Determine highest age in the policy coverage group
        ages = [profile.age]
        if profile.coverage_type == "family_floater" and profile.family_members:
            ages.extend([m.age for m in profile.family_members if m.age > 0])
        primary_age = max(ages)

        # Map to age bracket
        if primary_age <= 35:
            bracket = "18-35"
        elif primary_age <= 45:
            bracket = "36-45"
        elif primary_age <= 55:
            bracket = "46-55"
        elif primary_age <= 65:
            bracket = "56-65"
        else:
            bracket = "66+"

        base_rates = policy.get("base_premium_rates_10l", {})
        base_10l = base_rates.get(bracket, 13500.0)

        # Scale by sum insured factor
        scale = SUM_INSURED_SCALE_FACTORS.get(int(target_sum_insured), None)
        if scale is None:
            # Linear approximation between standard brackets
            scale = max(0.55, (target_sum_insured / 1000000.0) ** 0.58)

        calc_premium = base_10l * scale

        # Floater loading if family floater
        if profile.coverage_type == "family_floater":
            floater_multiplier = policy.get("floater_multiplier", 1.42)
            # Add small loading for additional members beyond spouse
            extra_members = max(0, len(profile.family_members) - 1)
            calc_premium = calc_premium * floater_multiplier + (extra_members * 1800.0)

        return round(calc_premium, -1)  # Round to nearest 10 INR

    def select_best_sum_insured(self, policy: Dict[str, Any], profile: UserProfile) -> float:
        """Find the closest valid sum insured option offered by the policy."""
        options = policy.get("sum_insured_options", [1000000])
        if profile.sum_insured_preference:
            pref = profile.sum_insured_preference
            # Find closest option
            return min(options, key=lambda x: abs(x - pref))

        # Default benchmark: ₹10 Lakhs if available, else first option >= ₹5 Lakhs
        if 1000000 in options:
            return 1000000
        suitable = [opt for opt in options if opt >= 500000]
        return suitable[0] if suitable else options[0]

    def passes_hard_filters(self, policy: Dict[str, Any], profile: UserProfile) -> Tuple[bool, Optional[str]]:
        """
        Apply strict eligibility filters.
        Returns (is_eligible, reason_if_ineligible).
        """
        # 1. Coverage type check
        allowed_types = policy.get("coverage_types", ["individual"])
        if profile.coverage_type not in allowed_types:
            return False, f"Does not offer {profile.coverage_type.replace('_', ' ')} cover."

        # 2. Age eligibility check
        min_age = policy.get("min_entry_age", 18)
        max_age = policy.get("max_entry_age", 65)

        if profile.age < min_age or profile.age > max_age:
            return False, f"Primary age {profile.age} outside policy entry limits ({min_age}-{max_age} yrs)."

        # Check family member ages if family floater
        if profile.coverage_type == "family_floater" and profile.family_members:
            for member in profile.family_members:
                if member.relation in ["spouse", "parent"] and (member.age < min_age or member.age > max_age):
                    return False, f"{member.relation.capitalize()} age {member.age} outside entry limits ({min_age}-{max_age} yrs)."

        return True, None

    def evaluate_affordability(
        self,
        policy: Dict[str, Any],
        profile: UserProfile,
        estimated_premium: float,
    ) -> Tuple[float, str]:
        """
        Calculate Affordability Score (0 to 30 points).
        Evaluates estimated premium against declared budget or benchmark norms.
        """
        if profile.annual_budget and profile.annual_budget > 0:
            budget = profile.annual_budget
            ratio = estimated_premium / budget

            if ratio <= 0.85:
                score = 30.0
                detail = f"₹{estimated_premium:,.0f}/yr is well within budget of ₹{budget:,.0f} (leaves {round((1-ratio)*100)}% financial headroom)."
            elif ratio <= 1.0:
                score = 28.0
                detail = f"₹{estimated_premium:,.0f}/yr matches budget of ₹{budget:,.0f} comfortably."
            elif ratio <= 1.12:
                score = 21.0
                detail = f"₹{estimated_premium:,.0f}/yr is slightly above budget by {round((ratio-1)*100)}% but provides premium terms."
            elif ratio <= 1.25:
                score = 14.0
                detail = f"₹{estimated_premium:,.0f}/yr exceeds budget by {round((ratio-1)*100)}%."
            elif ratio <= 1.50:
                score = 8.0
                detail = f"₹{estimated_premium:,.0f}/yr is significantly above budget of ₹{budget:,.0f}."
            else:
                score = 4.0
                detail = f"₹{estimated_premium:,.0f}/yr substantially exceeds budget limit."
        else:
            # Benchmark scoring without user budget: penalize overly expensive plans
            cost_per_lakh = estimated_premium / (policy.get("default_sum_insured", 1000000) / 100000.0)
            if cost_per_lakh <= 1200:
                score = 29.0
                detail = f"Competitive indicative premium of ₹{estimated_premium:,.0f}/yr with high value-to-cost ratio."
            elif cost_per_lakh <= 1600:
                score = 26.0
                detail = f"Standard market-aligned indicative premium of ₹{estimated_premium:,.0f}/yr."
            elif cost_per_lakh <= 2200:
                score = 22.0
                detail = f"Premium of ₹{estimated_premium:,.0f}/yr reflects extensive high-end inclusions."
            else:
                score = 18.0
                detail = f"Higher indicative premium of ₹{estimated_premium:,.0f}/yr."

        return score, detail

    def evaluate_coverage(
        self,
        policy: Dict[str, Any],
        profile: UserProfile,
        chosen_sum_insured: float,
    ) -> Tuple[float, str]:
        """
        Calculate Coverage & Sum Insured Score (0 to 25 points).
        Evaluates sum insured match, restoration benefit, and room rent flexibility.
        """
        score = 0.0
        details = []

        # 1. Sum insured alignment (0 to 10 pts)
        if profile.sum_insured_preference:
            diff_ratio = abs(chosen_sum_insured - profile.sum_insured_preference) / profile.sum_insured_preference
            if diff_ratio == 0:
                score += 10.0
                details.append(f"Offers exact requested ₹{(chosen_sum_insured/100000):.1f}L sum insured")
            elif diff_ratio <= 0.25:
                score += 8.5
                details.append(f"Offers ₹{(chosen_sum_insured/100000):.1f}L cover (near requested ₹{(profile.sum_insured_preference/100000):.1f}L)")
            else:
                score += 6.5
                details.append(f"Offers ₹{(chosen_sum_insured/100000):.1f}L cover")
        else:
            score += 9.5
            details.append(f"Standard ₹{(chosen_sum_insured/100000):.1f}L protective cover")

        # 2. Restoration Benefit (0 to 8 pts)
        restore = policy.get("restoration_benefit", "").lower()
        if "unlimited" in restore or "forever" in restore:
            score += 8.0
            details.append("Unlimited automatic restoration for recurring claims")
        elif "100%" in restore or "recharge" in restore:
            score += 6.5
            details.append("100% automatic reload benefit")
        else:
            score += 3.0

        # 3. Room rent restriction (0 to 7 pts)
        room_type = policy.get("room_rent_type", "single_private_room")
        if room_type == "no_capping":
            score += 7.0
            details.append("Zero room rent capping (no proportionate deduction)")
        elif room_type == "single_private_room":
            score += 5.5
            details.append("Single Private AC room allowed")
        elif room_type == "1_percent":
            score += 3.0
            details.append("Room rent capped at 1% of Sum Insured")
        else:
            score += 2.0
            details.append("Shared room sub-limit applies")

        return score, "; ".join(details)

    def evaluate_waiting_periods(
        self,
        policy: Dict[str, Any],
        profile: UserProfile,
    ) -> Tuple[float, str]:
        """
        Calculate Waiting Periods Score (0 to 20 points).
        Strictly prioritizes short pre-existing disease (PED) wait if user has conditions.
        """
        score = 0.0
        wp = policy.get("waiting_periods", {})
        ped_months = wp.get("ped_months", 36)
        has_ped = len(profile.pre_existing_conditions) > 0

        details = []

        if has_ped:
            # User declared PED: heavily weight PED wait
            if ped_months <= 12:
                score = 20.0
                details.append(f"Exceptional 12-month PED wait for declared conditions ({', '.join(profile.pre_existing_conditions)})")
            elif ped_months <= 24:
                score = 16.5
                details.append(f"Fast 24-month PED wait for declared conditions ({', '.join(profile.pre_existing_conditions)})")
            elif ped_months <= 36:
                score = 11.0
                details.append(f"Standard 36-month wait applies before declared conditions are covered")
            else:
                score = 5.0
                details.append(f"Extended 48-month waiting period for declared conditions")
        else:
            # No declared PED: standard scoring
            if ped_months <= 24:
                score = 19.5
                details.append(f"Rapid {ped_months}-month PED cover for future-diagnosed conditions")
            elif ped_months <= 36:
                score = 17.0
                details.append(f"Standard 36-month IRDAI-compliant PED wait")
            else:
                score = 12.0
                details.append(f"48-month PED wait")

        initial_days = wp.get("initial_days", 30)
        details.append(f"{initial_days}-day initial waiting period (accidents covered Day 1)")

        return score, "; ".join(details)

    def evaluate_hospital_network(
        self,
        policy: Dict[str, Any],
        profile: UserProfile,
    ) -> Tuple[float, str]:
        """
        Calculate Hospital Network Suitability Score (0 to 15 points).
        Evaluates network count and zonal co-payment restrictions.
        """
        network_count = policy.get("network_hospitals_count", 9000)
        score = 0.0
        details = []

        if network_count >= 13000:
            score += 11.0
            details.append(f"India's widest network ({network_count:,}+ cashless hospitals)")
        elif network_count >= 11000:
            score += 10.0
            details.append(f"Extensive network ({network_count:,}+ cashless hospitals)")
        elif network_count >= 9500:
            score += 8.5
            details.append(f"Large network ({network_count:,}+ cashless hospitals)")
        else:
            score += 7.0
            details.append(f"Established network ({network_count:,}+ cashless hospitals)")

        # Zonal compatibility (Tier 1 Metro vs Tier 2)
        copay_desc = policy.get("copay_desc", "").lower()
        if profile.city_tier == "tier_1":
            if "zone 1" in copay_desc and "20%" in copay_desc:
                # Penalize policies that mandate 20% co-pay on Tier 1 metro hospitals
                score += 1.0
                details.append("Warning: 20% co-pay applies if treated in Zone 1 metro hospitals")
            else:
                score += 4.0
                details.append("Full Tier-1 metro cashless coverage without zonal surcharge")
        else:
            score += 4.0
            details.append("Comprehensive Tier-2 & regional hospital network")

        return score, "; ".join(details)

    def evaluate_terms(
        self,
        policy: Dict[str, Any],
        profile: UserProfile,
    ) -> Tuple[float, str]:
        """
        Calculate Co-payment & Terms Score (0 to 10 points).
        Evaluates co-payment clauses and restrictions.
        """
        copay_pct = policy.get("copay_percentage", 0)
        copay_desc = policy.get("copay_desc", "")

        if copay_pct == 0 and "zone" not in copay_desc.lower() and "61" not in copay_desc.lower():
            score = 10.0
            detail = "Zero co-payment: Insurer pays 100% of admissible hospital claims"
        elif "61" in copay_desc:
            if profile.age < 61:
                score = 9.0
                detail = "0% co-payment for current age (10% co-pay applies only above 61)"
            else:
                score = 6.0
                detail = "10% senior co-payment applies for age 61+"
        elif copay_pct <= 10:
            score = 7.5
            detail = f"{copay_pct}% nominal co-payment clause"
        else:
            score = 4.0
            detail = f"{copay_pct}% co-payment clause applies"

        return score, detail

    def generate_recommendations(
        self,
        request: RecommendationRequest,
        catalog_policies: Optional[List[Dict[str, Any]]] = None,
    ) -> RecommendationResponse:
        """
        Core recommendation orchestration:
        1. Validates and hard-filters catalog policies.
        2. Scores all eligible policies deterministically.
        3. Ranks candidates and formats explainable output.
        """
        profile = request.profile
        policies = catalog_policies or CURATED_INDIAN_POLICIES
        weights = (request.custom_weights.normalized() if request.custom_weights else DEFAULT_WEIGHTS)

        assumptions_made = []
        if not profile.annual_budget:
            assumptions_made.append(
                "Annual budget was not specified; affordability was evaluated using market benchmark rates."
            )
        if not profile.sum_insured_preference:
            assumptions_made.append(
                "Sum insured preference was not specified; defaulted to optimal ₹10,00,000 standard cover."
            )
        if not profile.pre_existing_conditions:
            assumptions_made.append(
                "No pre-existing diseases were declared; waiting period evaluation assumes standard health."
            )
        if profile.coverage_type == "family_floater" and not profile.family_members:
            assumptions_made.append(
                "Family floater was selected without dependent details; calculated for 2 adults (self + spouse)."
            )

        scored_candidates = []

        for p in policies:
            is_eligible, reason = self.passes_hard_filters(p, profile)
            if not is_eligible:
                logger.debug("Policy %s filtered out: %s", p.get("product_id"), reason)
                continue

            chosen_si = self.select_best_sum_insured(p, profile)
            est_premium = self.calculate_estimated_premium(p, profile, chosen_si)

            # Evaluate 5 categories
            aff_score, aff_detail = self.evaluate_affordability(p, profile, est_premium)
            cov_score, cov_detail = self.evaluate_coverage(p, profile, chosen_si)
            wp_score, wp_detail = self.evaluate_waiting_periods(p, profile)
            net_score, net_detail = self.evaluate_hospital_network(p, profile)
            terms_score, terms_detail = self.evaluate_terms(p, profile)

            # Weighted overall score (0 to 100)
            overall = (
                (aff_score / 30.0) * (weights["affordability"] * 100.0)
                + (cov_score / 25.0) * (weights["coverage"] * 100.0)
                + (wp_score / 20.0) * (weights["waiting_periods"] * 100.0)
                + (net_score / 15.0) * (weights["hospital_network"] * 100.0)
                + (terms_score / 10.0) * (weights["terms"] * 100.0)
            )

            # Check preference alignment
            unmet_prefs = []
            for pref in profile.feature_preferences:
                if pref == "no_room_rent_capping" and p.get("room_rent_type") != "no_capping":
                    unmet_prefs.append("Does not offer unrestricted room rent (capped to single private or 1%)")
                elif pref == "zero_copay" and p.get("copay_percentage", 0) > 0:
                    unmet_prefs.append(f"Includes a {p.get('copay_percentage')}% co-payment clause")
                elif pref == "shortest_ped_wait" and p.get("waiting_periods", {}).get("ped_months", 36) > 24:
                    unmet_prefs.append(f"PED waiting period is {p.get('waiting_periods', {}).get('ped_months')} months (not shortest available)")

            # Deduct slight penalty for unmet explicit preferences
            if unmet_prefs:
                overall = max(20.0, overall - (len(unmet_prefs) * 4.0))

            breakdown = MatchBreakdown(
                affordability_score=round(aff_score, 1),
                coverage_score=round(cov_score, 1),
                waiting_period_score=round(wp_score, 1),
                hospital_network_score=round(net_score, 1),
                terms_score=round(terms_score, 1),
                overall_score=round(min(100.0, overall), 1),
                scoring_details={
                    "affordability": aff_detail,
                    "coverage": cov_detail,
                    "waiting_periods": wp_detail,
                    "hospital_network": net_detail,
                    "terms": terms_detail,
                },
            )

            # Synthesize explainability paragraph
            why_text = self._build_why_recommended(p, profile, chosen_si, est_premium, breakdown)

            scored_candidates.append({
                "policy": p,
                "chosen_si": chosen_si,
                "est_premium": est_premium,
                "breakdown": breakdown,
                "overall_score": breakdown.overall_score,
                "why_text": why_text,
                "unmet_prefs": unmet_prefs,
            })

        # Sort by overall score descending
        scored_candidates.sort(key=lambda x: x["overall_score"], reverse=True)

        # Build response items
        top_items: List[PolicyRecommendationItem] = []
        runner_up_items: List[PolicyRecommendationItem] = []

        total_evaluated = len(scored_candidates)

        for idx, cand in enumerate(scored_candidates):
            p = cand["policy"]
            rank = idx + 1

            # Assign distinctive badge
            badge = None
            if rank == 1:
                badge = "Top Match"
            elif rank == 2:
                # If rank 2 is cheaper, label as Best Value
                if cand["est_premium"] < scored_candidates[0]["est_premium"]:
                    badge = "Best Value"
                else:
                    badge = p.get("best_for_tag", "Comprehensive Choice")
            elif rank == 3:
                badge = p.get("best_for_tag", "Recommended Alternative")
            else:
                badge = p.get("best_for_tag")

            wp = p.get("waiting_periods", {})
            waiting_summary = {
                "initial": f"{wp.get('initial_days', 30)} days (accidents covered Day 1)",
                "pre_existing": f"{wp.get('ped_months', 36)} months",
                "specific_illnesses": f"{wp.get('specific_illness_months', 24)} months",
            }

            item = PolicyRecommendationItem(
                product_id=p["product_id"],
                insurer_name=p["insurer_name"],
                product_name=p["product_name"],
                coverage_types=p.get("coverage_types", ["individual"]),
                recommended_sum_insured=cand["chosen_si"],
                estimated_annual_premium=cand["est_premium"],
                premium_type="indicative_estimate",
                premium_badge="Indicative Estimate",
                premium_notes="Calculated based on standard IRDAI rate filings for your age group and chosen sum insured. Excludes 18% GST.",
                overall_match_score=cand["overall_score"],
                rank=rank,
                badge=badge,
                why_recommended=cand["why_text"],
                key_benefits=p.get("key_benefits", []),
                waiting_periods_summary=waiting_summary,
                room_rent_summary=p.get("room_rent_desc", "Single Private AC Room"),
                copay_summary=p.get("copay_desc", "0% Co-Payment"),
                restoration_summary=p.get("restoration_benefit", "100% Restore"),
                network_hospitals_count=p.get("network_hospitals_count", 9000),
                key_limitations=p.get("key_exclusions", []),
                unmet_preferences=cand["unmet_prefs"],
                match_breakdown=cand["breakdown"],
                official_brochure_url=p.get("official_brochure_url"),
                verification_status=p.get("verification_status", "verified_catalog"),
                quote_source_link=p.get("quote_source_link"),
            )

            if rank <= 3:
                top_items.append(item)
            else:
                runner_up_items.append(item)

        disclaimer = (
            "InsureAI is an educational and analytical recommendation engine, not an insurance broker or insurer. "
            "Premium figures shown are indicative estimates derived from standard IRDAI filings and do not include 18% GST. "
            "Actual underwriting quotes may vary based on individual medical declarations and location. "
            "Always verify official policy wordings and customer information sheets (CIS) on the insurer's portal before purchasing."
        )

        return RecommendationResponse(
            success=True,
            user_profile_summary={
                "age": profile.age,
                "coverage_type": profile.coverage_type,
                "family_members_count": len(profile.family_members),
                "requested_sum_insured": profile.sum_insured_preference,
                "budget": profile.annual_budget,
                "city_tier": profile.city_tier,
                "pre_existing_conditions": profile.pre_existing_conditions,
            },
            assumptions_made=assumptions_made,
            top_recommendations=top_items,
            runner_up_recommendations=runner_up_items[:3],  # Keep up to 3 runner ups
            total_eligible_evaluated=total_evaluated,
            scoring_weights=weights,
            disclaimer=disclaimer,
        )

    def _build_why_recommended(
        self,
        policy: Dict[str, Any],
        profile: UserProfile,
        chosen_si: float,
        est_premium: float,
        breakdown: MatchBreakdown,
    ) -> str:
        """Construct an explainable, personalized rationale for why this policy was chosen."""
        reasons = []

        # Affordability rationale
        if profile.annual_budget and est_premium <= profile.annual_budget:
            savings = profile.annual_budget - est_premium
            reasons.append(f"fits well within your ₹{profile.annual_budget:,.0f} budget at ₹{est_premium:,.0f}/yr")
        else:
            reasons.append(f"offers competitive value at ~₹{est_premium:,.0f}/yr for ₹{(chosen_si/100000):.1f} Lakhs coverage")

        # PED rationale
        ped_months = policy.get("waiting_periods", {}).get("ped_months", 36)
        if profile.pre_existing_conditions:
            reasons.append(f"provides a {ped_months}-month waiting window for pre-existing conditions")
        elif ped_months <= 24:
            reasons.append(f"features a shorter {ped_months}-month pre-existing disease waiting clause")

        # Room rent & copay rationale
        if policy.get("room_rent_type") == "no_capping":
            reasons.append("has zero room rent restrictions to prevent surprise out-of-pocket hospital deductions")
        if policy.get("copay_percentage", 0) == 0:
            reasons.append("comes with zero mandatory co-payment")

        # Network
        net = policy.get("network_hospitals_count", 0)
        if net >= 12000:
            reasons.append(f"gives you access to over {net:,} cashless hospitals across India")

        return f"{policy['product_name']} from {policy['insurer_name']} is recommended because it " + ", ".join(reasons) + "."


recommendation_engine = RecommendationEngine()
