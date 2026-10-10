import React from 'react';
import {
  Receipt,
  FileCheck,
  Calculator,
  RefreshCw,
  AlertCircle,
  HelpCircle,
} from 'lucide-react';
import CitationBadge from './CitationBadge';
import { Spinner } from '../components/common/ui';

export default function SettlementReceiptCard({ settlementEstimate, onRecalculate, loading }) {
  if (!settlementEstimate) {
    return (
      <div className="surface p-6 rounded-2xl border border-white/[0.08] text-center">
        <p className="text-xs text-zinc-400">
          Settlement estimate has not been generated yet. Upload bill or save treatment to estimate.
        </p>
      </div>
    );
  }

  const { basis = 'pre_treatment_estimate', receipt_steps = [], total = 0 } = settlementEstimate;

  const grossStep = receipt_steps.find(s => s.label === 'Gross Claimed Amount');
  const grossAmount = grossStep ? grossStep.amount : 0;
  const outOfPocket = Math.max(0, grossAmount - total);

  return (
    <div className="surface p-6 rounded-2xl border border-white/[0.08] flex flex-col gap-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/[0.06] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Receipt size={18} className="text-amber-400" />
            <h3 className="text-sm font-semibold text-zinc-100 tracking-tight">
              Deterministic Claim Settlement Math
            </h3>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Line-by-line itemized receipt showing statutory and policy-backed deductions.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className={`text-[11px] font-semibold px-2.5 py-1 rounded-full border ${
            basis === 'uploaded_bill'
              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
              : 'bg-blue-500/10 text-blue-400 border-blue-500/20'
          }`}>
            Basis: {basis === 'uploaded_bill' ? 'Uploaded Hospital Bill' : 'Pre-Treatment Estimate'}
          </span>

          {onRecalculate && (
            <button
              onClick={onRecalculate}
              disabled={loading}
              className="p-1.5 rounded-lg border border-white/[0.08] hover:border-white/[0.15] text-zinc-400 hover:text-zinc-200 transition-colors disabled:opacity-50"
              title="Recalculate settlement"
            >
              {loading ? <Spinner size="xs" /> : <RefreshCw size={13} />}
            </button>
          )}
        </div>
      </div>

      {/* Itemized receipt table */}
      <div className="flex flex-col gap-2">
        {receipt_steps.map((step, idx) => {
          const isDeduction = step.amount < 0;
          const isGross = idx === 0;

          return (
            <div
              key={idx}
              className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.05] flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-xs font-semibold ${isGross ? 'text-zinc-100' : 'text-zinc-200'}`}>
                    {step.label}
                  </span>
                  {step.citation && (
                    <CitationBadge citation={step.citation} />
                  )}
                </div>
                <p className="text-[11px] text-zinc-400 mt-0.5 leading-relaxed">
                  {step.rule}
                </p>
              </div>

              <div className="text-right sm:flex-shrink-0">
                <span className={`text-xs font-mono font-semibold ${
                  isGross
                    ? 'text-zinc-100'
                    : isDeduction
                    ? 'text-rose-400'
                    : 'text-emerald-400'
                }`}>
                  {isDeduction ? '-' : ''}₹{Math.abs(step.amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Summary totals */}
      <div className="mt-2 pt-4 border-t border-white/[0.08] grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-wider font-semibold text-emerald-400">
            Estimated Payable by Insurer
          </span>
          <span className="text-xl font-bold font-mono text-emerald-300">
            ₹{total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          <span className="text-[11px] text-emerald-400/70">
            Subject to TPA claim verification
          </span>
        </div>

        <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-wider font-semibold text-amber-400">
            Estimated Patient Out-of-Pocket
          </span>
          <span className="text-xl font-bold font-mono text-amber-300">
            ₹{outOfPocket.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          <span className="text-[11px] text-amber-400/70">
            Includes co-pay, non-medical items & deductibles
          </span>
        </div>
      </div>
    </div>
  );
}
