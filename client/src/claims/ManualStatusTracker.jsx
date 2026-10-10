import React, { useState } from 'react';
import {
  Clock,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  XCircle,
  Send,
  Info,
  Calendar,
  MessageSquare,
  ArrowRight,
} from 'lucide-react';
import { Spinner } from '../components/common/ui';

const ALLOWED_NEXT_STATUSES = {
  submitted: ['under_review'],
  under_review: ['query_raised', 'settled', 'rejected'],
  query_raised: ['under_review', 'docs_pending'],
  docs_pending: ['docs_validated'],
  docs_validated: ['ready_to_submit'],
  ready_to_submit: ['submitted'],
  settled: [],
  rejected: [],
};

const STATUS_LABELS = {
  draft: 'Draft',
  eligibility_checked: 'Eligibility Checked',
  docs_pending: 'Documents Pending',
  docs_validated: 'Documents Validated',
  ready_to_submit: 'Ready to Submit',
  submitted: 'Claim Submitted to Insurer',
  under_review: 'Under TPA / Insurer Review',
  query_raised: 'Query Raised by Insurer',
  settled: 'Claim Settled / Paid',
  rejected: 'Claim Rejected',
};

export default function ManualStatusTracker({ claim, onStatusTransition, loading }) {
  const [selectedNext, setSelectedNext] = useState('');
  const [statusNote, setStatusNote] = useState('');

  if (!claim) return null;

  const currentStatus = claim.status || 'draft';
  const allowedNext = ALLOWED_NEXT_STATUSES[currentStatus] || [];
  const timeline = claim.timeline || [];

  const handleUpdate = (e) => {
    e.preventDefault();
    if (!selectedNext) return;
    onStatusTransition(selectedNext, statusNote.trim() || undefined);
    setSelectedNext('');
    setStatusNote('');
  };

  return (
    <div className="surface p-6 rounded-2xl border border-white/[0.08] flex flex-col gap-6">
      <div>
        <div className="flex items-center gap-2">
          <Clock size={18} className="text-amber-400" />
          <h3 className="text-sm font-semibold text-zinc-100 tracking-tight">
            Claim Lifecycle & Settlement Tracking
          </h3>
        </div>
        <p className="text-xs text-zinc-400 mt-1">
          Track official updates and record communication milestones with your insurer.
        </p>
      </div>

      {/* MANDATORY NOTICE: MANUAL TRACKING (No insurer integration) */}
      <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-start gap-3">
        <Info size={17} className="text-blue-400 flex-shrink-0 mt-0.5" />
        <div className="text-xs text-blue-200 leading-relaxed">
          <strong className="font-semibold text-blue-100 block mb-0.5">
            Manual Tracking Notice
          </strong>
          Status tracking is manual. InsureAI does not integrate directly with your insurer or TPA's backend. Update your claim status as you receive official SMS, email, or portal communications from your insurer.
        </div>
      </div>

      {/* Current status display & Transition form */}
      <div className="p-4 rounded-xl bg-white/[0.02] border border-white/[0.06] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-[11px] text-zinc-500 uppercase tracking-wider block font-medium">
            Current Status
          </span>
          <span className="text-sm font-semibold text-zinc-100 mt-0.5 block">
            {STATUS_LABELS[currentStatus] || currentStatus}
          </span>
        </div>

        {allowedNext.length > 0 && (
          <form onSubmit={handleUpdate} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            <select
              value={selectedNext}
              onChange={e => setSelectedNext(e.target.value)}
              className="px-3 py-2 rounded-xl bg-[#0c0c16] border border-white/[0.1] text-xs text-zinc-200 focus:outline-none focus:border-amber-400/50"
            >
              <option value="">Move to next state...</option>
              {allowedNext.map(st => (
                <option key={st} value={st}>
                  {STATUS_LABELS[st] || st}
                </option>
              ))}
            </select>

            <input
              type="text"
              placeholder="Note (e.g. Reference number / email date)"
              value={statusNote}
              onChange={e => setStatusNote(e.target.value)}
              className="px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-amber-400/50"
            />

            <button
              type="submit"
              disabled={!selectedNext || loading}
              className="btn-primary text-xs px-4 py-2 rounded-xl flex items-center justify-center gap-1.5 disabled:opacity-50 whitespace-nowrap"
            >
              {loading ? <Spinner size="xs" /> : <ArrowRight size={13} />}
              <span>Update Status</span>
            </button>
          </form>
        )}
      </div>

      {/* Timeline display */}
      <div className="flex flex-col gap-3">
        <h4 className="text-xs font-semibold text-zinc-300">
          Claim History & Audit Trail ({timeline.length} events)
        </h4>

        <div className="relative pl-6 border-l border-white/[0.08] flex flex-col gap-4 ml-2">
          {timeline.slice().reverse().map((entry, idx) => (
            <div key={idx} className="relative group">
              {/* Bullet */}
              <div className="absolute -left-[31px] top-1 w-3 h-3 rounded-full bg-zinc-900 border-2 border-amber-400 flex items-center justify-center" />

              <div className="flex flex-col gap-0.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-semibold text-zinc-200">
                    {entry.event}
                  </span>
                  <span className="text-[10px] text-zinc-500 font-mono">
                    {entry.timestamp ? new Date(entry.timestamp).toLocaleString('en-IN') : '—'}
                  </span>
                </div>
                {entry.note && (
                  <p className="text-xs text-zinc-400 leading-relaxed mt-0.5">
                    {entry.note}
                  </p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
