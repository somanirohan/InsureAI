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
      <div className="bg-white border border-[#062327]/10 rounded-3xl p-6 shadow-sm text-center">
        <p className="text-xs text-[#558187] font-medium">
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
    <div className="bg-white border border-[#062327]/10 rounded-3xl p-6 shadow-sm flex flex-col gap-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#062327]/08 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Receipt size={18} className="text-[#062327]" />
            <h3 className="font-headline text-base font-bold text-[#062327] tracking-tight">
              Deterministic Claim Settlement Math
            </h3>
          </div>
          <p className="text-xs text-[#558187] mt-1 font-medium">
            Line-by-line itemized receipt showing statutory and policy-backed deductions.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className={`text-[11px] font-bold px-3 py-1 rounded-full border ${
            basis === 'uploaded_bill'
              ? 'bg-[#dcfce7] text-[#15803d] border-[#22c55e]/30'
              : 'bg-[#dbeafe] text-[#1e40af] border-[#3b82f6]/30'
          }`}>
            Basis: {basis === 'uploaded_bill' ? 'Uploaded Hospital Bill' : 'Pre-Treatment Estimate'}
          </span>

          {onRecalculate && (
            <button
              onClick={onRecalculate}
              disabled={loading}
              className="p-1.5 rounded-full border border-[#062327]/15 hover:border-[#062327]/30 text-[#062327] transition-all disabled:opacity-50 cursor-pointer shadow-sm hover:bg-[#f5f8f8]"
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
              className="p-4 rounded-2xl bg-[#f5f8f8] border border-[#062327]/08 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 hover:border-[#062327]/20 transition-all"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`text-xs font-bold ${isGross ? 'text-[#062327]' : 'text-[#062327]'}`}>
                    {step.label}
                  </span>
                  {step.citation && (
                    <CitationBadge citation={step.citation} />
                  )}
                </div>
                <p className="text-[11px] text-[#558187] mt-0.5 leading-relaxed font-medium">
                  {step.rule}
                </p>
              </div>

              <div className="text-right sm:flex-shrink-0">
                <span className={`text-xs font-mono font-bold ${
                  isGross
                    ? 'text-[#062327]'
                    : isDeduction
                    ? 'text-[#be123c]'
                    : 'text-[#15803d]'
                }`}>
                  {isDeduction ? '-' : ''}₹{Math.abs(step.amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Summary totals */}
      <div className="mt-2 pt-4 border-t border-[#062327]/08 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="p-5 rounded-2xl bg-[#f0fdf4] border border-[#22c55e]/25 flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-wider font-bold text-[#15803d]">
            Estimated Payable by Insurer
          </span>
          <span className="text-2xl font-black font-mono text-[#15803d]">
            ₹{total.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          <span className="text-[11px] text-[#166534] font-medium">
            Subject to TPA claim verification
          </span>
        </div>

        <div className="p-5 rounded-2xl bg-[#fffbeb] border border-[#f59e0b]/25 flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-wider font-bold text-[#b45309]">
            Estimated Patient Out-of-Pocket
          </span>
          <span className="text-2xl font-black font-mono text-[#b45309]">
            ₹{outOfPocket.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
          <span className="text-[11px] text-[#92400e] font-medium">
            Includes co-pay, non-medical items & deductibles
          </span>
        </div>
      </div>
    </div>
  );
}
