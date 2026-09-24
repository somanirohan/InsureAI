import React, { useState } from 'react';
import { Scale, Check, AlertTriangle, ShieldCheck, ArrowRightLeft, Sparkles } from 'lucide-react';
import api from '../../services/api';

export default function ComparisonView({ policies }) {
  const [selectedPolicyIds, setSelectedPolicyIds] = useState(
    policies.length >= 2 ? [policies[0]._id, policies[1]._id] : []
  );
  const [comparisonResult, setComparisonResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const togglePolicySelection = (id) => {
    setSelectedPolicyIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((item) => item !== id);
      } else {
        return [...prev, id];
      }
    });
  };

  const handleRunComparison = async () => {
    if (selectedPolicyIds.length < 2) {
      setError('Please select at least 2 policies to compare');
      return;
    }
    setError(null);
    setLoading(true);

    try {
      const res = await api.post('/comparisons', {
        policy_ids: selectedPolicyIds,
      });
      setComparisonResult(res.data.comparison.comparison_result);
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.error || 'Comparison failed');
    } finally {
      setLoading(false);
    }
  };

  const metadata = comparisonResult?.policies_metadata || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="glass-panel rounded-2xl p-6">
        <h2 className="text-xl font-bold text-white font-['Space_Grotesk'] flex items-center space-x-2">
          <Scale className="w-6 h-6 text-emerald-400" />
          <span>Multi-Policy Comparative Analysis (FR-07)</span>
        </h2>
        <p className="text-xs text-slate-400 mt-1">
          Side-by-side contrast of coverage caps, premium costs, co-payments, room-rent clauses, waiting periods, and exclusions.
        </p>

        {/* Policy Checkbox Selectors */}
        <div className="mt-4 pt-4 border-t border-slate-800">
          <div className="text-xs font-semibold text-slate-300 mb-2">Select Policies to Compare:</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {policies.map((p) => {
              const isSelected = selectedPolicyIds.includes(p._id);
              return (
                <div
                  key={p._id}
                  onClick={() => togglePolicySelection(p._id)}
                  className={`p-3 rounded-xl border cursor-pointer transition-all flex items-center justify-between ${
                    isSelected
                      ? 'bg-emerald-950/40 border-emerald-500 text-white'
                      : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className="text-xs truncate mr-2">
                    <div className="font-semibold text-slate-200">{p.insurer_name}</div>
                    <div className="text-[11px] text-slate-400 capitalize">{p.policy_type.replace(/_/g, ' ')}</div>
                  </div>
                  <div
                    className={`w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 ${
                      isSelected ? 'bg-emerald-500 text-slate-950' : 'border border-slate-700'
                    }`}
                  >
                    {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                  </div>
                </div>
              );
            })}
          </div>

          {error && <div className="mt-2 text-xs text-rose-400">{error}</div>}

          <div className="mt-4">
            <button
              onClick={handleRunComparison}
              disabled={loading || selectedPolicyIds.length < 2}
              className="px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shadow-lg shadow-emerald-500/25 transition-all disabled:opacity-40 disabled:cursor-not-allowed flex items-center space-x-2"
            >
              <ArrowRightLeft className="w-4 h-4" />
              <span>{loading ? 'Analyzing Differences...' : 'Run Comparative Matrix'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Comparison Diff Table */}
      {comparisonResult && metadata.length > 0 && (
        <div className="glass-panel rounded-2xl overflow-hidden border border-slate-800">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-slate-950 border-b border-slate-800">
                  <th className="p-4 text-slate-400 font-semibold uppercase text-[10px] w-52 tracking-wider">
                    Feature / Clause
                  </th>
                  {metadata.map((m) => (
                    <th key={m.policy_id} className="p-4 text-white font-bold border-l border-slate-800 text-sm">
                      <div className="text-emerald-400 font-['Space_Grotesk']">{m.insurer_name}</div>
                      <div className="text-[10px] text-slate-400 capitalize font-normal">
                        {m.policy_type?.replace(/_/g, ' ')}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-800/60 text-slate-300">
                {/* Sum Insured */}
                <tr className="hover:bg-slate-900/50">
                  <td className="p-4 font-bold text-white bg-slate-950/40">Sum Insured Coverage</td>
                  {metadata.map((m) => (
                    <td key={m.policy_id} className="p-4 border-l border-slate-800 font-bold text-emerald-300 text-sm">
                      {comparisonResult.coverage_comparison[m.policy_id]}
                    </td>
                  ))}
                </tr>

                {/* Annual Premium */}
                <tr className="hover:bg-slate-900/50">
                  <td className="p-4 font-bold text-white bg-slate-950/40">Annual Premium</td>
                  {metadata.map((m) => (
                    <td key={m.policy_id} className="p-4 border-l border-slate-800 font-mono font-medium text-white">
                      {comparisonResult.premium_comparison[m.policy_id]}
                    </td>
                  ))}
                </tr>

                {/* Room Rent Cap */}
                <tr className="hover:bg-slate-900/50">
                  <td className="p-4 font-bold text-white bg-slate-950/40">Room Rent Limits</td>
                  {metadata.map((m) => {
                    const text = comparisonResult.room_rent_comparison[m.policy_id] || '';
                    const hasCap = text.includes('1%') || text.includes('cap');
                    return (
                      <td key={m.policy_id} className="p-4 border-l border-slate-800">
                        <span
                          className={`inline-block px-2.5 py-1 rounded-md text-xs ${
                            hasCap
                              ? 'bg-amber-950/60 text-amber-300 border border-amber-800/80'
                              : 'bg-emerald-950/60 text-emerald-300 border border-emerald-800/80 font-semibold'
                          }`}
                        >
                          {text}
                        </span>
                      </td>
                    );
                  })}
                </tr>

                {/* Co-Payment Terms */}
                <tr className="hover:bg-slate-900/50">
                  <td className="p-4 font-bold text-white bg-slate-950/40">Co-Payment Terms</td>
                  {metadata.map((m) => {
                    const text = comparisonResult.copay_comparison[m.policy_id] || '';
                    const zeroCopay = text.includes('0%') || text.includes('Zero');
                    return (
                      <td key={m.policy_id} className="p-4 border-l border-slate-800">
                        <span
                          className={`inline-block px-2.5 py-1 rounded-md text-xs ${
                            zeroCopay
                              ? 'bg-emerald-950/60 text-emerald-300 border border-emerald-800/80 font-semibold'
                              : 'bg-amber-950/60 text-amber-300 border border-amber-800/80'
                          }`}
                        >
                          {text}
                        </span>
                      </td>
                    );
                  })}
                </tr>

                {/* Waiting Periods */}
                <tr className="hover:bg-slate-900/50">
                  <td className="p-4 font-bold text-white bg-slate-950/40">Waiting Periods</td>
                  {metadata.map((m) => {
                    const waits = comparisonResult.waiting_periods_comparison[m.policy_id] || [];
                    return (
                      <td key={m.policy_id} className="p-4 border-l border-slate-800">
                        <ul className="space-y-1 list-disc list-inside text-xs text-slate-300">
                          {waits.map((w, idx) => (
                            <li key={idx}>{w}</li>
                          ))}
                        </ul>
                      </td>
                    );
                  })}
                </tr>

                {/* Major Exclusions */}
                <tr className="hover:bg-slate-900/50">
                  <td className="p-4 font-bold text-white bg-slate-950/40">Key Policy Exclusions</td>
                  {metadata.map((m) => {
                    const exclusions = comparisonResult.exclusions_diff[m.policy_id] || [];
                    return (
                      <td key={m.policy_id} className="p-4 border-l border-slate-800">
                        <ul className="space-y-1 text-xs text-slate-400">
                          {exclusions.map((ex, idx) => (
                            <li key={idx} className="flex items-start space-x-1.5">
                              <span className="text-rose-400 font-bold">•</span>
                              <span>{ex}</span>
                            </li>
                          ))}
                        </ul>
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
