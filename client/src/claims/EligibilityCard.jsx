import React from 'react';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  HelpCircle,
  ShieldCheck,
  RefreshCw,
} from 'lucide-react';
import CitationBadge from './CitationBadge';
import { Spinner } from '../components/common/ui';

const CHECK_TITLES = {
  exclusions_check: 'Policy Exclusions Verification',
  specific_waiting_period_check: 'Specific Ailment Waiting Period',
  ped_waiting_period_check: 'Pre-Existing Disease (PED) Term',
  cost_and_sublimits_check: 'Sum Insured & Sub-limit Feasibility',
  irdai_baseline_check: 'IRDAI Statutory Baseline Compliance',
};

export default function EligibilityCard({ eligibilityResult, onReevaluate, loading }) {
  if (!eligibilityResult || !eligibilityResult.checks) {
    return (
      <div className="surface p-6 rounded-2xl border border-white/[0.08] text-center">
        <p className="text-xs text-zinc-400">
          Eligibility evaluation has not been run yet. Provide treatment details above to evaluate.
        </p>
      </div>
    );
  }

  const { checks = [], evaluated_at } = eligibilityResult;

  const renderStatus = (result) => {
    switch (result) {
      case 'pass':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 size={12} />
            Passed
          </span>
        );
      case 'fail':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <XCircle size={12} />
            Unmet / Excluded
          </span>
        );
      case 'flag':
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <AlertTriangle size={12} />
            Flagged
          </span>
        );
      case 'unable_to_determine':
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-zinc-500/10 text-zinc-400 border border-zinc-500/20">
            <HelpCircle size={12} />
            Needs Confirmation
          </span>
        );
    }
  };

  return (
    <div className="surface p-6 rounded-2xl border border-white/[0.08] flex flex-col gap-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/[0.06] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck size={18} className="text-emerald-400" />
            <h3 className="text-sm font-semibold text-zinc-100 tracking-tight">
              Deterministic Policy Eligibility Verdicts
            </h3>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Evaluated directly against policy clauses and regulatory benchmarks. No AI hallucinations.
          </p>
        </div>
        {onReevaluate && (
          <button
            onClick={onReevaluate}
            disabled={loading}
            className="text-xs text-zinc-400 hover:text-zinc-200 border border-white/[0.08] hover:border-white/[0.15] px-3 py-1.5 rounded-xl flex items-center gap-1.5 transition-colors disabled:opacity-50"
          >
            {loading ? <Spinner size="xs" /> : <RefreshCw size={12} />}
            <span>Re-evaluate</span>
          </button>
        )}
      </div>

      <div className="flex flex-col gap-3">
        {checks.map((chk, idx) => (
          <div
            key={chk.check || idx}
            className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.05] flex flex-col sm:flex-row sm:items-start justify-between gap-3"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1.5">
                <span className="text-xs font-semibold text-zinc-200">
                  {CHECK_TITLES[chk.check] || chk.check}
                </span>
                {chk.source && <CitationBadge citation={chk.source} />}
              </div>
              <p className="text-xs text-zinc-400 leading-relaxed">
                {chk.detail}
              </p>
            </div>
            <div className="flex-shrink-0 self-start">
              {renderStatus(chk.result)}
            </div>
          </div>
        ))}
      </div>

      {evaluated_at && (
        <div className="text-[11px] text-zinc-500 pt-1 text-right">
          Last evaluated: {new Date(evaluated_at).toLocaleString('en-IN')}
        </div>
      )}
    </div>
  );
}
