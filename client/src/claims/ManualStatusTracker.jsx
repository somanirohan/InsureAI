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
    <div className="bg-white border border-[#062327]/10 rounded-3xl p-6 shadow-sm flex flex-col gap-6">
      <div>
        <div className="flex items-center gap-2">
          <Clock size={18} className="text-[#062327]" />
          <h3 className="font-headline text-base font-bold text-[#062327] tracking-tight">
            Claim Lifecycle & Settlement Tracking
          </h3>
        </div>
        <p className="text-xs text-[#558187] mt-1 font-medium">
          Track official updates and record communication milestones with your insurer.
        </p>
      </div>

      {/* MANDATORY NOTICE: MANUAL TRACKING (No insurer integration) */}
      <div className="p-5 rounded-2xl bg-[#eff6ff] border border-[#3b82f6]/25 flex items-start gap-3">
        <Info size={18} className="text-[#1d4ed8] flex-shrink-0 mt-0.5" />
        <div className="text-xs text-[#1e40af] leading-relaxed">
          <strong className="font-bold text-[#1e40af] block mb-0.5">
            Manual Tracking Notice
          </strong>
          Status tracking is manual. InsureAI does not integrate directly with your insurer or TPA's backend. Update your claim status as you receive official SMS, email, or portal communications from your insurer.
        </div>
      </div>

      {/* Current status display & Transition form */}
      <div className="p-5 rounded-2xl bg-[#f5f8f8] border border-[#062327]/08 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-[11px] text-[#558187] uppercase tracking-wider block font-bold">
            Current Status
          </span>
          <span className="text-base font-bold text-[#062327] mt-0.5 block">
            {STATUS_LABELS[currentStatus] || currentStatus}
          </span>
        </div>

        {allowedNext.length > 0 && (
          <form onSubmit={handleUpdate} className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
            <select
              value={selectedNext}
              onChange={e => setSelectedNext(e.target.value)}
              className="px-3.5 py-2.5 rounded-2xl bg-white border border-[#062327]/15 text-xs text-[#062327] font-semibold focus:outline-none focus:border-[#062327] shadow-2xs"
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
              className="px-3.5 py-2.5 rounded-2xl bg-white border border-[#062327]/15 text-xs text-[#062327] placeholder-[#558187]/60 font-medium focus:outline-none focus:border-[#062327] shadow-2xs"
            />

            <button
              type="submit"
              disabled={!selectedNext || loading}
              className="btn-pill-lime text-xs px-5 py-2.5 font-bold flex items-center justify-center gap-1.5 disabled:opacity-50 whitespace-nowrap shadow-md cursor-pointer"
            >
              {loading ? <Spinner size="xs" /> : <ArrowRight size={14} />}
              <span>Update Status</span>
            </button>
          </form>
        )}
      </div>

      {/* Timeline display */}
      <div className="flex flex-col gap-3 pt-1">
        <h4 className="text-xs font-bold uppercase tracking-wider text-[#558187]">
          Claim History & Audit Trail ({timeline.length} events)
        </h4>

        <div className="relative pl-6 border-l-2 border-[#062327]/15 flex flex-col gap-5 ml-2.5 pt-2">
          {timeline.slice().reverse().map((entry, idx) => (
            <div key={idx} className="relative group">
              {/* Bullet */}
              <div className="absolute -left-[31px] top-1 w-3.5 h-3.5 rounded-full bg-[#d2f57b] border-2 border-[#062327] flex items-center justify-center shadow-xs" />

              <div className="flex flex-col gap-0.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-[#062327]">
                    {entry.event}
                  </span>
                  <span className="text-[10px] text-[#558187] font-mono font-medium">
                    {entry.timestamp ? new Date(entry.timestamp).toLocaleString('en-IN') : '—'}
                  </span>
                </div>
                {entry.note && (
                  <p className="text-xs text-[#558187] leading-relaxed mt-0.5 font-medium">
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
