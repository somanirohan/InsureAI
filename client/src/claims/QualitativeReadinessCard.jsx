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
    <div className="surface p-5 rounded-2xl border border-white/[0.08] flex flex-col gap-5">
      {/* Header & Qualitative summary string */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/[0.06] pb-4">
        <div>
          <div className="flex items-center gap-2">
            <ShieldAlert size={18} className="text-amber-400" />
            <h3 className="text-sm font-semibold text-zinc-100 tracking-tight">
              Claim Readiness Evaluation
            </h3>
          </div>
          <p className="text-xs text-zinc-400 mt-1">
            Qualitative readiness status based on mandatory policy clauses and uploaded documents.
          </p>
        </div>
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/[0.08]">
          <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
          <span className="text-xs font-semibold text-zinc-200">
            {qualitative_label}
          </span>
        </div>
      </div>

      {/* Qualitative Count Pills (Strictly NO numeric percentages or scores) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center flex-shrink-0">
            <CheckCircle2 size={16} className="text-emerald-400" />
          </div>
          <div>
            <div className="text-xs font-medium text-emerald-300">
              {complete_items} of {total_items} Items Validated
            </div>
            <div className="text-[11px] text-emerald-400/70">
              Grounded & complete
            </div>
          </div>
        </div>

        <div className={`p-3 rounded-xl border flex items-center gap-3 ${
          flagged_items > 0
            ? 'bg-amber-500/10 border-amber-500/20'
            : 'bg-white/[0.02] border-white/[0.05]'
        }`}>
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
            flagged_items > 0 ? 'bg-amber-500/20' : 'bg-white/[0.05]'
          }`}>
            <AlertTriangle size={16} className={flagged_items > 0 ? 'text-amber-400' : 'text-zinc-500'} />
          </div>
          <div>
            <div className={`text-xs font-medium ${flagged_items > 0 ? 'text-amber-300' : 'text-zinc-400'}`}>
              {flagged_items} Needs Confirmation
            </div>
            <div className="text-[11px] text-zinc-500">
              Requires user verification
            </div>
          </div>
        </div>

        <div className={`p-3 rounded-xl border flex items-center gap-3 ${
          missing_items > 0
            ? 'bg-rose-500/10 border-rose-500/20'
            : 'bg-white/[0.02] border-white/[0.05]'
        }`}>
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
            missing_items > 0 ? 'bg-rose-500/20' : 'bg-white/[0.05]'
          }`}>
            <Clock size={16} className={missing_items > 0 ? 'text-rose-400' : 'text-zinc-500'} />
          </div>
          <div>
            <div className={`text-xs font-medium ${missing_items > 0 ? 'text-rose-300' : 'text-zinc-400'}`}>
              {missing_items} Items Missing
            </div>
            <div className="text-[11px] text-zinc-500">
              Required documents pending
            </div>
          </div>
        </div>
      </div>

      {/* Flag Aggregation (Blocking / Worth-Confirming / Info) */}
      {all_flags.length > 0 && (
        <div className="flex flex-col gap-2.5 pt-2">
          <div className="text-xs font-semibold text-zinc-300">
            Identified Policy & Document Flags ({all_flags.length})
          </div>

          {/* Blocking flags */}
          {blockingFlags.map((flag, idx) => (
            <div
              key={flag.flag_id || `b-${idx}`}
              className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start gap-3"
            >
              <AlertOctagon size={16} className="text-rose-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-semibold text-rose-200">{flag.label}</span>
                  <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300">
                    Blocking Issue
                  </span>
                  {flag.citation && <CitationBadge citation={flag.citation} />}
                </div>
                <p className="text-xs text-rose-300/80 mt-1 leading-relaxed">
                  {flag.detail}
                </p>
              </div>
            </div>
          ))}

          {/* Worth-confirming flags */}
          {warningFlags.map((flag, idx) => (
            <div
              key={flag.flag_id || `w-${idx}`}
              className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3"
            >
              <AlertTriangle size={16} className="text-amber-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-semibold text-amber-200">{flag.label}</span>
                  <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300">
                    Worth Confirming
                  </span>
                  {flag.citation && <CitationBadge citation={flag.citation} />}
                </div>
                <p className="text-xs text-amber-300/80 mt-1 leading-relaxed">
                  {flag.detail}
                </p>
              </div>
            </div>
          ))}

          {/* Info flags */}
          {infoFlags.map((flag, idx) => (
            <div
              key={flag.flag_id || `i-${idx}`}
              className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-start gap-3"
            >
              <Info size={16} className="text-blue-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-semibold text-blue-200">{flag.label}</span>
                  <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-300">
                    Regulatory Advisory
                  </span>
                  {flag.citation && <CitationBadge citation={flag.citation} type="irdai" />}
                </div>
                <p className="text-xs text-blue-300/80 mt-1 leading-relaxed">
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
