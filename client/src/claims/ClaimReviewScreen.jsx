import React from 'react';
import {
  FileCheck2,
  AlertOctagon,
  CheckCircle2,
  Shield,
  Send,
  Building,
  User,
  Activity,
  Receipt,
  AlertTriangle,
} from 'lucide-react';
import QualitativeReadinessCard from './QualitativeReadinessCard';
import SettlementReceiptCard from './SettlementReceiptCard';
import CitationBadge from './CitationBadge';
import { Spinner } from '../components/common/ui';

export default function ClaimReviewScreen({
  reviewData,
  onSubmitClaim,
  submittingLoading,
}) {
  if (!reviewData) return null;

  const {
    claim,
    policy,
    readiness,
    settlement_estimate,
    can_submit = false,
    submission_blockers = [],
  } = reviewData;

  const treatment = claim?.treatment;
  const checklist = claim?.checklist || [];

  return (
    <div className="flex flex-col gap-6">
      {/* Header Banner */}
      <div className="surface p-6 rounded-2xl border border-white/[0.08] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-[11px] uppercase tracking-wider font-semibold text-amber-400">
            Final Submission Review Screen
          </span>
          <h2 className="text-lg font-bold text-zinc-100 mt-1">
            Claim Dossier: {treatment?.name || 'Medical Claim'}
          </h2>
          <div className="flex items-center gap-3 mt-2 text-xs text-zinc-400 flex-wrap">
            <span className="flex items-center gap-1">
              <Building size={13} className="text-zinc-500" />
              {policy?.insurer_name || 'Insurance Provider'}
            </span>
            <span>·</span>
            <span className="font-mono text-zinc-300">
              {policy?.policy_number || 'Policy'}
            </span>
            <span>·</span>
            <span>Hospital: {treatment?.hospital || '—'}</span>
          </div>
        </div>

        <div className="text-right flex-shrink-0">
          <span className="text-[11px] text-zinc-500 uppercase tracking-wider block">
            Approved Estimate
          </span>
          <span className="text-xl font-bold font-mono text-emerald-400">
            ₹{(settlement_estimate?.total || 0).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
          </span>
        </div>
      </div>

      {/* Notice: In-app review screen only (NO downloadable export) */}
      <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] flex items-center justify-between text-xs text-zinc-400">
        <span>In-App Submission Package Review</span>
        <span className="text-[11px] text-zinc-500 italic">
          Verified against policy terms and uploaded documentation.
        </span>
      </div>

      {/* Qualitative Readiness Summary */}
      <QualitativeReadinessCard readiness={readiness} />

      {/* Treatment & Hospitalization Summary */}
      {treatment && (
        <div className="surface p-5 rounded-2xl border border-white/[0.08] flex flex-col gap-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
            Treatment Summary
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs bg-white/[0.02] p-4 rounded-xl">
            <div>
              <span className="text-zinc-500 block">Procedure</span>
              <span className="text-zinc-100 font-medium">{treatment.name}</span>
            </div>
            <div>
              <span className="text-zinc-500 block">Hospital</span>
              <span className="text-zinc-100 font-medium">{treatment.hospital}</span>
            </div>
            <div>
              <span className="text-zinc-500 block">Dates</span>
              <span className="text-zinc-100 font-medium">
                {treatment.admission_date} {treatment.discharge_date ? `to ${treatment.discharge_date}` : ''}
              </span>
            </div>
            <div>
              <span className="text-zinc-500 block">Room Type</span>
              <span className="text-zinc-100 font-medium">{treatment.room_type}</span>
            </div>
          </div>
        </div>
      )}

      {/* Settlement Math Breakdown */}
      {settlement_estimate && (
        <SettlementReceiptCard settlementEstimate={settlement_estimate} />
      )}

      {/* Submission Gate Alert / Submission Action */}
      <div className="surface p-6 rounded-2xl border border-white/[0.08] flex flex-col gap-4">
        {!can_submit ? (
          <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 flex flex-col gap-2">
            <div className="flex items-center gap-2 text-rose-300 font-semibold text-xs">
              <AlertOctagon size={16} />
              <span>Claim Submission Is Currently Blocked</span>
            </div>
            <p className="text-xs text-rose-300/80 leading-relaxed">
              To prevent claim rejection by your insurer, all cited requirements and blocking eligibility criteria must be satisfied before submission:
            </p>
            <ul className="list-disc list-inside text-xs text-rose-300/90 space-y-1 mt-1">
              {submission_blockers.map((b, i) => (
                <li key={i}>{b}</li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 size={18} className="text-emerald-400" />
              <div>
                <span className="text-xs font-semibold text-emerald-200 block">
                  All Policy Requirements Satisfied
                </span>
                <span className="text-[11px] text-emerald-400/80">
                  Zero blocking flags and all required documents are validated.
                </span>
              </div>
            </div>
          </div>
        )}

        <div className="flex justify-between items-center pt-2">
          <span className="text-xs text-zinc-500">
            {can_submit
              ? 'Ready to proceed to official claim filing'
              : 'Complete remaining items above to enable submission'}
          </span>

          <button
            onClick={onSubmitClaim}
            disabled={!can_submit || submittingLoading}
            className="btn-primary text-xs px-6 py-2.5 rounded-xl flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submittingLoading ? (
              <>
                <Spinner size="xs" />
                <span>Submitting Claim...</span>
              </>
            ) : (
              <>
                <Send size={14} />
                <span>Submit Claim</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
