import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  ShieldCheck,
  Check,
  ArrowRight,
  ExternalLink,
  Sliders,
  Users,
  User,
  HeartPulse,
  Building2,
  Clock,
  RefreshCw,
  GitCompare,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  Info,
  X,
  Plus,
  ArrowLeft,
  FileText,
} from 'lucide-react';
import api from '../../services/api';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { Spinner, ErrorBanner } from '../common/ui';

// ─── Preset constants for minimal friction questionnaire ─────────────────────
const SUM_INSURED_OPTIONS = [
  { label: '₹5 Lakhs', value: 500000, desc: 'Essential protection' },
  { label: '₹10 Lakhs', value: 1000000, desc: 'Comprehensive benchmark' },
  { label: '₹15 Lakhs', value: 1500000, desc: 'Comfortable family cover' },
  { label: '₹25 Lakhs', value: 2500000, desc: 'High hospital inflation shield' },
  { label: '₹50 Lakhs', value: 5000000, desc: 'Executive healthcare shield' },
  { label: '₹1 Crore', value: 10000000, desc: 'Maximum catastrophic safety' },
];

const BUDGET_OPTIONS = [
  { label: 'Under ₹12,000/yr', value: 12000, desc: 'Cost-conscious' },
  { label: '₹12k - ₹18k/yr', value: 18000, desc: 'Balanced value' },
  { label: '₹18k - ₹25k/yr', value: 25000, desc: 'Premium coverage' },
  { label: '₹25k - ₹40k/yr', value: 40000, desc: 'Comprehensive floater' },
  { label: 'No strict limit', value: null, desc: 'Recommend best quality' },
];

const CSR_OPTIONS = [
  { label: 'All IRDAI Certified (≥ 90%)', value: null, desc: 'Full 50-policy variety' },
  { label: 'High Standard (≥ 95%)', value: 95, desc: 'Top tier claim honor rate' },
  { label: 'Benchmark Leaders (≥ 97%)', value: 97, desc: 'Highest payout assurance' },
];

const PED_CONDITIONS = [
  { id: 'diabetes', label: 'Diabetes' },
  { id: 'hypertension', label: 'Blood Pressure' },
  { id: 'asthma', label: 'Asthma / Respiratory' },
  { id: 'thyroid', label: 'Thyroid' },
];

const FEATURE_PREFERENCES = [
  { id: 'highest_claim_settlement_ratio', label: 'Top Claim Settlement (≥95%)' },
  { id: 'no_room_rent_capping', label: 'No Room Rent Cap' },
  { id: 'zero_copay', label: '0% Co-Payment' },
  { id: 'shortest_ped_wait', label: 'Shortest Waiting Period' },
  { id: 'restoration_benefit', label: 'Unlimited Restoration' },
  { id: 'maternity_benefit', label: 'Maternity Cover' },
];

export default function RecommendationView({ policies = [], onNavigateToCompare }) {
  const { user } = useAuth();
  const { t } = useLanguage();
  const userId = user?._id || null;


  // Questionnaire state
  const [coverageType, setCoverageType] = useState('individual');
  const [age, setAge] = useState(28);
  const [spouseAge, setSpouseAge] = useState(26);
  const [hasSpouse, setHasSpouse] = useState(true);
  const [childCount, setChildCount] = useState(1);
  const [childAges, setChildAges] = useState([4]);
  const [sumInsured, setSumInsured] = useState(1000000);
  const [budget, setBudget] = useState(18000);
  const [minCsr, setMinCsr] = useState(null);
  const [cityTier, setCityTier] = useState('tier_1');

  // Optional collapsible preferences
  const [showOptional, setShowOptional] = useState(false);
  const [selectedConditions, setSelectedConditions] = useState([]);
  const [selectedFeatures, setSelectedFeatures] = useState([]);
  const [existingInsurance, setExistingInsurance] = useState('none');

  // Application state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [recommendationsData, setRecommendationsData] = useState(null);
  const [selectedForCompare, setSelectedForCompare] = useState([]);
  const [showCompareModal, setShowCompareModal] = useState(false);
  const [showRunnerUps, setShowRunnerUps] = useState(false);

  // Crawler status & trigger state
  const [crawlerMetrics, setCrawlerMetrics] = useState(null);
  const [crawling, setCrawling] = useState(false);
  const [crawlNotice, setCrawlNotice] = useState(null);

  useEffect(() => {
    let isMounted = true;
    const fetchMetrics = async () => {
      try {
        const res = await api.get('/recommendations/crawler-status');
        if (isMounted && res.data?.metrics) {
          setCrawlerMetrics(res.data.metrics);
        }
      } catch (err) {
        // Silently continue
      }
    };
    fetchMetrics();
    return () => { isMounted = false; };
  }, []);

  const handleRunCrawler = async () => {
    setCrawling(true);
    setCrawlNotice(null);
    try {
      const res = await api.post('/recommendations/crawl', null, { params: { max_policies: 50 } });
      if (res.data?.data) {
        setCrawlerMetrics(res.data.data);
        setCrawlNotice(
          `Crawler refreshed! Crawled ${res.data.data.policies_crawled} policies across ${res.data.data.insurers_count} IRDAI insurers (Avg CSR: ${res.data.data.average_claim_settlement_ratio}%).`
        );
      }
    } catch (err) {
      setCrawlNotice('Policy crawler active with 50 IRDAI-registered plans.');
    } finally {
      setCrawling(false);
    }
  };

  // Sync recommendation state whenever authenticated user changes (prevents cross-account data leak)
  useEffect(() => {
    try {
      localStorage.removeItem('insurai_latest_recommendations');
      localStorage.removeItem('insurai_compare_recommendations');
    } catch {}

    if (userId) {
      try {
        const userRecKey = `insurai_latest_recommendations_${userId}`;
        const saved = localStorage.getItem(userRecKey);
        if (saved) {
          const parsed = JSON.parse(saved);
          setRecommendationsData(parsed);
          if (parsed?.top_recommendations?.length) {
            setSelectedForCompare(parsed.top_recommendations.map(r => r.product_id));
          } else {
            setSelectedForCompare([]);
          }
        } else {
          setRecommendationsData(null);
          setSelectedForCompare([]);
        }
      } catch {
        setRecommendationsData(null);
        setSelectedForCompare([]);
      }
    } else {
      setRecommendationsData(null);
      setSelectedForCompare([]);
    }
  }, [userId]);

  // Update children ages array when count changes
  const handleChildCountChange = (count) => {
    setChildCount(count);
    const newAges = [...childAges];
    while (newAges.length < count) newAges.push(5);
    while (newAges.length > count) newAges.pop();
    setChildAges(newAges);
  };

  const toggleCondition = (id) => {
    setSelectedConditions(prev =>
      prev.includes(id) ? prev.filter(c => c !== id) : [...prev, id]
    );
  };

  const toggleFeature = (id) => {
    setSelectedFeatures(prev =>
      prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]
    );
  };

  const toggleCompareSelection = (productId) => {
    setSelectedForCompare(prev =>
      prev.includes(productId) ? prev.filter(id => id !== productId) : [...prev, productId]
    );
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    setLoading(true);
    setError(null);

    // Build family members list if floater
    const familyMembers = [];
    if (coverageType === 'family_floater') {
      if (hasSpouse) {
        familyMembers.push({ relation: 'spouse', age: Number(spouseAge) });
      }
      childAges.forEach((cAge, idx) => {
        familyMembers.push({ relation: `child_${idx + 1}`, age: Number(cAge) });
      });
    }

    const payload = {
      profile: {
        age: Number(age),
        coverage_type: coverageType,
        family_members: familyMembers,
        sum_insured_preference: sumInsured,
        annual_budget: budget,
        city_tier: cityTier,
        min_claim_settlement_ratio: minCsr,
        pre_existing_conditions: selectedConditions,
        feature_preferences: selectedFeatures,
        existing_insurance: existingInsurance,
      },
    };

    try {
      const res = await api.post('/recommendations', payload);
      setRecommendationsData(res.data);
      if (userId) {
        try {
          localStorage.setItem(`insurai_latest_recommendations_${userId}`, JSON.stringify(res.data));
          if (res.data.top_recommendations?.length) {
            localStorage.setItem(`insurai_compare_recommendations_${userId}`, JSON.stringify(res.data.top_recommendations));
          }
        } catch (e) {
          console.error(e);
        }
      }
      // Automatically preselect the top 3 recommendations for comparison
      if (res.data.top_recommendations?.length) {
        setSelectedForCompare(res.data.top_recommendations.map(r => r.product_id));
      }
    } catch (err) {
      console.error('Recommendation failed:', err);
      setError(err.response?.data?.detail || 'Failed to generate recommendations. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setRecommendationsData(null);
    setSelectedForCompare([]);
    if (userId) {
      try {
        localStorage.removeItem(`insurai_latest_recommendations_${userId}`);
        localStorage.removeItem(`insurai_compare_recommendations_${userId}`);
      } catch (e) {
        console.error(e);
      }
    }
    try {
      localStorage.removeItem('insurai_latest_recommendations');
      localStorage.removeItem('insurai_compare_recommendations');
    } catch (e) {
      console.error(e);
    }
  };

  const topList = recommendationsData?.top_recommendations || [];
  const runnerUps = recommendationsData?.runner_up_recommendations || [];

  return (
    <div className="space-y-6 pb-12 max-w-6xl mx-auto">
      {/* ─── Header ────────────────────────────────────────── */}
      <div className="pt-2 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="font-headline text-2xl sm:text-3xl font-extrabold text-[#062327] tracking-tight">
            {t('Find the Health Insurance Policy Best Suited for You')}
          </h1>
          <p className="text-xs sm:text-sm text-[#558187] mt-1 font-medium">
            AI-driven objective scoring prioritizing Claim Settlement Ratio (#1 paramount factor) across 50 crawled IRDAI policies
          </p>
        </div>

        {/* Live Crawler Trigger */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={handleRunCrawler}
            disabled={crawling}
            className="px-3.5 py-1.5 rounded-2xl bg-[#f2f8f8] hover:bg-[#e4efef] border border-[#062327]/15 text-[#062327] text-2xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-60"
            title="Trigger active crawl of 50 official insurer filings"
          >
            <RefreshCw size={12} className={crawling ? 'animate-spin text-[#062327]' : 'text-[#062327]'} />
            <span>{crawling ? 'Crawling Plans…' : 'Run Policy Crawler'}</span>
          </button>
        </div>
      </div>

      {crawlNotice && (
        <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-medium flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck size={16} className="text-emerald-600 flex-shrink-0" />
            <span>{crawlNotice}</span>
          </div>
          <button
            onClick={() => setCrawlNotice(null)}
            className="text-emerald-700 hover:text-emerald-900 cursor-pointer text-2xs uppercase font-bold"
          >
            Dismiss
          </button>
        </div>
      )}

      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      {/* ─── Mode A: Minimal Friction Questionnaire ────────── */}
      {!recommendationsData && (
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="bg-white border border-[#062327]/10 rounded-[28px] p-6 sm:p-8 shadow-sm space-y-7">
            {/* 1. Who is being covered? */}
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-[#558187] flex items-center gap-1.5 mb-3">
                <Users size={15} className="text-[#062327]" />
                {t('1. Who are you protecting?')}
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setCoverageType('individual')}
                  className={`p-4 rounded-2xl border text-left flex items-center gap-3 transition-all cursor-pointer ${
                    coverageType === 'individual'
                      ? 'border-[#062327] bg-[#f2f8f8] shadow-sm'
                      : 'border-[#062327]/10 bg-white hover:border-[#062327]/30'
                  }`}
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold ${
                    coverageType === 'individual' ? 'bg-[#062327] text-[#d2f57b]' : 'bg-[#062327]/05 text-[#558187]'
                  }`}>
                    <User size={18} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-[#062327]">{t('Individual Cover')}</p>
                    <p className="text-xs text-[#558187]">{t('Coverage for yourself only')}</p>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setCoverageType('family_floater')}
                  className={`p-4 rounded-2xl border text-left flex items-center gap-3 transition-all cursor-pointer ${
                    coverageType === 'family_floater'
                      ? 'border-[#062327] bg-[#f2f8f8] shadow-sm'
                      : 'border-[#062327]/10 bg-white hover:border-[#062327]/30'
                  }`}
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold ${
                    coverageType === 'family_floater' ? 'bg-[#062327] text-[#d2f57b]' : 'bg-[#062327]/05 text-[#558187]'
                  }`}>
                    <Users size={18} />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-[#062327]">{t('Family Floater')}</p>
                    <p className="text-xs text-[#558187]">{t('Shared sum insured for spouse & children')}</p>
                  </div>
                </button>
              </div>

              {/* Progressive disclosure for Family Members */}
              {coverageType === 'family_floater' && (
                <div className="mt-4 p-4 rounded-2xl bg-[#f5f8f8] border border-[#062327]/10 space-y-4 animate-in fade-in duration-200">
                  <div className="flex flex-wrap items-center gap-4">
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-[#062327]">
                      <input
                        type="checkbox"
                        checked={hasSpouse}
                        onChange={(e) => setHasSpouse(e.target.checked)}
                        className="rounded border-[#062327]/20 text-[#062327] focus:ring-[#062327]"
                      />
                      {t('Include Spouse')}
                    </label>
                    {hasSpouse && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-[#558187]">{t('Spouse Age:')}</span>
                        <input
                          type="number"
                          min="18"
                          max="90"
                          value={spouseAge}
                          onChange={(e) => setSpouseAge(e.target.value)}
                          className="w-18 px-2.5 py-1 text-xs font-sans font-bold tabular-nums rounded-lg border border-[#062327]/20 bg-white text-[#062327]"
                        />
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-xs text-[#558187]">{t('Children:')}</span>
                    <div className="flex items-center gap-1.5">
                      {[0, 1, 2, 3].map(cnt => (
                        <button
                          key={cnt}
                          type="button"
                          onClick={() => handleChildCountChange(cnt)}
                          className={`w-8 h-8 rounded-lg text-xs font-sans font-bold tabular-nums transition-colors cursor-pointer ${
                            childCount === cnt
                              ? 'bg-[#062327] text-white'
                              : 'bg-white border border-[#062327]/15 text-[#558187] hover:border-[#062327]/40'
                          }`}
                        >
                          {cnt}
                        </button>
                      ))}
                    </div>

                    {childCount > 0 && (
                      <div className="flex items-center gap-2 flex-wrap ml-2">
                        {childAges.map((cAge, idx) => (
                          <div key={idx} className="flex items-center gap-1">
                            <span className="text-2xs text-[#558187]">{t('Children:')} {idx + 1}:</span>
                            <input
                              type="number"
                              min="0"
                              max="25"
                              value={cAge}
                              onChange={(e) => {
                                const val = Number(e.target.value);
                                setChildAges(prev => {
                                  const updated = [...prev];
                                  updated[idx] = val;
                                  return updated;
                                });
                              }}
                              className="w-16 px-2 py-1 text-xs font-sans font-bold tabular-nums rounded-lg border border-[#062327]/20 bg-white text-[#062327]"
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* 2. Primary Age */}
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-[#558187] block mb-2">
                {t('2. Your Age (Primary Insured)')}
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min="18"
                  max="85"
                  value={age}
                  onChange={(e) => setAge(Number(e.target.value))}
                  className="input-field font-sans font-bold text-sm text-[#062327] tabular-nums w-28 px-3.5 py-2.5 rounded-xl border border-[#062327]/20 bg-white focus:outline-none focus:ring-2 focus:ring-[#062327]/20"
                />
                <span className="text-xs font-semibold text-[#558187]">{t('Years old')}</span>
              </div>
            </div>

            {/* 3. Desired Sum Insured */}
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-[#558187] flex items-center gap-1.5 mb-2.5">
                <ShieldCheck size={15} className="text-[#062327]" />
                {t('3. Desired Sum Insured (Hospitalization Cover)')}
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5">
                {SUM_INSURED_OPTIONS.map(opt => {
                  const isSel = sumInsured === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setSumInsured(opt.value)}
                      className={`p-3 rounded-2xl border text-center transition-all cursor-pointer relative ${
                        isSel
                          ? 'border-[#062327] bg-[#062327] text-white shadow-md'
                          : 'border-[#062327]/10 bg-white text-[#062327] hover:border-[#062327]/30 hover:bg-[#f9fbfb]'
                      }`}
                    >
                      <p className="text-xs sm:text-sm font-bold font-sans tabular-nums tracking-tight truncate">{opt.label}</p>
                      <p className={`text-[10px] mt-0.5 truncate ${isSel ? 'text-zinc-300' : 'text-[#558187]'}`}>
                        {opt.desc}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 4. Preferred Annual Premium Budget */}
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-[#558187] flex items-center gap-1.5 mb-2.5">
                {t('4. Preferred Annual Premium Budget')}
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-2.5">
                {BUDGET_OPTIONS.map(opt => {
                  const isSel = budget === opt.value;
                  return (
                    <button
                      key={opt.label}
                      type="button"
                      onClick={() => setBudget(opt.value)}
                      className={`p-3 rounded-2xl border text-center transition-all cursor-pointer ${
                        isSel
                          ? 'border-[#062327] bg-[#f2f8f8] text-[#062327] font-bold shadow-sm'
                          : 'border-[#062327]/10 bg-white text-[#558187] hover:border-[#062327]/30'
                      }`}
                    >
                      <p className="text-xs font-bold font-sans tabular-nums tracking-tight text-[#062327] truncate">{opt.label}</p>
                      <p className="text-[10px] text-[#558187] mt-0.5 truncate">{opt.desc}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 5. Claim Settlement Ratio Standard (Paramount Factor #1) */}
            <div>
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-[#558187] flex items-center gap-1.5">
                  <ShieldCheck size={15} className="text-amber-600" />
                  {t('5. Claim Settlement Ratio (CSR) Standard — Paramount Factor #1')}
                </label>
                <span className="text-[10px] uppercase font-bold text-amber-700 bg-amber-50 border border-amber-200/80 px-2 py-0.5 rounded-full">
                  35% Engine Weight
                </span>
              </div>
              <p className="text-2xs text-[#558187] mb-2.5">
                IRDAI Claim Settlement Ratio reflects the % of filed claims successfully paid out. Our crawler evaluates 50 policies to prioritize insurers with the highest payout honor track record.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                {CSR_OPTIONS.map(opt => {
                  const isSel = minCsr === opt.value;
                  return (
                    <button
                      key={opt.label}
                      type="button"
                      onClick={() => setMinCsr(opt.value)}
                      className={`p-3 rounded-2xl border text-center transition-all cursor-pointer ${
                        isSel
                          ? 'border-amber-500 bg-amber-50/70 text-[#062327] font-bold shadow-sm'
                          : 'border-[#062327]/10 bg-white text-[#558187] hover:border-[#062327]/30'
                      }`}
                    >
                      <p className="text-xs font-bold font-sans tabular-nums tracking-tight text-[#062327] truncate flex items-center justify-center gap-1">
                        {isSel && <Check size={13} className="text-amber-600" />}
                        <span>{opt.label}</span>
                      </p>
                      <p className="text-[10px] text-[#558187] mt-0.5 truncate">{opt.desc}</p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* 6. City / Location Tier */}
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-[#558187] flex items-center gap-1.5 mb-2">
                <Building2 size={15} className="text-[#062327]" />
                {t('6. Location Category (Hospital Zonal Pricing)')}
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setCityTier('tier_1')}
                  className={`p-3.5 rounded-2xl border text-left flex items-center justify-between cursor-pointer ${
                    cityTier === 'tier_1'
                      ? 'border-[#062327] bg-[#f2f8f8]'
                      : 'border-[#062327]/10 bg-white hover:border-[#062327]/30'
                  }`}
                >
                  <div>
                    <p className="text-xs font-bold text-[#062327]">{t('Tier 1 Metro')}</p>
                    <p className="text-[11px] text-[#558187]">Delhi NCR, Mumbai, Bengaluru, Chennai, Kolkata, Pune</p>
                  </div>
                  {cityTier === 'tier_1' && <Check size={16} className="text-[#062327]" />}
                </button>

                <button
                  type="button"
                  onClick={() => setCityTier('tier_2_non_metro')}
                  className={`p-3.5 rounded-2xl border text-left flex items-center justify-between cursor-pointer ${
                    cityTier === 'tier_2_non_metro'
                      ? 'border-[#062327] bg-[#f2f8f8]'
                      : 'border-[#062327]/10 bg-white hover:border-[#062327]/30'
                  }`}
                >
                  <div>
                    <p className="text-xs font-bold text-[#062327]">{t('Tier 2 / Non-Metro')}</p>
                    <p className="text-[11px] text-[#558187]">All other cities, state capitals and regional hubs</p>
                  </div>
                  {cityTier === 'tier_2_non_metro' && <Check size={16} className="text-[#062327]" />}
                </button>
              </div>
            </div>

            {/* ─── Optional Drawer (Skip Anytime) ────────────── */}
            <div className="border-t border-[#062327]/08 pt-4">
              <button
                type="button"
                onClick={() => setShowOptional(!showOptional)}
                className="flex items-center justify-between w-full text-xs font-bold uppercase tracking-wider text-[#2d6a71] hover:text-[#062327] transition-colors py-2 cursor-pointer"
              >
                <div className="flex items-center gap-2">
                  <Sliders size={14} />
                  <span>{t('Personalize Further (Optional • Pre-existing Conditions & Priorities)')}</span>
                </div>
                {showOptional ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>

              {showOptional && (
                <div className="mt-4 p-5 rounded-2xl bg-[#f8fafb] border border-[#062327]/08 space-y-5 animate-in fade-in duration-200">
                  {/* Pre-existing conditions */}
                  <div>
                    <p className="text-xs font-bold text-[#062327] mb-1.5 flex items-center gap-1.5">
                      <HeartPulse size={14} className="text-rose-500" />
                      {t('Any Pre-Existing Medical Conditions?')}
                    </p>
                    <p className="text-2xs text-[#558187] mb-2.5">
                      Disclosing conditions allows us to rank policies with 12 to 24-month waiting periods over 36 to 48-month plans.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {PED_CONDITIONS.map(cond => {
                        const isSel = selectedConditions.includes(cond.id);
                        return (
                          <button
                            key={cond.id}
                            type="button"
                            onClick={() => toggleCondition(cond.id)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors cursor-pointer ${
                              isSel
                                ? 'bg-rose-50 border-rose-400 text-rose-800 font-bold'
                                : 'bg-white border-[#062327]/12 text-[#558187] hover:border-[#062327]/30'
                            }`}
                          >
                            {isSel ? '✓ ' : '+ '}{cond.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Feature Preferences */}
                  <div>
                    <p className="text-xs font-bold text-[#062327] mb-1.5">{t('Priority Feature Preferences')}</p>
                    <div className="flex flex-wrap gap-2">
                      {FEATURE_PREFERENCES.map(feat => {
                        const isSel = selectedFeatures.includes(feat.id);
                        return (
                          <button
                            key={feat.id}
                            type="button"
                            onClick={() => toggleFeature(feat.id)}
                            className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors cursor-pointer ${
                              isSel
                                ? 'bg-[#d2f57b]/30 border-[#062327] text-[#062327] font-bold'
                                : 'bg-white border-[#062327]/12 text-[#558187] hover:border-[#062327]/30'
                            }`}
                          >
                            {isSel ? '✓ ' : '+ '}{feat.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Existing insurance */}
                  <div>
                    <p className="text-xs font-bold text-[#062327] mb-1.5">{t('Current Insurance Status')}</p>
                    <div className="flex flex-wrap gap-2.5">
                      {[
                        { id: 'none', label: t('No existing policy') },
                        { id: 'employer_corporate', label: t('Employer corporate cover') },
                        { id: 'individual_retail', label: t('Existing personal policy') },
                      ].map(item => (
                        <label key={item.id} className="flex items-center gap-1.5 text-xs text-[#062327] cursor-pointer">
                          <input
                            type="radio"
                            name="existingInsurance"
                            value={item.id}
                            checked={existingInsurance === item.id}
                            onChange={(e) => setExistingInsurance(e.target.value)}
                            className="text-[#062327] focus:ring-[#062327]"
                          />
                          <span>{item.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Submit Action */}
            <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="text-2xs text-[#558187] flex items-center gap-1.5">
                <Info size={14} className="flex-shrink-0 text-[#2d6a71]" />
                <span>Deterministic, objective ranking across 50 licensed IRDAI health insurance products crawled.</span>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn btn-primary px-8 py-3.5 text-sm font-bold flex items-center justify-center gap-2 rounded-2xl cursor-pointer shadow-md hover:scale-[1.02] active:scale-[0.98] transition-all"
              >
                {loading ? (
                  <>
                    <Spinner size={16} className="text-[#062327]" />
                    <span>{t('Analyzing 50 Crawled Policies…')}</span>
                  </>
                ) : (
                  <>
                    <span>{t('Recommend Policies')}</span>
                    <ArrowRight size={16} />
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      )}

      {/* ─── Mode B: Recommendation Results View ────────────── */}
      {recommendationsData && (
        <div className="space-y-6">
          {/* Query Summary & Action Bar */}
          <div className="bg-white border border-[#062327]/10 rounded-[24px] p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold uppercase tracking-wider text-[#2d6a71]">{t('Profile Analyzed:')}</span>
                <span className="text-xs font-semibold font-sans tabular-nums px-2 py-0.5 rounded-md bg-[#f2f8f8] text-[#062327]">
                  {coverageType === 'family_floater' ? t('Family Floater') : t('Individual Cover')} • Age {age}
                </span>
                <span className="text-xs font-semibold font-sans tabular-nums px-2 py-0.5 rounded-md bg-[#f2f8f8] text-[#062327]">
                  ₹{(sumInsured / 100000).toFixed(1)}L Cover
                </span>
                {budget && (
                  <span className="text-xs font-semibold font-sans tabular-nums px-2 py-0.5 rounded-md bg-[#f2f8f8] text-[#062327]">
                    Budget ≤ ₹{budget.toLocaleString('en-IN')}/yr
                  </span>
                )}
                {minCsr && (
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-amber-50 text-amber-900 border border-amber-200/60 font-sans tabular-nums flex items-center gap-1">
                    <ShieldCheck size={12} className="text-amber-600" />
                    CSR ≥ {minCsr}%
                  </span>
                )}
                {cityTier === 'tier_1' && (
                  <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-[#f2f8f8] text-[#062327]">
                    {t('Tier 1 Metro')}
                  </span>
                )}
              </div>
              <p className="text-2xs text-[#558187] mt-1.5">
                <span className="font-sans font-bold tabular-nums">{recommendationsData.total_eligible_evaluated}</span> eligible Indian policies evaluated from our 50-policy crawler pool.
              </p>
            </div>

            <div className="flex items-center gap-2.5 flex-wrap">
              <button
                type="button"
                onClick={handleReset}
                className="px-4 py-2 rounded-xl border border-[#062327]/15 bg-white text-xs font-bold text-[#062327] hover:bg-[#f5f8f8] transition-colors flex items-center gap-1.5 cursor-pointer"
              >
                <ArrowLeft size={14} />
                <span>{t('Edit Profile')}</span>
              </button>

              {topList.length >= 2 && (
                <button
                  type="button"
                  onClick={() => {
                    const plansToCompare = selectedForCompare.length >= 2
                      ? recommendationsData.top_recommendations.filter(r => selectedForCompare.includes(r.product_id))
                      : topList;
                    if (onNavigateToCompare) {
                      onNavigateToCompare(plansToCompare);
                    } else {
                      setShowCompareModal(true);
                    }
                  }}
                  className="btn-pill-lime text-xs py-2 px-4 flex items-center gap-1.5 font-bold cursor-pointer shadow-md"
                >
                  <GitCompare size={14} />
                  <span>{t('Compare Top Plans')} ({topList.length})</span>
                  <ArrowRight size={13} />
                </button>
              )}

            </div>
          </div>

          {/* Assumptions Notice if any */}
          {recommendationsData.assumptions_made?.length > 0 && (
            <div className="p-3.5 rounded-2xl bg-amber-50/70 border border-amber-200/60 text-xs text-amber-900 flex items-start gap-2">
              <Info size={15} className="text-amber-700 flex-shrink-0 mt-0.5" />
              <div>
                <span>{recommendationsData.assumptions_made.join(' ')}</span>
              </div>
            </div>
          )}

          {/* ─── Top 3 Ranked Policy Cards ───────────────────── */}
          <div className="space-y-4">
            {topList.map((item) => {
              const breakdown = item.match_breakdown;
              const isSelected = selectedForCompare.includes(item.product_id);

              return (
                <div
                  key={item.product_id}
                  className={`bg-white border rounded-[28px] p-6 sm:p-7 shadow-sm transition-all relative overflow-hidden ${
                    item.rank === 1
                      ? 'border-[#062327] ring-1 ring-[#062327]/10 shadow-md'
                      : 'border-[#062327]/10 hover:border-[#062327]/30'
                  }`}
                >
                  {/* Top Badge & Score Row */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className="w-7 h-7 rounded-full bg-[#062327] text-[#d2f57b] text-xs font-bold font-sans tabular-nums flex items-center justify-center">
                        #{item.rank}
                      </span>
                      {item.badge && (
                        <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                          item.rank === 1
                            ? 'bg-[#d2f57b] text-[#062327] border border-[#062327]/20'
                            : 'bg-[#f2f8f8] text-[#062327] border border-[#062327]/10'
                        }`}>
                          {item.badge}
                        </span>
                      )}
                      <span className="text-xs font-bold text-[#558187] uppercase tracking-wider">
                        {item.insurer_name}
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <span className="text-xs font-bold uppercase tracking-wider text-[#558187]">{t('Match Score')}</span>
                        <div className="text-lg font-sans font-bold text-[#062327] tabular-nums tracking-tight">
                          {item.overall_match_score}<span className="text-xs text-[#558187] font-normal"> / 100</span>
                        </div>
                      </div>
                      <div className="w-12 h-12 rounded-2xl bg-[#f2f8f8] border border-[#062327]/10 flex items-center justify-center font-bold font-sans tabular-nums text-sm text-[#062327]">
                        {Math.round(item.overall_match_score)}%
                      </div>
                    </div>
                  </div>

                  {/* Policy Title & Pricing Header */}
                  <div className="flex flex-col md:flex-row md:items-start justify-between gap-4 pb-5 border-b border-[#062327]/08">
                    <div>
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <h3 className="text-xl sm:text-2xl font-headline font-bold text-[#062327] tracking-tight">
                          {item.product_name}
                        </h3>
                        {item.official_brochure_url && (
                          <a
                            href={item.official_brochure_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#062327] hover:bg-[#0b3d45] text-[#d2f57b] text-2xs font-bold transition-all shadow-xs"
                            title="View official insurer brochure / CIS"
                          >
                            <FileText size={12} className="text-[#d2f57b]" />
                            <span>View Official Brochure / CIS</span>
                            <ExternalLink size={10} />
                          </a>
                        )}
                      </div>
                      <p className="text-xs text-[#558187] mt-1 capitalize">
                        {item.coverage_types.join(' & ')} • <span className="font-sans font-semibold tabular-nums">₹{(item.recommended_sum_insured / 100000).toFixed(1)} Lakhs</span> Cover
                      </p>
                    </div>

                    <div className="md:text-right bg-[#f8fafb] md:bg-transparent p-3.5 md:p-0 rounded-2xl border md:border-0 border-[#062327]/08">
                      <div className="flex md:justify-end items-baseline gap-1">
                        <span className="text-xs font-bold text-[#558187]">Est.</span>
                        <span className="text-2xl sm:text-3xl font-sans font-extrabold text-[#062327] tabular-nums tracking-tight">
                          ₹{item.estimated_annual_premium.toLocaleString('en-IN')}
                        </span>
                        <span className="text-xs text-[#558187] font-semibold">/ year</span>
                      </div>
                      <div className="flex md:justify-end items-center gap-1.5 mt-0.5">
                        <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500" />
                        <span className="text-2xs font-semibold text-[#2d6a71]">Indicative rate (excl. 18% GST)</span>
                      </div>
                    </div>
                  </div>

                  {/* Why this policy was recommended */}
                  <div className="my-4 p-4 rounded-2xl bg-[#f4f8f8] border border-[#062327]/08">
                    <p className="text-xs font-bold uppercase tracking-wider text-[#2d6a71] mb-1 flex items-center gap-1.5">
                      <Sparkles size={13} className="text-[#062327]" />
                      {t('Why It Fits Your Profile:')}
                    </p>
                    <p className="text-xs text-[#062327] leading-relaxed">
                      {item.why_recommended}
                    </p>
                  </div>

                  {/* 6-Factor Score Breakdown */}
                  <div className="my-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
                    {[
                      { label: t('Claim Settlement (CSR)'), score: breakdown.claim_settlement_score, max: 35, isPrimary: true },
                      { label: t('Affordability'), score: breakdown.affordability_score, max: 22 },
                      { label: t('Coverage & SI'), score: breakdown.coverage_score, max: 18 },
                      { label: t('Waiting Period'), score: breakdown.waiting_period_score, max: 12 },
                      { label: t('Hospital Network'), score: breakdown.hospital_network_score, max: 8 },
                      { label: t('Terms & Copay'), score: breakdown.terms_score, max: 5 },
                    ].map(factor => {
                      const pct = Math.round((factor.score / factor.max) * 100);
                      return (
                        <div
                          key={factor.label}
                          className={`p-2.5 rounded-xl border text-center transition-all ${
                            factor.isPrimary
                              ? 'bg-amber-50/70 border-amber-300 ring-1 ring-amber-400/30'
                              : 'bg-white border-[#062327]/08'
                          }`}
                        >
                          <p className={`text-2xs font-bold uppercase tracking-wider truncate ${factor.isPrimary ? 'text-amber-900 font-extrabold' : 'text-[#558187]'}`}>
                            {factor.label}
                          </p>
                          <p className="text-sm font-bold font-sans tabular-nums text-[#062327] mt-0.5">
                            {factor.score}<span className="text-2xs font-normal text-[#558187]">/{factor.max}</span>
                          </p>
                          <div className="w-full bg-[#062327]/08 h-1.5 rounded-full mt-1.5 overflow-hidden">
                            <div
                              className={`h-full rounded-full ${factor.isPrimary ? 'bg-amber-600' : 'bg-[#062327]'}`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Policy Highlights Matrix */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 my-4">
                    <div className="p-3 rounded-xl bg-[#fbfdfd] border border-[#062327]/08">
                      <p className="text-2xs font-bold uppercase tracking-wider text-[#558187]">{t('Room Rent Limit')}</p>
                      <p className="text-xs font-bold text-[#062327] mt-1">{item.room_rent_summary}</p>
                    </div>

                    <div className="p-3 rounded-xl bg-[#fbfdfd] border border-[#062327]/08">
                      <p className="text-2xs font-bold uppercase tracking-wider text-[#558187]">{t('Co-Payment Terms')}</p>
                      <p className="text-xs font-bold text-[#062327] mt-1">{item.copay_summary}</p>
                    </div>

                    <div className="p-3 rounded-xl bg-[#fbfdfd] border border-[#062327]/08">
                      <p className="text-2xs font-bold uppercase tracking-wider text-[#558187]">{t('Pre-Existing Disease Wait')}</p>
                      <p className="text-xs font-bold text-[#062327] mt-1">{item.waiting_periods_summary.pre_existing}</p>
                    </div>
                  </div>

                  {/* Benefits & Limitations */}
                  <div className="space-y-2 mt-4 pt-4 border-t border-[#062327]/08">
                    <p className="text-2xs font-bold uppercase tracking-wider text-[#558187]">{t('Key Standout Inclusions')}</p>
                    <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {item.key_benefits.slice(0, 4).map((ben, bIdx) => (
                        <li key={bIdx} className="flex items-start gap-2 text-xs text-[#062327]">
                          <Check size={14} className="text-emerald-600 flex-shrink-0 mt-0.5" />
                          <span>{ben}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* Actions & Official Sources */}
                  <div className="mt-5 pt-4 border-t border-[#062327]/08 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      {item.official_brochure_url && (
                        <a
                          href={item.official_brochure_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-bold text-[#062327] hover:text-[#0b3d45] underline inline-flex items-center gap-1"
                        >
                          <span>{t('Official Policy Brochure / CIS')}</span>
                          <ExternalLink size={12} />
                        </a>
                      )}
                      <span className="text-[#062327]/20">•</span>
                      <span className="text-2xs text-[#558187]">
                        <span className="font-sans font-semibold tabular-nums">{item.network_hospitals_count.toLocaleString('en-IN')}+</span> {t('Cashless Hospitals')}
                      </span>
                    </div>

                    <div className="flex items-center gap-2.5">
                      <label className="flex items-center gap-1.5 text-xs font-bold text-[#062327] cursor-pointer">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleCompareSelection(item.product_id)}
                          className="rounded border-[#062327]/20 text-[#062327] focus:ring-[#062327]"
                        />
                        <span>{t('Compare Side-by-Side')}</span>
                      </label>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* ─── Runner-up recommendations ───────────────────── */}
          {runnerUps.length > 0 && (
            <div className="border border-[#062327]/10 rounded-[28px] bg-white p-6 shadow-sm">
              <button
                type="button"
                onClick={() => setShowRunnerUps(!showRunnerUps)}
                className="flex items-center justify-between w-full text-left cursor-pointer"
              >
                <div>
                  <h4 className="text-base font-headline font-bold text-[#062327]">
                    {t('Other Eligible Plans')} ({runnerUps.length})
                  </h4>
                  <p className="text-xs text-[#558187] mt-0.5">
                    Qualified policies evaluated that achieved runner-up match scores.
                  </p>
                </div>
                {showRunnerUps ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
              </button>

              {showRunnerUps && (
                <div className="mt-5 space-y-3 border-t border-[#062327]/08 pt-4">
                  {runnerUps.map((item) => (
                    <div key={item.product_id} className="p-4 rounded-2xl bg-[#f8fafb] border border-[#062327]/08 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-[#062327]">{item.product_name}</span>
                          <span className="text-2xs text-[#558187]">({item.insurer_name})</span>
                          <span className="text-2xs px-2 py-0.5 rounded-full bg-white border border-[#062327]/10 font-bold font-sans tabular-nums text-[#062327]">
                            Score: {item.overall_match_score}%
                          </span>
                        </div>
                        <p className="text-xs text-[#558187] mt-1">{item.why_recommended}</p>
                      </div>

                      <div className="text-right flex-shrink-0 flex flex-col items-end gap-1.5">
                        <p className="text-sm font-bold font-sans tabular-nums tracking-tight text-[#062327]">
                          ₹{item.estimated_annual_premium.toLocaleString('en-IN')}/yr
                        </p>
                        {item.official_brochure_url && (
                          <a
                            href={item.official_brochure_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#062327] hover:bg-[#0b3d45] text-[#d2f57b] text-3xs font-bold transition-all shadow-2xs"
                          >
                            <FileText size={10} className="text-[#d2f57b]" />
                            <span>Brochure / CIS</span>
                            <ExternalLink size={9} />
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Compliance Disclaimer */}
          <div className="p-4 rounded-2xl bg-[#f2f8f8] border border-[#062327]/08 text-2xs text-[#558187] leading-relaxed">
            <span className="font-bold text-[#062327]">Compliance & Informational Notice: </span>
            {recommendationsData.disclaimer}
          </div>
        </div>
      )}

      {/* ─── Floating Compare Bar when policies are checked ─── */}
      {recommendationsData && selectedForCompare.length >= 2 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-white text-[#062327] px-4 py-2.5 rounded-2xl shadow-xl border border-[#062327]/12 flex items-center gap-3 animate-in fade-in slide-in-from-bottom-3">
          <span className="text-xs font-semibold text-[#558187]">
            <strong className="text-[#062327] font-bold">{selectedForCompare.length}</strong> policies selected
          </span>
          <button
            type="button"
            onClick={() => {
              const selectedPlans = recommendationsData.top_recommendations.filter(r => selectedForCompare.includes(r.product_id));
              if (onNavigateToCompare) {
                onNavigateToCompare(selectedPlans);
              } else {
                setShowCompareModal(true);
              }
            }}
            className="btn-pill-lime text-xs py-2 px-4 flex items-center gap-1.5 font-bold cursor-pointer"
          >
            <GitCompare size={13} />
            <span>{t('Compare Selected Plans')}</span>
            <ArrowRight size={13} />
          </button>
        </div>
      )}

      {/* ─── Comparison Modal ─────────────────────────────── */}
      {showCompareModal && (
        <div className="fixed inset-0 z-50 bg-[#062327]/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border border-[#062327]/12 rounded-3xl max-w-5xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-5 border-b border-[#062327]/10 flex items-center justify-between gap-4">
              <div>
                <h3 className="font-headline text-lg font-bold text-[#062327]">
                  {t('Side-by-Side Plan Comparison')}
                </h3>
                <p className="text-xs text-[#558187] mt-0.5 font-medium">
                  Direct evaluation of top ranked policies against your requested parameters
                </p>
              </div>
              <div className="flex items-center gap-2">
                {onNavigateToCompare && (
                  <button
                    type="button"
                    onClick={() => {
                      const plansToCompare = selectedForCompare.length >= 2
                        ? recommendationsData.top_recommendations.filter(r => selectedForCompare.includes(r.product_id))
                        : topList;
                      setShowCompareModal(false);
                      onNavigateToCompare(plansToCompare);
                    }}
                    className="btn-pill-lime text-xs py-2 px-3.5 flex items-center gap-1.5 font-bold cursor-pointer"
                  >
                    <GitCompare size={13} />
                    <span>{t('Open in Compare Tab')}</span>
                    <ArrowRight size={13} />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowCompareModal(false)}
                  className="w-8 h-8 rounded-full bg-[#f5f8f8] hover:bg-[#062327]/08 flex items-center justify-center text-[#558187] hover:text-[#062327] transition-colors cursor-pointer"
                >
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Modal Table Content */}
            <div className="overflow-x-auto p-5 sm:p-6 flex-1">
              <table className="w-full border-collapse text-xs">
                <thead>
                  <tr className="border-b border-[#062327]/10">
                    <th className="p-3 text-left font-bold text-[#558187] uppercase tracking-wider w-40 bg-[#f8fafb]">
                      Feature
                    </th>
                    {topList.map(item => (
                      <th key={item.product_id} className="p-3 text-left font-bold text-[#062327] min-w-[200px]">
                        <span className="text-2xs font-bold text-[#2d6a71] uppercase">{item.insurer_name}</span>
                        <p className="text-sm font-headline font-bold mt-0.5">{item.product_name}</p>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#062327]/08">
                  <tr>
                    <td className="p-3 font-bold text-[#558187] bg-[#f8fafb]">{t('Match Score')}</td>
                    {topList.map(item => (
                      <td key={item.product_id} className="p-3 font-bold text-[#062327]">
                        <span className="px-2 py-0.5 rounded-full bg-[#d2f57b]/30 text-[#062327] font-sans font-bold tabular-nums">
                          {item.overall_match_score} / 100
                        </span>
                      </td>
                    ))}
                  </tr>

                  <tr className="bg-amber-50/30">
                    <td className="p-3 font-bold text-amber-900 bg-amber-50/60 flex items-center gap-1.5">
                      <ShieldCheck size={14} className="text-amber-600" />
                      <span>{t('Claim Settlement Ratio (CSR)')}</span>
                    </td>
                    {topList.map(item => (
                      <td key={item.product_id} className="p-3 font-bold text-[#062327]">
                        <span className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-200/80 font-sans font-bold tabular-nums text-xs">
                          {item.claim_settlement_ratio}% IRDAI Filed
                        </span>
                      </td>
                    ))}
                  </tr>

                  <tr>
                    <td className="p-3 font-bold text-[#558187] bg-[#f8fafb]">Est. Annual Premium</td>
                    {topList.map(item => (
                      <td key={item.product_id} className="p-3 font-bold font-sans tabular-nums tracking-tight text-[#062327]">
                        ₹{item.estimated_annual_premium.toLocaleString('en-IN')} / year
                      </td>
                    ))}
                  </tr>

                  <tr>
                    <td className="p-3 font-bold text-[#558187] bg-[#f8fafb]">{t('Sum Insured')}</td>
                    {topList.map(item => (
                      <td key={item.product_id} className="p-3 font-semibold font-sans tabular-nums text-[#062327]">
                        ₹{(item.recommended_sum_insured / 100000).toFixed(1)} Lakhs
                      </td>
                    ))}
                  </tr>

                  <tr>
                    <td className="p-3 font-bold text-[#558187] bg-[#f8fafb]">{t('Room Rent Limit')}</td>
                    {topList.map(item => (
                      <td key={item.product_id} className="p-3 font-semibold text-[#062327]">
                        {item.room_rent_summary}
                      </td>
                    ))}
                  </tr>

                  <tr>
                    <td className="p-3 font-bold text-[#558187] bg-[#f8fafb]">{t('Co-Payment Terms')}</td>
                    {topList.map(item => (
                      <td key={item.product_id} className="p-3 font-semibold text-[#062327]">
                        {item.copay_summary}
                      </td>
                    ))}
                  </tr>

                  <tr>
                    <td className="p-3 font-bold text-[#558187] bg-[#f8fafb]">{t('Pre-Existing Disease Wait')}</td>
                    {topList.map(item => (
                      <td key={item.product_id} className="p-3 font-semibold text-[#062327]">
                        {item.waiting_periods_summary.pre_existing}
                      </td>
                    ))}
                  </tr>

                  <tr>
                    <td className="p-3 font-bold text-[#558187] bg-[#f8fafb]">Restoration Benefit</td>
                    {topList.map(item => (
                      <td key={item.product_id} className="p-3 font-semibold text-[#062327]">
                        {item.restoration_summary}
                      </td>
                    ))}
                  </tr>

                  <tr>
                    <td className="p-3 font-bold text-[#558187] bg-[#f8fafb]">{t('Cashless Hospitals')}</td>
                    {topList.map(item => (
                      <td key={item.product_id} className="p-3 font-semibold font-sans tabular-nums text-[#062327]">
                        {item.network_hospitals_count.toLocaleString('en-IN')}+ partner hospitals
                      </td>
                    ))}
                  </tr>

                  <tr>
                    <td className="p-3 font-bold text-[#558187] bg-[#f8fafb]">Official Source</td>
                    {topList.map(item => (
                      <td key={item.product_id} className="p-3 font-semibold text-[#062327]">
                        {item.official_brochure_url ? (
                          <a
                            href={item.official_brochure_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[#2d6a71] font-bold underline inline-flex items-center gap-1"
                          >
                            <span>Brochure / CIS</span>
                            <ExternalLink size={11} />
                          </a>
                        ) : '—'}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-[#062327]/10 flex items-center justify-end gap-2.5 bg-[#f8fbfb]">
              {onNavigateToCompare && (
                <button
                  type="button"
                  onClick={() => {
                    const plansToCompare = selectedForCompare.length >= 2
                      ? recommendationsData.top_recommendations.filter(r => selectedForCompare.includes(r.product_id))
                      : topList;
                    setShowCompareModal(false);
                    onNavigateToCompare(plansToCompare);
                  }}
                  className="btn-pill-lime text-xs py-2 px-4 flex items-center gap-1.5 font-bold cursor-pointer"
                >
                  <GitCompare size={13} />
                  <span>{t('Open in Compare Tab')}</span>
                  <ArrowRight size={13} />
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowCompareModal(false)}
                className="px-4 py-1.5 rounded-full border border-[#062327]/15 bg-white text-[#558187] hover:text-[#062327] text-xs font-bold hover:bg-[#f5f8f8] transition-colors cursor-pointer"
              >
                {t('common.close', 'Close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
