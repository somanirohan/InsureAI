import React, { useState, useEffect } from 'react';
import { Calculator, RefreshCw, TrendingDown, ArrowRight, ChevronDown, ChevronUp } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import api from '../../services/api';
import { Select, Spinner, EmptyState, ErrorBanner } from '../common/ui';

const TREATMENTS = [
  { value: 'Knee Replacement',           label: 'Knee Replacement (Orthopedic)' },
  { value: 'Angioplasty',                label: 'Angioplasty / Stent (Cardiology)' },
  { value: 'Cataract Surgery',           label: 'Cataract Surgery (Daycare)' },
  { value: 'Appendectomy',               label: 'Appendectomy (General Surgery)' },
  { value: 'Gallbladder Removal',        label: 'Gallbladder Removal (Laparoscopic)' },
  { value: 'Cardiac Bypass (CABG)',      label: 'Cardiac Bypass CABG' },
  { value: 'Chemotherapy (per cycle)',   label: 'Chemotherapy (per cycle)' },
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

// ─── Currency formatter ────────────────────────────────────
const fmt = (n) => n !== undefined && n !== null ? `₹${Number(n).toLocaleString('en-IN')}` : '—';
const pct = (a, b) => b ? `${Math.round((a / b) * 100)}%` : '—';

// ─── Custom tooltip for bar chart ─────────────────────────
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

// ─── Breakdown row ─────────────────────────────────────────
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

export default function CostEstimatorView({ policies }) {
  const [selectedPolicyId, setSelectedPolicyId] = useState(policies[0]?._id || '');
  const [treatmentName, setTreatmentName]     = useState('Knee Replacement');
  const [hospitalTier, setHospitalTier]       = useState('tier_1');
  const [roomRentPerDay, setRoomRentPerDay]   = useState(12000);
  const [stayDays, setStayDays]               = useState(4);
  const [loading, setLoading]                 = useState(false);
  const [estimate, setEstimate]               = useState(null);
  const [history, setHistory]                 = useState([]);
  const [error, setError]                     = useState(null);

  // What-if
  const [whatIfVar, setWhatIfVar]     = useState('hospital_tier');
  const [whatIfVal, setWhatIfVal]     = useState('tier_2');
  const [whatIfLoading, setWhatIfLoading] = useState(false);
  const [showWhatIf, setShowWhatIf]   = useState(false);

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
      setError(err.response?.data?.error || 'Calculation failed. Please try again.');
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
        <p className="text-sm text-zinc-500 mt-0.5">
          Calculate out-of-pocket expenses based on room-rent limits, co-pay, and deductibles
        </p>
      </div>

      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
        {/* ─── Input form ─────────────────────────────── */}
        <div className="lg:col-span-2 space-y-4">
          <div className="surface p-5 space-y-4">
            <p className="text-sm font-semibold text-zinc-200 pb-3 border-b border-white/[0.06]">
              Estimation Inputs
            </p>

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

              <Select
                label="Medical Procedure"
                value={treatmentName}
                onChange={setTreatmentName}
                options={TREATMENTS}
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
                disabled={loading || !selectedPolicyId}
                className="btn btn-primary w-full py-2.5 font-semibold"
              >
                {loading ? <><Spinner size={14} className="text-black" /> Calculating…</> : <>
                  <Calculator size={14} /> Calculate Breakdown
                </>}
              </button>
            </form>
          </div>

          {/* History */}
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

        {/* ─── Results ─────────────────────────────────── */}
        <div className="lg:col-span-3 space-y-4">
          {estimate ? (
            <>
              {/* Summary metrics */}
              <div className="grid grid-cols-3 gap-3">
                <div className="surface p-4">
                  <p className="label-xs mb-2">Total Bill</p>
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

              {/* Bar chart */}
              <div className="surface p-5">
                <p className="text-sm font-medium text-zinc-300 mb-4">Cost Breakdown</p>
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

              {/* Detailed breakdown */}
              <div className="surface p-5">
                <p className="text-sm font-medium text-zinc-300 mb-2">Detailed Audit</p>
                <div>
                  <BreakdownRow label="Base Hospital & Surgical Charges" value={fmt(breakdown.base_hospital_charges)} />
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
                    label="Excluded Items (IRDAI non-payables)"
                    value={fmt(breakdown.excluded_items_cost)}
                    deduction
                  />
                  <div className="border-t border-white/[0.08] pt-3">
                    <BreakdownRow
                      label="Net Admissible Claim"
                      value={fmt(breakdown.final_payable_by_insurer)}
                      accent="green"
                    />
                  </div>
                </div>
              </div>

              {/* What-If simulator */}
              <div className="surface overflow-hidden">
                <button
                  onClick={() => setShowWhatIf(v => !v)}
                  className="w-full px-5 py-4 flex items-center justify-between text-sm font-medium text-zinc-300 hover:bg-white/[0.02] transition-colors"
                >
                  <div className="flex items-center gap-2">
                    <RefreshCw size={14} className="text-brand-500" />
                    What-If Simulator
                  </div>
                  {showWhatIf ? <ChevronUp size={15} className="text-zinc-500" /> : <ChevronDown size={15} className="text-zinc-500" />}
                </button>

                {showWhatIf && (
                  <div className="px-5 pb-5 border-t border-white/[0.06] pt-4 space-y-4">
                    <p className="text-xs text-zinc-500">
                      Simulate alternative scenarios to see how decisions affect your out-of-pocket cost.
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
                        onClick={handleWhatIf}
                        disabled={whatIfLoading}
                        className="btn btn-primary gap-2 whitespace-nowrap"
                      >
                        {whatIfLoading ? <Spinner size={13} className="text-black" /> : <ArrowRight size={13} />}
                        {whatIfLoading ? 'Simulating…' : 'Simulate'}
                      </button>
                    </div>

                    {/* Variants */}
                    {variants.length > 0 && (
                      <div className="space-y-2 mt-2">
                        <p className="label-xs">Scenario Results</p>
                        {variants.map(v => (
                          <div
                            key={v.variant_id}
                            className="surface-inset rounded-xl p-3.5 flex items-center justify-between gap-4"
                          >
                            <div>
                              <p className="text-xs font-medium text-zinc-300 capitalize">
                                {v.changed_variable?.replace(/_/g, ' ')}
                                <span className="text-brand-500 ml-1">→ {v.new_value}</span>
                              </p>
                              <p className="text-2xs text-zinc-500 mt-0.5">
                                Total: {fmt(v.recalculated_total_cost)} · Insurer: {fmt(v.recalculated_covered_amount)}
                              </p>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <p className="text-2xs text-zinc-500 uppercase">New OOP</p>
                              <p className="text-sm font-semibold text-brand-500">{fmt(v.recalculated_out_of_pocket)}</p>
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
                title="No estimate yet"
                description="Select a policy and treatment, then click Calculate to see the detailed cost breakdown."
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
