import React, { useState, useEffect } from 'react';
import {
  Calculator,
  RefreshCw,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  CheckCircle2,
  TrendingDown,
  Info,
  Shield,
  Layers,
  History,
} from 'lucide-react';
import api from '../../services/api';
import { useLanguage } from '../../context/LanguageContext';
import { Select, Spinner, EmptyState, ErrorBanner } from '../common/ui';

const TREATMENTS = [
  { value: 'Knee Replacement',         label: 'Knee Replacement (Orthopedic)' },
  { value: 'Angioplasty',              label: 'Angioplasty / Stent (Cardiology)' },
  { value: 'Cataract Surgery',         label: 'Cataract Surgery (Daycare)' },
  { value: 'Appendectomy',             label: 'Appendectomy (General Surgery)' },
  { value: 'Gallbladder Removal',      label: 'Gallbladder Removal (Laparoscopic)' },
  { value: 'Cardiac Bypass (CABG)',    label: 'Cardiac Bypass CABG' },
  { value: 'Chemotherapy (per cycle)', label: 'Chemotherapy (per cycle)' },
  { value: 'custom',                   label: 'Other (Custom Procedure...)' },
];

const HOSPITAL_TIERS = [
  { value: 'tier_1', label: 'Tier 1 — Metro Super Specialty' },
  { value: 'tier_2', label: 'Tier 2 — Non-Metro Private' },
  { value: 'tier_3', label: 'Tier 3 — District / Semi-Urban' },
];

const WHATIF_VARS = [
  { value: 'hospital_tier', label: 'Change Hospital Tier' },
  { value: 'rider',         label: 'Add Zero-Copay Rider' },
  { value: 'sum_insured',   label: 'Simulate Higher Sum Insured' },
];

const WHATIF_VALUES = {
  hospital_tier: [
    { value: 'tier_2', label: 'Tier 2 Hospital (Non-Metro)' },
    { value: 'tier_3', label: 'Tier 3 Hospital (Semi-Urban)' },
  ],
  rider: [
    { value: 'zero_copay_rider', label: 'Enable Zero Co-Pay Rider' },
  ],
  sum_insured: [
    { value: '2000000', label: '₹20 Lakh Sum Insured' },
    { value: '5000000', label: '₹50 Lakh Sum Insured' },
  ],
};

// ─── Currency & Percentage Formatters (Professional Clean Figures) ─────────
const fmt = (n) =>
  n !== undefined && n !== null ? `₹${Number(n).toLocaleString('en-IN')}` : '—';

const pct = (a, b) =>
  b && b > 0 ? `${Math.round((Number(a) / Number(b)) * 100)}%` : '0%';

// ─── Itemized Audit Breakdown Row ──────────────────────────────────────────
function AuditRow({ label, value, type = 'normal', note, isDeduction = false }) {
  return (
    <div className={`py-3.5 border-b border-[#062327]/[0.06] last:border-0 ${type === 'total' ? 'bg-[#f4faf7] -mx-4 sm:-mx-6 px-4 sm:px-6 rounded-2xl border-0 my-1 py-4' : ''}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {type === 'deduction' && (
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 flex-shrink-0" />
            )}
            {type === 'total' && (
              <CheckCircle2 size={16} className="text-emerald-700 flex-shrink-0" />
            )}
            <p className={`text-xs sm:text-sm ${
              type === 'total'
                ? 'font-bold text-[#062327]'
                : type === 'deduction'
                ? 'font-medium text-[#1e3e44]'
                : 'font-semibold text-[#062327]'
            }`}>
              {label}
            </p>
          </div>
          {note && (
            <div className="mt-1 pl-3.5 border-l-2 border-amber-300 text-[11px] text-[#558187] leading-relaxed">
              {note}
            </div>
          )}
        </div>

        <div className="text-right flex-shrink-0">
          <p className={`text-xs sm:text-sm font-bold font-sans tabular-nums tracking-tight ${
            type === 'total'
              ? 'text-emerald-800 text-sm sm:text-base'
              : type === 'deduction'
              ? 'text-rose-700'
              : 'text-[#062327]'
          }`}>
            {isDeduction ? '− ' : ''}{value}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function CostEstimatorView({ policies }) {
  const { t } = useLanguage();
  const [selectedPolicyId, setSelectedPolicyId]     = useState(policies[0]?._id || '');
  const [treatmentSelection, setTreatmentSelection] = useState('Knee Replacement');
  const [customTreatment, setCustomTreatment]       = useState('');
  const [hospitalTier, setHospitalTier]             = useState('tier_1');
  const [roomRentPerDay, setRoomRentPerDay]         = useState(12000);
  const [stayDays, setStayDays]                     = useState(4);

  const [loading, setLoading]                       = useState(false);
  const [estimate, setEstimate]                     = useState(null);
  const [history, setHistory]                       = useState([]);
  const [error, setError]                           = useState(null);

  // What-if simulator
  const [whatIfVar, setWhatIfVar]             = useState('hospital_tier');
  const [whatIfVal, setWhatIfVal]             = useState('tier_2');
  const [whatIfLoading, setWhatIfLoading]     = useState(false);
  const [showWhatIf, setShowWhatIf]           = useState(true);

  // Ensure default policy is set when policies load
  useEffect(() => {
    if (policies.length > 0 && !selectedPolicyId) {
      setSelectedPolicyId(policies[0]._id);
    }
    fetchHistory();
  }, [policies]);

  const fetchHistory = async () => {
    try {
      const res = await api.get('/cost/history');
      const fetchedEstimates = res.data.estimates || [];
      setHistory(fetchedEstimates);
      if (fetchedEstimates.length > 0 && !estimate) {
        // If current selectedPolicy has an estimate, pick it, otherwise first estimate
        const activePolicyEst = fetchedEstimates.find(e => e.policy_id === selectedPolicyId) || fetchedEstimates[0];
        setEstimate(activePolicyEst);
        if (activePolicyEst.policy_id && activePolicyEst.policy_id !== selectedPolicyId) {
          setSelectedPolicyId(activePolicyEst.policy_id);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const calculateEstimate = async (targetPolicyId, customTreatmentName = null) => {
    const polId = targetPolicyId || selectedPolicyId;
    const effectiveTreatment = customTreatmentName || (
      treatmentSelection === 'custom' ? customTreatment.trim() : treatmentSelection
    );

    if (!polId || !effectiveTreatment) {
      if (treatmentSelection === 'custom' && !customTreatment.trim()) {
        setError('Please enter the custom medical procedure name.');
      }
      return;
    }
    setError(null);
    try {
      setLoading(true);
      const res = await api.post('/cost/estimate', {
        policy_id: polId,
        treatment_name: effectiveTreatment,
        hospital_tier: hospitalTier,
        room_rent_per_day: roomRentPerDay,
        stay_days: stayDays,
      });
      setEstimate(res.data.estimate);
      fetchHistory();
    } catch (err) {
      setError(err.response?.data?.error || err.response?.data?.detail || 'Calculation failed. Please check inputs and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handlePolicyChange = (newPolicyId) => {
    setSelectedPolicyId(newPolicyId);
    // Automatically adjust and recalculate costs for the newly selected policy
    if (newPolicyId) {
      calculateEstimate(newPolicyId);
    }
  };

  const handleCalculate = async (e) => {
    if (e) e.preventDefault();
    calculateEstimate(selectedPolicyId);
  };

  const handleSelectHistoryItem = (est) => {
    setEstimate(est);
    if (est.policy_id) {
      setSelectedPolicyId(est.policy_id);
    }
    if (est.treatment_name) {
      if (TREATMENTS.some(t => t.value === est.treatment_name)) {
        setTreatmentSelection(est.treatment_name);
      } else {
        setTreatmentSelection('custom');
        setCustomTreatment(est.treatment_name);
      }
    }
    if (est.hospital_tier) setHospitalTier(est.hospital_tier);
    if (est.room_rent_per_day) setRoomRentPerDay(Number(est.room_rent_per_day));
    if (est.stay_days) setStayDays(Number(est.stay_days));
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

  const selectedPolicy = policies.find(p => p._id === selectedPolicyId);
  const estimatePolicy = policies.find(p => p._id === estimate?.policy_id) || selectedPolicy;

  const policyOptions = policies.map(p => ({
    value: p._id,
    label: `${p.insurer_name} (${p.sum_insured ? '₹' + (p.sum_insured / 100000).toFixed(1) + 'L' : 'Policy'})`,
  }));

  // Calculations for progress bar
  const totalCost = estimate?.estimated_total_cost || 0;
  const coveredAmount = estimate?.covered_amount || 0;
  const outOfPocket = estimate?.out_of_pocket_amount || 0;
  const coveredPctNum = totalCost > 0 ? Math.round((coveredAmount / totalCost) * 100) : 0;
  const outOfPocketPctNum = Math.max(0, 100 - coveredPctNum);

  return (
    <div className="space-y-8">
      {/* ─── Page Header ────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="font-headline text-2xl sm:text-3xl font-extrabold text-[#062327] tracking-tight">
              {t('cost.title', 'Cost Estimator & Bill Audit')}
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-[#558187] mt-1 font-medium max-w-2xl">
            {t('cost.subtitle', 'Simulate hospitalization out-of-pocket expenses and hidden room-rent sub-limit penalties with clause-level precision.')}
          </p>
        </div>

        {selectedPolicy && (
          <div className="flex items-center gap-2 px-3.5 py-2 rounded-2xl bg-white border border-[#062327]/10 shadow-sm self-start sm:self-auto">
            <Shield size={15} className="text-[#062327]" />
            <div className="text-xs">
              <span className="text-[#558187] font-medium">Active Policy: </span>
              <strong className="text-[#062327] font-bold">{selectedPolicy.insurer_name}</strong>
            </div>
          </div>
        )}
      </div>

      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      {/* ─── Main Two-Column Layout ──────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-7 items-start">
        {/* ─── Left Column: Parameters & History (4 cols) ────── */}
        <div className="lg:col-span-4 space-y-6">
          {/* Estimation Parameters Card */}
          <div className="bg-white border border-[#062327]/10 rounded-3xl p-6 shadow-sm">
            <div className="flex items-center justify-between pb-4 mb-5 border-b border-[#062327]/08">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-xl bg-[#d2f57b] border border-[#062327]/20 flex items-center justify-center text-[#062327] shadow-xs">
                  <Calculator size={16} className="stroke-[2.2]" />
                </div>
                <div>
                  <h2 className="font-headline text-sm font-bold text-[#062327] leading-tight">
                    {t('Simulation Parameters')}
                  </h2>
                  <p className="text-[11px] text-[#558187]">Admission & hospital specifications</p>
                </div>
              </div>
            </div>

            <form onSubmit={handleCalculate} className="space-y-4">
              {policies.length > 0 ? (
                <Select
                  label={t('cost.select_policy', 'Policy Document')}
                  value={selectedPolicyId}
                  onChange={handlePolicyChange}
                  options={policyOptions}
                />
              ) : (
                <div className="text-xs text-[#558187] p-3.5 rounded-2xl bg-[#f5f8f8] border border-[#062327]/10">
                  Upload an insurance policy first to calculate costs.
                </div>
              )}

              <div>
                <Select
                  label={t('cost.medical_procedure', 'Medical Procedure')}
                  value={treatmentSelection}
                  onChange={setTreatmentSelection}
                  options={TREATMENTS}
                />

                {treatmentSelection === 'custom' && (
                  <div className="mt-2.5 animate-fade-in">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-[#558187] block mb-1.5">
                      Specify Custom Procedure Name
                    </label>
                    <input
                      type="text"
                      value={customTreatment}
                      onChange={e => setCustomTreatment(e.target.value)}
                      placeholder="e.g., Hip Replacement, Hernia Repair, Arthroscopy..."
                      className="input-field font-sans font-bold text-sm text-[#062327] placeholder:text-[#558187]/50"
                      autoFocus
                      required
                    />
                    <p className="text-[11px] text-[#558187] mt-1 font-medium">
                      Enter the procedure name to evaluate against your policy rules and caps.
                    </p>
                  </div>
                )}
              </div>

              <Select
                label={t('cost.hospital_tier', 'Hospital Tier Category')}
                value={hospitalTier}
                onChange={setHospitalTier}
                options={HOSPITAL_TIERS}
              />

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-[#558187] block mb-1.5">
                    {t('cost.room_rent_per_day', 'Room Rent (₹/Day)')}
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-[#558187]">₹</span>
                    <input
                      type="number"
                      value={roomRentPerDay}
                      onChange={e => setRoomRentPerDay(Number(e.target.value))}
                      min={1000}
                      step={500}
                      className="input-field pl-7 font-sans font-bold text-sm text-[#062327] tabular-nums"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-[#558187] block mb-1.5">
                    {t('cost.stay_duration', 'Stay Duration')}
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      value={stayDays}
                      onChange={e => setStayDays(Number(e.target.value))}
                      min={1}
                      max={90}
                      className="input-field pr-12 font-sans font-bold text-sm text-[#062327] tabular-nums"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-semibold text-[#558187]">
                      {t('common.days', 'Days')}
                    </span>
                  </div>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={loading || !selectedPolicyId}
                  className="btn-pill-lime w-full py-3.5 px-6 font-bold text-sm shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40"
                >
                  {loading ? (
                    <>
                      <Spinner size={15} className="text-[#062327]" />
                      <span>{t('common.calculating', 'Adjusting & Calculating Breakdown…')}</span>
                    </>
                  ) : (
                    <>
                      <Calculator size={16} />
                      <span>{t('Calculate Bill Breakdown')}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>

          {/* Previous Estimates List */}
          {history.length > 0 && (
            <div className="bg-white border border-[#062327]/10 rounded-3xl p-5 shadow-sm">
              <div className="flex items-center justify-between mb-3 px-1">
                <div className="flex items-center gap-1.5">
                  <History size={14} className="text-[#558187]" />
                  <p className="text-[11px] font-bold uppercase tracking-wider text-[#558187]">
                    {t('Recent Simulations')}
                  </p>
                </div>
                <span className="text-[10px] text-[#558187] font-semibold">
                  {history.length} saved
                </span>
              </div>


              <div className="space-y-1.5 max-h-56 overflow-y-auto scroll-area pr-0.5">
                {history.map(est => {
                  const isCurrent = estimate?._id === est._id;
                  const estPolicy = policies.find(p => p._id === est.policy_id);
                  return (
                    <button
                      key={est._id}
                      onClick={() => handleSelectHistoryItem(est)}
                      className={`w-full text-left px-3.5 py-3 rounded-2xl text-xs flex items-center justify-between transition-all cursor-pointer ${
                        isCurrent
                          ? 'bg-[#d2f57b]/25 border-2 border-[#062327] text-[#062327] font-bold shadow-xs'
                          : 'text-[#558187] hover:text-[#062327] hover:bg-[#f5f8f8] border border-transparent'
                      }`}
                    >
                      <div className="min-w-0 pr-2">
                        <span className="block truncate font-semibold text-[#062327]">
                          {est.treatment_name}
                        </span>
                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className="block text-[10px] text-[#2d6a71] font-semibold truncate max-w-[120px]">
                            {estPolicy?.insurer_name || est.policy_name || 'Policy'}
                          </span>
                          <span className="text-[10px] text-[#558187] capitalize font-medium">
                            · {est.hospital_tier?.replace('_', ' ')}
                          </span>
                        </div>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <span className="font-sans font-bold text-xs text-[#062327] tabular-nums block">
                          {fmt(est.out_of_pocket_amount)}
                        </span>
                        <span className="text-[10px] text-rose-600 font-semibold block uppercase">
                          OOP Share
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* ─── Right Column: Audit Results & Breakdown (8 cols) ─ */}
        <div className="lg:col-span-8 space-y-6">
          {estimate ? (
            <>
              {/* ── Card 1: Cohesive Executive Summary Panel ── */}
              <div className="bg-white border border-[#062327]/10 rounded-3xl p-6 sm:p-7 shadow-sm space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-[#062327]/08 gap-3">
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[#558187] block">
                      Audited Estimate For
                    </span>
                    <h2 className="font-headline text-lg sm:text-xl font-bold text-[#062327]">
                      {estimate.treatment_name}
                    </h2>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
                    {estimatePolicy && (
                      <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-[#d2f57b]/25 text-[#062327] border border-[#062327]/15">
                        <Shield size={13} className="text-[#062327]" />
                        <span>Applied: {estimatePolicy.insurer_name}</span>
                      </span>
                    )}
                    <span className="px-3 py-1 rounded-full text-xs font-semibold bg-[#f5f8f8] text-[#2d6a71] border border-[#062327]/10 capitalize">
                      {estimate.hospital_tier?.replace('_', ' ')}
                    </span>
                    <span className="px-3 py-1 rounded-full text-xs font-semibold bg-[#f5f8f8] text-[#2d6a71] border border-[#062327]/10">
                      {estimate.stay_days || 4} Days Stay
                    </span>
                  </div>
                </div>

                {/* 3 Metric Summary Cards in clean harmonious grid */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  {/* Total Bill */}
                  <div className="bg-[#f8fbfb] border border-[#062327]/08 p-5 rounded-2xl flex flex-col justify-between">
                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wider text-[#558187] mb-1.5">
                        {t('Total Hospital Bill')}
                      </p>
                      <p className="font-sans text-2xl sm:text-3xl font-extrabold text-[#062327] tabular-nums tracking-tight">
                        {fmt(estimate.estimated_total_cost)}
                      </p>
                    </div>
                    <p className="text-[11px] text-[#558187] mt-3 font-medium flex items-center gap-1">
                      <span>Gross hospital charges</span>
                    </p>
                  </div>

                  {/* Insurer Pays */}
                  <div className="bg-emerald-50/70 border border-emerald-200 p-5 rounded-2xl flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-800">
                          {t('Insurer Pays')}
                        </p>
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                          {pct(estimate.covered_amount, estimate.estimated_total_cost)}
                        </span>
                      </div>
                      <p className="font-sans text-2xl sm:text-3xl font-extrabold text-emerald-900 tabular-nums tracking-tight">
                        {fmt(estimate.covered_amount)}
                      </p>
                    </div>
                    <p className="text-[10px] font-bold text-red-600 mt-2">* Estimated amount. Actual may vary.</p>
                    <p className="text-[11px] text-emerald-700 mt-3 font-semibold flex items-center gap-1">
                      <CheckCircle2 size={13} className="text-emerald-700" />
                      <span>Net admissible claim</span>
                    </p>
                  </div>

                  {/* Patient Out-of-Pocket */}
                  <div className="bg-rose-50/80 border border-rose-200 p-5 rounded-2xl flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-rose-700">
                          {t('Your Out-of-Pocket')}
                        </p>
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800">
                          {pct(estimate.out_of_pocket_amount, estimate.estimated_total_cost)}
                        </span>
                      </div>
                      <p className="font-sans text-2xl sm:text-3xl font-extrabold text-rose-700 tabular-nums tracking-tight">
                        {fmt(estimate.out_of_pocket_amount)}
                      </p>
                    </div>
                    <p className="text-[11px] text-rose-600 mt-3 font-semibold flex items-center gap-1">
                      <AlertTriangle size={13} className="text-rose-600" />
                      <span>Direct self contribution</span>
                    </p>
                  </div>
                </div>

                {/* Indicative Estimate Disclaimer (Directly below numbers) */}
                <div className="flex items-start sm:items-center gap-2.5 px-3.5 py-2.5 rounded-xl bg-amber-50 border border-amber-200/80 text-xs leading-relaxed">
                  <Info size={15} className="text-amber-700 shrink-0 mt-0.5 sm:mt-0" />
                  <p className="text-xs text-[#4b6367]">
                    <strong className="text-[#062327]">Disclaimer:</strong> This is an estimated amount. Real hospital charges and settlement amounts may vary based on clinical complications, doctor fees, room category chosen, and final insurer claim adjudication.
                  </p>
                </div>

                {/* Visual Bill Coverage Proportion Bar */}
                <div className="bg-[#f8fbfb] p-4 rounded-2xl border border-[#062327]/08 space-y-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-[#062327] flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 inline-block" />
                      {t('Insurer Pays')}: <strong className="font-bold">{pct(estimate.covered_amount, estimate.estimated_total_cost)}</strong>
                    </span>
                    <span className="font-semibold text-rose-700 flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" />
                      {t('Your Out-of-Pocket')}: <strong className="font-bold">{pct(estimate.out_of_pocket_amount, estimate.estimated_total_cost)}</strong>
                    </span>
                  </div>

                  {/* Dual-color bar */}
                  <div className="w-full h-3 rounded-full bg-[#062327]/10 overflow-hidden flex shadow-inner">
                    <div
                      style={{ width: `${coveredPctNum}%` }}
                      className="bg-emerald-600 transition-all duration-500 rounded-l-full"
                      title={`Insurer Coverage: ${coveredPctNum}%`}
                    />
                    <div
                      style={{ width: `${outOfPocketPctNum}%` }}
                      className="bg-rose-500 transition-all duration-500 rounded-r-full"
                      title={`Out-of-Pocket: ${outOfPocketPctNum}%`}
                    />
                  </div>
                </div>
              </div>

              {/* ── Card 2: Detailed Audit & Deductions Breakdown ── */}
              <div className="bg-white border border-[#062327]/10 rounded-3xl p-6 sm:p-7 shadow-sm space-y-5">
                <div>
                  <h3 className="font-headline text-base sm:text-lg font-bold text-[#062327]">
                    {t('Detailed Audit & Deductions Breakdown')}
                  </h3>
                  <p className="text-xs text-[#558187] mt-0.5">
                    Itemized transparent audit showing applicable penalties, IRDAI excluded non-payables, and patient co-shares.
                  </p>
                </div>

                <div className="divide-y divide-[#062327]/[0.06]">
                  {/* Gross Charges */}
                  <AuditRow
                    label="Base Hospital & Surgical Charges"
                    value={fmt(breakdown.base_hospital_charges)}
                    type="normal"
                  />

                  {/* Room Rent Proportionate Penalty */}
                  {breakdown.room_rent_copay_penalty > 0 ? (
                    <AuditRow
                      label="Room Rent Proportionate Deduction"
                      note={`Your ₹${roomRentPerDay.toLocaleString('en-IN')}/day room exceeded your policy sub-limit of ₹${breakdown.room_rent_cap_per_day?.toLocaleString('en-IN')}/day. A proportionate deduction was applied across associated doctor and surgical charges.`}
                      value={fmt(breakdown.room_rent_copay_penalty)}
                      type="deduction"
                      isDeduction
                    />
                  ) : breakdown.has_no_room_rent_cap ? (
                    <div className="py-3 flex items-center justify-between text-xs text-[#558187]">
                      <span className="flex items-center gap-1.5 text-emerald-800 font-medium">
                        <CheckCircle2 size={14} className="text-emerald-600" />
                        No Room Rent Sub-Limit: 100% room rent eligible under this policy (No Proportionate Deductions)
                      </span>
                      <span className="font-sans font-semibold text-emerald-700">₹0</span>
                    </div>
                  ) : (
                    <div className="py-3 flex items-center justify-between text-xs text-[#558187]">
                      <span className="flex items-center gap-1.5 text-[#2d6a71]">
                        <CheckCircle2 size={14} className="text-emerald-600" />
                        Room Rent Sub-Limit: Within ₹{breakdown.room_rent_cap_per_day?.toLocaleString('en-IN') || '10,000'}/day limit (No Penalty)
                      </span>
                      <span className="font-sans font-semibold text-[#558187]">₹0</span>
                    </div>
                  )}

                  {/* Co-Payment */}
                  {breakdown.copay_percentage > 0 ? (
                    <AuditRow
                      label={`Mandatory Co-Payment (${breakdown.copay_percentage}%)`}
                      note={`Tier-based or age-based co-pay requirement clause from policy terms.`}
                      value={fmt(breakdown.copay_amount)}
                      type="deduction"
                      isDeduction
                    />
                  ) : (
                    <div className="py-3 flex items-center justify-between text-xs text-[#558187]">
                      <span className="flex items-center gap-1.5 text-emerald-800 font-medium">
                        <CheckCircle2 size={14} className="text-emerald-600" />
                        Zero Co-Payment Clause: 0% co-payment applied across eligible expenses
                      </span>
                      <span className="font-sans font-semibold text-emerald-700">₹0</span>
                    </div>
                  )}

                  {/* Excluded Items */}
                  <AuditRow
                    label="Excluded Items & Consumables (IRDAI Non-Payables)"
                    note="Standard exclusions: PPE kits, hygiene supplies, administrative registration, and non-medical consumables."
                    value={fmt(breakdown.excluded_items_cost)}
                    type="deduction"
                    isDeduction
                  />

                  {/* Total Out-of-pocket */}
                  <div className="pt-2">
                    <AuditRow
                      label="Total Out-of-Pocket Expense Paid by You"
                      value={fmt(estimate.out_of_pocket_amount)}
                      type="normal"
                    />
                  </div>

                  {/* Net Admissible Claim */}
                  <div className="pt-2">
                    <AuditRow
                      label="Net Admissible Claim Settled by Insurer"
                      value={fmt(breakdown.final_payable_by_insurer || estimate.covered_amount)}
                      type="total"
                    />
                  </div>
                </div>

                {/* Policy Clauses & Assumptions audit notes */}
                {((estimate.assumptions && estimate.assumptions.length > 0) || (estimate.citations && estimate.citations.length > 0)) && (
                  <div className="mt-5 pt-4 border-t border-[#062327]/08 space-y-2">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-[#558187] flex items-center gap-1.5">
                      <Shield size={12} className="text-[#2d6a71]" />
                      <span>Policy Rules & Clauses Applied ({estimatePolicy?.insurer_name || 'Selected Policy'})</span>
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-[#558187]">
                      {estimate.assumptions?.map((assump, idx) => (
                        <div key={idx} className="flex items-start gap-1.5 p-2 rounded-xl bg-[#f8fbfb] border border-[#062327]/05">
                          <CheckCircle2 size={12} className="text-emerald-700 flex-shrink-0 mt-0.5" />
                          <span className="leading-tight">{assump}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* ── Card 3: What-If Scenario Simulator ──────── */}
              <div className="bg-white border border-[#062327]/10 rounded-3xl p-6 sm:p-7 shadow-sm space-y-5">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-headline text-base sm:text-lg font-bold text-[#062327]">
                      What-If Scenario Optimizer
                    </h3>
                    <p className="text-xs text-[#558187] mt-0.5">
                      Simulate alternative decisions to slash your out-of-pocket expenses before scheduling hospitalization.
                    </p>
                  </div>
                  <button
                    onClick={() => setShowWhatIf(v => !v)}
                    className="p-1.5 rounded-xl hover:bg-[#f5f8f8] text-[#558187] hover:text-[#062327] transition-colors cursor-pointer"
                  >
                    {showWhatIf ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                  </button>
                </div>

                {showWhatIf && (
                  <div className="space-y-4 pt-2">
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                      <div className="sm:col-span-5">
                        <label className="text-[11px] font-bold uppercase tracking-wider text-[#558187] block mb-1.5">
                          Variable To Change
                        </label>
                        <Select
                          value={whatIfVar}
                          onChange={(v) => {
                            setWhatIfVar(v);
                            setWhatIfVal(WHATIF_VALUES[v][0].value);
                          }}
                          options={WHATIF_VARS}
                        />
                      </div>

                      <div className="sm:col-span-4">
                        <label className="text-[11px] font-bold uppercase tracking-wider text-[#558187] block mb-1.5">
                          Alternative Option
                        </label>
                        <Select
                          value={whatIfVal}
                          onChange={setWhatIfVal}
                          options={WHATIF_VALUES[whatIfVar] || []}
                        />
                      </div>

                      <div className="sm:col-span-3">
                        <button
                          onClick={handleWhatIf}
                          disabled={whatIfLoading}
                          className="btn-pill-lime w-full py-3 px-4 font-bold text-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40"
                        >
                          {whatIfLoading ? (
                            <Spinner size={14} className="text-[#062327]" />
                          ) : (
                            <ArrowRight size={14} className="stroke-[2.5]" />
                          )}
                          <span>{whatIfLoading ? 'Simulating…' : 'Simulate'}</span>
                        </button>
                      </div>
                    </div>

                    {/* Calculated Scenarios */}
                    {variants.length > 0 && (
                      <div className="space-y-3 mt-4 pt-4 border-t border-[#062327]/08">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-[#558187]">
                          Calculated Alternative Scenarios
                        </p>
                        <div className="grid grid-cols-1 gap-3">
                          {variants.map(v => {
                            const diff = (estimate?.out_of_pocket_amount || 0) - (v.recalculated_out_of_pocket || 0);
                            const isCheaper = diff > 0;
                            return (
                              <div
                                key={v.variant_id}
                                className="bg-[#f8fbfb] rounded-2xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border border-[#062327]/08 hover:border-[#062327]/20 transition-all"
                              >
                                <div className="space-y-1">
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-bold text-[#062327] capitalize">
                                      {v.changed_variable?.replace(/_/g, ' ')}
                                    </span>
                                    <span className="text-[#0b3d45] font-bold text-xs">
                                      → {v.new_value?.replace(/_/g, ' ')}
                                    </span>
                                  </div>
                                  <p className="text-xs text-[#558187]">
                                    Total: {fmt(v.recalculated_total_cost)} · Covered: {fmt(v.recalculated_covered_amount)}
                                  </p>
                                </div>

                                <div className="flex items-center sm:flex-col sm:items-end justify-between gap-1 flex-shrink-0">
                                  {isCheaper && (
                                    <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-100/70 px-2 py-0.5 rounded-full">
                                      <TrendingDown size={12} />
                                      Saves {fmt(diff)}!
                                    </span>
                                  )}
                                  <div className="text-right">
                                    <span className="text-[10px] text-[#558187] uppercase font-bold block">
                                      New Out-of-Pocket
                                    </span>
                                    <span className="font-sans text-base sm:text-lg font-bold text-[#062327] tabular-nums">
                                      {fmt(v.recalculated_out_of_pocket)}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          ) : (
            /* Empty State */
            <div className="bg-white border border-[#062327]/10 rounded-3xl h-96 flex flex-col items-center justify-center p-8 text-center shadow-sm">
              <div className="w-14 h-14 rounded-2xl bg-[#f5f8f8] border border-[#062327]/10 flex items-center justify-center text-[#062327] mb-4">
                <Calculator size={24} className="stroke-[2.2]" />
              </div>
              <h3 className="font-headline text-lg font-bold text-[#062327] mb-1.5">
                Ready to Audit Your Medical Bill
              </h3>
              <p className="text-xs sm:text-sm text-[#558187] max-w-md leading-relaxed mb-5">
                Select your policy and treatment procedure, specify the room rent per day, and click <strong>Calculate Bill Breakdown</strong> to uncover hidden deductions.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
