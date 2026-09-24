import React, { useState, useEffect } from 'react';
import { Calculator, ArrowRight, ShieldCheck, AlertCircle, RefreshCw, Layers, TrendingDown } from 'lucide-react';
import api from '../../services/api';

export default function CostEstimatorView({ policies }) {
  const [selectedPolicyId, setSelectedPolicyId] = useState(policies[0]?._id || '');
  const [treatmentName, setTreatmentName] = useState('Knee Replacement');
  const [hospitalTier, setHospitalTier] = useState('tier_1');
  const [roomRentPerDay, setRoomRentPerDay] = useState(12000);
  const [stayDays, setStayDays] = useState(4);
  const [loading, setLoading] = useState(false);
  const [currentEstimate, setCurrentEstimate] = useState(null);
  const [estimateHistory, setEstimateHistory] = useState([]);

  // What-If Scenario State (FR-15, FR-17)
  const [whatIfVariable, setWhatIfVariable] = useState('hospital_tier');
  const [whatIfNewValue, setWhatIfNewValue] = useState('tier_2');
  const [whatIfLoading, setWhatIfLoading] = useState(false);

  useEffect(() => {
    if (policies.length > 0 && !selectedPolicyId) {
      setSelectedPolicyId(policies[0]._id);
    }
    fetchEstimateHistory();
  }, [policies]);

  const fetchEstimateHistory = async () => {
    try {
      const res = await api.get('/cost/history');
      setEstimateHistory(res.data.estimates || []);
      if (res.data.estimates && res.data.estimates.length > 0) {
        setCurrentEstimate(res.data.estimates[0]);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleCalculateEstimate = async (e) => {
    e.preventDefault();
    if (!selectedPolicyId || !treatmentName) return;

    try {
      setLoading(true);
      const res = await api.post('/cost/estimate', {
        policy_id: selectedPolicyId,
        treatment_name: treatmentName,
        hospital_tier: hospitalTier,
        room_rent_per_day: roomRentPerDay,
        stay_days: stayDays,
      });

      setCurrentEstimate(res.data.estimate);
      fetchEstimateHistory();
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleApplyWhatIf = async () => {
    if (!currentEstimate) return;
    try {
      setWhatIfLoading(true);
      const res = await api.post(`/cost/estimate/${currentEstimate._id}/what-if`, {
        changed_variable: whatIfVariable,
        new_value: whatIfNewValue,
      });

      setCurrentEstimate(res.data.estimate);
      fetchEstimateHistory();
    } catch (err) {
      console.error(err);
    } finally {
      setWhatIfLoading(false);
    }
  };

  const breakdown = currentEstimate?.cost_breakdown || {};

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="glass-panel rounded-2xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white font-['Space_Grotesk'] flex items-center space-x-2">
            <Calculator className="w-6 h-6 text-emerald-400" />
            <span>Treatment Cost Estimator & What-If Simulator</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Calculates exact out-of-pocket expenses based on your policy's extracted room-rent limits, copay clauses, deductibles, and hospital tiers (FR-14).
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Form: Inputs */}
        <div className="lg:col-span-5 glass-panel rounded-2xl p-6">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4 border-b border-slate-800 pb-2">
            Estimation Inputs
          </h3>

          <form onSubmit={handleCalculateEstimate} className="space-y-4">
            {/* Policy Selector */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Select Policy</label>
              <select
                value={selectedPolicyId}
                onChange={(e) => setSelectedPolicyId(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
              >
                {policies.map((p) => (
                  <option key={p._id} value={p._id}>
                    {p.insurer_name} (Sum Insured: ₹{p.sum_insured?.toLocaleString('en-IN') || 'N/A'})
                  </option>
                ))}
              </select>
            </div>

            {/* Treatment Selector */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Medical Procedure / Treatment</label>
              <select
                value={treatmentName}
                onChange={(e) => setTreatmentName(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
              >
                <option value="Knee Replacement">Knee Replacement (Orthopedic)</option>
                <option value="Angioplasty">Angioplasty / Stent (Cardiology)</option>
                <option value="Cataract Surgery">Cataract Surgery (Daycare/Ophthalmic)</option>
                <option value="Appendectomy">Appendectomy (General Surgery)</option>
                <option value="Gallbladder Removal">Gallbladder Removal (Laparoscopic)</option>
                <option value="Cardiac Bypass (CABG)">Cardiac Bypass - CABG (Cardiology)</option>
                <option value="Chemotherapy (per cycle)">Chemotherapy per cycle (Oncology)</option>
              </select>
            </div>

            {/* Hospital Tier */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Hospital Tier / City Category</label>
              <select
                value={hospitalTier}
                onChange={(e) => setHospitalTier(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
              >
                <option value="tier_1">Tier 1 — Metro Super Specialty (Max, Apollo, Fortis)</option>
                <option value="tier_2">Tier 2 — Non-Metro Private Multi-Specialty</option>
                <option value="tier_3">Tier 3 — District Healthcare / Semi-Urban</option>
              </select>
            </div>

            {/* Hospital Room Rent & Stay Duration */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Room Rent/Day (₹)</label>
                <input
                  type="number"
                  value={roomRentPerDay}
                  onChange={(e) => setRoomRentPerDay(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Stay Duration (Days)</label>
                <input
                  type="number"
                  value={stayDays}
                  onChange={(e) => setStayDays(Number(e.target.value))}
                  className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-3 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-lg shadow-emerald-500/25 transition-all"
            >
              {loading ? 'Recalculating...' : 'Calculate Cost Breakdown'}
            </button>
          </form>

          {/* Past Estimates mini history */}
          <div className="mt-6 pt-4 border-t border-slate-800">
            <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">
              Previous Estimates
            </div>
            <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
              {estimateHistory.map((est) => (
                <button
                  key={est._id}
                  onClick={() => setCurrentEstimate(est)}
                  className={`w-full text-left p-2 rounded-lg text-xs flex items-center justify-between transition-colors ${
                    currentEstimate?._id === est._id
                      ? 'bg-slate-800 text-emerald-300 border border-emerald-500/30'
                      : 'text-slate-400 hover:bg-slate-900'
                  }`}
                >
                  <span className="truncate">{est.treatment_name} ({est.hospital_tier})</span>
                  <span className="font-mono text-slate-300 text-[11px]">
                    ₹{(est.out_of_pocket_amount / 1000).toFixed(0)}k out of pocket
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right Section: Results & What-If Simulator */}
        <div className="lg:col-span-7 space-y-6">
          {currentEstimate ? (
            <>
              {/* Cost Summary Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="glass-panel rounded-2xl p-4 border border-slate-800">
                  <div className="text-xs text-slate-400">Total Hospital Bill</div>
                  <div className="text-xl font-bold text-white mt-1">
                    ₹{currentEstimate.estimated_total_cost?.toLocaleString('en-IN')}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1 capitalize">{currentEstimate.hospital_tier.replace('_', ' ')} Hospital</div>
                </div>

                <div className="glass-panel rounded-2xl p-4 border border-emerald-900/60 bg-emerald-950/20">
                  <div className="text-xs text-emerald-400 font-medium">Covered by Insurer</div>
                  <div className="text-xl font-bold text-emerald-300 mt-1">
                    ₹{currentEstimate.covered_amount?.toLocaleString('en-IN')}
                  </div>
                  <div className="text-[10px] text-emerald-500 mt-1">
                    {Math.round((currentEstimate.covered_amount / currentEstimate.estimated_total_cost) * 100)}% of Bill
                  </div>
                </div>

                <div className="glass-panel rounded-2xl p-4 border border-rose-900/60 bg-rose-950/20">
                  <div className="text-xs text-rose-400 font-medium">Your Out-Of-Pocket</div>
                  <div className="text-xl font-bold text-rose-300 mt-1">
                    ₹{currentEstimate.out_of_pocket_amount?.toLocaleString('en-IN')}
                  </div>
                  <div className="text-[10px] text-rose-400/80 mt-1">Direct Patient Payment</div>
                </div>
              </div>

              {/* Detailed Breakdown Accordion / List */}
              <div className="glass-panel rounded-2xl p-5 border border-slate-800">
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-3">
                  Detailed Cost Audit & Deductions (FR-14)
                </h4>
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between py-1.5 border-b border-slate-800/80 text-slate-300">
                    <span>Base Hospital & Surgical Charges</span>
                    <span className="font-mono text-white">₹{breakdown.base_hospital_charges?.toLocaleString('en-IN')}</span>
                  </div>

                  {breakdown.room_rent_copay_penalty > 0 && (
                    <div className="flex justify-between py-1.5 border-b border-slate-800/80 text-amber-300">
                      <span>Room Rent Proportionate Deduction Penalty (Cap: ₹{breakdown.room_rent_cap_per_day}/day)</span>
                      <span className="font-mono font-semibold">-₹{breakdown.room_rent_copay_penalty?.toLocaleString('en-IN')}</span>
                    </div>
                  )}

                  {breakdown.copay_percentage > 0 && (
                    <div className="flex justify-between py-1.5 border-b border-slate-800/80 text-amber-300">
                      <span>Co-payment Applied ({breakdown.copay_percentage}%)</span>
                      <span className="font-mono font-semibold">-₹{breakdown.copay_amount?.toLocaleString('en-IN')}</span>
                    </div>
                  )}

                  <div className="flex justify-between py-1.5 border-b border-slate-800/80 text-slate-400">
                    <span>Non-Medical Consumables & PPE (Excluded by IRDAI)</span>
                    <span className="font-mono">-₹{breakdown.excluded_items_cost?.toLocaleString('en-IN')}</span>
                  </div>

                  <div className="flex justify-between py-2 text-emerald-400 font-bold text-sm">
                    <span>Net Admissible Claim Payable</span>
                    <span className="font-mono">₹{breakdown.final_payable_by_insurer?.toLocaleString('en-IN')}</span>
                  </div>
                </div>
              </div>

              {/* What-If Simulation Box (FR-15, FR-17) */}
              <div className="glass-panel-glow rounded-2xl p-5 border border-emerald-500/20 bg-slate-900/90">
                <div className="flex items-center space-x-2 text-emerald-400 text-xs font-bold uppercase tracking-wider mb-2">
                  <RefreshCw className="w-4 h-4 text-emerald-400" />
                  <span>Interactive What-If Scenario Simulator (FR-15)</span>
                </div>
                <p className="text-xs text-slate-400 mb-4">
                  Simulate alternative decisions: see how choosing a different hospital tier or adding a zero-copay rider impacts your out-of-pocket costs.
                </p>

                <div className="flex flex-col sm:flex-row items-center gap-3">
                  <select
                    value={whatIfVariable}
                    onChange={(e) => {
                      setWhatIfVariable(e.target.value);
                      if (e.target.value === 'hospital_tier') setWhatIfNewValue('tier_2');
                      if (e.target.value === 'rider') setWhatIfNewValue('zero_copay_rider');
                      if (e.target.value === 'sum_insured') setWhatIfNewValue('2000000');
                    }}
                    className="w-full sm:w-1/2 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200"
                  >
                    <option value="hospital_tier">Change Hospital Tier</option>
                    <option value="rider">Add Zero-Copay Rider</option>
                    <option value="sum_insured">Simulate Higher Sum Insured</option>
                  </select>

                  {whatIfVariable === 'hospital_tier' && (
                    <select
                      value={whatIfNewValue}
                      onChange={(e) => setWhatIfNewValue(e.target.value)}
                      className="w-full sm:w-1/2 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200"
                    >
                      <option value="tier_2">Switch to Tier 2 Hospital</option>
                      <option value="tier_3">Switch to Tier 3 Hospital</option>
                    </select>
                  )}

                  {whatIfVariable === 'rider' && (
                    <select
                      value={whatIfNewValue}
                      onChange={(e) => setWhatIfNewValue(e.target.value)}
                      className="w-full sm:w-1/2 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200"
                    >
                      <option value="zero_copay_rider">Enable Zero Co-Payment Rider</option>
                    </select>
                  )}

                  {whatIfVariable === 'sum_insured' && (
                    <select
                      value={whatIfNewValue}
                      onChange={(e) => setWhatIfNewValue(e.target.value)}
                      className="w-full sm:w-1/2 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200"
                    >
                      <option value="2000000">₹20 Lakh Sum Insured</option>
                      <option value="5000000">₹50 Lakh Sum Insured</option>
                    </select>
                  )}

                  <button
                    onClick={handleApplyWhatIf}
                    disabled={whatIfLoading}
                    className="w-full sm:w-auto px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs rounded-xl whitespace-nowrap transition-colors"
                  >
                    {whatIfLoading ? 'Simulating...' : 'Simulate'}
                  </button>
                </div>

                {/* Display Embedded What-If Variants */}
                {currentEstimate.what_if_variants && currentEstimate.what_if_variants.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-slate-800 space-y-2">
                    <div className="text-[11px] font-semibold text-slate-300">Scenario Variations:</div>
                    {currentEstimate.what_if_variants.map((v) => (
                      <div
                        key={v.variant_id}
                        className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 flex items-center justify-between text-xs"
                      >
                        <div>
                          <div className="font-semibold text-white capitalize">
                            Variant: {v.changed_variable.replace('_', ' ')} &rarr;{' '}
                            <span className="text-emerald-400">{v.new_value}</span>
                          </div>
                          <div className="text-[11px] text-slate-400">
                            Total Bill: ₹{v.recalculated_total_cost?.toLocaleString('en-IN')} | Insurer Pays: ₹{v.recalculated_covered_amount?.toLocaleString('en-IN')}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-[10px] text-slate-400 uppercase">New Out-Of-Pocket</div>
                          <div className="text-sm font-bold text-emerald-300">
                            ₹{v.recalculated_out_of_pocket?.toLocaleString('en-IN')}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="h-64 glass-panel rounded-2xl flex flex-col items-center justify-center text-slate-400 text-xs">
              <Calculator className="w-8 h-8 text-slate-600 mb-2" />
              <span>Select parameters on the left and click "Calculate Cost Breakdown"</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
