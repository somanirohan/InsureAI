import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Calculator, RefreshCw, TrendingDown, ArrowRight, ChevronDown, ChevronUp, Search, BookOpen, FileText, X, Sparkles, Filter } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import api from '../../services/api';
import { Select, Spinner, EmptyState, ErrorBanner } from '../common/ui';

// Quick picks for common high-frequency procedures
const QUICK_TREATMENTS = [
  { value: 'Knee Replacement',           label: 'Total Knee Replacement (Orthopedic)' },
  { value: 'Angioplasty',                label: 'Coronary Angioplasty / PTCA (Cardiology)' },
  { value: 'Cataract Surgery',           label: 'Cataract Extraction with IOL (Eye Care)' },
  { value: 'Appendectomy',               label: 'Appendicectomy (GI Surgery)' },
  { value: 'Gallbladder Removal',        label: 'Cholecystectomy / Gallbladder (GI Surgery)' },
  { value: 'Cardiac Bypass (CABG)',      label: 'Coronary Artery Bypass (CABG)' },
  { value: 'Cesarean Section',           label: 'Cesarean Section / C-Section (Obstetrics)' },
  { value: 'Normal Delivery',            label: 'Normal Delivery with Episiotomy' },
  { value: 'Tonsillectomy',              label: 'Tonsillectomy (ENT)' },
  { value: 'MRI Brain',                  label: 'MRI Brain / Head with/without Contrast' },
  { value: 'Root Canal Treatment',       label: 'Root Canal Treatment (RCT Dental)' },
  { value: 'Chemotherapy',               label: 'Chemotherapy Cycle (Oncology)' },
];

const HOSPITAL_TIERS = [
  { value: 'tier_1', label: 'Tier 1 — Metro / NABH Accredited Hospital' },
  { value: 'tier_2', label: 'Tier 2 — Non-Metro Private Hospital' },
  { value: 'tier_3', label: 'Tier 3 — District / Semi-Urban / Non-NABH' },
];

const WHATIF_VARS = [
  { value: 'hospital_tier', label: 'Change Hospital Tier' },
  { value: 'rider',         label: 'Add Zero-Copay Rider' },
  { value: 'sum_insured',   label: 'Simulate Higher Sum Insured' },
];

const WHATIF_VALUES = {
  hospital_tier: [
    { value: 'tier_2', label: 'Tier 2 Hospital' },
    { value: 'tier_3', label: 'Tier 3 Hospital' },
  ],
  rider: [
    { value: 'zero_copay_rider', label: 'Enable Zero Co-Pay Rider' },
  ],
  sum_insured: [
    { value: '2000000', label: '₹20 Lakh' },
    { value: '5000000', label: '₹50 Lakh' },
  ],
};

// Currency formatter
const fmt = (n) => n !== undefined && n !== null ? `₹${Number(n).toLocaleString('en-IN')}` : '—';
const pct = (a, b) => b ? `${Math.round((a / b) * 100)}%` : '—';

// Custom tooltip for bar chart
const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#1e1e23] border border-white/[0.10] rounded-xl px-3 py-2.5 text-xs shadow-md">
      <p className="text-zinc-400 mb-1">{label}</p>
      {payload.map((p, i) => (
        <p key={i} style={{ color: p.color }} className="font-medium">
          {p.name}: {fmt(p.value)}
        </p>
      ))}
    </div>
  );
};

// Breakdown row component
function BreakdownRow({ label, value, accent, note, deduction }) {
  return (
    <div className={`flex items-start justify-between py-3 border-b border-white/[0.05] last:border-0 gap-4 ${accent ? 'border-0 pt-3' : ''}`}>
      <div className="flex-1">
        <p className={`text-sm ${accent ? 'font-semibold text-zinc-100' : 'text-zinc-400'}`}>{label}</p>
        {note && <p className="text-xs text-zinc-600 mt-0.5">{note}</p>}
      </div>
      <p className={`text-sm font-mono font-semibold flex-shrink-0 ${
        accent === 'green' ? 'text-brand-500' :
        accent === 'red'   ? 'text-red-400' :
        deduction          ? 'text-amber-400' :
        'text-zinc-200'
      }`}>
        {deduction ? '-' : ''}{value}
      </p>
    </div>
  );
}

// Treatment Search Component with CGHS Rate Card Autocomplete
function TreatmentSearch({ value, onChange, selectedRateCardInfo }) {
  const [query, setQuery] = useState(value || '');
  const [results, setResults] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [showQuickPicks, setShowQuickPicks] = useState(false);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('');
  const wrapperRef = useRef(null);
  const searchTimeoutRef = useRef(null);

  // Sync external value
  useEffect(() => {
    if (value !== query) {
      setQuery(value || '');
    }
  }, [value]);

  // Load categories once
  useEffect(() => {
    async function loadCats() {
      try {
        const res = await api.get('/cost/rate-card/categories');
        if (res.data?.categories) {
          setCategories(res.data.categories);
        }
      } catch (err) {
        // ignore fallback
      }
    }
    loadCats();
  }, []);

  // Close dropdown on click outside
  useEffect(() => {
    function handleClickOutside(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setIsOpen(false);
        setShowQuickPicks(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const searchRateCard = useCallback(async (searchQuery, categoryFilter) => {
    if (!searchQuery || searchQuery.length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const res = await api.get('/cost/rate-card/search', {
        params: {
          q: searchQuery,
          category: categoryFilter || undefined,
          limit: 15,
        }
      });
      setResults(res.data.treatments || []);
    } catch (err) {
      console.error('Rate card search error:', err);
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  const handleInputChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    onChange(val);
    setIsOpen(true);
    setShowQuickPicks(false);

    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => searchRateCard(val, selectedCategory), 250);
  };

  const handleCategoryChange = (catName) => {
    const nextCat = selectedCategory === catName ? '' : catName;
    setSelectedCategory(nextCat);
    if (query) {
      searchRateCard(query, nextCat);
    }
  };

  const handleSelect = (treatment) => {
    setQuery(treatment.treatment_name);
    onChange(treatment.treatment_name);
    setIsOpen(false);
    setResults([]);
  };

  const handleQuickPick = (t) => {
    setQuery(t.value);
    onChange(t.value);
    setShowQuickPicks(false);
    setIsOpen(false);
  };

  const handleClear = () => {
    setQuery('');
    onChange('');
    setResults([]);
    setIsOpen(false);
  };

  return (
    <div ref={wrapperRef} className="relative">
      <div className="flex items-center justify-between mb-2">
        <label className="label-xs block">
          Medical Procedure
        </label>
        <span className="text-2xs text-brand-500 font-medium flex items-center gap-1">
          <Sparkles size={11} /> 1,750+ CGHS Rates
        </span>
      </div>

      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={handleInputChange}
          onFocus={() => {
            if (query.length >= 2) setIsOpen(true);
            else if (!query) setShowQuickPicks(true);
          }}
          placeholder="Search treatments... (e.g. knee replacement, CABG, cataract, MRI)"
          className="input-field pl-9 pr-9"
        />
        {query && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Quick Picks Dropdown */}
      {showQuickPicks && !query && (
        <div className="absolute z-50 mt-1.5 w-full bg-[#1a1a1f] border border-white/[0.08] rounded-xl shadow-2xl overflow-hidden backdrop-blur-md">
          <div className="px-3.5 py-2.5 border-b border-white/[0.06] flex items-center justify-between bg-white/[0.02]">
            <p className="text-2xs text-zinc-400 uppercase tracking-wider font-semibold">Popular Quick Picks</p>
            <span className="text-2xs text-zinc-500">Click to select</span>
          </div>
          <div className="max-h-56 overflow-y-auto scroll-area divide-y divide-white/[0.02]">
            {QUICK_TREATMENTS.map(t => (
              <button
                key={t.value}
                type="button"
                onClick={() => handleQuickPick(t)}
                className="w-full text-left px-3.5 py-2.5 text-xs text-zinc-300 hover:bg-white/[0.06] hover:text-white transition-all flex items-center justify-between group"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <BookOpen size={13} className="text-brand-500/70 flex-shrink-0 group-hover:text-brand-500" />
                  <span className="truncate">{t.label}</span>
                </div>
                <span className="text-2xs text-zinc-600 group-hover:text-zinc-400 font-mono">Select →</span>
              </button>
            ))}
          </div>
          <div className="px-3 py-2 border-t border-white/[0.06] bg-white/[0.01]">
            <p className="text-2xs text-zinc-500 text-center">Type any medical term to search 1,750+ CGHS Rate Card procedures</p>
          </div>
        </div>
      )}

      {/* Autocomplete Search Results Dropdown */}
      {isOpen && (results.length > 0 || searching) && (
        <div className="absolute z-50 mt-1.5 w-full bg-[#1a1a1f] border border-white/[0.08] rounded-xl shadow-2xl overflow-hidden backdrop-blur-md">
          {searching ? (
            <div className="px-4 py-6 flex items-center justify-center gap-2.5 text-xs text-zinc-400">
              <Spinner size={14} /> Searching official CGHS rate card...
            </div>
          ) : (
            <>
              <div className="px-3.5 py-2.5 border-b border-white/[0.06] flex items-center justify-between bg-white/[0.02]">
                <p className="text-2xs text-zinc-400 uppercase tracking-wider font-semibold">
                  CGHS Rate Card Matches
                </p>
                <span className="text-2xs px-2 py-0.5 rounded-full bg-brand-500/10 text-brand-500 font-mono font-medium">
                  {results.length} found
                </span>
              </div>
              <div className="max-h-64 overflow-y-auto scroll-area divide-y divide-white/[0.03]">
                {results.map((t, idx) => (
                  <button
                    key={`${t.sr_no}-${idx}`}
                    type="button"
                    onClick={() => handleSelect(t)}
                    className="w-full text-left px-3.5 py-2.5 hover:bg-white/[0.06] transition-all group"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-zinc-200 group-hover:text-white leading-snug truncate">
                          {t.treatment_name}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-2xs px-1.5 py-0.5 rounded bg-brand-500/10 text-brand-400 font-medium">
                            {t.category}
                          </span>
                          <span className="text-2xs text-zinc-500">#{t.sr_no}</span>
                          {t.relevance_score && (
                            <span className="text-2xs text-zinc-600">
                              {Math.round(t.relevance_score * 100)}% match
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-xs font-mono font-semibold text-brand-400">
                          ₹{t.nabh_rate?.toLocaleString('en-IN')}
                        </p>
                        <p className="text-2xs text-zinc-500">NABH Rate</p>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// Rate Card Match Badge
function RateCardBadge({ match }) {
  if (!match) return null;
  return (
    <div className="flex items-start gap-3.5 p-4 rounded-xl bg-brand-500/[0.07] border border-brand-500/[0.15]">
      <FileText size={18} className="text-brand-500 flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-semibold text-brand-400 uppercase tracking-wider">
            CGHS Hospital Rate Card Match
          </p>
          <span className="text-2xs px-2 py-0.5 rounded-full bg-brand-500/15 text-brand-300 font-mono">
            {Math.round((match.relevance_score || 0) * 100)}% Confidence
          </span>
        </div>
        <p className="text-sm font-medium text-zinc-200 mt-1 leading-snug">
          {match.matched_treatment}
        </p>
        <div className="flex flex-wrap items-center gap-y-1 gap-x-4 mt-2 text-xs text-zinc-400">
          <span>Specialty: <strong className="text-zinc-300 font-normal">{match.category}</strong></span>
          <span>NABH (Metro): <strong className="text-brand-400 font-mono">₹{match.nabh_rate?.toLocaleString('en-IN')}</strong></span>
          <span>Non-NABH: <strong className="text-zinc-300 font-mono">₹{match.non_nabh_rate?.toLocaleString('en-IN')}</strong></span>
        </div>
        <p className="text-2xs text-zinc-500 mt-1.5">
          Source: {match.source} · Official Schedule (Delhi/NCR) · Page {match.source_page}
        </p>
      </div>
    </div>
  );
}

export default function CostEstimatorView({ policies }) {
  const [selectedPolicyId, setSelectedPolicyId] = useState(policies[0]?._id || '');
  const [treatmentName, setTreatmentName]     = useState('');
  const [hospitalTier, setHospitalTier]       = useState('tier_1');
  const [roomRentPerDay, setRoomRentPerDay]   = useState(12000);
  const [stayDays, setStayDays]               = useState(4);
  const [loading, setLoading]                 = useState(false);
  const [estimate, setEstimate]               = useState(null);
  const [history, setHistory]                 = useState([]);
  const [error, setError]                     = useState(null);

  // What-if simulator
  const [whatIfVar, setWhatIfVar]         = useState('hospital_tier');
  const [whatIfVal, setWhatIfVal]         = useState('tier_2');
  const [whatIfLoading, setWhatIfLoading] = useState(false);
  const [showWhatIf, setShowWhatIf]       = useState(false);

  useEffect(() => {
    if (policies.length > 0 && !selectedPolicyId) {
      setSelectedPolicyId(policies[0]._id);
    }
    fetchHistory();
  }, [policies]);

  const fetchHistory = async () => {
    try {
      const res = await api.get('/cost/history');
      setHistory(res.data.estimates || []);
      if (res.data.estimates?.length > 0) setEstimate(res.data.estimates[0]);
    } catch (err) {
      console.error(err);
    }
  };

  const handleCalculate = async (e) => {
    e.preventDefault();
    if (!selectedPolicyId || !treatmentName) return;
    setError(null);
    try {
      setLoading(true);
      const res = await api.post('/cost/estimate', {
        policy_id: selectedPolicyId,
        treatment_name: treatmentName,
        hospital_tier: hospitalTier,
        room_rent_per_day: roomRentPerDay,
        stay_days: stayDays,
      });
      setEstimate(res.data.estimate);
      fetchHistory();
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.detail || 'Calculation failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleWhatIf = async () => {
    if (!estimate) return;
    setError(null);
    try {
      setWhatIfLoading(true);
      const res = await api.post(`/cost/estimate/${estimate._id}/what-if`, {
        changed_variable: whatIfVar,
        new_value: whatIfVal,
      });
      setEstimate(res.data.estimate);
    } catch (err) {
      setError(err.response?.data?.error || 'What-if simulation failed.');
    } finally {
      setWhatIfLoading(false);
    }
  };

  const breakdown = estimate?.cost_breakdown || {};
  const variants  = estimate?.what_if_variants || [];
  const rateCardMatch = estimate?.rate_card_match || null;

  const policyOptions = policies.map(p => ({
    value: p._id,
    label: `${p.insurer_name} (₹${p.sum_insured ? (p.sum_insured / 100000).toFixed(1) + 'L' : 'N/A'})`,
  }));

  // Chart data for covered vs out-of-pocket
  const chartData = estimate ? [
    { name: 'Insurer Pays', value: estimate.covered_amount },
    { name: 'Your Share',   value: estimate.out_of_pocket_amount },
  ] : [];

  const COLORS = ['#30d158', '#ff453a'];

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-xl font-semibold text-zinc-100 tracking-tight">Cost Estimator</h1>
        <p className="text-sm text-zinc-400 mt-0.5">
          Accurate out-of-pocket estimates using the official CGHS Rate Card (1,750+ procedures), policy room-rent limits, co-pay, and deductions
        </p>
      </div>

      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        {/* Input Form Column */}
        <div className="lg:col-span-2 space-y-4">
          <div className="surface p-5 space-y-4">
            <div className="pb-3 border-b border-white/[0.06] flex items-center justify-between">
              <p className="text-sm font-semibold text-zinc-200">
                Estimation Inputs
              </p>
              <span className="text-2xs px-2 py-0.5 rounded-full bg-brand-500/10 text-brand-500 font-medium">
                CGHS Rate Card
              </span>
            </div>

            <form onSubmit={handleCalculate} className="space-y-4">
              {policies.length > 0 ? (
                <Select
                  label="Policy"
                  value={selectedPolicyId}
                  onChange={setSelectedPolicyId}
                  options={policyOptions}
                />
              ) : (
                <div className="text-xs text-zinc-500 p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                  Upload a policy first to calculate costs.
                </div>
              )}

              <TreatmentSearch
                value={treatmentName}
                onChange={setTreatmentName}
              />

              <Select
                label="Hospital Tier"
                value={hospitalTier}
                onChange={setHospitalTier}
                options={HOSPITAL_TIERS}
              />

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label-xs block mb-2">Room Rent/Day (₹)</label>
                  <input
                    type="number"
                    value={roomRentPerDay}
                    onChange={e => setRoomRentPerDay(Number(e.target.value))}
                    min={1000}
                    step={500}
                    className="input-field"
                  />
                </div>
                <div>
                  <label className="label-xs block mb-2">Stay (Days)</label>
                  <input
                    type="number"
                    value={stayDays}
                    onChange={e => setStayDays(Number(e.target.value))}
                    min={1}
                    max={90}
                    className="input-field"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || !selectedPolicyId || !treatmentName}
                className="btn btn-primary w-full py-2.5 font-semibold"
              >
                {loading ? <><Spinner size={14} className="text-black" /> Calculating…</> : <>
                  <Calculator size={14} /> Calculate Out-of-Pocket Cost
                </>}
              </button>
            </form>
          </div>

          {/* Previous Estimates History */}
          {history.length > 0 && (
            <div className="surface p-4">
              <p className="label-xs mb-3">Previous Estimates</p>
              <div className="space-y-1 max-h-44 overflow-y-auto scroll-area">
                {history.map(est => (
                  <button
                    key={est._id}
                    onClick={() => setEstimate(est)}
                    className={`w-full text-left px-3 py-2.5 rounded-xl text-xs flex items-center justify-between transition-all ${
                      estimate?._id === est._id
                        ? 'bg-white/[0.07] text-zinc-200'
                        : 'text-zinc-500 hover:text-zinc-300 hover:bg-white/[0.04]'
                    }`}
                  >
                    <span className="truncate mr-2">{est.treatment_name}</span>
                    <span className="font-mono text-zinc-400 flex-shrink-0">
                      {fmt(est.out_of_pocket_amount)} OOP
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Results Column */}
        <div className="lg:col-span-3 space-y-4">
          {estimate ? (
            <>
              {/* Rate Card Match Banner */}
              <RateCardBadge match={rateCardMatch} />

              {/* Summary Metrics */}
              <div className="grid grid-cols-3 gap-3">
                <div className="surface p-4">
                  <p className="label-xs mb-2">Total Hospital Bill</p>
                  <p className="text-xl font-semibold text-zinc-100 tracking-tight">{fmt(estimate.estimated_total_cost)}</p>
                  <p className="text-xs text-zinc-500 mt-1 capitalize">{estimate.hospital_tier?.replace('_', ' ')}</p>
                </div>
                <div className="surface p-4 border-brand-500/20">
                  <p className="label-xs mb-2 text-brand-500">Insurer Pays</p>
                  <p className="text-xl font-semibold text-brand-500 tracking-tight">{fmt(estimate.covered_amount)}</p>
                  <p className="text-xs text-brand-500/60 mt-1">{pct(estimate.covered_amount, estimate.estimated_total_cost)} covered</p>
                </div>
                <div className="surface p-4 border-red-500/20">
                  <p className="label-xs mb-2 text-red-400">Your Share</p>
                  <p className="text-xl font-semibold text-red-400 tracking-tight">{fmt(estimate.out_of_pocket_amount)}</p>
                  <p className="text-xs text-red-400/60 mt-1">Out-of-pocket</p>
                </div>
              </div>

              {/* Bar Chart */}
              <div className="surface p-5">
                <p className="text-sm font-medium text-zinc-300 mb-4">Cost Distribution</p>
                <ResponsiveContainer width="100%" height={120}>
                  <BarChart data={chartData} layout="vertical" margin={{ left: 0, right: 20, top: 0, bottom: 0 }}>
                    <XAxis type="number" hide />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={90}
                      tick={{ fill: '#71717a', fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                    <Bar dataKey="value" radius={[0, 6, 6, 0]} maxBarSize={32}>
                      {chartData.map((entry, i) => (
                        <Cell key={i} fill={COLORS[i]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Detailed Breakdown Audit */}
              <div className="surface p-5">
                <p className="text-sm font-medium text-zinc-300 mb-2">Detailed Financial Audit</p>
                <div>
                  <BreakdownRow label="Base Hospital & Surgical Charges (CGHS Benchmark)" value={fmt(breakdown.base_hospital_charges)} />
                  {breakdown.room_rent_copay_penalty > 0 && (
                    <BreakdownRow
                      label="Room Rent Proportionate Deduction"
                      note={`Policy cap: ₹${breakdown.room_rent_cap_per_day?.toLocaleString('en-IN')}/day`}
                      value={fmt(breakdown.room_rent_copay_penalty)}
                      deduction
                    />
                  )}
                  {breakdown.copay_percentage > 0 && (
                    <BreakdownRow
                      label={`Co-Payment (${breakdown.copay_percentage}%)`}
                      value={fmt(breakdown.copay_amount)}
                      deduction
                    />
                  )}
                  <BreakdownRow
                    label="Excluded Items (IRDAI non-payables, 7% consumables)"
                    value={fmt(breakdown.excluded_items_cost)}
                    deduction
                  />
                  <div className="border-t border-white/[0.08] pt-3">
                    <BreakdownRow
                      label="Net Admissible Insurer Claim"
                      value={fmt(breakdown.final_payable_by_insurer)}
                      accent="green"
                    />
                  </div>
                </div>
              </div>

              {/* Assumptions & Citations */}
              {(estimate.assumptions?.length > 0 || estimate.citations?.length > 0) && (
                <div className="surface p-5">
                  <p className="text-sm font-medium text-zinc-300 mb-3">Policy Audit & Citations</p>
                  {estimate.assumptions?.map((a, i) => (
                    <p key={i} className="text-xs text-zinc-500 leading-relaxed py-1 border-b border-white/[0.03] last:border-0">
                      • {a}
                    </p>
                  ))}
                  {estimate.citations?.filter(c => c.category === 'rate_card').map((c, i) => (
                    <div key={i} className="mt-2.5 px-3 py-2 rounded-lg bg-brand-500/[0.05] border border-brand-500/[0.1]">
                      <p className="text-2xs text-brand-500 uppercase tracking-wider font-semibold mb-0.5">Rate Card Benchmark Source</p>
                      <p className="text-xs text-zinc-300">{c.text}</p>
                      {c.page && <p className="text-2xs text-zinc-500 mt-0.5">Page {c.page} of Rate_CARD_HOSPITAL.pdf</p>}
                    </div>
                  ))}
                </div>
              )}

              {/* What-If Simulator */}
              <div className="surface overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowWhatIf(v => !v)}
                  className="w-full px-5 py-4 flex items-center justify-between text-sm font-medium text-zinc-300 hover:bg-white/[0.02] transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <RefreshCw size={14} className="text-brand-500" />
                    <span>What-If Simulator</span>
                  </div>
                  {showWhatIf ? <ChevronUp size={15} className="text-zinc-500" /> : <ChevronDown size={15} className="text-zinc-500" />}
                </button>

                {showWhatIf && (
                  <div className="px-5 pb-5 border-t border-white/[0.06] pt-4 space-y-4">
                    <p className="text-xs text-zinc-400">
                      Simulate alternative scenarios (switching hospital tier, adding riders, or expanding sum insured) to optimize out-of-pocket expenses.
                    </p>

                    <div className="flex flex-col sm:flex-row gap-3">
                      <Select
                        value={whatIfVar}
                        onChange={(v) => {
                          setWhatIfVar(v);
                          setWhatIfVal(WHATIF_VALUES[v][0].value);
                        }}
                        options={WHATIF_VARS}
                        className="flex-1"
                      />
                      <Select
                        value={whatIfVal}
                        onChange={setWhatIfVal}
                        options={WHATIF_VALUES[whatIfVar] || []}
                        className="flex-1"
                      />
                      <button
                        type="button"
                        onClick={handleWhatIf}
                        disabled={whatIfLoading}
                        className="btn btn-primary gap-2 whitespace-nowrap"
                      >
                        {whatIfLoading ? <Spinner size={13} className="text-black" /> : <ArrowRight size={13} />}
                        {whatIfLoading ? 'Simulating…' : 'Simulate'}
                      </button>
                    </div>

                    {/* Simulation Variants Results */}
                    {variants.length > 0 && (
                      <div className="space-y-2 mt-2">
                        <p className="label-xs">Simulated Scenarios</p>
                        {variants.map(v => (
                          <div
                            key={v.variant_id}
                            className="surface-inset rounded-xl p-3.5 flex items-center justify-between gap-4"
                          >
                            <div>
                              <p className="text-xs font-medium text-zinc-200 capitalize">
                                {v.changed_variable?.replace(/_/g, ' ')}
                                <span className="text-brand-400 ml-1 font-semibold">→ {v.new_value}</span>
                              </p>
                              <p className="text-2xs text-zinc-400 mt-0.5">
                                Total: {fmt(v.recalculated_total_cost)} · Insurer: {fmt(v.recalculated_covered_amount)}
                              </p>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <p className="text-2xs text-zinc-500 uppercase">New OOP</p>
                              <p className="text-sm font-semibold text-brand-400">{fmt(v.recalculated_out_of_pocket)}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="surface h-80 flex items-center justify-center">
              <EmptyState
                icon={Calculator}
                title="No estimate generated yet"
                description="Search for a treatment from 1,750+ CGHS hospital procedures, select your policy, and calculate your personalized cost breakdown."
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
