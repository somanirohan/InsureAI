"""
Rate Card Service for InsureAI.
Loads authoritative CGHS hospital treatment rate card data (1750+ treatments/investigations)
and provides intelligent fuzzy search, synonym matching, and tiered lookup capabilities for cost estimation.
"""

from __future__ import annotations

import json
import logging
import re
from pathlib import Path
from typing import Any, Dict, List, Optional
from difflib import SequenceMatcher

logger = logging.getLogger("insureai.ratecard")

# Resolve rate card JSON path
_DATA_DIR = Path(__file__).resolve().parent.parent / "data"
RATE_CARD_PATH = _DATA_DIR / "rate_card.json"

# Common medical clinical synonyms and acronyms
SYNONYMS: Dict[str, List[str]] = {
    "gallbladder": ["cholecystectomy", "cholecystostomy"],
    "gall bladder": ["cholecystectomy"],
    "gallbladder removal": ["cholecystectomy"],
    "c-section": ["cesarean section", "cesarean"],
    "c section": ["cesarean section", "cesarean"],
    "caesarean": ["cesarean section", "cesarean"],
    "caesarean section": ["cesarean section"],
    "cesarean delivery": ["cesarean section"],
    "appendix": ["appendicectomy"],
    "appendix removal": ["appendicectomy"],
    "appendectomy": ["appendicectomy"],
    "tkr": ["total knee replacement", "knee replacement", "total knee joint replacement"],
    "knee replacement": ["total knee replacement", "total knee joint replacement"],
    "thr": ["total hip replacement", "hip replacement"],
    "hip replacement": ["total hip replacement"],
    "cabg": ["coronary artery bypass graft", "coronary artery bypass"],
    "bypass surgery": ["coronary artery bypass graft", "cabg"],
    "heart bypass": ["coronary artery bypass graft", "cabg"],
    "open heart surgery": ["coronary artery bypass graft", "cabg"],
    "angioplasty": ["balloon coronary angioplasty", "ptca", "angioplasty"],
    "heart stent": ["balloon coronary angioplasty", "stenting"],
    "coronary stent": ["balloon coronary angioplasty"],
    "stenting": ["balloon coronary angioplasty", "stent"],
    "rct": ["root canal treatment"],
    "root canal": ["root canal treatment", "rct"],
    "mri brain": ["mri head", "mri brain"],
    "brain mri": ["mri head", "mri brain"],
    "ct brain": ["ct head", "ct brain"],
    "brain ct": ["ct head", "ct brain"],
    "dialysis": ["hemodialysis", "peritoneal dialysis"],
    "kidney dialysis": ["hemodialysis", "dialysis"],
    "normal delivery": ["normal delivery"],
    "child birth": ["normal delivery"],
    "kidney stone": ["lithotripsy", "pyelolithotomy", "nephrolithotomy"],
    "kidney stones": ["lithotripsy", "pyelolithotomy", "nephrolithotomy"],
    "piles": ["piles", "haemorrhoidectomy", "hemorrhoids"],
    "hemorrhoids": ["haemorrhoidectomy", "piles"],
    "piles surgery": ["haemorrhoidectomy", "piles banding"],
    "tonsils": ["tonsillectomy"],
    "tonsils removal": ["tonsillectomy"],
    "pacemaker": ["permanent pacemaker implantation", "pacemaker"],
    "chemo": ["chemotherapy"],
    "chemo cycle": ["chemotherapy"],
    "colonoscopy": ["colonoscopy", "diagnostic colonoscopy", "colonic"],
}


class RateCardService:
    """
    Loads the CGHS hospital rate card and provides:
    - Fuzzy search by treatment name with clinical synonym expansion
    - Exact lookup by serial number
    - Category-based filtering across 30+ medical specialties
    - Hospital tier pricing (NABH / Non-NABH / Tier 2 blended)
    """

    def __init__(self):
        self._treatments: List[Dict[str, Any]] = []
        self._categories: List[str] = []
        self._loaded = False
        self._load_data()

    def _load_data(self):
        """Load rate card JSON file."""
        if not RATE_CARD_PATH.exists():
            logger.warning("Rate card file not found at %s", RATE_CARD_PATH)
            return

        try:
            with open(RATE_CARD_PATH, "r", encoding="utf-8") as f:
                self._treatments = json.load(f)
            self._categories = sorted(set(t["category"] for t in self._treatments))
            self._loaded = True
            logger.info(
                "Loaded rate card: %d treatments in %d categories",
                len(self._treatments),
                len(self._categories),
            )
        except Exception as exc:
            logger.exception("Failed to load rate card: %s", exc)

    @property
    def is_loaded(self) -> bool:
        return self._loaded

    @property
    def total_treatments(self) -> int:
        return len(self._treatments)

    @property
    def categories(self) -> List[str]:
        return self._categories

    def _normalize(self, text: str) -> str:
        """Normalize text: lower, replace punctuations, collapse whitespace."""
        text = text.lower().replace("-", " ").replace("/", " ").replace("(", " ").replace(")", " ")
        return re.sub(r"\s+", " ", text).strip()

    def _score_single_query(self, query_norm: str, name_norm: str) -> float:
        """Score a single query variant against a treatment name."""
        if not query_norm or not name_norm:
            return 0.0

        if query_norm == name_norm:
            return 1.0

        q_words = [w for w in query_norm.split() if w]
        n_words = [w for w in name_norm.split() if w]
        q_set = set(q_words)
        n_set = set(n_words)

        # 1. Exact phrase substring match
        if query_norm in name_norm:
            return 0.95

        # 2. All query words present in name
        if q_set.issubset(n_set):
            return 0.93

        # 3. Acronym / abbreviation match (e.g. CABG, TKR, RCT, PTCA)
        name_acronym = "".join(w[0] for w in n_words if w)
        if query_norm.upper() == name_acronym.upper() or query_norm in n_set:
            return 0.92

        # 4. Token overlap + SequenceMatcher
        overlap = len(q_set & n_set)
        if overlap > 0:
            overlap_ratio = overlap / len(q_set)
            sim = SequenceMatcher(None, query_norm, name_norm).ratio()
            return max(overlap_ratio * 0.90, sim)

        # 5. Fuzzy string similarity
        sim = SequenceMatcher(None, query_norm, name_norm).ratio()
        return sim if sim >= 0.5 else 0.0

    def search_treatments(
        self,
        query: str,
        category: Optional[str] = None,
        limit: int = 20,
        min_score: float = 0.35,
    ) -> List[Dict[str, Any]]:
        """
        Fuzzy search treatments by name with clinical synonym expansion.
        Returns ranked results with relevance scores and rate information.
        """
        if not self._loaded or not query:
            return []

        q_norm = self._normalize(query)
        queries_to_try = [q_norm]

        # Expand with synonyms
        for term, syns in SYNONYMS.items():
            if term in q_norm or q_norm in term:
                for s in syns:
                    s_norm = self._normalize(s)
                    if s_norm not in queries_to_try:
                        queries_to_try.append(s_norm)

        results = []
        for t in self._treatments:
            if category and self._normalize(t["category"]) != self._normalize(category):
                continue

            name = t["treatment_name"]
            name_norm = self._normalize(name)

            best_score = 0.0
            for q_variant in queries_to_try:
                score = self._score_single_query(q_variant, name_norm)
                if score > best_score:
                    best_score = score

            if best_score >= min_score:
                results.append({
                    **t,
                    "relevance_score": round(best_score, 3),
                })

        # Sort by relevance score descending, then by serial number
        results.sort(key=lambda r: (-r["relevance_score"], r["sr_no"]))
        return results[:limit]

    def get_treatment_by_sr_no(self, sr_no: int) -> Optional[Dict[str, Any]]:
        """Look up a treatment by its serial number."""
        for t in self._treatments:
            if t["sr_no"] == sr_no:
                return t
        return None

    def get_treatments_by_category(self, category: str) -> List[Dict[str, Any]]:
        """Get all treatments in a category."""
        cat_norm = self._normalize(category)
        return [t for t in self._treatments if self._normalize(t["category"]) == cat_norm]

    def get_rate_for_treatment(
        self,
        treatment_name: str,
        hospital_tier: str = "tier_1",
    ) -> Optional[Dict[str, Any]]:
        """
        Get the best matching rate for a treatment name.
        Maps hospital tiers to rates:
          - tier_1 (Metro / NABH Accredited): Uses NABH rate
          - tier_2 (Non-Metro / Private):     Uses blended average of NABH & Non-NABH
          - tier_3 (District / Semi-Urban):   Uses Non-NABH rate
        
        Returns the matched treatment metadata with the calculated rate.
        """
        results = self.search_treatments(treatment_name, limit=1, min_score=0.4)
        if not results:
            return None

        best = results[0]
        nabh_rate = best["nabh_rate"]
        non_nabh_rate = best["non_nabh_rate"]

        if hospital_tier == "tier_1":
            rate = nabh_rate
        elif hospital_tier == "tier_2":
            rate = round((nabh_rate + non_nabh_rate) / 2)
        else:  # tier_3
            rate = non_nabh_rate

        return {
            "matched_treatment": best["treatment_name"],
            "sr_no": best["sr_no"],
            "category": best["category"],
            "rate": rate,
            "nabh_rate": nabh_rate,
            "non_nabh_rate": non_nabh_rate,
            "relevance_score": best["relevance_score"],
            "source_page": best["page"],
            "rate_source": "CGHS Rate Card (Delhi/NCR)",
        }

    def get_all_rates_for_treatment(
        self,
        treatment_name: str,
    ) -> Optional[Dict[str, Any]]:
        """
        Get rate card rates across all tiers for a treatment.
        """
        results = self.search_treatments(treatment_name, limit=1, min_score=0.4)
        if not results:
            return None

        best = results[0]
        nabh = best["nabh_rate"]
        non_nabh = best["non_nabh_rate"]

        return {
            "matched_treatment": best["treatment_name"],
            "sr_no": best["sr_no"],
            "category": best["category"],
            "tier_1": nabh,
            "tier_2": round((nabh + non_nabh) / 2),
            "tier_3": non_nabh,
            "nabh_rate": nabh,
            "non_nabh_rate": non_nabh,
            "relevance_score": best["relevance_score"],
            "source_page": best["page"],
        }


# Singleton instance
rate_card_service = RateCardService()
