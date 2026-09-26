import React, { useState } from 'react';
import { GitCompare, Check, AlertTriangle, ArrowRightLeft, ChevronUp, ChevronDown } from 'lucide-react';
import api from '../../services/api';
import { Spinner, EmptyState, ErrorBanner } from '../common/ui';

// ─── Cell coloring helper ──────────────────────────────────
function CoverageTag({ text, positive, negative }) {
  if (!text) return <span className="text-zinc-600">—</span>;
  const cls = positive
    ? 'status-ready'
    : negative
    ? 'status-error'
    : 'status-info';
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}>
      {text}
    </span>
  );
}

// ─── Comparison row ────────────────────────────────────────
function CompareRow({ label, children, striped }) {
  return (
    <tr className={`${striped ? 'bg-white/[0.02]' : ''} hover:bg-white/[0.03] transition-colors`}>
      <td className="px-4 py-3.5 text-xs font-medium text-zinc-400 w-40 align-top border-b border-white/[0.05]">
        {label}
      </td>
      {children}
    </tr>
  );
}

function DataCell({ children }) {
  return (
    <td className="px-4 py-3.5 text-sm text-zinc-200 border-b border-white/[0.05] border-l border-l-white/[0.04] align-top">
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
        <h1 className="text-xl font-semibold text-zinc-100 tracking-tight">Compare Policies</h1>
        <p className="text-sm text-zinc-500 mt-0.5">
          Side-by-side comparison of coverage, co-payment, room rent, waiting periods, and exclusions
        </p>
      </div>

      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      {/* ─── Policy selector ────────────────────────── */}
      <div className="surface p-5">
        <p className="text-sm font-medium text-zinc-300 mb-4">Select Policies to Compare</p>

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
                      p-4 rounded-xl border text-left flex items-start justify-between gap-3 transition-all duration-150
                      ${isSelected
                        ? 'border-brand-500/40 bg-brand-500/[0.06]'
                        : 'border-white/[0.07] bg-white/[0.02] hover:border-white/[0.12]'
                      }
                    `}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-zinc-200 truncate">{p.insurer_name || p.file_name}</p>
                      <p className="text-xs text-zinc-500 capitalize mt-0.5">
                        {p.policy_type?.replace(/_/g, ' ') || 'Health Insurance'}
                        {p.sum_insured
                          ? ` · ₹${(p.sum_insured / 100000).toFixed(1)}L`
                          : ''}
                      </p>
                    </div>
                    <div
                      className={`w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5 transition-all ${
                        isSelected
                          ? 'bg-brand-500 border-brand-500'
                          : 'border border-white/[0.12]'
                      }`}
                    >
                      {isSelected && <Check size={12} strokeWidth={3} className="text-black" />}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={handleCompare}
                disabled={loading || selectedIds.length < 2}
                className="btn btn-primary gap-2"
              >
                {loading
                  ? <><Spinner size={14} className="text-black" /> Analyzing…</>
                  : <><ArrowRightLeft size={14} /> Compare {selectedIds.length > 0 ? `(${selectedIds.length})` : ''}</>
                }
              </button>
              {selectedIds.length < 2 && (
                <p className="text-xs text-zinc-600">Select at least 2 policies</p>
              )}
            </div>
          </>
        )}
      </div>

      {/* ─── Comparison table ───────────────────────── */}
      {result && metadata.length > 0 && (
        <div className="surface overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="bg-white/[0.03] border-b border-white/[0.07]">
                  <th className="px-4 py-3.5 text-left text-xs font-medium text-zinc-500 w-40">
                    Feature
                  </th>
                  {metadata.map(m => (
                    <th
                      key={m.policy_id}
                      className="px-4 py-3.5 text-left text-xs font-semibold text-zinc-100 border-l border-l-white/[0.04]"
                    >
                      <div className="text-brand-500 font-semibold text-sm">{m.insurer_name}</div>
                      <div className="text-zinc-500 font-normal capitalize mt-0.5">
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
                      <span className="font-semibold text-brand-500">
                        {result.coverage_comparison[m.policy_id] || '—'}
                      </span>
                    </DataCell>
                  ))}
                </CompareRow>

                {/* Annual Premium */}
                <CompareRow label="Annual Premium" striped>
                  {metadata.map(m => (
                    <DataCell key={m.policy_id}>
                      <span className="font-mono">
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
                          <span className="text-zinc-600">—</span>
                        ) : (
                          <ul className="space-y-1">
                            {waits.map((w, i) => (
                              <li key={i} className="flex items-start gap-1.5 text-xs text-zinc-400">
                                <span className="text-amber-500 mt-0.5 flex-shrink-0">·</span>
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
                          <span className="text-zinc-600">—</span>
                        ) : (
                          <ul className="space-y-1">
                            {exclusions.map((ex, i) => (
                              <li key={i} className="flex items-start gap-1.5 text-xs text-zinc-400">
                                <span className="text-red-500 mt-0.5 flex-shrink-0">·</span>
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
          <div className="px-4 py-3 border-t border-white/[0.06] flex items-center gap-4">
            <div className="flex items-center gap-3 text-2xs text-zinc-600">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-brand-500 inline-block" />
                Favorable
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
                Restrictive
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />
                Neutral
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
