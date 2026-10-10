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
      <div className="bg-white border border-[#062327]/10 rounded-3xl p-6 shadow-sm text-center">
        <p className="text-xs text-[#558187] font-medium">
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
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-[#dcfce7] text-[#15803d] border border-[#22c55e]/30">
            <CheckCircle2 size={13} />
            Passed
          </span>
        );
      case 'fail':
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-[#fee2e2] text-[#b91c1c] border border-[#ef4444]/30">
            <XCircle size={13} />
            Unmet / Excluded
          </span>
        );
      case 'flag':
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-[#fef3c7] text-[#b45309] border border-[#f59e0b]/30">
            <AlertTriangle size={13} />
            Flagged
          </span>
        );
      case 'unable_to_determine':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-[#f5f8f8] text-[#558187] border border-[#062327]/15">
            <HelpCircle size={13} />
            Needs Confirmation
          </span>
        );
    }
  };

  return (
    <div className="bg-white border border-[#062327]/10 rounded-3xl p-6 shadow-sm flex flex-col gap-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#062327]/08 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck size={18} className="text-[#062327]" />
            <h3 className="font-headline text-base font-bold text-[#062327] tracking-tight">
              Deterministic Policy Eligibility Verdicts
            </h3>
          </div>
          <p className="text-xs text-[#558187] mt-1 font-medium">
            Evaluated directly against policy clauses and regulatory benchmarks. No AI guesswork.
          </p>
        </div>
        {onReevaluate && (
          <button
            onClick={onReevaluate}
            disabled={loading}
            className="text-xs text-[#062327] font-bold border border-[#062327]/15 hover:border-[#062327]/30 bg-white hover:bg-[#f5f8f8] px-3.5 py-2 rounded-full flex items-center gap-1.5 transition-all disabled:opacity-50 cursor-pointer shadow-sm"
          >
            {loading ? <Spinner size="xs" /> : <RefreshCw size={13} />}
            <span>Re-evaluate</span>
          </button>
        )}
      </div>

      <div className="flex flex-col gap-3">
        {checks.map((chk, idx) => (
          <div
            key={chk.check || idx}
            className="p-4 rounded-2xl bg-[#f5f8f8] border border-[#062327]/08 flex flex-col sm:flex-row sm:items-start justify-between gap-3 hover:border-[#062327]/20 transition-all"
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-1.5">
                <span className="text-xs font-bold text-[#062327]">
                  {CHECK_TITLES[chk.check] || chk.check}
                </span>
                {chk.source && <CitationBadge citation={chk.source} />}
              </div>
              <p className="text-xs text-[#558187] leading-relaxed font-medium">
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
        <div className="text-[11px] text-[#558187] pt-1 text-right font-medium">
          Last evaluated: {new Date(evaluated_at).toLocaleString('en-IN')}
        </div>
      )}
    </div>
  );
}
