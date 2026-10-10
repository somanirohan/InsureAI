import React, { useState } from 'react';
import { GitCompare, Check, AlertTriangle, ArrowRightLeft, ChevronUp, ChevronDown } from 'lucide-react';
import api from '../../services/api';
import { Spinner, EmptyState, ErrorBanner } from '../common/ui';
import { useLanguage } from '../../context/LanguageContext';

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

function CompareRow({ label, children, striped }) {
  return (
    <tr className={`${striped ? 'bg-white/[0.02]' : ''} hover:bg-white/[0.03] transition-colors`}>
      <td className="px-4 py-3.5 text-xs font-medium text-zinc-400 w-44 align-top border-b border-white/[0.05]">
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
  const { t } = useLanguage();
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
      setResult(res.data.comparison?.comparison_result || res.data.comparison);
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
        <h1 className="text-xl font-semibold text-zinc-100 tracking-tight">
          {t('compare.title', 'Compare Policies')}
        </h1>
        <p className="text-sm text-zinc-400 mt-0.5">
          {t('compare.subtitle', 'Side-by-side comparison of coverage, co-payment, room rent, waiting periods, and exclusions')}
        </p>
      </div>

      <ErrorBanner message={error} onDismiss={() => setError(null)} />

      {/* Policy selector */}
      <div className="surface p-5">
        <p className="text-sm font-medium text-zinc-300 mb-4">
          {t('compare.select_policies', 'Select Policies to Compare')}
        </p>

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
                    type="button"
                    onClick={() => toggle(p._id)}
                    className={`p-3.5 rounded-xl border text-left transition-all ${
                      isSelected
                        ? 'bg-brand-500/10 border-brand-500/40 text-white'
                        : 'bg-white/[0.02] border-white/[0.06] text-zinc-400 hover:border-white/[0.12] hover:text-zinc-200'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-semibold truncate">{p.insurer_name || p.file_name}</p>
                      <div className={`w-4 h-4 rounded-md flex items-center justify-center border text-xs ${
                        isSelected
                          ? 'bg-brand-500 border-brand-500 text-black font-bold'
                          : 'border-white/[0.15]'
                      }`}>
                        {isSelected && <Check size={10} />}
                      </div>
                    </div>
                    <p className="text-2xs text-zinc-500 mt-1">
                      {p.sum_insured ? `₹${(p.sum_insured / 100000).toFixed(1)}L Sum Insured` : 'Standard'}
                    </p>
                  </button>
                );
              })}
            </div>

            <button
              onClick={handleCompare}
              disabled={loading || selectedIds.length < 2}
              className="btn btn-primary gap-2"
            >
              {loading ? <><Spinner size={14} className="text-black" /> Comparing…</> : <>
                <ArrowRightLeft size={14} /> Compare Selected ({selectedIds.length})
              </>}
            </button>
          </>
        )}
      </div>

      {/* Comparison results */}
      {result && (
        <div className="surface overflow-hidden">
          <div className="p-5 border-b border-white/[0.06] flex items-center justify-between">
            <h2 className="text-sm font-semibold text-zinc-200">Comparison Matrix</h2>
            <span className="text-2xs text-brand-500 font-mono">
              {metadata.length} Policies Analyzed
            </span>
          </div>

          <div className="overflow-x-auto scroll-area">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/[0.08] bg-white/[0.02]">
                  <th className="px-4 py-3.5 text-xs font-semibold text-zinc-400 w-44">Feature</th>
                  {metadata.map((p, idx) => (
                    <th key={idx} className="px-4 py-3.5 text-sm font-semibold text-brand-400 border-l border-l-white/[0.06] min-w-[200px]">
                      {p.insurer_name}
                      <span className="block text-2xs font-normal text-zinc-500 mt-0.5">{p.policy_name || 'Health Insurance'}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <CompareRow label={t('compare.dimensions.sum_insured', 'Sum Insured')} striped>
                  {metadata.map((p, i) => (
                    <DataCell key={i}>
                      <span className="font-semibold text-zinc-100">
                        {p.sum_insured ? `₹${Number(p.sum_insured).toLocaleString('en-IN')}` : '—'}
                      </span>
                    </DataCell>
                  ))}
                </CompareRow>

                <CompareRow label={t('compare.dimensions.room_rent', 'Room Rent Limit')}>
                  {metadata.map((p, i) => (
                    <DataCell key={i}>
                      {p.room_rent_limit || '1% of Sum Insured / day'}
                    </DataCell>
                  ))}
                </CompareRow>

                <CompareRow label={t('compare.dimensions.copay', 'Co-Payment')} striped>
                  {metadata.map((p, i) => (
                    <DataCell key={i}>
                      <CoverageTag text={p.copay || '0% Co-pay'} positive={p.copay?.includes('0%') || p.copay === '0%'} />
                    </DataCell>
                  ))}
                </CompareRow>

                <CompareRow label={t('compare.dimensions.waiting_period', 'Waiting Period')}>
                  {metadata.map((p, i) => (
                    <DataCell key={i}>
                      {p.ped_waiting_period || p.waiting_periods?.[0] || '36 - 48 Months'}
                    </DataCell>
                  ))}
                </CompareRow>

                <CompareRow label={t('compare.dimensions.daycare', 'Daycare Procedures')} striped>
                  {metadata.map((p, i) => (
                    <DataCell key={i}>
                      {p.daycare_procedures || 'All listed day care procedures covered up to SI'}
                    </DataCell>
                  ))}
                </CompareRow>

                <CompareRow label={t('compare.dimensions.maternity', 'Maternity Cover')}>
                  {metadata.map((p, i) => (
                    <DataCell key={i}>
                      {p.maternity_cover || 'Not covered / optional rider'}
                    </DataCell>
                  ))}
                </CompareRow>

                <CompareRow label={t('compare.dimensions.restoration', 'Restoration Benefit')} striped>
                  {metadata.map((p, i) => (
                    <DataCell key={i}>
                      {p.restoration_benefit || '100% automatic restore for unrelated illnesses'}
                    </DataCell>
                  ))}
                </CompareRow>

                <CompareRow label={t('compare.dimensions.ncb', 'No Claim Bonus')}>
                  {metadata.map((p, i) => (
                    <DataCell key={i}>
                      {p.ncb || '10% - 50% increase per claim-free year'}
                    </DataCell>
                  ))}
                </CompareRow>
              </tbody>
            </table>
          </div>

          {result.recommendation && (
            <div className="p-5 border-t border-white/[0.08] bg-brand-500/[0.04]">
              <p className="text-xs font-semibold text-brand-400 uppercase tracking-wider mb-1">
                {t('compare.recommendation_title', 'Smart Recommendation')}
              </p>
              <p className="text-sm text-zinc-300 leading-relaxed">
                {result.recommendation}
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
