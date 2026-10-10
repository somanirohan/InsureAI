import React, { useState, useEffect } from 'react';
import { GitCompare, Check, AlertTriangle, ArrowRightLeft, ChevronUp, ChevronDown } from 'lucide-react';
import api from '../../services/api';
import { Spinner, EmptyState, ErrorBanner } from '../common/ui';

// ─── Cell coloring helper ──────────────────────────────────
function CoverageTag({ text, positive, negative }) {
  if (!text) return <span className="text-[#558187]">—</span>;
  const cls = positive
    ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
    : negative
    ? 'bg-rose-100 text-rose-700 border border-rose-200'
    : 'bg-sky-100 text-sky-700 border border-sky-200';
  return (
    <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${cls}`}>
      {text}
    </span>
  );
}

// ─── Comparison row ────────────────────────────────────────
function CompareRow({ label, children, striped }) {
  return (
    <tr className={`${striped ? 'bg-[#f9fbfb]' : 'bg-transparent'} hover:bg-[#f5f8f8] transition-colors`}>
      <td className="px-5 py-4 text-xs font-semibold uppercase tracking-wider text-[#558187] w-44 align-top border-b border-[#062327]/08">
        {label}
      </td>
      {children}
    </tr>
  );
}

function DataCell({ children }) {
  return (
    <td className="px-5 py-4 text-sm text-[#062327] border-b border-[#062327]/08 border-l border-l-[#062327]/08 align-top">
      {children}
    </td>
  );
}

export default function ComparisonView({ policies }) {
  const [selectedIds, setSelectedIds] = useState(
    policies.length >= 2 ? [policies[0]._id, policies[1]._id] : []
  );
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError]   = useState(null);

  useEffect(() => {
    if (policies.length >= 2 && selectedIds.length < 2) {
      setSelectedIds([policies[0]._id, policies[1]._id]);
    }
  }, [policies]);

  const toggle = (id) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleCompare = async () => {
    if (selectedIds.length < 2) {
      setError('Select at least 2 policies to compare.');
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await api.post('/comparisons', { policy_ids: selectedIds });
      setResult(res.data.comparison.comparison_result);
    } catch (err) {
      setError(err.response?.data?.error || 'Comparison failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const metadata = result?.policies_metadata || [];

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div>
        <h1 className="text-2xl font-headline font-bold text-[#062327] tracking-tight">Compare Policies</h1>
        <p className="text-sm text-[#558187] mt-1">
          Side-by-side comparison of coverage, co-payment, room rent, waiting periods, and exclusions
        </p>
      </div>

      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      {/* ─── Policy selector ────────────────────────── */}
      <div className="bg-white border border-[#062327]/10 rounded-[28px] p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <p className="text-sm font-semibold text-[#062327] uppercase tracking-wider">Select Policies to Compare</p>
          <span className="text-xs text-[#558187]">
            {selectedIds.length} selected (min 2)
          </span>
        </div>

        {policies.length === 0 ? (
          <EmptyState
            icon={GitCompare}
            title="No policies available"
            description="Upload at least 2 policy documents to run a comparison."
          />
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 mb-5">
              {policies.map(p => {
                const isSelected = selectedIds.includes(p._id);
                return (
                  <button
                    key={p._id}
                    onClick={() => toggle(p._id)}
                    aria-pressed={isSelected}
                    className={`
                      p-4 rounded-2xl border text-left flex items-start justify-between gap-3 transition-all duration-200
                      ${isSelected
                        ? 'border-[#062327] bg-[#d2f57b]/20 shadow-[0_3px_0_#062327]'
                        : 'border-[#062327]/12 bg-[#f5f8f8] hover:border-[#062327]/28 hover:bg-white'
                      }
                    `}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[#062327] truncate">{p.insurer_name || p.file_name}</p>
                      <p className="text-xs text-[#558187] capitalize mt-1">
                        {p.policy_type?.replace(/_/g, ' ') || 'Health Insurance'}
                        {p.sum_insured
                          ? ` · ₹${(p.sum_insured / 100000).toFixed(1)}L`
                          : ''}
                      </p>
                    </div>
                    <div
                      className={`w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5 transition-all ${
                        isSelected
                          ? 'bg-[#d2f57b] border-2 border-[#062327]'
                          : 'border-2 border-[#062327]/20'
                      }`}
                    >
                      {isSelected && <Check size={13} strokeWidth={3} className="text-[#062327]" />}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleCompare}
                disabled={loading || selectedIds.length < 2}
                className="btn-pill-lime py-3 px-6 text-sm font-bold shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed disabled:shadow-none"
              >
                {loading ? (
                  <>
                    <Spinner size={15} className="text-[#062327]" />
                    <span>Analyzing Policies…</span>
                  </>
                ) : (
                  <>
                    <ArrowRightLeft size={16} className="stroke-[2.5]" />
                    <span>Compare Selected {selectedIds.length > 0 ? `(${selectedIds.length})` : ''}</span>
                  </>
                )}
              </button>
              {selectedIds.length < 2 && (
                <p className="text-xs text-[#558187] font-medium">Select at least 2 policies to run comparison</p>
              )}
            </div>
          </>
        )}
      </div>

      {/* ─── Comparison table ───────────────────────── */}
      {result && metadata.length > 0 && (
        <div className="bg-white border border-[#062327]/10 rounded-[28px] overflow-hidden shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-[#f5f8f8] border-b border-[#062327]/10">
                  <th className="px-5 py-4 text-left text-xs font-semibold uppercase tracking-wider text-[#558187] w-44">
                    Feature
                  </th>
                  {metadata.map(m => (
                    <th
                      key={m.policy_id}
                      className="px-5 py-4 text-left text-xs font-semibold text-[#062327] border-l border-l-[#062327]/08"
                    >
                      <div className="font-headline font-bold text-base tracking-tight text-[#062327]">{m.insurer_name}</div>
                      <div className="text-[#558187] font-normal capitalize mt-0.5 text-xs">
                        {m.policy_type?.replace(/_/g, ' ')}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {/* Sum Insured */}
                <CompareRow label="Sum Insured">
                  {metadata.map(m => (
                    <DataCell key={m.policy_id}>
                      <span className="font-bold text-[#062327] text-base font-sans tabular-nums">
                        {result.coverage_comparison[m.policy_id] || '—'}
                      </span>
                    </DataCell>
                  ))}
                </CompareRow>

                {/* Annual Premium */}
                <CompareRow label="Annual Premium" striped>
                  {metadata.map(m => (
                    <DataCell key={m.policy_id}>
                      <span className="font-bold text-[#062327] font-sans tabular-nums">
                        {result.premium_comparison[m.policy_id] || '—'}
                      </span>
                    </DataCell>
                  ))}
                </CompareRow>

                {/* Room Rent */}
                <CompareRow label="Room Rent Limit">
                  {metadata.map(m => {
                    const text = result.room_rent_comparison[m.policy_id] || '';
                    const hasCap = text.toLowerCase().includes('1%') || text.toLowerCase().includes('cap');
                    return (
                      <DataCell key={m.policy_id}>
                        <CoverageTag text={text} positive={!hasCap} negative={hasCap} />
                      </DataCell>
                    );
                  })}
                </CompareRow>

                {/* Co-Payment */}
                <CompareRow label="Co-Payment" striped>
                  {metadata.map(m => {
                    const text = result.copay_comparison[m.policy_id] || '';
                    const zeroCopay = text.includes('0%') || text.toLowerCase().includes('zero') || text.toLowerCase().includes('nil');
                    return (
                      <DataCell key={m.policy_id}>
                        <CoverageTag text={text} positive={zeroCopay} negative={!zeroCopay && text !== '—'} />
                      </DataCell>
                    );
                  })}
                </CompareRow>

                {/* Waiting Periods */}
                <CompareRow label="Waiting Periods">
                  {metadata.map(m => {
                    const waits = result.waiting_periods_comparison[m.policy_id] || [];
                    return (
                      <DataCell key={m.policy_id}>
                        {waits.length === 0 ? (
                          <span className="text-[#558187]">—</span>
                        ) : (
                          <ul className="space-y-1.5">
                            {waits.map((w, i) => (
                              <li key={i} className="flex items-start gap-2 text-xs text-[#062327]">
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
                  {metadata.map(m => {
                    const exclusions = result.exclusions_diff[m.policy_id] || [];
                    return (
                      <DataCell key={m.policy_id}>
                        {exclusions.length === 0 ? (
                          <span className="text-[#558187]">—</span>
                        ) : (
                          <ul className="space-y-1.5">
                            {exclusions.map((ex, i) => (
                              <li key={i} className="flex items-start gap-2 text-xs text-[#062327]">
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
          <div className="px-6 py-4 bg-[#f9fbfb] border-t border-[#062327]/08 flex items-center justify-between">
            <div className="flex items-center gap-4 text-xs text-[#558187]">
              <span className="flex items-center gap-1.5 font-medium">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
                Favorable
              </span>
              <span className="flex items-center gap-1.5 font-medium">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" />
                Restrictive
              </span>
              <span className="flex items-center gap-1.5 font-medium">
                <span className="w-2.5 h-2.5 rounded-full bg-sky-500 inline-block" />
                Neutral
              </span>
            </div>
            <p className="text-2xs text-[#558187]">
              AI Policy Comparison Matrix
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
