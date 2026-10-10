import React from 'react';
import {
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  Info,
  Clock,
  ShieldAlert,
} from 'lucide-react';
import CitationBadge from './CitationBadge';

export default function QualitativeReadinessCard({ readiness }) {
  if (!readiness) return null;

  const {
    total_items = 0,
    complete_items = 0,
    flagged_items = 0,
    missing_items = 0,
    qualitative_label = 'Checklist pending',
    all_flags = [],
    blocking_flags_count = 0,
    can_submit = false,
  } = readiness;

  const blockingFlags = all_flags.filter(f => f.severity === 'blocking');
  const warningFlags = all_flags.filter(f => f.severity === 'worth-confirming');
  const infoFlags = all_flags.filter(f => f.severity === 'info');

  return (
    <div className="bg-white border border-[#062327]/10 rounded-3xl p-6 shadow-sm flex flex-col gap-5">
      {/* Header & Qualitative summary */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#062327]/08 pb-4">
        <div>
          <div className="flex items-center gap-2">
            <ShieldAlert size={18} className="text-[#062327]" />
            <h3 className="font-headline text-base font-bold text-[#062327] tracking-tight">
              Claim Readiness Evaluation
            </h3>
          </div>
          <p className="text-xs text-[#558187] mt-1 font-medium">
            Qualitative readiness status based on mandatory policy clauses and uploaded documents.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#f5f8f8] border border-[#062327]/15">
          <span className="w-2 h-2 rounded-full bg-[#062327] animate-pulse" />
          <span className="text-xs font-bold text-[#062327]">
            {qualitative_label}
          </span>
        </div>
      </div>

      {/* Qualitative Count Pills (Strictly NO numeric percentages or scores) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-3.5 rounded-2xl bg-[#f0fdf4] border border-[#22c55e]/25 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-[#dcfce7] flex items-center justify-center flex-shrink-0">
            <CheckCircle2 size={18} className="text-[#15803d]" />
          </div>
          <div>
            <div className="text-xs font-bold text-[#15803d]">
              {complete_items} of {total_items} Items Validated
            </div>
            <div className="text-[11px] text-[#166534] font-medium">
              Grounded & complete
            </div>
          </div>
        </div>

        <div className={`p-3.5 rounded-2xl border flex items-center gap-3 ${
          flagged_items > 0
            ? 'bg-[#fffbeb] border-[#f59e0b]/30'
            : 'bg-[#f5f8f8] border-[#062327]/08'
        }`}>
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
            flagged_items > 0 ? 'bg-[#fef3c7]' : 'bg-white'
          }`}>
            <AlertTriangle size={18} className={flagged_items > 0 ? 'text-[#b45309]' : 'text-[#558187]'} />
          </div>
          <div>
            <div className={`text-xs font-bold ${flagged_items > 0 ? 'text-[#b45309]' : 'text-[#558187]'}`}>
              {flagged_items} Needs Confirmation
            </div>
            <div className="text-[11px] text-[#558187] font-medium">
              Requires user verification
            </div>
          </div>
        </div>

        <div className={`p-3.5 rounded-2xl border flex items-center gap-3 ${
          missing_items > 0
            ? 'bg-[#fef2f2] border-[#ef4444]/30'
            : 'bg-[#f5f8f8] border-[#062327]/08'
        }`}>
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${
            missing_items > 0 ? 'bg-[#fee2e2]' : 'bg-white'
          }`}>
            <Clock size={18} className={missing_items > 0 ? 'text-[#be123c]' : 'text-[#558187]'} />
          </div>
          <div>
            <div className={`text-xs font-bold ${missing_items > 0 ? 'text-[#be123c]' : 'text-[#558187]'}`}>
              {missing_items} Items Missing
            </div>
            <div className="text-[11px] text-[#558187] font-medium">
              Required documents pending
            </div>
          </div>
        </div>
      </div>

      {/* Flag Aggregation (Blocking / Worth-Confirming / Info) */}
      {all_flags.length > 0 && (
        <div className="flex flex-col gap-2.5 pt-2">
          <div className="text-xs font-bold uppercase tracking-wider text-[#558187]">
            Identified Policy & Document Flags ({all_flags.length})
          </div>

          {/* Blocking flags */}
          {blockingFlags.map((flag, idx) => (
            <div
              key={flag.flag_id || `b-${idx}`}
              className="p-4 rounded-2xl bg-[#fef2f2] border border-[#ef4444]/30 flex items-start gap-3"
            >
              <AlertOctagon size={18} className="text-[#be123c] flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-[#991b1b]">{flag.label}</span>
                  <span className="text-[10px] uppercase font-black px-2 py-0.5 rounded-full bg-[#fee2e2] text-[#991b1b] border border-[#ef4444]/30">
                    Blocking Issue
                  </span>
                  {flag.citation && <CitationBadge citation={flag.citation} />}
                </div>
                <p className="text-xs text-[#991b1b]/90 mt-1 leading-relaxed font-medium">
                  {flag.detail}
                </p>
              </div>
            </div>
          ))}

          {/* Worth-confirming flags */}
          {warningFlags.map((flag, idx) => (
            <div
              key={flag.flag_id || `w-${idx}`}
              className="p-4 rounded-2xl bg-[#fffbeb] border border-[#f59e0b]/30 flex items-start gap-3"
            >
              <AlertTriangle size={18} className="text-[#b45309] flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-[#92400e]">{flag.label}</span>
                  <span className="text-[10px] uppercase font-black px-2 py-0.5 rounded-full bg-[#fef3c7] text-[#92400e] border border-[#f59e0b]/30">
                    Worth Confirming
                  </span>
                  {flag.citation && <CitationBadge citation={flag.citation} />}
                </div>
                <p className="text-xs text-[#92400e]/90 mt-1 leading-relaxed font-medium">
                  {flag.detail}
                </p>
              </div>
            </div>
          ))}

          {/* Info flags */}
          {infoFlags.map((flag, idx) => (
            <div
              key={flag.flag_id || `i-${idx}`}
              className="p-4 rounded-2xl bg-[#eff6ff] border border-[#3b82f6]/30 flex items-start gap-3"
            >
              <Info size={18} className="text-[#1d4ed8] flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-[#1e40af]">{flag.label}</span>
                  <span className="text-[10px] uppercase font-black px-2 py-0.5 rounded-full bg-[#dbeafe] text-[#1e40af] border border-[#3b82f6]/30">
                    Regulatory Advisory
                  </span>
                  {flag.citation && <CitationBadge citation={flag.citation} type="irdai" />}
                </div>
                <p className="text-xs text-[#1e40af]/90 mt-1 leading-relaxed font-medium">
                  {flag.detail}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
