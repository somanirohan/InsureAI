import React, { useState, useEffect, useRef } from 'react';
import {
  GitCompare,
  Check,
  AlertTriangle,
  ArrowRightLeft,
  ExternalLink,
  FileText,
  Layers,
  Sparkles,
} from 'lucide-react';
import api from '../../services/api';
import { Spinner, EmptyState, ErrorBanner } from '../common/ui';

// ─── Status Badge Helper ──────────────────────────────────
function Tag({ text, variant = 'neutral' }) {
  if (!text || text === '—') return <span className="text-slate-400 font-normal">—</span>;

  let style = 'bg-slate-100 text-slate-700 border-slate-200';
  if (variant === 'positive') {
    style = 'bg-emerald-50 text-emerald-800 border-emerald-200/80';
  } else if (variant === 'negative') {
    style = 'bg-amber-50 text-amber-800 border-amber-200/80';
  } else if (variant === 'info') {
    style = 'bg-sky-50 text-sky-800 border-sky-200/80';
  }

  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium border ${style}`}>
      {text}
    </span>
  );
}

// ─── Comparison Row ────────────────────────────────────────
function CompareRow({ label, description, children, striped, highlighted }) {
  return (
    <tr
      className={`transition-colors ${
        highlighted
          ? 'bg-amber-50/50 hover:bg-amber-50'
          : striped
          ? 'bg-slate-50/40 hover:bg-slate-50/80'
          : 'bg-white hover:bg-slate-50/80'
      }`}
    >
      <td className="sticky left-0 z-10 bg-inherit px-5 py-3.5 text-xs font-semibold text-slate-600 w-52 min-w-[13rem] align-top border-b border-slate-100 border-r border-slate-200/70 shadow-[1px_0_0_rgba(0,0,0,0.02)]">
        <div>{label}</div>
        {description && (
          <div className="text-2xs text-slate-400 font-normal mt-0.5 leading-tight">
            {description}
          </div>
        )}
      </td>
      {children}
    </tr>
  );
}

function DataCell({ children, className = '' }) {
  return (
    <td
      className={`px-5 py-3.5 text-xs text-slate-800 border-b border-slate-100 border-l border-slate-200/70 align-top min-w-[240px] ${className}`}
    >
      {children}
    </td>
  );
}

export default function ComparisonView({
  policies = [],
  recommendedPlans = null,
  onNavigateToRecommend,
}) {
  const [activeMode, setActiveMode] = useState(() => {
    if (recommendedPlans && recommendedPlans.length >= 2) return 'recommended';
    if (policies.length >= 2) return 'uploaded';
    if (recommendedPlans && recommendedPlans.length > 0) return 'recommended';
    return 'recommended';
  });

  const [highlightDiffs, setHighlightDiffs] = useState(false);

  // Uploaded policies state
  const [selectedUploadedIds, setSelectedUploadedIds] = useState(() =>
    policies.length >= 2 ? [policies[0]._id, policies[1]._id] : []
  );
  const [uploadedResult, setUploadedResult] = useState(null);
  const [loadingUploaded, setLoadingUploaded] = useState(false);
  const [uploadedError, setUploadedError] = useState(null);

  // Recommended plans state
  const [selectedRecIds, setSelectedRecIds] = useState(() => {
    if (recommendedPlans && recommendedPlans.length > 0) {
      return recommendedPlans.map((r) => r.product_id);
    }
    return [];
  });

  const lastRecPlansRef = useRef(recommendedPlans);
  useEffect(() => {
    if (recommendedPlans && recommendedPlans !== lastRecPlansRef.current) {
      lastRecPlansRef.current = recommendedPlans;
      setSelectedRecIds(recommendedPlans.map((r) => r.product_id));
      setActiveMode('recommended');
    }
  }, [recommendedPlans]);

  useEffect(() => {
    if (policies.length >= 2) {
      setSelectedUploadedIds((prev) => (prev.length < 2 ? [policies[0]._id, policies[1]._id] : prev));
    }
  }, [policies]);

  const toggleUploaded = (id) => {
    setSelectedUploadedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleRec = (id) => {
    setSelectedRecIds((prev) => {
      if (prev.includes(id)) {
        if (prev.length <= 2) return prev; // Keep minimum 2 plans
        return prev.filter((x) => x !== id);
      }
      return [...prev, id];
    });
  };

  const handleCompareUploaded = async () => {
    if (selectedUploadedIds.length < 2) {
      setUploadedError('Select at least 2 policies to compare.');
      return;
    }
    setUploadedError(null);
    setLoadingUploaded(true);
    try {
      const res = await api.post('/comparisons', { policy_ids: selectedUploadedIds });
      setUploadedResult(res.data.comparison.comparison_result);
    } catch (err) {
      setUploadedError(err.response?.data?.error || 'Comparison failed. Please try again.');
    } finally {
      setLoadingUploaded(false);
    }
  };

  const metadata = uploadedResult?.policies_metadata || [];

  const comparedRecPlans = (recommendedPlans || []).filter((r) =>
    selectedRecIds.includes(r.product_id)
  );

  const recDiffers = (extractor) => {
    if (!highlightDiffs || comparedRecPlans.length < 2) return false;
    const values = comparedRecPlans.map(extractor);
    return new Set(values).size > 1;
  };

  return (
    <div className="space-y-6 w-full">
      {/* ─── Top Control Header ───────────────────────────── */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-5 sm:p-6 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
              Compare Policies
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Side-by-side comparison of coverage, limits, co-pay, waiting periods, and network hospitals
            </p>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Mode Switcher */}
            {(recommendedPlans?.length > 0 || policies.length > 0) && (
              <div className="bg-slate-100 p-1 rounded-full border border-slate-200/80 flex items-center text-xs">
                <button
                  type="button"
                  onClick={() => setActiveMode('recommended')}
                  className={`px-3.5 py-1.5 rounded-full transition-all flex items-center gap-1.5 font-bold cursor-pointer ${
                    activeMode === 'recommended'
                      ? 'bg-[#d2f57b] text-[#062327] border border-[#062327] shadow-[0_2px_0_#062327]'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Sparkles size={13} className={activeMode === 'recommended' ? 'text-[#062327]' : 'text-slate-400'} />
                  <span>Market Plans ({recommendedPlans?.length || 0})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveMode('uploaded')}
                  className={`px-3.5 py-1.5 rounded-full transition-all flex items-center gap-1.5 font-bold cursor-pointer ${
                    activeMode === 'uploaded'
                      ? 'bg-[#d2f57b] text-[#062327] border border-[#062327] shadow-[0_2px_0_#062327]'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <FileText size={13} className={activeMode === 'uploaded' ? 'text-[#062327]' : 'text-slate-400'} />
                  <span>Uploaded Docs ({policies.length})</span>
                </button>
              </div>
            )}

            {/* Difference Highlight Button */}
            <button
              type="button"
              onClick={() => setHighlightDiffs(!highlightDiffs)}
              title="Highlight differing values across plans"
              className={`px-3.5 py-1.5 rounded-full border text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
                highlightDiffs
                  ? 'bg-[#d2f57b] text-[#062327] border-[#062327] shadow-[0_2px_0_#062327]'
                  : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              <Layers size={13} className={highlightDiffs ? 'text-[#062327]' : 'text-slate-400'} />
              <span>Highlight differences</span>
            </button>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════
          MODE 1: MARKET PLANS COMPARISON
          ══════════════════════════════════════════════════════ */}
      {activeMode === 'recommended' && (
        <div className="space-y-4">
          {(!recommendedPlans || recommendedPlans.length === 0) ? (
            <div className="bg-white border border-slate-200/90 rounded-2xl p-10 text-center shadow-xs space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-[#d2f57b]/30 text-[#062327] flex items-center justify-center mx-auto border border-[#062327]/10">
                <Sparkles size={24} />
              </div>
              <div className="max-w-md mx-auto">
                <h3 className="text-base font-bold text-slate-900">
                  No Market Plans to Compare Yet
                </h3>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  Run the recommendation engine to generate curated market plans (Bajaj Allianz, HDFC ERGO, Care, Star, etc.) tailored to your profile.
                </p>
              </div>
              {onNavigateToRecommend && (
                <button
                  type="button"
                  onClick={onNavigateToRecommend}
                  className="btn-pill-lime text-xs py-2.5 px-5 font-bold shadow-md cursor-pointer inline-flex items-center gap-2"
                >
                  <Sparkles size={14} />
                  <span>Get Market Recommendations</span>
                </button>
              )}
            </div>
          ) : (
            <>
              {/* Plan Selection Filter Chips */}
              <div className="bg-white border border-slate-200/90 rounded-xl p-3.5 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="text-xs font-semibold text-slate-700">
                  Select plans to compare:
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  {recommendedPlans.map((plan) => {
                    const isChecked = selectedRecIds.includes(plan.product_id);
                    return (
                      <button
                        key={plan.product_id}
                        type="button"
                        onClick={() => toggleRec(plan.product_id)}
                        className={`px-3 py-1.5 rounded-full text-xs transition-all flex items-center gap-2 border cursor-pointer ${
                          isChecked
                            ? 'bg-[#d2f57b]/30 border-[#062327] text-[#062327] font-bold shadow-[0_2px_0_#062327]'
                            : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <div
                          className={`w-3.5 h-3.5 rounded flex items-center justify-center ${
                            isChecked
                              ? 'bg-[#d2f57b] border border-[#062327] text-[#062327]'
                              : 'border border-slate-300 bg-white'
                          }`}
                        >
                          {isChecked && <Check size={10} strokeWidth={3} />}
                        </div>
                        <span className="text-2xs text-slate-500 font-mono">#{plan.rank}</span>
                        <span>{plan.product_name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* ── Comparison Table ────────────────────────── */}
              <div className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-xs">
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-xs">
                    {/* Sticky Table Header */}
                    <thead className="sticky top-0 z-20 bg-white shadow-2xs border-b border-slate-200">
                      <tr>
                        <th className="sticky left-0 z-30 bg-white px-5 py-5 text-left font-semibold text-slate-600 uppercase tracking-wider w-52 min-w-[13rem] border-r border-slate-200/70">
                          <span className="text-2xs text-slate-400 block font-normal">Plan Details</span>
                          <span className="text-sm font-bold text-slate-900">Features</span>
                        </th>
                        {comparedRecPlans.map((plan) => (
                          <th
                            key={plan.product_id}
                            className="px-5 py-5 text-left border-l border-slate-200/70 min-w-[260px] align-top bg-white"
                          >
                            <div className="flex items-center justify-between gap-2 mb-1.5">
                              <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 text-2xs font-semibold">
                                Rank #{plan.rank}
                              </span>
                              {plan.badge && (
                                <span className="px-2 py-0.5 rounded-md bg-sky-50 text-sky-800 border border-sky-200/60 text-3xs font-semibold">
                                  {plan.badge}
                                </span>
                              )}
                              <span className="text-3xs font-semibold text-slate-500 uppercase tracking-wider ml-auto">
                                {plan.insurer_name}
                              </span>
                            </div>

                            <p className="text-sm sm:text-base font-bold text-slate-900 leading-snug">
                              {plan.product_name}
                            </p>

                            <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-baseline justify-between">
                              <div>
                                <span className="text-3xs uppercase tracking-wider text-slate-400 font-medium block">
                                  Annual Premium
                                </span>
                                <div className="text-base font-bold text-slate-900 tabular-nums">
                                  ₹{plan.estimated_annual_premium.toLocaleString('en-IN')}
                                  <span className="text-3xs font-normal text-slate-500"> /yr</span>
                                </div>
                              </div>
                              <span className="px-2.5 py-1 rounded-full bg-[#d2f57b]/35 border border-[#062327]/30 text-[#062327] font-bold text-xs tabular-nums">
                                {plan.overall_match_score}% Match
                              </span>
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>

                    {/* Table Body */}
                    <tbody className="divide-y divide-slate-100">
                      {/* SECTION: SUMMARY & SCORES */}
                      <tr className="bg-slate-50/80">
                        <td
                          colSpan={comparedRecPlans.length + 1}
                          className="px-5 py-2.5 text-2xs font-bold text-slate-600 uppercase tracking-wider sticky left-0 z-10"
                        >
                          Core Highlights & Recommendation Fit
                        </td>
                      </tr>

                      {/* Match Score */}
                      <CompareRow label="Overall Match Score" highlighted={recDiffers((p) => p.overall_match_score)}>
                        {comparedRecPlans.map((plan) => (
                          <DataCell key={plan.product_id}>
                            <div className="flex items-center gap-2.5">
                              <span className="font-bold text-slate-900 text-sm">
                                {plan.overall_match_score} / 100
                              </span>
                              <span className="text-2xs text-slate-500">
                                ({plan.overall_match_score >= 85 ? 'Exceptional Fit' : 'Strong Alignment'})
                              </span>
                            </div>
                          </DataCell>
                        ))}
                      </CompareRow>

                      {/* Why Recommended */}
                      <CompareRow label="Why It Fits You" striped highlighted={false}>
                        {comparedRecPlans.map((plan) => (
                          <DataCell key={plan.product_id}>
                            <p className="text-xs text-slate-700 leading-relaxed">
                              {plan.why_recommended}
                            </p>
                          </DataCell>
                        ))}
                      </CompareRow>

                      {/* 5-Factor Score Breakdown */}
                      <CompareRow label="Score Breakdown" highlighted={false}>
                        {comparedRecPlans.map((plan) => {
                          const bd = plan.match_breakdown;
                          return (
                            <DataCell key={plan.product_id}>
                              <div className="space-y-1 text-2xs text-slate-600">
                                <div className="flex justify-between">
                                  <span>Affordability:</span>
                                  <span className="font-semibold text-slate-800">{bd.affordability_score} / 30</span>
                                </div>
                                <div className="flex justify-between">
                                  <span>Coverage & SI:</span>
                                  <span className="font-semibold text-slate-800">{bd.coverage_score} / 25</span>
                                </div>
                                <div className="flex justify-between">
                                  <span>Waiting Periods:</span>
                                  <span className="font-semibold text-slate-800">{bd.waiting_period_score} / 20</span>
                                </div>
                                <div className="flex justify-between">
                                  <span>Hospital Network:</span>
                                  <span className="font-semibold text-slate-800">{bd.hospital_network_score} / 15</span>
                                </div>
                                <div className="flex justify-between">
                                  <span>Terms & Copay:</span>
                                  <span className="font-semibold text-slate-800">{bd.terms_score} / 10</span>
                                </div>
                              </div>
                            </DataCell>
                          );
                        })}
                      </CompareRow>

                      {/* SECTION: FINANCIALS & COVERAGE */}
                      <tr className="bg-slate-50/80">
                        <td
                          colSpan={comparedRecPlans.length + 1}
                          className="px-5 py-2.5 text-2xs font-bold text-slate-600 uppercase tracking-wider sticky left-0 z-10"
                        >
                          Pricing & Coverage
                        </td>
                      </tr>

                      {/* Est. Premium */}
                      <CompareRow label="Estimated Premium" highlighted={recDiffers((p) => p.estimated_annual_premium)}>
                        {comparedRecPlans.map((plan) => (
                          <DataCell key={plan.product_id}>
                            <div className="font-bold text-sm text-slate-900 tabular-nums">
                              ₹{plan.estimated_annual_premium.toLocaleString('en-IN')}
                              <span className="text-2xs font-normal text-slate-500"> / year</span>
                            </div>
                            <div className="text-2xs text-slate-500 mt-0.5">
                              ≈ ₹{Math.round(plan.estimated_annual_premium / 12).toLocaleString('en-IN')} / month (excl. 18% GST)
                            </div>
                          </DataCell>
                        ))}
                      </CompareRow>

                      {/* Sum Insured */}
                      <CompareRow label="Sum Insured Limit" striped highlighted={recDiffers((p) => p.recommended_sum_insured)}>
                        {comparedRecPlans.map((plan) => (
                          <DataCell key={plan.product_id}>
                            <span className="font-bold text-sm text-slate-900 tabular-nums">
                              ₹{(plan.recommended_sum_insured / 100000).toFixed(1)} Lakhs
                            </span>
                            <p className="text-2xs text-slate-500 mt-0.5">Annual base cover</p>
                          </DataCell>
                        ))}
                      </CompareRow>

                      {/* Tax Relief Sec 80D */}
                      <CompareRow label="Tax Relief (Sec 80D)" highlighted={false}>
                        {comparedRecPlans.map((plan) => (
                          <DataCell key={plan.product_id}>
                            <Tag text="Eligible up to ₹25k - ₹100k" variant="positive" />
                          </DataCell>
                        ))}
                      </CompareRow>

                      {/* SECTION: HOSPITALIZATION & ROOM RENT */}
                      <tr className="bg-slate-50/80">
                        <td
                          colSpan={comparedRecPlans.length + 1}
                          className="px-5 py-2.5 text-2xs font-bold text-slate-600 uppercase tracking-wider sticky left-0 z-10"
                        >
                          Room Rent & Hospitalization Terms
                        </td>
                      </tr>

                      {/* Room Rent Limit */}
                      <CompareRow label="Room Rent Limit" highlighted={recDiffers((p) => p.room_rent_summary)}>
                        {comparedRecPlans.map((plan) => {
                          const text = plan.room_rent_summary || '';
                          const hasCap = text.toLowerCase().includes('1%') || text.toLowerCase().includes('cap');
                          return (
                            <DataCell key={plan.product_id}>
                              <Tag text={text} variant={hasCap ? 'negative' : 'positive'} />
                              <p className="text-2xs text-slate-500 mt-1">
                                {!hasCap ? 'No sub-limit penalty on room or doctor fees' : 'Proportional deduction if room exceeds 1% of SI'}
                              </p>
                            </DataCell>
                          );
                        })}
                      </CompareRow>

                      {/* Co-Payment */}
                      <CompareRow label="Co-Payment Terms" striped highlighted={recDiffers((p) => p.copay_summary)}>
                        {comparedRecPlans.map((plan) => {
                          const text = plan.copay_summary || '';
                          const zeroCopay = text.includes('0%') || text.toLowerCase().includes('zero') || text.toLowerCase().includes('nil') || text.toLowerCase().includes('no co-pay');
                          return (
                            <DataCell key={plan.product_id}>
                              <Tag text={text} variant={zeroCopay ? 'positive' : 'negative'} />
                              <p className="text-2xs text-slate-500 mt-1">
                                {zeroCopay ? 'Insurer covers 100% of approved claims' : 'Out-of-pocket patient co-payment applies'}
                              </p>
                            </DataCell>
                          );
                        })}
                      </CompareRow>

                      {/* Restoration Benefit */}
                      <CompareRow label="Restoration / Refill" highlighted={recDiffers((p) => p.restoration_summary)}>
                        {comparedRecPlans.map((plan) => {
                          const text = plan.restoration_summary || 'Included';
                          return (
                            <DataCell key={plan.product_id}>
                              <Tag text={text} variant="positive" />
                              <p className="text-2xs text-slate-500 mt-1">Refills sum insured if fully exhausted</p>
                            </DataCell>
                          );
                        })}
                      </CompareRow>

                      {/* SECTION: WAITING PERIODS */}
                      <tr className="bg-slate-50/80">
                        <td
                          colSpan={comparedRecPlans.length + 1}
                          className="px-5 py-2.5 text-2xs font-bold text-slate-600 uppercase tracking-wider sticky left-0 z-10"
                        >
                          Waiting Periods
                        </td>
                      </tr>

                      {/* PED Waiting */}
                      <CompareRow label="Pre-Existing Diseases" highlighted={recDiffers((p) => p.waiting_periods_summary?.pre_existing)}>
                        {comparedRecPlans.map((plan) => {
                          const wait = plan.waiting_periods_summary?.pre_existing || '3 Years';
                          const isShort = wait.includes('1') || wait.toLowerCase().includes('short') || wait.includes('2');
                          return (
                            <DataCell key={plan.product_id}>
                              <Tag text={wait} variant={isShort ? 'positive' : 'negative'} />
                              <p className="text-2xs text-slate-500 mt-0.5">Waiting duration for declared prior ailments</p>
                            </DataCell>
                          );
                        })}
                      </CompareRow>

                      {/* Specific Illness */}
                      <CompareRow label="Specific Illnesses" striped highlighted={recDiffers((p) => p.waiting_periods_summary?.specific_illness)}>
                        {comparedRecPlans.map((plan) => {
                          const wait = plan.waiting_periods_summary?.specific_illness || '2 Years';
                          return (
                            <DataCell key={plan.product_id}>
                              <span className="font-semibold text-slate-800 text-xs">{wait}</span>
                              <p className="text-2xs text-slate-500 mt-0.5">Joint replacement, cataract, hernia, etc.</p>
                            </DataCell>
                          );
                        })}
                      </CompareRow>

                      {/* Initial Waiting */}
                      <CompareRow label="Initial Waiting Period" highlighted={false}>
                        {comparedRecPlans.map((plan) => (
                          <DataCell key={plan.product_id}>
                            <span className="font-semibold text-slate-800 text-xs">
                              {plan.waiting_periods_summary?.initial || '30 Days'}
                            </span>
                            <p className="text-2xs text-slate-500 mt-0.5">Accidental injury covered from Day 1</p>
                          </DataCell>
                        ))}
                      </CompareRow>

                      {/* SECTION: NETWORK HOSPITALS & SERVICES */}
                      <tr className="bg-slate-50/80">
                        <td
                          colSpan={comparedRecPlans.length + 1}
                          className="px-5 py-2.5 text-2xs font-bold text-slate-600 uppercase tracking-wider sticky left-0 z-10"
                        >
                          Cashless Network & Sources
                        </td>
                      </tr>

                      {/* Cashless Network */}
                      <CompareRow label="Cashless Network" highlighted={recDiffers((p) => p.network_hospitals_count)}>
                        {comparedRecPlans.map((plan) => (
                          <DataCell key={plan.product_id}>
                            <div className="font-semibold text-slate-900 text-xs tabular-nums">
                              {plan.network_hospitals_count.toLocaleString('en-IN')}+ Partner Hospitals
                            </div>
                            <p className="text-2xs text-slate-500 mt-0.5">Cashless Anywhere pan-India network</p>
                          </DataCell>
                        ))}
                      </CompareRow>

                      {/* Standout Benefits */}
                      <CompareRow label="Key Standouts" striped highlighted={false}>
                        {comparedRecPlans.map((plan) => (
                          <DataCell key={plan.product_id}>
                            <ul className="space-y-1">
                              {plan.key_benefits.map((b, i) => (
                                <li key={i} className="flex items-start gap-1.5 text-xs text-slate-700">
                                  <Check size={13} className="text-emerald-600 flex-shrink-0 mt-0.5" />
                                  <span>{b}</span>
                                </li>
                              ))}
                            </ul>
                          </DataCell>
                        ))}
                      </CompareRow>

                      {/* Limitations */}
                      <CompareRow label="Key Limitations" highlighted={false}>
                        {comparedRecPlans.map((plan) => (
                          <DataCell key={plan.product_id}>
                            {plan.key_limitations && plan.key_limitations.length > 0 ? (
                              <ul className="space-y-1">
                                {plan.key_limitations.map((lim, i) => (
                                  <li key={i} className="flex items-start gap-1.5 text-xs text-slate-600">
                                    <AlertTriangle size={13} className="text-amber-600 flex-shrink-0 mt-0.5" />
                                    <span>{lim}</span>
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </DataCell>
                        ))}
                      </CompareRow>

                      {/* Brochure Links */}
                      <CompareRow label="Official Policy Document" striped highlighted={false}>
                        {comparedRecPlans.map((plan) => (
                          <DataCell key={plan.product_id}>
                            {plan.official_brochure_url ? (
                              <a
                                href={plan.official_brochure_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="btn-pill-lime text-2xs py-1.5 px-3 font-bold inline-flex items-center gap-1.5 shadow-xs"
                              >
                                <span>Official CIS Brochure</span>
                                <ExternalLink size={11} />
                              </a>
                            ) : (
                              <span className="text-slate-400">IRDAI Catalog</span>
                            )}
                          </DataCell>
                        ))}
                      </CompareRow>
                    </tbody>
                  </table>
                </div>

                {/* Table Footer */}
                <div className="px-5 py-3.5 bg-slate-50/70 border-t border-slate-200/70 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-500">
                  <div className="flex items-center gap-4">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                      Favorable Term
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
                      Sub-limit / Restriction
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full bg-slate-400 inline-block" />
                      Standard Market Term
                    </span>
                  </div>

                  <p className="text-2xs text-slate-400">
                    InsurAI Policy Comparison Matrix • IRDAI Registered Products
                  </p>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ══════════════════════════════════════════════════════
          MODE 2: UPLOADED POLICIES COMPARISON (MONGODB)
          ══════════════════════════════════════════════════════ */}
      {activeMode === 'uploaded' && (
        <div className="space-y-6">
          <ErrorBanner message={uploadedError} onDismiss={() => setUploadedError(null)} />

          {/* Policy selector */}
          <div className="bg-white border border-slate-200/90 rounded-2xl p-5 sm:p-6 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm font-semibold text-slate-800 uppercase tracking-wider">
                Select Uploaded Policies to Compare
              </p>
              <span className="text-xs text-slate-500">
                {selectedUploadedIds.length} selected (min 2)
              </span>
            </div>

            {policies.length === 0 ? (
              <EmptyState
                icon={GitCompare}
                title="No uploaded policies available"
                description="Upload policy documents in the dashboard to run custom contract text comparison, or switch to Market Plans tab above."
              />
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 mb-5">
                  {policies.map((p) => {
                    const isSelected = selectedUploadedIds.includes(p._id);
                    return (
                      <button
                        key={p._id}
                        onClick={() => toggleUploaded(p._id)}
                        aria-pressed={isSelected}
                        className={`p-4 rounded-xl border text-left flex items-start justify-between gap-3 transition-all duration-200 cursor-pointer ${
                          isSelected
                            ? 'border-[#062327] bg-[#d2f57b]/25 shadow-[0_2px_0_#062327]'
                            : 'border-slate-200 bg-slate-50/50 hover:border-slate-300 hover:bg-white'
                        }`}
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900 truncate">
                            {p.insurer_name || p.file_name}
                          </p>
                          <p className="text-xs text-slate-500 capitalize mt-1">
                            {p.policy_type?.replace(/_/g, ' ') || 'Health Insurance'}
                            {p.sum_insured ? ` · ₹${(p.sum_insured / 100000).toFixed(1)}L` : ''}
                          </p>
                        </div>
                        <div
                          className={`w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5 transition-all ${
                            isSelected
                              ? 'bg-[#d2f57b] border border-[#062327] text-[#062327]'
                              : 'border border-slate-300 bg-white'
                          }`}
                        >
                          {isSelected && <Check size={12} strokeWidth={3} className="text-[#062327]" />}
                        </div>
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={handleCompareUploaded}
                    disabled={loadingUploaded || selectedUploadedIds.length < 2}
                    className="btn-pill-lime py-2.5 px-6 text-xs font-bold shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {loadingUploaded ? (
                      <>
                        <Spinner size={14} className="text-[#062327]" />
                        <span>Analyzing Policies…</span>
                      </>
                    ) : (
                      <>
                        <ArrowRightLeft size={14} />
                        <span>
                          Compare Selected {selectedUploadedIds.length > 0 ? `(${selectedUploadedIds.length})` : ''}
                        </span>
                      </>
                    )}
                  </button>
                  {selectedUploadedIds.length < 2 && (
                    <p className="text-xs text-slate-500">Select at least 2 policies to run comparison</p>
                  )}
                </div>
              </>
            )}
          </div>

          {/* Comparison Table */}
          {uploadedResult && metadata.length > 0 && (
            <div className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-xs">
                  <thead className="sticky top-0 z-20 bg-slate-50/90 border-b border-slate-200">
                    <tr>
                      <th className="sticky left-0 z-30 bg-slate-50 px-5 py-4 text-left text-xs font-semibold uppercase tracking-wider text-slate-600 w-52 border-r border-slate-200/70">
                        Feature
                      </th>
                      {metadata.map((m) => (
                        <th
                          key={m.policy_id}
                          className="px-5 py-4 text-left text-xs font-semibold text-slate-900 border-l border-slate-200/70 min-w-[220px]"
                        >
                          <div className="font-bold text-sm text-slate-900">
                            {m.insurer_name}
                          </div>
                          <div className="text-slate-500 font-normal capitalize mt-0.5 text-xs">
                            {m.policy_type?.replace(/_/g, ' ')}
                          </div>
                        </th>
                      ))}
                    </tr>
                  </thead>

                  <tbody>
                    {/* Sum Insured */}
                    <CompareRow label="Sum Insured">
                      {metadata.map((m) => (
                        <DataCell key={m.policy_id}>
                          <span className="font-bold text-slate-900 text-sm tabular-nums">
                            {uploadedResult.coverage_comparison?.[m.policy_id] || '—'}
                          </span>
                        </DataCell>
                      ))}
                    </CompareRow>

                    {/* Annual Premium */}
                    <CompareRow label="Annual Premium" striped>
                      {metadata.map((m) => (
                        <DataCell key={m.policy_id}>
                          <span className="font-bold text-slate-900 text-sm tabular-nums">
                            {uploadedResult.premium_comparison?.[m.policy_id] || '—'}
                          </span>
                        </DataCell>
                      ))}
                    </CompareRow>

                    {/* Room Rent */}
                    <CompareRow label="Room Rent Limit">
                      {metadata.map((m) => {
                        const text = uploadedResult.room_rent_comparison?.[m.policy_id] || '';
                        const hasCap = text.toLowerCase().includes('1%') || text.toLowerCase().includes('cap');
                        return (
                          <DataCell key={m.policy_id}>
                            <Tag text={text} variant={hasCap ? 'negative' : 'positive'} />
                          </DataCell>
                        );
                      })}
                    </CompareRow>

                    {/* Co-Payment */}
                    <CompareRow label="Co-Payment" striped>
                      {metadata.map((m) => {
                        const text = uploadedResult.copay_comparison?.[m.policy_id] || '';
                        const zeroCopay =
                          text.includes('0%') ||
                          text.toLowerCase().includes('zero') ||
                          text.toLowerCase().includes('nil');
                        return (
                          <DataCell key={m.policy_id}>
                            <Tag text={text} variant={zeroCopay ? 'positive' : 'negative'} />
                          </DataCell>
                        );
                      })}
                    </CompareRow>

                    {/* Waiting Periods */}
                    <CompareRow label="Waiting Periods">
                      {metadata.map((m) => {
                        const waits = uploadedResult.waiting_periods_comparison?.[m.policy_id] || [];
                        return (
                          <DataCell key={m.policy_id}>
                            {waits.length === 0 ? (
                              <span className="text-slate-400">—</span>
                            ) : (
                              <ul className="space-y-1">
                                {waits.map((w, i) => (
                                  <li key={i} className="flex items-start gap-2 text-xs text-slate-700">
                                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-1.5 flex-shrink-0" />
                                    {w}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </DataCell>
                        );
                      })}
                    </CompareRow>

                    {/* Exclusions */}
                    <CompareRow label="Key Exclusions" striped>
                      {metadata.map((m) => {
                        const exclusions = uploadedResult.exclusions_diff?.[m.policy_id] || [];
                        return (
                          <DataCell key={m.policy_id}>
                            {exclusions.length === 0 ? (
                              <span className="text-slate-400">—</span>
                            ) : (
                              <ul className="space-y-1">
                                {exclusions.map((ex, i) => (
                                  <li key={i} className="flex items-start gap-2 text-xs text-slate-700">
                                    <span className="w-1.5 h-1.5 rounded-full bg-rose-500 mt-1.5 flex-shrink-0" />
                                    {ex}
                                  </li>
                                ))}
                              </ul>
                            )}
                          </DataCell>
                        );
                      })}
                    </CompareRow>
                  </tbody>
                </table>
              </div>

              {/* Table footer */}
              <div className="px-5 py-3.5 bg-slate-50/70 border-t border-slate-200/70 flex items-center justify-between text-xs text-slate-500">
                <div className="flex items-center gap-4">
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" />
                    Favorable
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-500 inline-block" />
                    Restrictive
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-slate-400 inline-block" />
                    Neutral
                  </span>
                </div>
                <p className="text-2xs text-slate-400">AI Policy Comparison Matrix</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
